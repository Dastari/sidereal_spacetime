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
