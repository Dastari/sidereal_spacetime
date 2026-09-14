# Gas r004 — authored dust opacity finish

Uses the preserved generated RGB dust strip as a native PBR material input. The source file and all RGB artwork remain unchanged; Blender authors alpha from black density, with per-zone density factors .92/1/.82. Input-black pixels become transparent, sparse grains remain partially transparent, and dense magenta/lilac dust remains visible. No emission is used; lighting and planet shadow remain runtime behavior.

Gas3 positions, triangle indices, normals, UVs, debris groups and body texture are exact. Angular U and inner-to-outer V mapping are unchanged. Body/debris GLBs remain byte-identical; each ring's geometry accessor bytes match Gas3, while its embedded texture changes.

Four Blender artifact tests pass and the five-variant JSON/GLB audit has zero differences or gaps; embedded PNGs byte-match authored outputs. Tests verify decoded RGB equality, black/sparse/dense opacity classes, native geometry preservation, angular/radial UV mapping and absence of emissive rails.

Blender preview has been inspected: lilac granular ring dust reads with real gaps in PBR. Actual rendered-planet two-angle, UV seam and planet-cast shadow diagnostic remain required. Source artwork is not guaranteed periodically seamless; no RGB seam repaint was made because the input artwork is immutable. No working whole-planet, owner or hardware acceptance is claimed.
