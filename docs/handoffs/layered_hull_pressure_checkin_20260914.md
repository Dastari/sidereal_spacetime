# Layered hull and interior pressure check-in — 2026-09-14

Owner-directed r003 native study and damage/pressure rule foundation are reviewable. No Shipyard contract, live combat integration or art approval is marked complete.

## Exact review package

- [Crater states and exploded anatomy](../../assets/art-library/hull-voxel-study/review-r003/screenshots/damage.png)
- [Reference-led finishes](../../assets/art-library/hull-voxel-study/review-r003/screenshots/finishes.png)
- [Interior damage and pressure](../../assets/art-library/hull-voxel-study/review-r003/screenshots/interior.png)
- [Height/width variants](../../assets/art-library/hull-voxel-study/review-r003/screenshots/modules.png) and [actual Babylon socket assembly](../../assets/art-library/hull-voxel-study/review-r003/screenshots/assembled-widths.png)
- [Editable Blender source](../../assets/art-library/hull-voxel-study/review-r003/study.blend), [findings/limits/reproduction](../../assets/art-library/hull-voxel-study/review-r003/README.md), [living ledger](../../assets/art-library/designs/shipyard.hull.voxel-material-study/design.json)
- [Exact artifact manifest](../../assets/art-library/hull-voxel-study/review-r003/artifact-manifest.json), SHA-256 `533105f59ddf3ba9525b1c15bfa2d2b4ef08509a4bd984e171d1ed0ad6443df1`.

The library retains r001/r002 and failed rendering logs. New reference notes identify exact crops and hashes; no original art pixels or logos are used as panel textures. The private browser route used for review is not a deployed gallery URL.

## Implemented in this candidate

Twenty-two exported native specimens use a 31.25 mm physical cell lattice. The exterior review assembly has a continuous inner skin, actual ribbed cavity and outer armor. Internal partitions have two skins and a cavity with ribs, within a centred 250 mm thickness. Three image-backed finishes share identical geometry. Widths 0.5/1/2 m and heights 0.75/1.5/1.84375/2.25/3 m preserve depth, material scale and explicit attachment sockets. Damage creates shallow craters, exposed cavities or narrowing full penetrations without painted holes.

New shared rules analyze six-face empty-cell connectivity through the exact material proxy. A partial crater preserves isolation; offset holes can connect through a cavity. Explicit accepted boundary endpoints distinguish room-to-room flow from vacuum. Tests exercise the existing world atmosphere helpers, preserving gas when the topology changes and rejecting stale revisions/repeated initialization. A chained-room test verifies that an internal breach alone does not vent, while a later exterior breach drains connected rooms conservatively.

All exact native export proxies produced the expected traces: craters and armor-open states retain their back skin, and full penetrations open a 0.078125 m² back-skin aperture. Conductance is a clearly labeled illustrative input, not an approved material rating.

## Validation

| Check | Result |
| --- | --- |
| Independent actual GLB geometry/material validation | 22 passed; closed, consistently wound, volume/cell conservation, correct fracture surfaces and socket positions |
| Interchangeability | Four three-finish groups preserve identical geometry; 49 exported socket pairings align |
| Browser | All 22 GLBs load with expected normal maps/triangles; actual mixed-width sockets coincide; pressure trace slider works; no JavaScript errors |
| Focused rules | 10 Python tests and 10 TypeScript pressure/damage tests pass |
| TypeScript / scoped ESLint / document checks | Pass; 88 document/provenance checks |
| `npm run build` / `npm run art:check` | Pass; build-size/circular-dependency advisories retained in logs |
| `npm run check` | 1,937 tests passed, two failed initially; planet timeout passes isolated rerun, flight exact-rest assertion still fails with residual velocities `8e-323` / `2e-323` |
| Fresh isolated smoke | Test database created without reset; fails the existing `available engines accelerate and turn` assertion at `scripts/smoke.ts:376` |
| Whole art-library check | Index regenerated; separate unregistered `reference/art/editor-mockup-5.png` inventory warning remains; no validator relaxation |

The native/pressure changes do not modify flight code. Shared-tree activity advanced HEAD from entry `599d2c7a8ab2c3553f4db8fb63ea5624511a63f0` to observed `c1f2eb4a9c3d5fa637c8b3c9feeb238c8012adee`; no other owner's work was staged, reset or restored. Exact scoped source hashes and full command logs are in `.runtime/shipyard-completion/layered-hull-20260914/`. The smoke fixture is `sidereal-spacetime-dev-layered-panel-r003-r0001-smoke`; it is preserved for investigation. No public/live database was reset or published.

## State boundaries and next gate

Live native catalogue hash remains `9fa3db94ed61a84f3e9d52b0d404d1433931747bbd268fceefe6a4e2a6ead237`; hull-interface hash remains `2379415fc3501b6818daa3b17174d52fa8a91c330c9a1107271b5fcc4efd4e03`. This task performed no public game/dashboard deployment, live ship refit, account/item change or collision-pin change. Only the isolated smoke fixture was published.

Required next integration includes qualified native damage/seal adapters, live hit authorization and resource checks, expected-revision/idempotency receipts, persisted damage, compartment boundary bindings, render/collision updates and actual game/restart evidence. Panel-level connectivity assumes sealed lateral framing; seams and offset holes across multiple pieces require a combined proxy. No pressure rating can be inferred from a material texture or a room label.

These straight specimens do not qualify diagonal/corner/door/window families or floor/roof/deck joints. The standard 3 m clear-height specimen does not redefine the approved 3.5 m deck pitch: floor, roof and service-band interfaces still need explicit assembly qualification. Existing structural walls remain separate barriers until a qualified replacement adapter accounts for them. Texture scale is fixed; continuous motif phase across arbitrary mixed-width placements needs an explicit instance UV phase. Cell meshes remain unmerged studies and must be optimized/measured before production admission.

No new owner dimensional decision is needed to review these examples. Proposed next defaults are to retain the current mechanical dimensions and lattice, keep finish selection independent, and qualify the layered stack against the existing structural wall and deck bands. Exact artistic sign-off, production material/flow qualification and live game acceptance are still open. Prior Shipyard minimum-completion and isolated administrator-workspace gates are not bypassed by this study.
