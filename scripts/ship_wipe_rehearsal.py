#!/usr/bin/env python3
"""Isolated end-to-end ship-wipe rehearsal (npm run smoke:ship-wipe).

1. Export the live-baseline authority source (a git ref) into a temporary copy.
2. Publish that baseline module into a new named -smoke database on the
   development server from dev.toml and seed it with the full standard smoke
   (many characters, starter ships, stations, fittings, cargo containers).
3. Upgrade the same database in place to this checkout's module with
   --delete-data=never (the exact live publication mode).
4. Run scripts/ship-wipe-smoke.ts: extra cargo/ground items, then the operator
   runbook tooling (export, policy, dry-run, apply, verify, assign) and player
   view invariants.

Refuses the live server port. Never resets or touches any other database.
"""
import argparse
import os
import re
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CFG = tomllib.loads((ROOT / 'dev.toml').read_text())


def run(command, cwd, env=None):
    print('+', ' '.join(command), f'(in {cwd})', flush=True)
    subprocess.run(command, cwd=cwd, check=True, env=env)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--baseline-ref', default='release/live-authority-20260921')
    parser.add_argument('--label', required=True, help='new lowercase smoke label, e.g. wipe-r001')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,31}', args.label):
        raise SystemExit('Label must be lowercase letters/digits/hyphens, at most 32 characters')
    server = CFG['server']
    if int(server['port']) == 3100 or CFG['project']['database'] == 'sidereal-spacetime-dev':
        raise SystemExit('Refusing: dev.toml points at the live server/database. Use an isolated server port and database name.')
    url = f"http://{server['host']}:{server['port']}"
    database = f"{CFG['project']['database']}-{args.label}-smoke"

    baseline = Path('/tmp') / f'sidereal-ship-wipe-baseline-{args.label}'
    if baseline.exists():
        raise SystemExit(f'{baseline} exists; choose a new label')
    baseline.mkdir()
    archive = subprocess.run(['git', 'archive', args.baseline_ref], cwd=ROOT, check=True, capture_output=True).stdout
    subprocess.run(['tar', '-x', '-C', str(baseline)], input=archive, check=True)
    shutil.copy(ROOT / 'dev.toml', baseline / 'dev.toml')
    os.symlink((ROOT / '.tools').resolve(), baseline / '.tools')
    run(['npm', 'ci', '--no-audit', '--no-fund'], baseline)

    # Seed with the baseline (live) module, then upgrade in place.
    run([sys.executable, 'scripts/dev.py', 'smoke', '--smoke-name', args.label], baseline)
    run([sys.executable, 'scripts/dev.py', 'smoke-update', '--smoke-name', args.label], ROOT)
    evidence = ROOT / '.runtime' / f'ship-wipe-{args.label}'
    evidence.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env.update(SIDEREAL_SMOKE_URL=url, SIDEREAL_SMOKE_DATABASE=database, SIDEREAL_SMOKE_EVIDENCE_DIR=str(evidence))
    run([str(ROOT / 'node_modules/.bin/tsx'), 'scripts/ship-wipe-smoke.ts'], ROOT, env)
    print(f'Ship wipe rehearsal passed: {database} on {url}; evidence {evidence}/ship-wipe-smoke.json')


if __name__ == '__main__':
    main()
