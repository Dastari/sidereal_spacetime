"""Package the exact r005 review as an editable dashboard-only design. No geometry changes."""
from pathlib import Path
import hashlib
import json
import uuid
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
NATIVE = ROOT / "assets/art-library/framed-wayfarer/r005"
OUT = ROOT / "apps/dashboard/src/shipyard/layout/armor-kit-r005.json"
LIBRARY_SHA = "dcc978612d390e08895cb8dc9011d02e3ffe2a83be9480bcaa7bbc04fce4d1c8"
DESIGN = "shipyard.hull.armor-block-review"


def build():
    library = NATIVE / "library-02/hull.glb"
    if hashlib.sha256(library.read_bytes()).hexdigest() != LIBRARY_SHA:
        raise ValueError("Reviewed native library changed")
    manifest = json.loads((NATIVE / "library-02/models.json").read_text())
    review = NATIVE / "browser/final-02"
    fixture = json.loads(json.loads((review / "document.json").read_text())["documentJson"])
    layout = fixture["layout"]
    # The native editor recognizes the exact authored structural identifiers.
    # The game fixture remaps them for its isolated instance. Reverse only those
    # structural IDs, leaving all equipment/armor placement identities intact.
    source = json.loads((ROOT / "packages/content/src/wayfarer-rebuild-r002.json").read_text())["layout"]
    structural_keys = ("decks", "tiles", "partitions", "openings", "structure")

    def strings(value):
        if isinstance(value, str):
            return {value}
        if isinstance(value, list):
            return set().union(*(strings(v) for v in value))
        if isinstance(value, dict):
            return set(value).union(*(strings(v) for v in value.values()))
        return set()

    structural_ids = strings({k: source[k] for k in structural_keys})
    identity_map = {v: k for k, v in fixture["wayfarerExterior"]["identities"].items() if k in structural_ids}
    identity_pattern = re.compile("|".join(re.escape(k) for k in identity_map))

    def remap(value):
        if isinstance(value, str):
            return identity_pattern.sub(lambda m: identity_map[m.group()], value)
        if isinstance(value, list):
            return [remap(v) for v in value]
        if isinstance(value, dict):
            return {remap(k): remap(v) for k, v in value.items()}
        return value

    layout = remap(layout)
    if any(layout[k] != source[k] for k in structural_keys):
        raise ValueError("Review structure differs from the exact native editor structure")
    if layout["assembly"]["parts"] != fixture["layout"]["assembly"]["parts"]:
        raise ValueError("Structural remapping changed an equipment identity or pose")
    capture = json.loads((review / "captures.json").read_text())["captures"][0]
    original = {p["id"]: p for p in layout["assembly"]["parts"]}
    catalog = json.loads((ROOT / "assets/runtime/assembly/catalog-shipyard-r005.json").read_text())
    definitions = {a["id"]: a for a in catalog["assets"]}
    special = {
        "part-4c25a5fd9da0bce537f5", "part-540c83fc49ee792d9a4a",
        "part-ecd751f76e602db806a3", "part-63a0c40bbb71cfeba4dd",
        "part-437732483fa4d7acbcbc", "part-e965a5502d9fe4c25406",
        "part-9f79f3a40a72f9b7ad4a", "part-b3a1decd8a0336ac2030",
    }
    removed = {p["id"] for p in original.values()
               if p["assetId"] in special or definitions[p["assetId"]]["category"] == "superstructure"}
    recorded = {p for row in capture["removals"] for p in row["placements"]}
    if not recorded <= removed:
        raise ValueError("Review removal identities differ")
    layout["assembly"]["parts"] = [p for p in original.values() if p["id"] not in removed]
    for mount in capture["mounts"]:
        part = original[mount["placementId"]]
        previous = mount["previousRendererPosition"]
        if part["assetId"] != mount["assetId"] or part["position"] != [previous[0], -previous[2], previous[1]]:
            raise ValueError("Retained equipment source pose differs")
        position = mount["reviewRendererPosition"]
        part["position"] = [position[0], -position[2], position[1]]
    assets = []
    for model in manifest["models"]:
        p = model["parameters"]
        if model["kind"] == "span":
            label = f"Armor · {p['lengthM']:.4g} × {p['heightM']:g} m · {p['finish']}"
        else:
            angle = abs(p["turnRadians"]) * 180 / 3.141592653589793
            heights = f"{p['incomingHeightM']:g}"
            if p['outgoingHeightM'] != p['incomingHeightM']:
                heights += f" → {p['outgoingHeightM']:g}"
            label = f"Armor · {p['convexity']} {angle:.3g}° · {heights} m"
        assets.append({"id": model["modelId"], "label": label, "category": "superstructure",
                       "nodes": [], "bounds": model["bounds"], "visual": {
                           "url": "/assets/shipyard/armor-r005/hull.glb", "sha256": LIBRARY_SHA,
                           "designId": DESIGN, "revision": 5, "bounds": model["bounds"],
                           "damagePreview": "unsupported", "nodePrefix": model["nodePrefix"]}})
    native_parts = []
    for p in manifest["assemblies"]["wayfarer"]["placements"]:
        if p["scale"] != [1, 1, 1]:
            raise ValueError("Native module scaling is forbidden")
        native_parts.append({"id": str(uuid.uuid5(uuid.NAMESPACE_URL, DESIGN + "/" + p["placementId"])),
                             "assetId": p["modelId"], "position": p["position"],
                             "rotation": p["rotationZRad"], "flipped": False, "removedCells": []})
    layout["assembly"]["parts"].extend(native_parts)
    layout["assembly"]["revisions"].update({a["id"]: LIBRARY_SHA for a in assets})
    layout["assembly"]["source"] = None
    layout["source"] = None
    layout["name"] = "Wayfarer · armor review"
    layout["dependencies"].append({"id": DESIGN, "revision": LIBRARY_SHA})
    result = {"schema": "sidereal.armor-editor-review.v1", "designId": DESIGN,
              "librarySha256": LIBRARY_SHA, "assets": assets, "layout": layout,
              "provenance": {"sourceSha256": manifest["sourceSha256"],
                             "manifestSha256": hashlib.sha256((NATIVE / "library-02/models.json").read_bytes()).hexdigest(),
                             "removedPlacementIds": sorted(removed), "equipmentMounts": capture["mounts"],
                             "structuralIdentityMap": identity_map,
                             "authority": "Editor visual review only; unqualified for game installation."}}
    OUT.write_text(json.dumps(result, indent=2) + "\n")
    subprocess.run([str(ROOT / "node_modules/.bin/prettier"), "--write", str(OUT)],
                   cwd=ROOT, check=True, capture_output=True, text=True)
    print(json.dumps({"assets": len(assets), "nativePlacements": len(native_parts), "removed": len(removed),
                      "retained": len(original) - len(removed), "output": str(OUT)}))


if __name__ == "__main__":
    build()
