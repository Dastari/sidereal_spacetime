# Crystal moon r004 — 2026-09-14

Status: implemented native source candidate, runtime/reference review pending. No hardware capture, production publication, final acceptance or owner sign-off.

Preserves r003 and its two rejected source attempts. Parent/Astra accepted its structural direction but found an overly smooth armor-plate shell. This bounded successor preserves broad native facets and all nine exact PBR material definitions/maps, adding selected stepped concave cliff-lip footprints, several unequal deeper cut sectors and a stronger asymmetric notch hierarchy in Moon2. No columns, rocky substrate, decimation, replacement shader or global emission increase.

7 of 26 native panels have chipped edges; other facets remain quiet. New closed native surface triangles: 1012. All LODs retain the same whole body through unchanged crystal_moon_reference_composition_r003.ts. Its seed only rotates the assembly, with native normals/UV/material roles and body partId preserved. Source geometry is an original editable Blender mesh with per-face materials.

Validation: five tests pass, dedicated TypeScript check passes, both GLB/JSON complete attribute audits report zero position/normal/UV/material differences. Tests cover exact source3 PBR retention, unchanged LOD buffers/ranges, selective rather than uniform chips, and64 distributed NullEngine body rays. The angular Moon2 deliberately has deeper native cuts and uses the already established0.45 minimum-radius bound.

Actual Blender native-body-preview.png and native-reference-scale.png were inspected against each exact original crop. The small canvases are90px for Moon1 and78px for Moon2, approximately65px/53px visible body, rather than the previous140px body. The broken edges are visible, but broad orderly facets may still dominate; parent/Astra actual runtime review is explicitly needed. Native area-light appearance is not proof of runtime emission or hardware performance.

Kit SHA256: `4b1760df964e244c7f2867572dd473d28412c9c4d2f19a897589d0d5c0ab73fb`.
