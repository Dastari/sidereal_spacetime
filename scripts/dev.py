#!/usr/bin/env python3
"""Project-owned lifecycle; application operations never rebuild or stop their sibling."""
from pathlib import Path
import argparse
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


def run(command, **kwargs):
    return subprocess.run(command, cwd=ROOT, check=True, **kwargs)


def cli(*arguments):
    return run(CLI + list(arguments))


def load():
    path = STATE / 'processes.json'
    return json.loads(path.read_text()) if path.exists() else {}


def save(state):
    path = STATE / 'processes.json'
    path.write_text(json.dumps(state, indent=2))
    path.chmod(0o600)


def proc(pid):
    try:
        fields = Path(f'/proc/{pid}/stat').read_text().split()
        return None if fields[2] == 'Z' else fields[21]
    except (FileNotFoundError, ProcessLookupError):
        return None


def alive(row):
    return row['start'] is not None and proc(row['pid']) == row['start']


def port_free(host, port):
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))


def launch(name, command, env=None):
    state = load()
    if name in state and alive(state[name]):
        return
    logfile = STATE / f'{name}.log'
    with logfile.open('ab') as output:
        logfile.chmod(0o600)
        process = subprocess.Popen(command, cwd=ROOT, stdout=output, stderr=output, env=env, start_new_session=True)
    state[name] = {'pid': process.pid, 'start': proc(process.pid), 'command': command}
    save(state)


def ready(url, name):
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        row = load().get(name)
        if not row or not alive(row):
            raise RuntimeError(f'{name} stopped; inspect .runtime/{name}.log')
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(.15)
    raise RuntimeError(f'{name} readiness timed out')


def down(only=None):
    state = load()
    for name, row in reversed(list(state.items())):
        if only is not None and name != only:
            continue
        if alive(row):
            os.killpg(row['pid'], signal.SIGTERM)
            deadline = time.monotonic() + 8
            while alive(row) and time.monotonic() < deadline:
                time.sleep(.1)
            if alive(row):
                os.killpg(row['pid'], signal.SIGKILL)
        del state[name]
    save(state)
    print(f'Stopped {only or "this project’s managed services"}.')


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
    launch('database', CLI + ['start', '--listen-addr', f"{CFG['server']['host']}:{CFG['server']['port']}", '--data-dir', str(ROOT / '.spacetime-data'), '--non-interactive'])
    ready(DB_URL + '/v1/ping', 'database')
    if publish_module:
        publish()


