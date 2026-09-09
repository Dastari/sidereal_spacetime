"""Install the exact r004 native family without editing any live blueprint/ship."""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r004/family"
PINS = {
    "kit.glb": "568d491623f03df932a9c5c120a94e4a60b00bd0fd421ae3cf928c89543505db",
    "interfaces.json": "136afd89f22c1cbea3ba590fca4ebc4cd81f82615f71fcadcedc2d041b73544b",
    "collision-proxies.json": "83a408e22f8c56b1c515827938273297ed41e6d70a94eeb13180290158c8e399",
    "boundary-kit.blend": "3f615eeca6bbec35b45b207e0a0a6d42ad6edca5de781c1fa994d0abc5efc166",
}
for name, expected in PINS.items():
    if hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() != expected:
        raise SystemExit(f"Pinned boundary family mismatch: {name}")
source = json.loads((SOURCE / "interfaces.json").read_text())
assert source["revision"] == "r004" and len(source["parts"]) == 46
runtime = {key: source[key] for key in ["revision", "latticePerMeter", "floorTopUnits", "wallTopUnits", "coreThicknessM", "decorativeEnvelopeWidthM", "parts", "grammar"]}
content = ROOT / "packages/content/src/construction-boundary-family-interfaces.json"
content.write_text(json.dumps(runtime, indent=2) + "\n")
subprocess.run([str(ROOT / "node_modules/.bin/prettier"), "--write", str(content)], cwd=ROOT, check=True)
for target in [ROOT / "assets/runtime/construction/boundary-r004", ROOT / "apps/client/public/assets/construction/boundary-r004", ROOT / "apps/dashboard/public/assets/construction/boundary-r004"]:
    target.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SOURCE / "kit.glb", target / "kit.glb")
    (target / "manifest.json").write_text(json.dumps({"schema": "sidereal.native-boundary-family-runtime.v1", "id": "shipyard.structure.boundary-kit", "revision": "r004", "sourcePins": PINS, "runtimeMetadataSha256": hashlib.sha256(content.read_bytes()).hexdigest(), "status": "working candidate; exact opt-in only, no pressure/native-damage/final-art approval"}, indent=2) + "\n")
print("Pinned boundary family copied; no live blueprint, assembly or database changes.")
