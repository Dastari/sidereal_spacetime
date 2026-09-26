"""Managed prefab-ship kit export (`npm run art:ship-kit`). Writes GLBs + manifest into
assets/runtime/ship-kit/r001 only; never publishes apps or touches database state.
Extra arguments pass through to ship_kit_export.py (for example `-- --only id,id --sheet /tmp/sheet.png`)."""
from pathlib import Path
import subprocess
import sys
import tomllib

R = Path(__file__).resolve().parents[2]
cfg = tomllib.loads((R / "dev.toml").read_text()) if (R / "dev.toml").exists() else {}
blender = cfg.get("art", {}).get("blender", "blender")
cmd = [blender, "--background", "--factory-startup", "--python-exit-code", "1",
       "--python", str(R / "scripts/art_library/ship_kit_export.py"), "--",
       "--pieces", "packages/content/src/ship-kit-pieces.v1.json", "--out", "assets/runtime/ship-kit/r001", *sys.argv[1:]]
sys.exit(subprocess.run(cmd, cwd=R).returncode)
