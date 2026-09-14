# Temperate native r002 — 2026-09-14

Isolated source/composition candidate, no production edits or visual acceptance. Exact reference and r001 corrected actual two-angle captures inspected. Native kit and forested unit previews inspected.

Composition reduces continent scales from .47–.58 to .29–.38 and increases6 to14 unequal globally distributed regions. A larger hero size remains among medium continents. Forest rows replaced with14 irregular clustered placements per continent on three distinct upland terraces and two lower clearing edges;196 stable group IDs. Grove transforms have seeded unequal rotations, sizes and vertical scales, retaining geometry/materials across LOD.

Native source lowers base cliffs to .19/.22/.27, authors three unequal upper terraces per variant and three lower coast buttresses, plus five selected deeply indented coast sections with variable shallow-water skirt width. All final native forms closed/manifold, edges bounded .22. Ocean7 PBR materials/maps/water/grove sources preserved exactly; this revision generates no new raster maps, so no extra linear-to-sRGB conversion is applied.

Tests: two pass, including stable terrain/forest IDs/UV/geometry through LOD and NullEngine open water versus raised native cap clearance; TypeScript passes. GLB/JSON materials, positions, UVs and texture bytes agree, all normal channels present. Strict audit notes three matched normal-corner differences on continent-a (maximum .0001235 vs .0001 tolerance), with no geometry/material/UV mismatch. A nearest-native-export diagnostic found an equivalent normal at each source position, suggesting a duplicate-corner matching/float rounding issue; preserve report rather than claiming zero mismatch. No JSON normal was changed.

Actual two-angle/reference-size capture and Astra remain parent gate. Full npm checks/build and hardware are parent tasks; native previews do not prove hardware timings.
