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


def database_up():
    require_development()
    state = load()
    if 'database' in state and alive(state['database']):
        ready(DB_URL + '/v1/ping', 'database')
        return
    port_free(CFG['server']['host'], CFG['server']['port'])
    launch('database', CLI + ['start', '--listen-addr', f"{CFG['server']['host']}:{CFG['server']['port']}", '--data-dir', str(ROOT / '.spacetime-data'), '--non-interactive'])
    ready(DB_URL + '/v1/ping', 'database')
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
    parser.add_argument('command', choices=['setup', 'up', 'up-client', 'up-dashboard', 'down', 'stop-client', 'stop-dashboard', 'status', 'build-world', 'generate', 'publish', 'export-art', 'mcp', 'smoke-prepare', 'smoke', 'smoke-restart', 'backup'])
    command = parser.parse_args().command
    if command == 'setup':
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
    elif command == 'smoke-prepare':
        publish(CFG['project']['database'] + '-smoke', reset=True)
    elif command in ('smoke', 'smoke-restart'):
        if command == 'smoke':
            publish(CFG['project']['database'] + '-smoke', reset=True)
        env = os.environ.copy()
        env.update(SIDEREAL_SMOKE_URL=DB_URL, SIDEREAL_SMOKE_DATABASE=CFG['project']['database'] + '-smoke')
        arguments = ['--verify-restart'] if command == 'smoke-restart' else []
        run([str(ROOT/'node_modules/.bin/tsx'), 'scripts/smoke.ts', *arguments], env=env)
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
    elif command == 'mcp':
        run([sys.executable, 'scripts/blender_mcp.py'])
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
