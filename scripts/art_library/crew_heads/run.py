"""Managed entry point: `npm run art:crew-heads [-- --review DIR --sheets a,b --no-export]`.

Builds and exports the crew head kit with headless Blender (never the shared MCP instance), then composes
review sheets when --review is given. Output GLBs + manifest go to assets/runtime/crew/heads/v1/.
Nothing is published or deployed by this command.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
CATALOG = ROOT / "packages/content/src/crew-heads.v1.json"
OUT = ROOT / "assets/runtime/crew/heads/v1"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--review", default="")
    ap.add_argument("--refs", default="", help="directory of exact reference crops (see ref_crops/tiles/INDEX.json)")
    ap.add_argument("--sheets", default="")
    ap.add_argument("--samples", default="24")
    ap.add_argument("--no-export", action="store_true")
    a = ap.parse_args()
    blender = shutil.which("blender") or "/usr/bin/blender"
    cmd = [blender, "-b", "--factory-startup", "-P", str(HERE / "build.py"), "--", "--catalog", str(CATALOG), "--out", str(OUT),
           "--samples", a.samples]
    if a.review:
        cmd += ["--review", a.review]
    if a.sheets:
        cmd += ["--sheets", a.sheets]
    if a.no_export:
        cmd.append("--no-export")
    subprocess.run(cmd, check=True)
    if a.review and a.refs:
        py = ROOT / ".tools/art/bin/python"
        subprocess.run([str(py if py.exists() else sys.executable), str(HERE / "compose.py"), "--review", a.review, "--catalog",
                        str(CATALOG), "--refs", a.refs], check=True)
    print("crew heads:", OUT if not a.no_export else "(no export)", flush=True)


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
