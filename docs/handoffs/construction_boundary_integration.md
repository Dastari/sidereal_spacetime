# Native boundary and door integration — working checkpoint

2026-09-09. Integration owner: `integration_continuation`. Extends the published floor-walking checkpoint; full construction acceptance remains in `docs/ship_construction_rebuild.md`.

## Exact candidate and authority boundary

Native source is `assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r001/`. GLB SHA256 `4c631ad5517bf6d6cc88af29aba4a6890808c33effeed4205acb26a022758426`, interface-file SHA256 `33347b32b1675fee00d36046a05de37013fa32eca6e2a4d671464da3499972d9`. `scripts/install_construction_boundaries.py` verifies the exact GLB, interface and Blender source pins and copies only runtime GLB/interface/manifest files into independent application asset directories. No Wayfarer assembly is replaced. No owner art approval is inferred.

A construction document may explicitly opt into `boundaryKit` with the exact interface pin. Historical documents without this field retain their original floor-only behavior. The compiler invokes the same pure native-boundary planner on every declared deck. Unsupported diagonal walls, partial module lengths, junctions, door dimensions/swing space or ceiling heights fail publication instead of stretching native art or substituting another revision. Draft save remains recoverable.

The native wall thickness is .125 m; floors meet wall bottom at .1875 m and wall tops reach the3 m ceiling plane. This is geometry, not a strength or pressure rating. Node closures must exist at every module endpoint, including collinear joins. The current physical leaf has2 mm fit gaps and no gasket, so pressure readiness remains false.

## Door behavior

Private `construction_door` rows use the already remapped opening UUID and retain instance/deck, hinge frame, fraction, target, obstruction and revision. Each independent spawn creates its own closed door rows. Connected actors may operate only doors in their owned current review instance/deck and within2.5 m unobstructed reach. Review transit visit ID, expected door revision and operation ID are validated. These are explicitly development review interactions, not remote control or arbitrary transforms.

A prototype manual one-second motion rate is an integration behavior, not an art-derived actuator/power rating. The server advances motion at its existing50 ms tick. A conservative complete hinge swept envelope blocks movement while a character occupies it; this can reject near-edge safe positions but avoids relying on sampled angles. Closed/partially open door apertures remain blocked. At full opening, the aperture becomes passable and the rotated leaf still contributes its actual conservative footprint to walking collision. No sealing, airlock pump or native voxel clipping is claimed.

## Rendering and checks

The dedicated loader verifies actual downloaded GLB bytes before importing. It shares source geometry/materials and preserves each native primitive's full bind transform, including hinges stored above multi-material primitive meshes. Separate placed nodes retain semantic identities. The door reads authoritative fraction; renderer movement never writes simulation state.

Actual native GLB tests under Babylon NullEngine pass for wall datum, upper-deck positioning, complete hinge translation, full1.25 m aperture at90°, material/normal/tangent retention and zero imported lights. Five pure motion tests and two new server integration tests cover continuous-envelope blocking, resumable motion, stale commands, reach, privacy, independent spawns, closed passage and persistent open-leaf collision. These are numerical/software tests, not final visual acceptance.

### Actual game gate passed

The exact candidate was saved, published and spawned through the actual Shipyard buttons in dedicated database `sidereal-spacetime-dev-review-boundaries-20260909`. Blueprint `b18bbc43-b817-4072-b272-b2d647d3fe97` has canonical SHA256 `95d0f89d65ad128c59b7ea827e198e0287189d604136f2b7e3d4fa40086926ad`. The review used two decks and two independent instances; movement was exercised on the lower decks. Temporary provider administration was revoked after the scoped review grant. Normal Wayfarer data was not replaced.

- Actual Enter/Open/Close/Return buttons and WASD exercised the server and native renderer together. A closed door stopped crossing at x1.6375 m; after full opening the character reached x3.6375 m. The physical leaf rotated to −90° and remained a collision obstacle.
- Closing paused while the actor occupied the conservative swept envelope and resumed after moving clear. Reconnect retained door fraction/revision, visit UUID and position. Opening the second instance's door left the first instance's closed door/revision unchanged.
- All seven inventory items, containers and appearance rows were byte-equal after the final Return. Both instances remained; no review visit remained. This is durable reconnect and instance-isolation evidence, not a new process-restart or shared-crew proof.
- Native perimeter cutaways hide the near walls according to camera direction in interior view and restore them in flight. This changes presentation only. The selected deck had20 native boundary placements and zero visible legacy Wayfarer meshes.
- Inspected game images: `output/playwright/construction-boundary-r001-cutaway-closed.png` and `output/playwright/construction-boundary-r001-open.png`. The browser used SwiftShader and manually requested frames; no hardware FPS or real-time animation-quality claim is made. It is closed and the software-GPU slot is released.

Detailed local logs are `.runtime/boundary-named-publish.log`, `boundary-walking-proof.log`, `boundary-reconnect-second.log` and `boundary-final-return.log`. An earlier attempt used the disposable `-smoke` database and its fixture disappeared during concurrent work; those earlier IDs are not this proof. Managed `publish-review --review-name boundaries-20260909` now creates only a project-prefixed, additive, named review database. It never resets data and cannot target the normal database through its suffix.

Final gate: `npm run check` passed450tests/100files, typecheck and73docs; full isolated `npm run smoke`, aggregate `npm run build`, and `npm run art:check` passed. Three Python tests guard the named-review command against resets or accidental normal database selection. The exact additive door schema was published normally using managed `publish` with delete-data=never. Readback has zero normal construction instances/grants/doors; no construction fixture was seeded there. Existing normal character/ship/item counts changed through concurrent work since the prior checkpoint, so post-publication counts are recorded without claiming before/after snapshot equality. Exact artifact hashes and counts are in `docs/releases/construction-boundaries-2026-09-09.json`.

Native roofs, pressure seals, deck transitions, cargo/services, damage and the full semantic Wayfarer rebuild remain required. The delivered roof r001 is a separate uninstalled candidate at this checkpoint.
