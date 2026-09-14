# Complete armor family candidate 03

Current corrected native r004 family after final-01's independent review. Preserve
final-01 as the reviewed failure and final-02 as the failed thin-return bevel
attempt. This candidate contains 46 GLBs and 33,640 triangles, editable named
Blender source parts, shared packed base-color/normal/roughness maps and fourteen
fresh-GLB native review captures.

Four focused corrections retain the established broad-bay, deep-cassette and
wrapped-cap design:

- Single identity tiles now retain the planet/ring emblem beside WF-01 in both
  standard and reflected port appearances.
- Diagonal sill/cheek rail UVs use the local tangent and depth frame. Mapped
  transverse courses align with the rail instead of crossing as X shapes.
- Side and bow cyan lenses occupy actual rail pockets. Lens front faces remain
  inside the original envelopes, with 15.625 mm separation from the dark housing
  face. Brightness was not increased to conceal competing surfaces.
- Pale bumper terminal returns reach the existing X=0/4 mating datums. The cheek
  has a fitted X=1 terminal land within Y=2..2.0625. The narrow contact return is
  planar; adjacent pale end caps retain their chamfers. The bounds and all
  structural placements remain unchanged.

The family remains five side variants as single and explicit left/right 2 m
members, with standard and `-port` UV variants, fixed-size narrow/quarter-height
examples, and all six front profiles. Each asset retains separate ARMOR and LINER
exports. The intended side layout is paired service(-8,-6), utility(-4,-2),
identity(0,2), single vent(4), and paired plain(6,8), measured in local Y metres.
Left means lower local Y; port placement reflects X only.

Both `validation.json` and `validation-mating-and-lights.json` pass. The latter
checks every required slug, all ten paired variant/handedness families, bounds,
exact socket positions/normals/lattice, finite nondegenerate triangles, normalized
normals, UVs, opaque materials, embedded map hashes and unchanged port geometry.
Every cyan front triangle is projected against every positive-facing opaque
planar triangle to reject competing faces and verify backing clearance. Both bow
contacts have 0.04826956 m² shared area; clipped armor triangles prove no crossing
of the neighboring owning space at the frozen review placements.

`models.json` records source, recipe, map, GLB and frozen interface hashes.
`check_armor_cassette_hull.py` and `render_armor_cassette_hull.py` are snapshots of
the exact checking/capture tools. `renders/captures.json` records all fourteen
image hashes, cameras, imported GLBs, placement reflections and neutral Cycles
settings. Fitted bow and both side/bow light pockets have dedicated close views.

Native validation does not grant artistic sign-off, pressure/damage qualification
or publication. The coordinator retains the separate actual-browser assembly,
armor-only, retained-structure, exploded and independent complete-family gates.
No runtime binding, catalog, authority, interior, engine, plume, IFCS, service or
Git state was changed by this author.
