#!/usr/bin/env python3
"""Project-owned lifecycle; application operations never rebuild or stop their sibling."""
from contextlib import contextmanager
from pathlib import Path
import argparse
import errno
import fcntl
import json
import os
import signal
import socket
import subprocess
import sys
import time
import tomllib
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CFG = tomllib.loads((ROOT / 'dev.toml').read_text())
STATE = ROOT / '.runtime'
STATE.mkdir(exist_ok=True, mode=0o700)
TOOLS = ROOT / '.tools/spacetime'
CLI = [str(TOOLS / 'spacetime'), f'--root-dir={TOOLS}']
DB_URL = f"http://{CFG['server']['host']}:{CFG['server']['port']}"
# Long-running services with a supervised foreground mode (`<name>-serve`). Each may be
# owned by a systemd unit named in dev.toml [systemd] (installed from ops/systemd/).
SERVE = ('database', 'public-client', 'dashboard')
# Seconds a supervised service gets between SIGTERM and SIGKILL; units allow more (TimeoutStopSec).
STOP_GRACE = {'database': 60}
DEFAULT_STOP_GRACE = 10
# Readiness budget for a supervised start; the dashboard also prepares its public assets first.
READY_TIMEOUT = {'database': 280, 'dashboard': 280}
DEFAULT_READY_TIMEOUT = 110
# Exit status for "already running elsewhere / port taken"; units list it in
# RestartPreventExitStatus so a conflict fails once instead of restart-looping.
CONFLICT_EXIT = 3


def run(command, **kwargs):
    return subprocess.run(command, cwd=ROOT, check=True, **kwargs)


def cli(*arguments):
    return run(CLI + list(arguments))


def load():
    path = STATE / 'processes.json'
    return json.loads(path.read_text()) if path.exists() else {}


def save(state):
    path = STATE / 'processes.json'
    temporary = path.with_name(path.name + '.tmp')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        stream.write(json.dumps(state, indent=2))
    temporary.chmod(0o600)
    temporary.replace(path)


@contextmanager
def state_lock():
    """Serialise read-modify-write of processes.json between dev.py invocations and supervisors."""
    with (STATE / 'processes.lock').open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield


def proc(pid):
    try:
        fields = Path(f'/proc/{pid}/stat').read_text().split()
        return None if fields[2] == 'Z' else fields[21]
    except (FileNotFoundError, ProcessLookupError):
        return None


def alive(row):
    return row['start'] is not None and proc(row['pid']) == row['start']


def supervisor_of(row):
    """The live foreground supervisor that owns a row, if any (rows from `launch` have none)."""
    supervisor = row.get('supervisor')
    if supervisor and supervisor.get('start') is not None and proc(supervisor['pid']) == supervisor['start']:
        return supervisor
    return None


def port_free(host, port):
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))


def systemctl(*arguments):
    return subprocess.run(['systemctl', *arguments], check=True)


def unit_properties(unit):
    try:
        result = subprocess.run(['systemctl', 'show', unit, '--property=LoadState,UnitFileState,ActiveState,WorkingDirectory'],
                                capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.TimeoutExpired):
        return {}
    if result.returncode:
        return {}
    return dict(line.split('=', 1) for line in result.stdout.splitlines() if '=' in line)


def managed_unit(name):
    """The enabled systemd unit that runs `name` from this checkout, or None.

    A unit counts only when it is loaded, enabled and its WorkingDirectory is this ROOT, so
    worktrees and other checkouts never drive the live units. SIDEREAL_SYSTEMD=off forces the
    detached flow (rollback, emergencies); a supervised process never recurses into systemd.
    """
    unit = CFG.get('systemd', {}).get(name)
    if not unit or os.environ.get('SIDEREAL_SUPERVISOR_UNIT'):
        return None
    if os.environ.get('SIDEREAL_SYSTEMD', '').strip().lower() in ('0', 'off', 'false', 'no'):
        return None
    properties = unit_properties(unit)
    if properties.get('LoadState') != 'loaded' or properties.get('UnitFileState') not in ('enabled', 'enabled-runtime'):
        return None
    directory = properties.get('WorkingDirectory')
    if not directory or Path(directory).resolve() != ROOT.resolve():
        return None
    return unit


