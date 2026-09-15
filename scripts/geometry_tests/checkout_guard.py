"""Fail geometry regressions that accidentally read the developer's other checkout."""
from pathlib import Path
import os
import runpy
import sys

ROOT = Path(__file__).resolve().parents[2]
LEGACY = Path('/root/sidereal_spacetime')


def reject_other_checkout(event, args):
    if event != 'open' or ROOT == LEGACY or isinstance(args[0], int):
        return
    path = Path(os.fsdecode(args[0])).absolute()
    if path.is_relative_to(LEGACY):
        raise AssertionError(f'Native qualification read another checkout: {path}')


sys.addaudithook(reject_other_checkout)

if __name__ == '__main__':
    sys.argv = sys.argv[1:]
    sys.path.insert(0, str(Path(sys.argv[0]).resolve().parent))
    runpy.run_path(sys.argv[0], run_name='__main__')
