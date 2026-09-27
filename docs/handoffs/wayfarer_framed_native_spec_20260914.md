# Framed Wayfarer hull, bow, engine and plume implementation

Status: accepted owner implementation direction; native artistic sign-off pending.

The owner requested implementation of the whole-ship concept at `assets/art-library/hull-voxel-study/wayfarer-layout-concept-r001/proposal.png`, including front panels, redesigned engines and translucent block-shaped exhaust. The appearance reference is `reference/art/3d-rpg-after.png`. This specification extends the existing Shipyard dimensional and native migration contracts; it does not change authority or qualified collision parameters.

## Deliverables and interfaces

- Native Blender side hull: plain armor, vent, red service, utility and identity variants, coherent stepped shoulder geometry and mapped fine detail. Standard modules are 2 m wide and 3 m high. Supply representative 1/0.5 m widths and 0.75/1.5/2.25 m heights without scaling. Base material-cell design stays on 1/32 m; cosmetics may be finer. Exterior origins use `HULL_ATTACH` at X=0,Y=0,Z=0, Y tangent and Z up, edge sockets at ±width/2 and top at exact height. Shell backing occupies X[0,.25]; frame and bay relief fit within X[0,.5], inside existing side-armor envelopes. Per-module half-width edge posts create one full connector when two modules abut. Roof/deck bands remain separately qualified.
- Bow/front panels: authored opaque armor/sill replacements use the existing individual asset-local placements, span and profile bounds. Preserve swept glazing, sight lines and accepted structural enclosure geometry. Replace the lower bow/straight/diagonal and outer bumper/shoulder surfaces with coherent frames/pale armor/red access detail where compatible. No full-height opaque duplicate in front of windows and no custom engine hull cutouts.
- Native engines: two large main drives, centre small main drive and small maneuver/retro housings should share the reference's framed pale/red/navy language. Keep existing object identities, local mounts, placement transforms, outer envelopes and authoritative actuator/nozzle locations. Maintain native emissive nozzle rings; active plume is separate presentation driven by achieved throttle. No thrust, mass, force direction or IFCS edits.
- Runtime plume: visibly separated stepped translucent blue/cyan volumes with a brighter core, faceted glass/plastic-like appearance and tapered voxel silhouette. No solid opaque cone or per-cell draw calls; no additional lights. Missing/zero telemetry disables effects, unknown IDs create nothing, throttle comes from subscribed achieved output. Use conservative transparency and stable ordering; check both dark space and bright ship backgrounds.

Root integrates models as individually addressable native GLBs with packed maps and exact hashes, retaining editable Blender sources and prior revisions. Draft model publication is explicitly authorized by the implementation request and prior session deployment direction, while final artistic sign-off remains a separate owner record. Exact native contract/gate requirements still apply; do not bypass a failed interface, shared-test or game acceptance gate.

## Architecture decision: authored frame geometry and a shared presentation plume

Accepted for implementation, 2026-09-14. Broad silhouettes, shoulders and large recesses use authored Blender meshes; small seams, bolts and roughness use maps. Completely flat normal-mapped slabs cannot reproduce the reference silhouette, while turning every fine detail into cubes would increase geometry and harm adjustable-size interfaces. Preserve authored native surfaces and retain separate occupancy/damage proxies; do not call the visual alone a qualified pressure/collision adapter.

Plumes use a bounded set of merged block shells/materials in the existing achieved-output effect adapter. A separate shader-only glow or opaque voxel solid would obscure the requested translucent construction. Alpha surfaces incur overdraw and sorting concerns, so opacity, overlap and camera dependence require actual browser review. This is cosmetic translucency, not authoritative transparent damage material or physically simulated exhaust.

## Validation and failure handling

Success requires native bounds/socket checks, no nonuniform scale, editable sources/GLB/material hashes, assembled side/bow/engine views, real browser review of exact assets and plume throttle states, and preserved identities/physics/native pressure/collision source state. Plume draw/material counts must not exceed the existing bounded effect without measured approval; the Shipyard plan's >10% Render CPU/draw-call regression gate remains applicable.

Out-of-envelope native geometry fails qualification rather than widening the live collision proxy. Invalid/missing assets leave current known-good installed pins untouched. Unknown or stale exhaust telemetry remains dark. Failed browser material/transparency/attachment checks require correction before activation. No world publication is needed for cosmetic plume work; any authority change would require an isolated smoke and a distinct review.