def launch(name, command, env=None):
    unit = managed_unit(name)
    with state_lock():
        state = load()
        if name in state and alive(state[name]):
            return
        if unit is None:
            logfile = STATE / f'{name}.log'
            with logfile.open('ab') as output:
                logfile.chmod(0o600)
                process = subprocess.Popen(command, cwd=ROOT, stdout=output, stderr=output, env=env, start_new_session=True)
            state[name] = {'pid': process.pid, 'start': proc(process.pid), 'command': command}
            save(state)
            return
    # The unit re-derives its own command at start (e.g. the current public release). With
    # Type=notify this returns once the supervisor has recorded its child and seen readiness.
    systemctl('start', unit)


def ready(url, name):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        row = load().get(name)
        if not row or not alive(row):
            raise RuntimeError(f'{name} stopped; inspect .runtime/{name}.log (systemd units: journalctl -u <unit>)')
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(.15)
    raise RuntimeError(f'{name} readiness timed out')


def wait_for(condition, seconds):
    deadline = time.monotonic() + seconds
    while not condition() and time.monotonic() < deadline:
        time.sleep(.1)
    return condition()


def stop_row(name, row):
    supervisor = supervisor_of(row)
    if supervisor and supervisor.get('unit'):
        # systemd owns this process: killing it directly would count as a failure and
        # Restart=on-failure would bring it straight back.
        systemctl('stop', supervisor['unit'])
    elif supervisor:
        os.kill(supervisor['pid'], signal.SIGTERM)
        wait_for(lambda: supervisor_of(row) is None and not alive(row), STOP_GRACE.get(name, DEFAULT_STOP_GRACE) + 5)
    if alive(row) or lingering(row):
        signal_group(row['pid'], signal.SIGTERM)
        if not wait_for(lambda: released(row), 8):
            signal_group(row['pid'], signal.SIGKILL)
            wait_for(lambda: released(row), 5)


def lingering(row):
    """The recorded process's leader is a zombie but other threads still run (and may hold its port).

    A multi-threaded server such as SpacetimeDB can end its main thread first; `alive` then
    reports it stopped while worker threads still listen, and an immediate restart fails
    with EADDRINUSE (seen during the 2026-09-28 systemd cutover).
    """
    if row['start'] is None or proc(row['pid']) is not None:
        return False
    try:
        fields = Path(f"/proc/{row['pid']}/stat").read_text().rsplit(')', 1)[1].split()
        if fields[19] != row['start']:
            return False
        for task in os.listdir(f"/proc/{row['pid']}/task"):
            if Path(f"/proc/{row['pid']}/task/{task}/stat").read_text().rsplit(')', 1)[1].split()[0] not in ('Z', 'X'):
                return True
    except (FileNotFoundError, ProcessLookupError, IndexError):
        return False
    return False


def released(row):
    return not alive(row) and not lingering(row)


def signal_group(pid, signum):
    try:
        os.killpg(pid, signum)
    except ProcessLookupError:
        pass


def down(only=None):
    for name, row in reversed(list(load().items())):
        if only is not None and name != only:
            continue
        stop_row(name, row)
        with state_lock():
            state = load()
            # Keep the row only if something else started a new live process meanwhile.
            if name in state and (state[name]['pid'] == row['pid'] or not alive(state[name])):
                del state[name]
            save(state)
    with state_lock():
        save(load())
    print(f'Stopped {only or "this project’s managed services"}.')


def notify(message):
    """sd_notify for Type=notify units; a no-op outside systemd."""
    address = os.environ.get('NOTIFY_SOCKET')
    if not address:
        return
    if address.startswith('@'):
        address = '\0' + address[1:]
    with socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM) as sock:
        sock.connect(address)
        sock.sendall(message.encode())


def probe(url):
    try:
        with urllib.request.urlopen(url, timeout=1) as response:
            return response.status == 200
    except Exception:
        return False


