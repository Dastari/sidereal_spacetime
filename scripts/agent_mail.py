#!/usr/bin/env python3
"""Shared, loopback-only Agent Mail lifecycle. Invoke through npm run agent-mail."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tarfile
import tempfile
import tomllib
import urllib.request
import dev

ROOT = Path(__file__).resolve().parents[1]
CFG = tomllib.loads((ROOT / 'dev.toml').read_text())['agent_mail']
STATE = Path(CFG['state_dir']).expanduser().resolve()
URL = f"http://127.0.0.1:{CFG['port']}"
KEY = 'RWTQGPeLsnm9G7VFdFWkkcRi3wJK/PqsYxWC+oLNN74W9IjBxRU1Xu70'


def install():
    if platform.system() != 'Linux' or platform.machine() != 'x86_64':
        raise RuntimeError('This pinned setup supports Linux x86_64; use upstream verified installation elsewhere.')
    if not shutil.which('minisign'):
        raise RuntimeError('Install minisign first (Debian: apt-get install minisign).')
    dest = STATE / 'bin' / CFG['version']
    if dest.exists():
        for name in ('am', 'mcp-agent-mail'):
            version = subprocess.check_output([str(dest / name), '--version'], text=True).strip()
            if version.split()[-1] != CFG['version'].removeprefix('v'):
                raise RuntimeError(f'Unexpected installed version: {version}')
        print(f'Already installed: {dest}')
        return
    base = 'https://github.com/Dicklesworthstone/mcp_agent_mail_rust/releases/download/' + CFG['version']
    artifact = 'mcp-agent-mail-x86_64-unknown-linux-musl.tar.xz'
    (STATE / 'bin').mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(dir=STATE / 'bin') as directory:
        stage = Path(directory)
        for name in (artifact, 'SHA256SUMS', 'SHA256SUMS.minisig'):
            subprocess.run(['curl', '-fSL', '--retry', '3', base + '/' + name, '-o', str(stage / name)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        subprocess.run(['minisign', '-Vm', str(stage / 'SHA256SUMS'), '-x', str(stage / 'SHA256SUMS.minisig'), '-P', KEY], check=True)
        entries = [line.split() for line in (stage / 'SHA256SUMS').read_text().splitlines()]
        hashes = [row[0] for row in entries if len(row) == 2 and row[1].lstrip('*') == artifact]
        with (stage / artifact).open('rb') as downloaded:
            digest = hashlib.file_digest(downloaded, 'sha256').hexdigest()
        if hashes != [digest]:
            raise RuntimeError('Signed archive checksum mismatch or duplicate/missing entry')
        payload = stage / 'payload'
        payload.mkdir()
        with tarfile.open(stage / artifact) as archive:
            members = archive.getmembers()
            if sorted(m.name for m in members) != ['am', 'mcp-agent-mail'] or any(not m.isfile() or m.size <= 0 for m in members):
                raise RuntimeError('Unexpected archive members')
            for member in members:
                target = payload / member.name
                with archive.extractfile(member) as source, target.open('wb') as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o700)
                version = subprocess.check_output([str(target), '--version'], text=True).strip()
                if version.split()[-1] != CFG['version'].removeprefix('v'):
                    raise RuntimeError(f'Unexpected release version: {version}')
        for name in ('SHA256SUMS', 'SHA256SUMS.minisig'):
            shutil.copy2(stage / name, payload / name)
        payload.rename(dest)
    print(f'Installed signed release: {dest}')


def rpc(method, params=None):
    body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': method, 'params': params or {}}).encode()
    request = urllib.request.Request(URL + '/mcp/', data=body, headers={'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream'})
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode()
    if raw.startswith('event:') or raw.startswith('data:'):
        raw = next(line[6:] for line in raw.splitlines() if line.startswith('data: '))
    result = json.loads(raw)
    if 'error' in result or result.get('result', {}).get('isError'):
        raise RuntimeError(str(result))
    return result['result']


def call(tool_name, **arguments):
    return rpc('tools/call', {'name': tool_name, 'arguments': arguments})


def tool_data(result):
    if 'structuredContent' in result:
        return result['structuredContent']
    return json.loads(next(item['text'] for item in result['content'] if item['type'] == 'text'))


def verify():
    rpc('initialize', {'protocolVersion': '2024-11-05', 'capabilities': {}, 'clientInfo': {'name': 'sidereal-setup', 'version': '1.0'}})
    names = {tool['name'] for tool in rpc('tools/list')['tools']}
    required = {'ensure_project', 'register_agent', 'fetch_inbox', 'file_reservation_paths', 'release_file_reservations', 'send_message'}
    if not required <= names:
        raise RuntimeError(f'Missing tools: {required - names}')
    project = CFG['project_key']
    call('ensure_project', human_key=project)
    registered = call('register_agent', project_key=project, program='sidereal-setup', model='verification', task_description='Installation probe; not an active worker')
    agent = tool_data(registered)['name']
    try:
        result = call('file_reservation_paths', project_key=project, agent_name=agent, paths=['.agent-mail-verification-probe'], ttl_seconds=60, exclusive=True)
        if tool_data(result).get('conflicts') != [] or not tool_data(result).get('granted'):
            raise RuntimeError(f'Unexpected reservation result: {result}')
        call('fetch_inbox', project_key=project, agent_name=agent, limit=1)
    finally:
        call('release_file_reservations', project_key=project, agent_name=agent)
    print(f'MCP verified: {len(names)} tools, project registration, inbox, reservation/release. No messages sent.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['setup', 'up', 'down', 'status', 'verify'])
    args = parser.parse_args()
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    STATE.chmod(0o700)
    # Reuse the project's process identity checks with a mailbox-only state registry.
    dev.STATE = STATE
    with (STATE / 'lifecycle.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.command == 'setup':
            install()
        elif args.command == 'up':
            row = dev.load().get('agent-mail')
            if not row or not dev.alive(row):
                dev.port_free('127.0.0.1', CFG['port'])
                binary = STATE / 'bin' / CFG['version'] / 'mcp-agent-mail'
                if not binary.exists():
                    raise RuntimeError('Run npm run agent-mail -- setup first.')
                env = os.environ.copy()
                env.update(HTTP_HOST='127.0.0.1', HTTP_PORT=str(CFG['port']), HTTP_PATH='/mcp/', HTTP_BEARER_TOKEN='', HTTP_ALLOW_LOCALHOST_UNAUTHENTICATED='true', HTTP_ALLOWED_HOSTS='', DATABASE_URL='sqlite:///' + str(STATE / 'storage.sqlite3'), STORAGE_ROOT=str(STATE / 'archive'), TUI_ENABLED='false')
                dev.launch('agent-mail', [str(binary), 'serve', '--no-tui'], env=env)
            try:
                dev.ready(URL + '/health', 'agent-mail')
            except RuntimeError as error:
                raise RuntimeError(f'{error}; log: {STATE / "agent-mail.log"}') from error
            print(f'Agent Mail ready: {URL}/mcp/')
        elif args.command == 'down':
            dev.down('agent-mail')
        elif args.command == 'status':
            row = dev.load().get('agent-mail')
            print(json.dumps({'running': bool(row and dev.alive(row)), 'url': URL + '/mcp/', 'state': str(STATE)}))
        else:
            verify()


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        raise SystemExit(str(error))
