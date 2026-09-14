"""Record exact independent build artifacts; does not build or deploy services."""
from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "docs/releases/native-ship-2026-09-08"


def file_record(path):
    return {"path": str(path.relative_to(ROOT)), "bytes": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def tree_record(path):
    files = [file_record(p) for p in sorted(path.rglob("*")) if p.is_file()]
    if not files:
        raise ValueError(f"Missing build artifact: {path}")
    digest = hashlib.sha256()
    for row in files:
        relative = str(Path(row["path"]).relative_to(path.relative_to(ROOT)))
        digest.update(f"{relative}\0{row['sha256']}\n".encode())
    return {"path": str(path.relative_to(ROOT)), "file_count": len(files),
            "bytes": sum(row["bytes"] for row in files),
            "tree_sha256": digest.hexdigest(), "files": files}


def main():
    manifests = [ROOT / "assets/runtime/assembly" / name for name in (
        "manifest.json", "hull-manifest.json", "floor-manifest.json",
        "cargo-manifest.json", "equipment-manifest.json")]
    manifests += sorted((ROOT / "assets/runtime/planets").glob("*/manifest.json"))
    for app in ("client", "dashboard"):
        for source in manifests:
            built = ROOT / f"apps/{app}/dist/assets" / source.relative_to(ROOT / "assets/runtime")
            if not built.is_file() or file_record(built)["sha256"] != file_record(source)["sha256"]:
                raise ValueError(f"Build does not contain current pinned metadata: {built}")
    evidence_names = ["native-r006-final-bow-deck.png", "native-r006-final-roof-flight.png",
                      "native-r006-final-doorway.png", "cargo-floor-final-close.png",
                      "dashboard-cargo-final-draft.png", "dashboard-native-floor-catalog.png",
                      "native-ice-r015-actual-observe.png", "combat-r002-actual-beam.png",
                      "f3-final-ibl-camera-lighting-off.png", "native-volcanic-r018-actual-observe.png",
                      "dastari-game-login.png", "graphics-local-light-budget-actual.png",
                      "pose-r002-actual-corrected-pistol.png", "pose-r002-transmission-recovery.png"]
    evidence = [file_record(ROOT / "output/playwright" / name) for name in evidence_names]
    record = {
        "schema": "sidereal.local-release-artifacts.v1",
        "status": "Built local candidate; auth/pose/Graphics functional gates passed, art limits separately recorded, planetary iterations paused",
        "deployment": "No production deployment. Normal local world authority published non-destructively.",
        "client": tree_record(ROOT / "apps/client/dist"),
        "dashboard": tree_record(ROOT / "apps/dashboard/dist"),
        "world": file_record(ROOT / "packages/world/dist/bundle.js"),
        "runtime_manifests": [file_record(p) for p in manifests],
        "validation_record": file_record(DEST / "validation-collision-f3.json"),
        "evidence": evidence,
        "compatibility": "Pilot layout revision 3, placed-container bindings and additive private auth/appearance/identity-link tables require the matching authority module. OIDC game clients use overlapping 30-second connection renewal. Rendering never writes live fixture transforms or balances.",
        "install_order": ["Managed non-destructive authority update when required", "Independent client artifact", "Independent dashboard artifact", "Verify normal game and preserved state"],
        "recovery": "Forward repair only affected visual mappings and placements using pinned before/after records. Changed cargo/hull coordinates require matching validated authority reach/collision repair. Preserve later edits, container/item/station identities and contents; never restore the full archived assembly/database.",
        "hash_method": "SHA256 over sorted relative-path NUL file-SHA256 newline records; this release index is outside the independently built artifact trees.",
    }
    (DEST / "build-artifacts.json").write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps({key: {field: value[field] for field in ("path", "tree_sha256", "file_count", "bytes")}
                      for key, value in record.items() if key in ("client", "dashboard")}))


if __name__ == "__main__":
    main()
