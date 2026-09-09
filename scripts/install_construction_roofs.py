"""Install an exact native roof candidate; no live assembly or blueprint edits."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/art-library/designs/shipyard.structure.roof-kit/revisions/r001"
PINS = {
    "kit.glb": "fe5646a431fcaa21033ca235094188b450c33e55e15735b7834fc18623fb3711",
    "interfaces.json": "ffa320a5edc5b99a45ff50a4d33f94c0346fe87972358a73a4fee8375de68a57",
    "roof-kit.blend": "e3ff6410c70fcef0dc2015beff2dda942c24ead86b09c19e41d342f75adeba7c",
}
for name, digest in PINS.items():
    if hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() != digest:
        raise SystemExit(f"Pinned roof artifact mismatch: {name}")
kit = json.loads((SOURCE / "interfaces.json").read_text())
assert len(kit["parts"]) == 12 and kit["revision"] == "r001"
for target in [ROOT / "assets/runtime/construction/roof-r001",
               ROOT / "apps/client/public/assets/construction/roof-r001",
               ROOT / "apps/dashboard/public/assets/construction/roof-r001"]:
    target.mkdir(parents=True, exist_ok=True)
    for name in ["kit.glb", "interfaces.json"]:
        shutil.copyfile(SOURCE / name, target / name)
    (target / "manifest.json").write_text(json.dumps({
        "schema": "sidereal.construction-roof-runtime.v1",
        "designId": kit["id"], "revision": "r001", "pins": PINS,
        "status": "working candidate; no final art, seal or damage approval",
        "scope": "explicit construction roofKit only; no Wayfarer replacement",
    }, indent=2) + "\n")
shutil.copyfile(SOURCE / "interfaces.json", ROOT / "packages/content/src/construction-roof-interfaces.json")
subprocess.run([str(ROOT / "node_modules/.bin/prettier"), "--write",
                "packages/content/src/construction-roof-interfaces.json"], cwd=ROOT, check=True)
print("Exact roof candidate copied; no database or existing assembly changes.")