def app_up(name):
    require_development()
    settings = CFG[name]
    run([sys.executable, 'scripts/prepare_app.py', name])
    state = load()
    if name not in state or not alive(state[name]):
        port_free(settings['host'], settings['port'])
        env = os.environ.copy()
        env.update(SIDEREAL_DB_URL=DB_URL, VITE_DATABASE=CFG['project']['database'], SIDEREAL_ALLOWED_HOSTS=json.dumps(settings.get('allowed_hosts', [])), VITE_CLIENT_PORT=str(CFG['client']['port']), VITE_DASHBOARD_PORT=str(CFG['dashboard']['port']))
        launch(name, ['node', 'node_modules/vite/bin/vite.js', '--config', f'apps/{name}/vite.config.ts', '--host', settings['host'], '--port', str(settings['port']), '--strictPort'], env)
    ready(f"http://127.0.0.1:{settings['port']}", name)
    print(f'{name}: http://localhost:{settings["port"]}')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['restore-review-prepare', 'restore-review-up', 'restore-review-restart', 'restore-review-stop', 'backup-database', 'public-client-stage', 'public-client-activate', 'public-client-deploy', 'public-client-up', 'public-client-stop', 'public-client-proxy', 'auth-https-setup', 'auth-https-status', 'auth-https-stop', 'keycloak-setup', 'keycloak-start', 'keycloak-stop', 'keycloak-status', 'keycloak-bootstrap', 'keycloak-authoring', 'keycloak-game-origin', 'keycloak-repair-cache', 'keycloak-review-grant', 'keycloak-review-revoke', 'keycloak-shared-review-account', 'setup', 'up', 'up-client', 'up-dashboard', 'down', 'stop-client', 'stop-dashboard', 'status', 'build-world', 'generate', 'publish', 'publish-review', 'export-art', 'export-voxels', 'export-engine', 'export-assembly', 'export-bulkheads', 'export-crew', 'export-equipment', 'export-inventory-icons', 'mcp', 'smoke-prepare', 'smoke-update', 'smoke', 'smoke-restart', 'smoke-auth-admission', 'restart-database', 'backup'])
    parser.add_argument('--review-name', help='Named additive test database suffix; publish-review only')
    parser.add_argument('--module-artifact', help='Pinned compiled JS/WASM; publish-review only')
    parser.add_argument('--artifact-sha256', help='Required digest with --module-artifact')
    parser.add_argument('--smoke-name', help='Separate named smoke database; additive publication, never reset')
    parser.add_argument('--archive', help='Private cold archive; restore-review-prepare only')
    parser.add_argument('--expected-sha256', help='Pinned cold archive digest; restore-review-prepare only')
    args = parser.parse_args()
    command = args.command
    if (args.archive is not None or args.expected_sha256 is not None) and command != 'restore-review-prepare':
        parser.error('Recovery archive arguments are valid only for restore-review-prepare')
    smoke_database = CFG['project']['database'] + '-smoke'
    if args.smoke_name is not None:
        import re
        if command not in ('smoke', 'smoke-restart', 'smoke-auth-admission') or not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,39}', args.smoke_name):
            parser.error('--smoke-name requires a smoke command and lowercase name of at most40 characters')
        smoke_database = CFG['project']['database'] + '-' + args.smoke_name + '-smoke'
    if args.module_artifact is not None or args.artifact_sha256 is not None:
        if command != 'publish-review' or not args.module_artifact or not args.artifact_sha256:
            parser.error('Pinned module artifact and SHA-256 are paired publish-review-only arguments')
    if args.review_name is not None and command != 'publish-review':
        parser.error('--review-name is valid only for publish-review')
    if command.startswith('restore-review-'):
        from restore_review import command as restore_command
        restore_command(command.removeprefix('restore-review-'), sys.modules[__name__], args.archive, args.expected_sha256)
    elif command.startswith('public-client-'):
        if command == 'public-client-stop':
            down('public-client')
        else:
            from public_client import command as public_command
            public_command(command.removeprefix('public-client-'), CFG, sys.modules[__name__])
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
        publish(CFG['project']['database'] + '-smoke', reset=False)
    elif command == 'smoke-prepare':
        publish(CFG['project']['database'] + '-smoke', reset=True)
    elif command in ('smoke', 'smoke-restart', 'smoke-auth-admission'):
        if command == 'smoke':
            publish(smoke_database, reset=args.smoke_name is None)
        env = os.environ.copy()
        env.update(SIDEREAL_SMOKE_URL=DB_URL, SIDEREAL_SMOKE_DATABASE=smoke_database)
        arguments = ['--verify-restart'] if command == 'smoke-restart' else []
        script = 'scripts/auth-admission-smoke.ts' if command == 'smoke-auth-admission' else 'scripts/smoke.ts'
        run([str(ROOT/'node_modules/.bin/tsx'), script, *arguments], env=env)
    elif command == 'restart-database':
        require_development()
        previous = load().get('database')
        if not previous or not alive(previous):
            raise RuntimeError('A managed running database is required for restart proof.')
        down('database')
        database_up(publish_module=False)
        print(json.dumps({'database_restarted': True, 'previous_pid': previous['pid'], 'current_pid': load()['database']['pid'], 'module_published': False}))
    elif command == 'down':
        down()
    elif command.startswith('stop-'):
        down(command.removeprefix('stop-'))
    elif command == 'status':
        print(json.dumps({name: {'running': alive(row), 'pid': row['pid']} for name, row in load().items()}, indent=2))
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
    elif command == 'export-inventory-icons':
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/build_inventory_icons.py'])
    elif command == 'export-crew':
        run([CFG['art']['blender'], '--background', '--factory-startup', '--python-exit-code', '1', '--python', 'scripts/build_crew_source.py'])
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
        main()
    except (RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
