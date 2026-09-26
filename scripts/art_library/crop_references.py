"""Copy exact reference tiles listed in a crops manifest (no resampling, no edits).

Usage: python3 scripts/art_library/crop_references.py MANIFEST.json OUT_DIR

Each crop is a lossless ffmpeg `crop` of the original PNG. A crops.json receipt records the
source SHA-256, rectangle and output SHA-256. Output is local review evidence, not runtime data.
"""
import hashlib
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def resolve(path):
    if os.path.isabs(path):
        return path
    local = os.path.join(ROOT, path)
    if os.path.exists(local):
        return local
    # Reference art is untracked; fall back to the primary checkout read-only.
    return os.path.join("/root/sidereal_spacetime", path)


def main():
    manifest_path, out = sys.argv[1], sys.argv[2]
    manifest = json.load(open(manifest_path))
    os.makedirs(out, exist_ok=True)
    receipt = {"manifest": os.path.relpath(manifest_path, ROOT), "sources": {}, "crops": []}
    for key, src in manifest["sources"].items():
        p = resolve(src)
        receipt["sources"][key] = {"path": src, "sha256": sha(p)}
    for c in manifest["crops"]:
        src = resolve(manifest["sources"][c["source"]])
        x, y, w, h = c["rect"]
        dst = os.path.join(out, c["id"] + ".png")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", f"crop={w}:{h}:{x}:{y}",
                        "-frames:v", "1", dst], check=True)
        receipt["crops"].append({**c, "file": os.path.basename(dst), "sha256": sha(dst)})
    json.dump(receipt, open(os.path.join(out, "crops.json"), "w"), indent=1)
    print(f"{len(manifest['crops'])} crops -> {out}")


if __name__ == "__main__":
    main()
