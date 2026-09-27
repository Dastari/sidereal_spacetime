# Complete armor family candidate 01

Native r004 candidate, authored after the independent proof-05 propagation pass.
Final complete-ship review and owner artistic sign-off remain separate gates.

The 46 native GLBs contain 27,328 triangles in total. Every asset exports distinct
`ARMOR` and `LINER` meshes while `source.blend` retains individually editable named
parts and chamfer modifiers. Shared base-color, portable baked normal and
roughness maps carry fine tooling, fasteners, wear and markings at 128 texels/m.
Deep recesses, shoulders, wrapped shoes, vent blades and utility housings are meshes.

The side family contains plain, red-service, vent, utility and identity variants
as single 2 m members and explicit left/right members of broad 4 m visual bays.
Each retains its own 2 m attachment span, 3 m full height, X[0,0.5] envelope and
1/32 m sockets. Left always means the lower local-Y member. Standard and `-port`
assets have identical geometry; port assets reverse the exterior atlas U for a
placement reflected in X, retaining local Y and legible lettering.

The intended review layout on each side is:

| Member centers Y (m) | Appearance |
| --- | --- |
| -8, -6 | red-service paired bay |
| -4, -2 | utility paired bay |
| 0, 2 | identity paired bay |
| 4 | single vent |
| 6, 8 | plain paired bay |

The optional vent paired bay remains covered by validation. Representative plain
1 m/0.5 m widths and 0.75 m/1.5 m/2.25 m heights are authored at physical size,
with port counterparts. The 0.75 m example uses an explicit 187.5 mm low-clearance
rail profile. Narrow or short pieces omit ornaments that do not physically fit.

All six front profiles retain the frozen asset IDs and accepted bounds. Sills and
transom remain opaque below the glazing and preserve a separate inboard visible
liner. The diagonal sill/cheek geometry clips deep return corners to existing
terminal mating planes. Engines, engine placements, interior walls, plumes,
IFCS, authority, runtime bindings and live state were not edited by this author.

`models.json` pins source, recipe, map, GLB and interface hashes. Both native
validation reports pass. `validation-complete-family.json` additionally checks
all 46 required slugs, ten paired variant/handedness families, exact socket
positions/normals/lattice, finite nondegenerate triangles, normalized normals,
UV range, opaque material mode, embedded map identity, unchanged port geometry
and the identity cassette's analytical U reversal/V orientation. Mating checks
prove no geometry crosses either member's owning side of the common Y plane.

Targeted fresh-GLB native views in `renders/` cover new service/utility/identity
pairs, actual X-reflected port lettering, fixed width/height examples, and new
front profiles. Camera, placement and image hashes are in `renders/captures.json`.
Rendering runs serially with four CPU threads and purges unused imported image,
material and mesh datablocks between views.

No visible mesh alone qualifies pressure, collision or damage behavior. Exact
candidate browser/whole-ship, armor-only, retained-structure and exploded evidence
and complete-family independent review are coordinated separately. This folder's
name does not record owner approval or authorize publication.
