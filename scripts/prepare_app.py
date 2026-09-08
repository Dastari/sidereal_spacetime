"""Copy immutable review assets/docs into exactly one app's public directory."""
from pathlib import Path
import argparse
import shutil
ROOT = Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('app',choices=['client','dashboard']);app=parser.parse_args().app
public=ROOT/f'apps/{app}/public'
(public/'assets').mkdir(parents=True,exist_ok=True)
shutil.copy2(ROOT/'assets/runtime/wayfarer.glb',public/'assets/wayfarer.glb')
shutil.copy2(ROOT/'PIVOT.md',public/'PIVOT.md')
shutil.copytree(ROOT/'docs',public/'docs',dirs_exist_ok=True)
shutil.copytree(ROOT/'reference',public/'reference',dirs_exist_ok=True)
print(f'Prepared {app} assets and documentation only.')
