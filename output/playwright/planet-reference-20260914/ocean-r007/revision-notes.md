# Ocean r007 — island shoreline and land finish only

Preserves the working Ocean6 water and reef subgates: original material definitions, water maps, native water/reef/grove geometry and GLBs remain exact. Global placement and Ocean5 1.4× footprint mapping remain unchanged. Clouds remain separately owned.

Six island-only material copies avoid changing accepted shared reef materials. Blue/cyan shore faces use native perimeter/depth UVs and an irregular soft alpha taper, with UV endpoints kept inside texture texel centers. Sand, grass and rock receive restrained authored albedo, normal and packed metallic/roughness detail. A few native cliff-edge vertices form shallow notches; the quiet central plateau remains intact. No triangles were added or removed, and source vertex displacement stays below .03 units.

Six focused tests and TypeScript pass, including exact non-island preservation, previous composition-map parity, all-LOD major attribute hashes, UV retention and NullEngine plateau placement picking. Full ten-variant JSON/GLB audit is clean, with no attribute gaps or supplied material/attribute differences and byte-identical embedded textures. High native triangle count remains147,902; total material definitions increase from10 to16 to isolate island finish.

The audit caught a stale Blender preview matrix in the first object's initial JSON export. That failed attempt is preserved as `ocean-r007-initial-stale-matrix/`. The source now updates the active dependency graph before corner export, and a position-delta regression prevents the preview offset returning.

Kit preview was inspected, but the shoreline mask must still be judged on the actual complete planet at two angles and approximately300 pixels. The land finish may remain too subtle at that scale; this is not an acceptance claim. No owner or hardware-transition acceptance follows from artifact tests. Candidate source is frozen for parent capture.