def terminate_group(child, grace):
    try:
        os.killpg(child.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        child.wait(timeout=grace)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait()


def supervise(name, command, env, url, bind, *, prepare=None, grace=None, ready_timeout=None):
    """Run one service in the foreground, recorded in processes.json like `launch`.

    The child gets its own process group, so a terminal Ctrl-C reaches only the supervisor,
    which forwards SIGTERM to the whole group. The row keeps the child's pid, so `status`,
    `ready`, `backup` and `backup-database` see it exactly like a detached service; its
    `supervisor` entry tells `down` to stop it through the supervisor or its systemd unit.
    Returns 0 after a requested stop (SIGTERM/SIGINT/SIGHUP), CONFLICT_EXIT when the service
    already runs or its port is taken, otherwise non-zero so Restart=on-failure restarts it.
    """
    grace = STOP_GRACE.get(name, DEFAULT_STOP_GRACE) if grace is None else grace
    ready_timeout = READY_TIMEOUT.get(name, DEFAULT_READY_TIMEOUT) if ready_timeout is None else ready_timeout
    unit = os.environ.get('SIDEREAL_SUPERVISOR_UNIT') or None
    stopping = []
    for signum in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
        signal.signal(signum, lambda received, _frame: stopping.append(received))

    def conflict():
        row = load().get(name)
        if row and alive(row):
            owner = supervisor_of(row)
            where = f"systemd unit {owner['unit']}" if owner and owner.get('unit') else 'outside this supervisor'
            print(f'{name} is already running (pid {row["pid"]}, {where}); stop it before serving.', file=sys.stderr, flush=True)
            return True
        try:
            port_free(*bind)
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
            print(f'{name}: {bind[0]}:{bind[1]} is in use by an unrecorded process; stop it before serving.', file=sys.stderr, flush=True)
            return True
        return False

    if conflict():
        return CONFLICT_EXIT
    if prepare is not None:
        prepare()
    if stopping:
        return 0
    # The child sees the same environment as a detached launch; systemd's notification
    # socket and unit marker belong to the supervisor only.
    child_env = {key: value for key, value in (os.environ if env is None else env).items()
                 if key not in ('NOTIFY_SOCKET', 'SIDEREAL_SUPERVISOR_UNIT')}
    with state_lock():
        if conflict():
            return CONFLICT_EXIT
        child = subprocess.Popen(command, cwd=ROOT, env=child_env, stdin=subprocess.DEVNULL, start_new_session=True)
        state = load()
        state[name] = {'pid': child.pid, 'start': proc(child.pid), 'command': command,
                       'supervisor': {'pid': os.getpid(), 'start': proc(os.getpid()), 'unit': unit}}
        save(state)
    print(f'{name}: supervising pid {child.pid}' + (f' for {unit}' if unit else ''), flush=True)
    status = 1
    try:
        deadline = time.monotonic() + ready_timeout
        is_ready = False
        while not stopping:
            code = child.poll()
            if code is not None:
                print(f'{name} exited unexpectedly with status {code}.', file=sys.stderr, flush=True)
                status = code if code > 0 else 1
                break
            if not is_ready:
                if probe(url):
                    is_ready = True
                    notify(f'READY=1\nSTATUS={name} ready at {url}')
                    print(f'{name}: ready at {url}', flush=True)
                    continue
                if time.monotonic() > deadline:
                    print(f'{name} readiness timed out after {ready_timeout}s.', file=sys.stderr, flush=True)
                    break
            time.sleep(.2 if not is_ready else .5)
        if stopping:
            notify('STOPPING=1')
            print(f'{name}: stopping (signal {stopping[0]}).', flush=True)
            status = 0
    finally:
        if child.poll() is None:
            terminate_group(child, grace)
        with state_lock():
            state = load()
            if state.get(name, {}).get('pid') == child.pid:
                del state[name]
                save(state)
    return status


def require_development():
    if CFG["auth"]["mode"] != "development":
        raise RuntimeError("This scaffold has no production authentication adapter yet; M1 must pass before enabling another auth mode.")


def publish(database=None, reset=False):
    require_development()
    run(["npm", "run", "typecheck", "--workspace", "@sidereal/world"])
    arguments = ['publish', database or CFG['project']['database'], '--server', DB_URL, '--module-path', 'packages/world', '--yes', '--no-config']
    arguments.append('--delete-data=always' if reset else '--delete-data=never')
    cli(*arguments)


def database_up(publish_module=True):
    require_development()
    state = load()
    if 'database' in state and alive(state['database']):
        ready(DB_URL + '/v1/ping', 'database')
        return
    port_free(CFG['server']['host'], CFG['server']['port'])
    launch('database', database_command())
    ready(DB_URL + '/v1/ping', 'database')
    if publish_module:
        publish()


def database_command():
    return CLI + ['start', '--listen-addr', f"{CFG['server']['host']}:{CFG['server']['port']}", '--data-dir', str(ROOT / '.spacetime-data'), '--non-interactive']


def app_command(name):
    settings = CFG[name]
    env = os.environ.copy()
    env.update(SIDEREAL_DB_URL=DB_URL, VITE_DATABASE=CFG['project']['database'], SIDEREAL_ALLOWED_HOSTS=json.dumps(settings.get('allowed_hosts', [])), VITE_CLIENT_PORT=str(CFG['client']['port']), VITE_DASHBOARD_PORT=str(CFG['dashboard']['port']))
    return ['node', 'node_modules/vite/bin/vite.js', '--config', f'apps/{name}/vite.config.ts', '--host', settings['host'], '--port', str(settings['port']), '--strictPort'], env


def prepare_app(name):
    run([sys.executable, 'scripts/prepare_app.py', name])


def app_up(name):
    require_development()
    settings = CFG[name]
    state = load()
    running = name in state and alive(state[name])
    if running or managed_unit(name) is None:
        # A systemd-managed app prepares its assets in its own `<name>-serve` start.
        prepare_app(name)
    if not running:
        port_free(settings['host'], settings['port'])
        command, env = app_command(name)
        launch(name, command, env)
    ready(f"http://127.0.0.1:{settings['port']}", name)
    print(f'{name}: http://localhost:{settings["port"]}')


def serve(name):
    """Foreground `<name>-serve`: what a systemd unit runs as ExecStart, or an operator in a terminal."""
    require_development()
    if name == 'database':
        return supervise(name, database_command(), None, DB_URL + '/v1/ping', (CFG['server']['host'], CFG['server']['port']))
    if name == 'public-client':
        from public_client import serve_command
        command, env = serve_command(CFG)
        settings = CFG['public_client']
        return supervise(name, command, env, f"http://127.0.0.1:{settings['port']}", (settings['host'], settings['port']))
    settings = CFG[name]
    command, env = app_command(name)
    return supervise(name, command, env, f"http://127.0.0.1:{settings['port']}", (settings['host'], settings['port']),
                     prepare=lambda: prepare_app(name))


def status():
    rows = {}
    for name, row in load().items():
        entry = {'running': alive(row), 'pid': row['pid']}
        if row.get('supervisor'):
            entry.update(supervisor=row['supervisor']['pid'], supervised=supervisor_of(row) is not None, unit=row['supervisor'].get('unit'))
        rows[name] = entry
    for name in CFG.get('systemd', {}):
        unit = managed_unit(name)
        if unit:
            entry = rows.setdefault(name, {'running': False, 'pid': None})
            entry.update(unit=unit, unitState=unit_properties(unit).get('ActiveState'))
    return rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['database-up', 'restore-review-prepare', 'restore-review-up', 'restore-review-restart', 'restore-review-stop', 'backup-database', 'public-client-delivery-stage', 'public-client-delivery-activate', 'public-client-delivery-rollback', 'public-client-stage', 'public-client-activate', 'public-client-deploy', 'public-client-up', 'public-client-stop', 'public-client-proxy', 'auth-https-setup', 'auth-https-status', 'auth-https-stop', 'keycloak-setup', 'keycloak-start', 'keycloak-stop', 'keycloak-status', 'keycloak-bootstrap', 'keycloak-authoring', 'keycloak-game-origin', 'keycloak-repair-cache', 'keycloak-review-grant', 'keycloak-review-revoke', 'keycloak-rotate-review-password', 'keycloak-shared-review-account', 'keycloak-native-public-review-account', 'keycloak-development-review-account', 'keycloak-development-review-grant', 'keycloak-development-review-revoke', 'setup', 'up', 'up-client', 'up-dashboard', 'down', 'stop-client', 'stop-dashboard', 'status', 'build-world', 'generate', 'publish', 'publish-review', 'export-art', 'export-voxels', 'export-engine', 'export-assembly', 'export-bulkheads', 'export-equipment', 'export-crew-items', 'export-inventory-icons', 'mcp', 'smoke-prepare', 'smoke-update', 'smoke', 'smoke-restart', 'smoke-auth-admission', 'restart-database', 'backup', *(f'{name}-serve' for name in SERVE)])
    parser.add_argument('--review-name', help='Named additive test database suffix; publish-review only')
    parser.add_argument('--client-artifact', help='Pinned prebuilt client directory; public-client-stage only')
    parser.add_argument('--client-artifact-sha256', help='Required complete tree digest with --client-artifact')
    parser.add_argument('--expected-live-client-sha256', help='Required live digest together with expected staged digest; public-client-activate only')
    parser.add_argument('--expected-staged-client-sha256', help='Exact reviewed staged digest; public-client-activate only')
    parser.add_argument('--module-artifact', help='Pinned compiled JS/WASM; publish-review only')
    parser.add_argument('--artifact-sha256', help='Required digest with --module-artifact')
    parser.add_argument('--ifcs-definition', action='store_true', help='Run fixed server-event and invalid-definition smoke in an isolated module copy')
    parser.add_argument('--ifcs-passenger', action='store_true', help='Run real IFCS two-client passenger evidence in a fresh isolated smoke database')
    parser.add_argument('--prefab', action='store_true', help='Assign, walk and fly a developer prefab ship in an isolated module copy')
    parser.add_argument('--smoke-name', help='Separate named smoke database; additive publication, never reset')
    parser.add_argument('--fresh-smoke', action='store_true', help='Reserve an unused numbered fixture for a named smoke run; never reset')
    parser.add_argument('--archive', help='Private cold archive; restore-review-prepare only')
    parser.add_argument('--expected-sha256', help='Pinned cold archive digest; restore-review-prepare only')
    args = parser.parse_args()
    command = args.command
    if (args.archive is not None or args.expected_sha256 is not None) and command != 'restore-review-prepare':
        parser.error('Recovery archive arguments are valid only for restore-review-prepare')
    if sum(map(bool, (args.ifcs_passenger, args.ifcs_definition, args.prefab))) > 1:
        parser.error('Choose one smoke variant')
    if args.prefab and (command != 'smoke' or not args.fresh_smoke or not args.smoke_name):
        parser.error('--prefab requires smoke --smoke-name LABEL --fresh-smoke')
    if args.ifcs_definition and (command != 'smoke' or not args.fresh_smoke or not args.smoke_name):
        parser.error('--ifcs-definition requires smoke --smoke-name LABEL --fresh-smoke')
    if args.ifcs_passenger and (command != 'smoke' or not args.fresh_smoke or not args.smoke_name):
        parser.error('--ifcs-passenger requires smoke --smoke-name LABEL --fresh-smoke')
    smoke_database = CFG['project']['database'] + '-smoke'
    if args.smoke_name is not None:
        import re
        if command not in ('smoke', 'smoke-restart', 'smoke-auth-admission', 'smoke-update') or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,39}', args.smoke_name):
            parser.error('--smoke-name requires a smoke command and lowercase name of at most40 characters')
        smoke_database = CFG['project']['database'] + '-' + args.smoke_name + '-smoke'
    if args.fresh_smoke and (command != 'smoke' or not args.smoke_name or len(args.smoke_name) > 32):
        parser.error('--fresh-smoke requires smoke --smoke-name with a label of at most32 characters; restart reuses the printed name')
    if args.module_artifact is not None or args.artifact_sha256 is not None:
        if command != 'publish-review' or not args.module_artifact or not args.artifact_sha256:
            parser.error('Pinned module artifact and SHA-256 are paired publish-review-only arguments')
    if args.client_artifact is not None or args.client_artifact_sha256 is not None:
        if command != 'public-client-stage' or not args.client_artifact or not args.client_artifact_sha256:
            parser.error('Prebuilt client path and SHA-256 are paired public-client-stage-only arguments')
    if args.expected_live_client_sha256 is not None or args.expected_staged_client_sha256 is not None:
        if command != 'public-client-activate' or not args.expected_live_client_sha256 or not args.expected_staged_client_sha256:
            parser.error('Expected live and staged digests are paired public-client-activate-only arguments')
    if args.review_name is not None and command != 'publish-review':
        parser.error('--review-name is valid only for publish-review')
    if command.endswith('-serve'):
        return serve(command.removesuffix('-serve'))
    if command.startswith('restore-review-'):
        from restore_review import command as restore_command
        restore_command(command.removeprefix('restore-review-'), sys.modules[__name__], args.archive, args.expected_sha256)
    elif command.startswith('public-client-'):
        if command == 'public-client-stop':
            down('public-client')
        else:
            from public_client import command as public_command
            expected = {} if args.expected_live_client_sha256 is None else {'expected_live_sha256': args.expected_live_client_sha256, 'expected_staged_sha256': args.expected_staged_client_sha256}
            public_command(command.removeprefix('public-client-'), CFG, sys.modules[__name__], artifact=args.client_artifact, artifact_sha256=args.client_artifact_sha256, **expected)
    elif command.startswith('auth-https-'):
        from auth_https import command as auth_https_command
        auth_https_command(command.removeprefix('auth-https-'), CFG)
    elif command.startswith('keycloak-'):
        from keycloak_service import command as keycloak_command
        keycloak_command(command.removeprefix('keycloak-'))
    elif command == 'setup':
        if not (TOOLS / 'bin' / CFG['project']['spacetime_version'] / 'spacetimedb-cli').exists():
            installer = STATE / 'install-spacetime.sh'
            urllib.request.urlretrieve('https://install.spacetimedb.com', installer)
            run(['sh', str(installer), '--root-dir', str(TOOLS), '--yes'])
            cli('version', 'install', CFG['project']['spacetime_version'])
        cli('version', 'use', CFG['project']['spacetime_version'])
        print('Pinned local SpacetimeDB ready; no global PATH changes.')
    elif command == 'build-world':
        run(['npm', 'run', 'typecheck', '--workspace', '@sidereal/world'])
        cli('build', '--module-path', 'packages/world')
    elif command == 'generate':
        cli('generate', '--lang', 'typescript', '--out-dir', 'packages/net/src/generated', '--module-path', 'packages/world', '--yes')
    elif command == 'publish':
        publish()
    elif command == 'publish-review':
        import re
        if not args.review_name or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,39}', args.review_name):
            parser.error('publish-review requires a lowercase --review-name of at most40 characters')
        if args.module_artifact:
            from review_module import publish as publish_artifact
            print(json.dumps(publish_artifact(sys.modules[__name__], args.review_name, args.module_artifact, args.artifact_sha256)))
        else:
            publish(CFG['project']['database'] + '-review-' + args.review_name, reset=False)
    elif command == 'smoke-update':
        publish(smoke_database, reset=False)
    elif command == 'smoke-prepare':
        publish(CFG['project']['database'] + '-smoke', reset=True)
    elif command in ('smoke', 'smoke-restart', 'smoke-auth-admission'):
        evidence = None
        if args.fresh_smoke:
            from fresh_smoke import reserve
            fixture = reserve(sys.modules[__name__], args.smoke_name)
            smoke_database = fixture['database']
            evidence = fixture['evidenceDirectory']
            print(json.dumps({'freshSmoke': fixture, 'restartCommand': 'python3 scripts/dev.py smoke-restart --smoke-name ' + fixture['smokeName']}), flush=True)
        elif args.smoke_name:
            from fresh_smoke import evidence_directory
            evidence = evidence_directory(sys.modules[__name__], smoke_database)
            if evidence and command == 'smoke':
                raise RuntimeError('Reserved fresh fixture already exists; use a new --fresh-smoke run or smoke-restart for persistence')
        ifcs_bindings = None
        if command == 'smoke':
            if args.ifcs_definition:
                from ifcs_smoke_module import publish as publish_ifcs_smoke
                ifcs_bindings = publish_ifcs_smoke(sys.modules[__name__], smoke_database, evidence)
            elif args.prefab:
                from prefab_smoke_module import publish as publish_prefab_smoke
                ifcs_bindings = publish_prefab_smoke(sys.modules[__name__], smoke_database, evidence)
            else:
                publish(smoke_database, reset=args.smoke_name is None)
        env = os.environ.copy()
        env.update(SIDEREAL_SMOKE_URL=DB_URL, SIDEREAL_SMOKE_DATABASE=smoke_database)
        if evidence:
            env['SIDEREAL_SMOKE_EVIDENCE_DIR'] = evidence
        else:
            env.pop('SIDEREAL_SMOKE_EVIDENCE_DIR', None)
        if ifcs_bindings:
            env['SIDEREAL_IFCS_TEST_BINDINGS'] = ifcs_bindings
        arguments = ['--verify-restart'] if command == 'smoke-restart' else []
        script = 'scripts/prefab-smoke.ts' if args.prefab else 'scripts/ifcs-definition-smoke.ts' if args.ifcs_definition else 'scripts/ifcs-passenger-smoke.ts' if args.ifcs_passenger else ('scripts/auth-admission-smoke.ts' if command == 'smoke-auth-admission' else 'scripts/smoke.ts')
        run([str(ROOT/'node_modules/.bin/tsx'), script, *arguments], env=env)
    elif command == 'database-up':
        database_up(publish_module=False)
    elif command == 'restart-database':
        require_development()
        previous = load().get('database')
        if not previous or not alive(previous):
            raise RuntimeError('A managed running database is required for restart proof.')
        down('database')
        database_up(publish_module=False)
        current = load()['database']
        print(json.dumps({'database_restarted': True, 'previous_pid': previous['pid'], 'current_pid': current['pid'], 'module_published': False,
                          'systemd_unit': (current.get('supervisor') or {}).get('unit')}))
    elif command == 'down':
        down()
    elif command.startswith('stop-'):
        down(command.removeprefix('stop-'))
    elif command == 'status':
        print(json.dumps(status(), indent=2))
        for name in ['client', 'dashboard']:
            print(f'{name}: http://localhost:{CFG[name]["port"]}')
        print(f'Database: {DB_URL}')
    elif command.startswith('up'):
        if command != 'up-dashboard':
            database_up()
        for name in (['client', 'dashboard'] if command == 'up' else [command.removeprefix('up-')]):
            app_up(name)
    elif command == 'export-art':
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/export_glb.py'])
    elif command == 'export-voxels':
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/build_interior_prop_source.py'])
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/build_ship_fixture_source.py'])
        run([str(ROOT/'node_modules/.bin/tsx'), 'scripts/build_voxel.ts'])
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/build_metal_materials.py'])
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/export_voxel_blender.py'])
    elif command == 'export-equipment':
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/build_equipment_source.py'])
    elif command == 'export-crew-items':
        # Proposal art kit (unpublished): GLBs, content JSON, source .blend, icons and review renders.
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python',
             'scripts/art_library/crew_items/build.py', '--', '--renders', str(ROOT/'.runtime/crew-items-r001-renders'),
             '--sheets', 'icons,held'])
    elif command == 'export-inventory-icons':
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/build_inventory_icons.py'])
    elif command == 'export-bulkheads':
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/build_bulkhead_source.py'])
        for slug in ['bulkhead', 'airlock']:
            run([str(ROOT/'node_modules/.bin/tsx'), 'scripts/mesh_sampled_asset.ts', slug])
            run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/export_sampled_asset.py', '--', slug])
    elif command == 'export-assembly':
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/build_interior_prop_source.py'])
        run([str(ROOT/'node_modules/.bin/tsx'), 'scripts/build_assembly.ts'])
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/export_voxel_blender.py', '--', '--assembly'])
    elif command == 'export-engine':
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/build_engine_source.py'])
        run([str(ROOT/'node_modules/.bin/tsx'), 'scripts/mesh_sampled_asset.ts'])
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/export_sampled_asset.py'])
    elif command == 'mcp':
        run([sys.executable, 'scripts/blender_mcp.py'])
    elif command == 'backup-database':
        from release_backup import backup_database
        backup_database(sys.modules[__name__])
    elif command == 'backup':
        if any(alive(row) for row in load().values()):
            raise RuntimeError('Stop the new stack before a consistent cold backup.')
        import tarfile
        destination = STATE / f'world-{time.strftime("%Y%m%d-%H%M%S")}.tar.gz'
        with tarfile.open(destination, 'w:gz') as archive:
            archive.add(ROOT / '.spacetime-data', arcname='database')
        destination.chmod(0o600)
        print(f'Private cold backup: {destination}')


if __name__ == '__main__':
    try:
        sys.exit(main() or 0)
    except (RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
