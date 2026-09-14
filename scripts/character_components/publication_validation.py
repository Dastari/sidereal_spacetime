"""Read-only, bounded r008 -> r009 character publication lineage checks."""
from pathlib import Path
import hashlib
import json

RUNTIME = "assets/runtime/crew/components"
R008 = "assets/art-library/character-components/publications/r008"
R009 = "assets/art-library/designs/crew.base-and-outfits/revisions/r009"
PREVIOUS_MANIFEST = {"path": R008 + "/installed-manifest.json", "sha256": "d9d407260ebd6b989ef0adecf4b4c72a4249a8ae5d3b35fa28f8f68326d02840"}
PREVIOUS_CATALOG = {"path": R008 + "/installed-character-components.json", "sha256": "bec7c1b4e1d051adaa141b3acdb38c318b1ea77dbce743804dbc522edf996f52"}
PREVIOUS_RECEIPT_SHA = "0072a1518fb4bbef01438a998bf574f0cd59fdb548d906cc934dc985bfcc81b3"
HAIR = ("swept", "cropped", "crest", "scientist", "bob", "ponytail", "bun", "braids")
COMPONENTS = {"base-male", "base-female", *("hair-" + style for style in HAIR)}
CHANGED_FILES = {"modular-crew.glb", *(name + extension for name in COMPONENTS for extension in (".glb", ".png"))}


def require(value, message):
    if not value:
        raise ValueError(message)


def path_under(root, name):
    relative = Path(name)
    require(not relative.is_absolute() and ".." not in relative.parts, f"Invalid artifact path: {name}")
    path = root / relative
    require(path.resolve().is_relative_to(root.resolve()), f"Artifact escapes root: {name}")
    require(not any(parent.is_symlink() for parent in (path, *path.parents) if parent != root.parent), f"Symlink artifact: {name}")
    return path


def digest(path):
    require(path.is_file() and not path.is_symlink(), f"Missing/non-regular artifact: {path}")
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def read(path):
    return json.loads(path.read_text())


def referenced(root, record):
    path = path_under(root, record["path"])
    require(digest(path) == record["sha256"], f"Referenced artifact changed: {record['path']}")
    return read(path)


def contract(catalog):
    return {key: catalog[key] for key in ("rigId", "bodyTypes", "hairStyles", "sets", "components")}


def r008_lineage(root):
    """Resolve every historical r008 file to an existing immutable authoring source."""
    manifest = referenced(root, PREVIOUS_MANIFEST)
    catalog = referenced(root, PREVIOUS_CATALOG)
    receipt_path = path_under(root, manifest["publication"])
    require(manifest["publication"] == R008 + "/publication.json" and digest(receipt_path) == PREVIOUS_RECEIPT_SHA,
            "Historical r008 publication changed")
    receipt = read(receipt_path)
    require(manifest["revision"] == catalog["revision"] == receipt["revision"] == 8, "Previous revision is not r008")
    require(manifest["sourceSha256"] == receipt["sourceSha256"] == digest(path_under(root, manifest["blenderSource"])),
            "Historical r008 Blender source changed")
    require(manifest["files"]["modular-crew.glb"] == receipt["runtimeSha256"], "Historical r008 GLB identity changed")
    rollback = path_under(root, receipt["rollback"])
    require(digest(rollback / "manifest.json") == receipt["rollbackManifestSha256"] and
            digest(rollback / "character-components.json") == receipt["rollbackCatalogSha256"], "Historical v1 rollback metadata changed")
    original = read(rollback / "manifest.json")
    require(digest(path_under(root, original["blenderSource"])) == original["sourceSha256"], "Original r002 Blender source changed")
    replacements, unchanged = receipt["files"], receipt["unchangedRuntimeFiles"]
    require(not set(replacements) & set(unchanged) and set(replacements) | set(unchanged) == set(manifest["files"]),
            "Historical r008 file accounting incomplete")
    sources = {}
    for name, expected in manifest["files"].items():
        if name in replacements:
            evidence = replacements[name]
            require(evidence["sha256"] == expected and evidence["previousSha256"] == original["files"][name] == digest(rollback / name),
                    f"Historical v1 rollback file changed: {name}")
            source = path_under(root, evidence["source"])
        else:
            require(unchanged[name] == expected == original["files"][name], f"Historical unchanged file mismatch: {name}")
            source = path_under(root, original["blenderSource"]).parent / name
        require(digest(source) == expected, f"Preserved r008 source file changed: {name}")
        sources[name] = source
    return manifest, catalog, sources


