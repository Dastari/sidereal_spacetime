# Full native dogleg a002 — geometry sweeps pass, join cleanup required

All55 native checks pass, including exact exported surfaces,18 actual contact patches,17 continuous whole-strip lift/forward/settle steps in both directions and five walk/turn corridors. The final-riser relocation fixes the unsafe last-tread stops from a001. Body dimensions and stair dimensions remain unchanged.

Actual Blender cutout review reveals coplanar duplicate faces where the final riser overlaps the intermediate pan, and where the upper final-riser plate overlaps the aperture fascia/native floor edge. The dark strip in the cutout is retained as evidence. a003 removes the redundant upper plate, uses the unchanged native floor slab edge as its physical final riser, limits the lower final-riser plate to the gap beneath the pan, and splits front fascia below/alongside the actual upper landing edge. No final artifact pin is taken from a002.
