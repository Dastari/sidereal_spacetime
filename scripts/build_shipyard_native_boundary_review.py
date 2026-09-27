"""Build a local, immutable native review artifact; never installs game assets."""
import hashlib
import json
import argparse
from pathlib import Path
import subprocess
from native_boundary_review_manifest import build_manifest
from native_cockpit_review_manifest import build_cockpit

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "assets/art-library"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--revision", type=int, required=True)
    revision = parser.parse_args().revision
    if revision < 0 or revision > 999:
        raise SystemExit("Revision must be 0..999")
    OUTPUT = ART / f"shipyard-completion/native-r{revision:03d}"
    if OUTPUT.exists():
        raise SystemExit("Review revision already exists; preserve it and author a new revision.")
    manifest = build_manifest(OUTPUT)
    cockpit = build_cockpit(OUTPUT)
    cockpit["fixture"]["notes"] = " ".join(cockpit["fixture"]["notes"])
    manifest["fixtures"].append(cockpit["fixture"])
    manifest["pins"].update(cockpit["pins"])
    manifest["sourcePins"].update(cockpit["sourcePins"])
    for source in [Path(__file__), ROOT / "scripts/shipyard_native_boundary_review.ts", ROOT / "scripts/native_boundary_review_manifest.py", ROOT / "scripts/native_cockpit_review_manifest.py"]:
        manifest["sourcePins"][str(source.relative_to(ROOT))] = hashlib.sha256(source.read_bytes()).hexdigest()
    manifest["approval"] = "unapproved"
    OUTPUT.mkdir(parents=True)
    for copy in cockpit["copies"]:
        target = OUTPUT / copy["target"]
        data = (ROOT / copy["source"]).read_bytes()
        if hashlib.sha256(data).hexdigest() != manifest["pins"][copy["target"]]:
            raise ValueError("Cockpit source changed during review build")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
    planner_path = OUTPUT / "compiled-planner.json"
    subprocess.run([str(ROOT / "node_modules/.bin/tsx"), "scripts/generate_inset_planner_review.ts", str(planner_path)], cwd=ROOT, check=True)
    planned = json.loads(planner_path.read_text())
    manifest["fixtures"].extend(planned["fixtures"])
    for field in ["pins", "sourcePins"]:
        for key, value in planned[field].items():
            if key in manifest[field] and manifest[field][key] != value:
                raise ValueError("Conflicting planner pin: " + key)
            manifest[field][key] = value
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (OUTPUT / "index.html").write_text('''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shipyard native boundary review r000</title>
<style>
:root{color-scheme:dark;font:16px/1.45 "Trebuchet MS", "Segoe UI", sans-serif;color:#e5ebe8;background:#263747}
*{box-sizing:border-box}body{margin:0}header,nav,footer{padding:12px 24px}header{display:flex;align-items:baseline;gap:24px;flex-wrap:wrap}h1{font-size:22px;margin:0;font-weight:600}p{margin:0;max-width:76ch}header p{color:#dcb3bd;font-size:14px}nav{display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:#304454}label{display:flex;align-items:center;gap:8px}select,button{font:inherit;background:#405466;color:#e5ebe8;border:1px solid #8095a5;border-radius:4px;padding:5px 9px}button{cursor:pointer}:focus-visible{outline:3px solid #74cbd0;outline-offset:3px}canvas{display:block;width:100%;height:calc(100dvh - 245px);min-height:360px;touch-action:none}output{display:block;padding:0 24px 10px;font-size:14px}footer{font-size:14px}details{margin-top:10px}pre{overflow:auto;max-height:220px;font-size:12px}summary{cursor:pointer}a{color:#74cbd0}@media(max-width:600px){header,nav,footer{padding:10px 14px}nav{gap:10px}canvas{height:55dvh}h1{font-size:20px}}
</style>
<header><h1>Shipyard boundary studies</h1><p>Native review r000. Art unapproved; gameplay qualification pending.</p></header>
<nav aria-label="Assembly review controls">
<label>Footprint <select id="footprint" aria-label="Footprint"></select></label>
<label>Wall height <select id="height" aria-label="Wall height"><option value="1">0.75 m</option><option value="2">1.5 m</option><option value="3">2.25 m</option><option value="4" selected>3 m</option></select></label>
<label><input type="checkbox" id="roof">Show native roof</label>
<button id="oblique">Oblique view</button><button id="top">Top view</button>
</nav>
<canvas tabindex="0" aria-label="Actual native floor, inward boundary walls and optional roof; drag to orbit, scroll to zoom"></canvas>
<output id="status" aria-live="polite">Loading review…</output>
<footer><p id="qualification"></p><p>Drag to orbit; scroll to zoom. The outer floor edge stays fixed. Partial walls leave an opening below the standard roof. Visual closure does not grant pressure, collision or crew clearance.</p><details><summary>Exact native source hashes</summary><pre id="pins"></pre></details></footer>
<script type="module" src="review.js"></script></html>
'''.replace("r000", f"r{revision:03d}"))
    source_dir = OUTPUT / "sources"
    source_dir.mkdir()
    for relative in manifest["sourcePins"]:
        source = ROOT / relative
        target = source_dir / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
    subprocess.run([str(ROOT / "node_modules/.bin/esbuild"), "scripts/shipyard_native_boundary_review.ts", "--bundle", "--format=esm", "--minify", f"--outfile={OUTPUT / 'review.js'}"], cwd=ROOT, check=True)
    files = {str(p.relative_to(OUTPUT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in OUTPUT.rglob("*") if p.is_file()}
    (OUTPUT / "delivery.json").write_text(json.dumps(files, indent=2) + "\n")
    print(json.dumps(files, indent=2))


if __name__ == "__main__":
    main()