def validate_report(root, receipt):
    report_ref = receipt["validation"]
    report_path = path_under(root, report_ref["path"])
    require(report_path.is_relative_to(root / R009), "Face validation must belong to r009")
    report = referenced(root, report_ref)
    require(report["passed"] is True and report["errors"] == [], "Face preservation validation did not pass")
    require(report["candidate"] == report_path.parent.relative_to(root).as_posix(), "Validation candidate path mismatch")
    require(report["nativeSourceSha256"] == receipt["sourceSha256"], "Validation/native source mismatch")
    checks = report["checks"]
    require(checks and all(row.get("passed") is True for row in checks.values()), "Failed validation check retained")
    for required in ("elevenStandaloneAndCombinedFiles", "catalogAndIdentityPreservation", "unchangedSharedSkinMaterial", "nativePreservation"):
        require(checks.get(required, {}).get("passed") is True, f"Missing validation check: {required}")
    for name in sorted(CHANGED_FILES):
        if not name.endswith(".glb"):
            continue
        for prefix in ("read/", "data/", "rig/", "clips/"):
            require(checks.get(prefix + name, {}).get("passed") is True, f"Missing rig/clip/data evidence: {name}")
        require(checks["read/" + name]["evidence"]["sha256"] == receipt["files"][name]["sha256"],
                f"Validation/export identity mismatch: {name}")
        require(path_under(root, receipt["files"][name]["source"]) == report_path.parent / name,
                f"Validation/source location mismatch: {name}")
    return report


def validate_r009(root, manifest, catalog, receipt):
    require(receipt["schema"] == "sidereal.character-visual-publication.v2" and
            receipt["revision"] == manifest["revision"] == catalog["revision"] == 9, "Unsupported v2 revision")
    require(receipt["previousManifest"] == PREVIOUS_MANIFEST and receipt["previousCatalog"] == PREVIOUS_CATALOG,
            "r009 must reference exact preserved r008 metadata")
    previous, previous_catalog, sources = r008_lineage(root)
    require(receipt["pairedPoseRevision"] == 3, "r009 must retain paired r003 equipment")
    require(receipt["authorization"]["ownerQuote"] and receipt["authorization"]["messageReference"] and
            receipt["authorization"].get("finalArtSignoff") is False and receipt.get("ownerFinalSignoff") is None,
            "Publication authorization must remain separate from final sign-off")
    require(set(receipt["installedComponents"]) == COMPONENTS and len(receipt["installedComponents"]) == len(COMPONENTS),
            "Unexpected r009 component scope")
    require(set(receipt["files"]) == CHANGED_FILES, "r009 may replace only the combined crew, two bases and eight hair GLB/PNG pairs")
    require(set(manifest["files"]) == set(previous["files"]), "Runtime file membership changed")
    expected_unchanged = {name: sha for name, sha in previous["files"].items() if name not in CHANGED_FILES}
    require(receipt["unchangedRuntimeFiles"] == expected_unchanged, "Unchanged runtime file accounting mismatch")
    for name, expected in manifest["files"].items():
        if name in CHANGED_FILES:
            evidence = receipt["files"][name]
            require(evidence["previousSha256"] == previous["files"][name], f"Incorrect predecessor hash: {name}")
            require(evidence["sha256"] == expected == digest(path_under(root, evidence["source"])), f"Candidate source hash mismatch: {name}")
        else:
            require(expected == expected_unchanged[name], f"Unrelated character artifact changed: {name}")
        require(digest(path_under(root, RUNTIME + "/" + name)) == expected, f"Installed character artifact changed: {name}")
    actual = {path.relative_to(root / RUNTIME).as_posix() for path in (root / RUNTIME).rglob("*") if path.is_file()}
    require(actual == set(manifest["files"]) | {"manifest.json"}, "Unexpected installed character file")
    require(contract(catalog) == contract(previous_catalog), "Character equipment/catalog contract changed")
    expected_revisions = {key: 9 if key in COMPONENTS else value for key, value in previous_catalog["visualRevisions"].items()}
    require(catalog["visualRevisions"] == manifest["componentRevisions"] == expected_revisions, "Unrelated character component revision changed")
    require(receipt["source"] == manifest["blenderSource"] and
            receipt["sourceSha256"] == manifest["sourceSha256"] == digest(path_under(root, receipt["source"])) and
            receipt["runtimeSha256"] == manifest["files"]["modular-crew.glb"], "Publication source/runtime identity mismatch")
    validate_report(root, receipt)
    # Re-read actual rig/bind matrices and channel samples instead of relying only
    # on a count or a claimed pass in the immutable validation report.
    from .validate_faces import Glb
    baseline = Glb(sources["modular-crew.glb"])
    rig, clips = baseline.rig(), baseline.clips()
    require(len(rig) == 16 and len(clips) == 12, "Preserved rig/clip contract changed")
    for name in sorted(CHANGED_FILES):
        if name.endswith(".glb"):
            current = Glb(root / RUNTIME / name)
            require(current.rig() == rig, f"Installed joint hierarchy/rest/bind matrices changed: {name}")
            require(current.clips() == ({} if name.startswith("hair-") else clips), f"Installed original animation channels changed: {name}")
    return previous, sources
