# Wayfarer studless ship refinement

Status: Implemented visual study; production art acceptance remains open
Last updated: 2026-09-08
Owners: Sidereal art and rendering

## 2026-09-08 shell refinement

The playable Wayfarer source now delegates exterior construction to `packages/content/src/voxel-wayfarer-shell.ts`. The reference is the owner-provided `reference/art/fully-complete-constructed-space-ship.png`: pale lilac construction courses, indigo mechanical recesses, burgundy service covers, copper plumbing, a tapered command bow and varied aft propulsion housings. The reference itself is not shipped as ship geometry.

The continuous cabin deck, original wall core, partitions, seat at (0, 6) and room furniture footprints are unchanged. The new bow extends outside the existing walkable fixture; it does not grant new walking space. The roof covers the cabin and remains a cutaway layer. Exterior armor and attached engines remain visible in both modes. The canopy is opaque blue enamel, not transparent glass; optical boundary meshing remains a separate acceptance gate.

Roof courses sit on continuous backing, with articulated edge rails and raised radiator/service housings. Side walls carry pressure-backed access panels, narrow vent mouths, fasteners and copper/indicator inserts. These are occupied fine voxels and derived merged faces, not an image-space pixel effect or exterior studs. Existing palette materials and the shared Blender PBR export are reused. The twin large main bells and smaller central unit have hollow outlets, recessed throats, circumferential body bands, service shrouds and mounting collars. Their visual form does not add thrust or change the IFCS installation definition.

`npm run art:voxels` produced 1,847,552 occupied 6.25cm samples in 537 storage chunks, 49,402 merged quads (98,804 triangles) and 38 semantic source batches. `npm run art:assembly` produced 289 placements, 195 unique assets and 255 mesh layers. Structural pieces remain segmented on the construction grid; each explicit engine/furniture/cargo source layer remains a whole movable authored object. These counts describe this generated study, not fleet performance or a validated destruction budget.

Both build commands completed with Blender 4.3.2; Draco compression is unavailable locally, so the valid glTF export remains uncompressed. Original imported sources are untouched. Generated `voxel_wayfarer.blend`, runtime voxel/GLB data and assembly review outputs are the reviewable deliverables. Browser review uses the real client and its live renderer; visual polish, glass, functional room systems, pressure simulation and production faction assets remain open.
