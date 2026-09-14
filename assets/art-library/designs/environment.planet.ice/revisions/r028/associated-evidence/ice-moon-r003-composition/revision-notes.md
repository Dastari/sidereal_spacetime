# Ice moon compositor r003 — exact-output optimization

2026-09-14. Isolated runtime proposal for frozen Ice moon 1/2 native r002 sources. No source geometry, PBR, UV, normal, recipe, source archive, worker import or browser change.

Hoists immutable region tangent frames/trigonometry and fixed floor-clearance offsets. Native floor sampling rejects queries outside conservative source XY bounds and uses collision-free numeric grid-cell keys with an asserted stride bound. Original finite-difference normal transport and all floating-point sample operations remain unchanged.

Validation: 11 Vitest tests pass in 34.57 s; dedicated TypeScript check passes. Tests compare every positions/normals/UV/indices buffer byte and placement range against frozen compositor r002 for both moon IDs at seeds 38 and 917. Existing tests retain all-LOD geometry, optical attributes, diagnostic shaft/gorge rays and all 18 global native cavity floor rays. No preallocation optimization included.

Prior isolated seed38 Moon1 probe: instrumented frozen 4299.5 ms versus optimized 1735.7 ms (2.48×), exact output equality. This is Node CPU timing, not hardware browser acceptance or proof of browser closure cause. See ../ice-moon-r002-worker-audit/diagnosis.md and probe-result.json. Frozen r002 and its isolated proposal remain preserved.

The exact used source variants are snow-cut-region, snow-open-gorge, ground-sphere. JSON.stringify size estimates in used-variant-size-audit.json are 45,772,917 / 42,921,684 bytes. Actual separately prepared Python compact JSON projections are 45,891,881 / 43,039,994 bytes (JSON number serialization differs), both below the unchanged 64 MiB staging cap. Full source sizes are 95,700,105 / 87,657,228 bytes. All top-level metadata and kept authored fields are preserved by the separate projection builder; archives are unchanged.

The reproducible audit_ice_moon_projection_equality.ts checks both original and optimized composers using original versus projected kits, seeds 1/38/91 and LODs 0/1/2, including every buffer, ranges, and material definitions. Its per-revision equality.json belongs under runtime-projections/ and is pinned by the staging owner after completion. No claim of hardware visual acceptance, publication, or owner sign-off.
