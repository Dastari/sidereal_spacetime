"""Managed native Wayfarer authoring; never changes live catalogs or authority."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--revision', type=int, default=1)
    parser.add_argument('--component', choices=('hull', 'engines'), required=True)
    args = parser.parse_args()
    if args.revision < 1:
        raise ValueError('Revision must be positive')
    out = ROOT / 'assets/art-library/framed-wayfarer' / f'r{args.revision:03}' / args.component
    if (out / 'models.json').exists():
        raise ValueError('Retain this revision; use a new revision for another build')
    out.mkdir(parents=True, exist_ok=True)
    recipe = ROOT / 'scripts/art_library' / f'framed_{args.component}.py'
    shutil.copyfile(recipe, out / 'recipe.py')
    cfg = tomllib.loads((ROOT / 'dev.toml').read_text())
    command = [cfg['art']['blender'], '--background', '--factory-startup',
               '--threads', '8', '--python-exit-code', '1', '--python',
               str(ROOT / 'scripts/art_library/framed_wayfarer_entry.py'),
               '--', str(recipe), str(out)]
    subprocess.run(command, cwd=ROOT, check=True)


if __name__ == '__main__':
    main()