Run focused geometry/renderer tests, scoped lint, `npm run check`, `npm run build`, `npm run art:check` and exact-candidate browser/game evidence. Record existing unrelated failures separately without relaxing validators. Delivery uses a PR where a remote is available; this checkout currently has no remote and the destination was requested. No commit to the shared IFCS branch or main, no blanket staging, and no merge without owner instruction.


## Owner correction: separate armored envelope — 2026-09-14

The owner rejected the native r002 hull/ledger r005 concept match: the exterior
reads as the reverse of interior walls rather than dedicated hull armor. The
next geometry pass is explicitly authorized, with a different agent comparing
actual results to `hull-voxel-study/wayfarer-layout-concept-r001/proposal.png`.
Prior technical pass reports remain history; they are not artistic acceptance.

### Native pass and design decision

Author new hull r004 without editing old native sources or live bindings. Preserve
all existing 2 m attachment spans, 3 m full height, 1/32 m interface lattice and
X[0,0.5] outward bounds. Interior wall art, pressure/collision data, engine poses,
engine art, plume and IFCS remain outside this geometry correction.

Use substantial stepped navy upper shoulders and lower impact rails, about
0.4375–0.5 m high on full-height pieces, rather than narrow linear trims. Pale
connector ribs wrap through the outer depth onto the horizontal rails and have
large chamfered end blocks. Cassette face around X=0.28125 behind forward frame
X=0.5 leaves an actual roughly 0.22 m recess and dark reveals. Do not hide this
silhouette problem behind emission, exposure or bloom.

Retain single 2 × 3 m modules and author explicit paired left/right 2 m members
for broad 4 × 3 m visual bays. Each member stays inside its own physical envelope,
retains independent identity and exact edge sockets, and is modeled at real size.
The assembled pair has outer connectors, continuous horizontal armor and a narrow
central cassette seam. Pairing is an appearance assignment in review fixtures;
it does not silently widen a physical catalog item or add nonuniform scaling.
Use larger plain/identity bays between narrow service/utility/vent bays. Quarter
height and narrow examples retain physical cap/post sizes where they fit; visibly
short modules may use a defined low-clearance profile, never compressed ornaments.

The bow must continue the stepped shoulder/rib/impact-rail language around the
transom, diagonal cheeks and corner/shoulder transitions. Keep opaque additions
below/around existing glazing. Author separate named exterior armor solids and
inboard liner/structural reference objects. Preserve the inner visible surface
when replacing inherited front visuals. Export enough semantic separation to
show armor alone and the retained structure separately; a wall texture swap or
full opaque duplicate in front of cockpit glass fails. No custom engine cutouts
or filler returns.

Map fine fasteners, shallow plate joints, inset tooling, localized edge wear and
markings into shared base-color/normal/roughness textures with stable metric UVs.
A bump field must be baked to a portable GLB normal map. Use meshes for silhouette,
wrapped caps/ribs, deep shadow cavities and vent blades. Preserve editable Blender
source parts/materials, exact exported GLBs and map hashes.

### Review and error gates

Initial native proof includes one single bay, one joined broad bay and a bow
continuation. Independent reviewer `armor_reference_review` uses its saved rubric
at `framed-wayfarer/armor-correction-review-20260914/initial-rubric.md`; the author
cannot self-certify the concept match. Fix substantive failures before full
propagation. Preserve each meaningful failed iteration. After two consecutive
iterations without demonstrated improvement, deliver the named owner checkpoint.

Required final evidence: neutral native close views, joined bay, bow close, exact
assembled ship aligned to the concept's nose-left camera, armor-only, bare
structure and an exploded separation view. Review at gameplay zoom with bloom off
and inspect actual browser output; AI concepts are references only. Validate all
hashes, UV/material preservation, normals, finite nondegenerate triangles, socket
positions and bounds, plus explicit no-overlap mating checks. Do not relax an
existing validator to admit incompatible geometry. Independent visual pass means
ready for owner review, not final artistic sign-off or pressure/damage acceptance.

A live update requires the established exact candidate checks/build/art/browser
and unchanged resource/performance gates. Otherwise deliver the native check-in
with precise remaining gates and keep the previous release intact. The repository
now has upstream main and an unrelated IFCS PR #1; isolate this art delivery on its
own main-based branch, preserve all shared owners' staged/unstaged work, and never
merge a PR without explicit owner instruction.
