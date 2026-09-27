# Private native test fixtures

`toxic-fog-r005-density.png` is the unchanged saved Blender r005 density texture
from `output/playwright/planet-reference-20260914/toxic-fog-r005/toxic-fog-density.png`.
SHA-256: `55dda2e150e20197164a2026e05983d2ce18baf2d41a5c151691f1634721ddb5`.

It preserves the existing alpha/albedo regression test in clean checkouts. This
is a private test input, not an art approval or a published runtime asset. It is
not included in either application's public asset allowlist. The Blender authoring
script remains `scripts/art_library/build_toxic_fog_native_kit_r005.py`; CI reads
saved PNG bytes through the already declared Pillow dependency.

`gas-preservation-r003-r005.tar.xz` preserves the exact original files required by
the Gas4 material and Gas5 UV regressions. The adjacent JSON manifest records
every source path, size and SHA-256, with 28 logical paths deduplicated to 19
unchanged files. It contains only required kit JSON, exported GLB and texture PNG
data; no references, Blender sources, or runtime publication is included.
Archive SHA-256: `9ffb9ff11334ef17afa37c2b69e1f6ddc33902be1f102d4b7ad5e422dde35676`.

The 64,910,195-byte original payload compresses to 16,348,472 bytes with the
deterministic archive recipe recorded in the manifest. CI reads only explicitly
named regular members, verifies the complete archive and every member hash, and
never extracts it to the checkout. Existing JSON/GLB comparisons still operate on
the original bytes; Pillow preserves the RGB/alpha assertions without Blender.
