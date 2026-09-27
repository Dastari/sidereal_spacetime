#!/usr/bin/env python3
"""Isolated end-to-end ship-wipe rehearsal (npm run smoke:ship-wipe).

Stage "seed" (live baseline module):
  1. Export the live-baseline authority source (a git ref) into a temporary copy.
  2. Publish that unmodified module into a NEW named -smoke database on the
     development server from dev.toml. With --full-seed, also run the full
     standard smoke there first (many characters and starter ships).
  3. Run scripts/ship-wipe-seed.ts under the baseline bindings: live-shaped
     accounts (default three) with starter Wayfarers, ship cargo and a ground drop.
Stage "wipe" (this checkout's module):
  4. Upgrade the same database in place with --delete-data=never (the exact live
     publication mode).
  5. Run scripts/ship-wipe-smoke.ts: the runbook tooling (export, policy,
     dry-run, apply, verify) plus player-view and assignment-refusal invariants.
Stage "all" runs both; stopping between them allows "before" screenshots.

Refuses the live server port and database name. Never resets another database.
"""
import argparse
import json
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
    parser.add_argument('--label', required=True, help='new lowercase smoke label, e.g. wipe-r003')
    parser.add_argument('--stage', choices=['all', 'seed', 'wipe'], default='all')
    parser.add_argument('--full-seed', action='store_true', help='also run the full standard smoke before seeding')
    parser.add_argument('--keep-baseline', action='store_true', help='keep the scratch baseline copy after the wipe stage')
    parser.add_argument('--accounts', default='Owner Main,Crew Two,Crew Three',
                        help='comma-separated live-shaped seed account names')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,31}', args.label):
        raise SystemExit('Label must be lowercase letters/digits/hyphens, at most 32 characters')
    server = CFG['server']
    if int(server['port']) == 3100 or CFG['project']['database'] == 'sidereal-spacetime-dev':
        raise SystemExit('Refusing: dev.toml points at the live server/database. Use an isolated server port and database name.')
    url = f"http://{server['host']}:{server['port']}"
    database = f"{CFG['project']['database']}-{args.label}-smoke"
    evidence = ROOT / '.runtime' / f'ship-wipe-{args.label}'
    env = os.environ.copy()
    env.update(SIDEREAL_SMOKE_URL=url, SIDEREAL_SMOKE_DATABASE=database,
               SIDEREAL_SMOKE_EVIDENCE_DIR=str(evidence), SIDEREAL_SEED_ACCOUNTS=args.accounts)

    if args.stage in ('all', 'seed'):
        if evidence.exists():
            raise SystemExit(f'{evidence} exists; choose a new label')
        evidence.mkdir(parents=True)
        os.chmod(evidence, 0o700)
        # Disk-backed scratch (never /tmp: it is RAM-backed on the shared host).
        scratch = Path(os.environ.get('SIDEREAL_SCRATCH', Path.home() / 'sidereal-scratch/ships-removal'))
        scratch.mkdir(parents=True, exist_ok=True)
        baseline = scratch / f'ship-wipe-baseline-{args.label}'
        if baseline.exists():
            raise SystemExit(f'{baseline} exists; choose a new label')
        baseline.mkdir()
        archive = subprocess.run(['git', 'archive', args.baseline_ref], cwd=ROOT, check=True,
                                 capture_output=True).stdout
        subprocess.run(['tar', '-x', '-C', str(baseline)], input=archive, check=True)
        shutil.copy(ROOT / 'dev.toml', baseline / 'dev.toml')
        shutil.copy(ROOT / 'scripts/ship-wipe-seed.ts', baseline / 'scripts/ship-wipe-seed.ts')
        os.symlink((ROOT / '.tools').resolve(), baseline / '.tools')
        run(['npm', 'ci', '--no-audit', '--no-fund'], baseline)
        if args.full_seed:
            run([sys.executable, 'scripts/dev.py', 'smoke', '--smoke-name', args.label], baseline)
        else:
            # Fresh additive publication of the unmodified baseline module only.
            run([sys.executable, '-c', f"import sys; sys.path.insert(0, 'scripts'); import dev; dev.publish({database!r}, reset=True)"], baseline)
        run([str(baseline / 'node_modules/.bin/tsx'), 'scripts/ship-wipe-seed.ts'], baseline, env)
        print(json.dumps({'seeded': database, 'server': url, 'evidence': str(evidence),
                          'next': f'npm run smoke:ship-wipe -- --label {args.label} --stage wipe'}))

    if args.stage in ('all', 'wipe'):
        if not (evidence / 'ship-wipe-seed.json').exists():
            raise SystemExit('Run --stage seed first')
        run([sys.executable, 'scripts/dev.py', 'smoke-update', '--smoke-name', args.label], ROOT)
        run([str(ROOT / 'node_modules/.bin/tsx'), 'scripts/ship-wipe-smoke.ts'], ROOT, env)
        print(f'Ship wipe rehearsal passed: {database} on {url}; evidence {evidence}/ship-wipe-smoke.json')
        scratch = Path(os.environ.get('SIDEREAL_SCRATCH', Path.home() / 'sidereal-scratch/ships-removal'))
        baseline = scratch / f'ship-wipe-baseline-{args.label}'
        if baseline.exists() and not args.keep_baseline:
            shutil.rmtree(baseline)
            print(f'Removed scratch baseline copy {baseline}')


if __name__ == '__main__':
    main()
