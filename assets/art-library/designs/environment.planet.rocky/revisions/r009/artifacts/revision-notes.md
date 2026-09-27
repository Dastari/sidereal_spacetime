# Rocky native r009 — 2026-09-14

Isolated source/composition candidate; mainworld only. No production changes, no visual acceptance. Exact reference and Rocky8 corrected two-angle/reference-size runtime captures inspected. Native Blender preview inspected; wholeplanet r009 remains parent capture/Astra gate.

Rocky8 diagnosis: sparse regional coverage and broad unbroken shelves; linear palette RGB was written directly into sRGB albedo PNGs. The source now explicitly applies the standard linear-to-sRGB transfer to albedo only; ORM remains linear Non-Color. Palette is unchanged. Reduced the large wavy procedural pigment modulation to subtle fine grain; this is a texture encoding/finish correction, not a global palette retint.

Native r009 preserves working large/medium bowl geometry. Adds24 unequal actual closed-bottom octagonal pits cut into the four broad district solids,8 small ledge-top pits and11 clustered small fracture chips per region. Each Boolean cutter stops within its solid, preserving an authored floor; all final objects pass manifold validation. Two connected wider warm-mineral strips expose pigment at a regional fracture; ordinary non-emissive PBR. No replacement shader, decimation or re-export of voxel solids.

Composition9 changes8 regions to12 unequal regions (.38–.44 scale) with global golden-angle anchors and seeded unequal rotations. Ground5120 triangles and all regional geometry/UV/normals retained unchanged across LOD. Region a13464 triangles, b13382; whole166196 triangles.

Dedicated tests cover exact allLOD geometry/UV/normal/identity, bounded167000 triangles, missing-channel rejection and NullEngine visibility of large, medium and added small-pit floors. TypeScript passes. GLB/JSON parity all11 variants: zero differences/gaps. Native source preview is not runtime/hardware evidence; parent handles full npm checks/build and actual two-angle/reference-size/Astra review.
