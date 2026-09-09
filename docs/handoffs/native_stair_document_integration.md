# Native dogleg stairs: document bridge ready for integration

2026-09-10. This bounded slice adds source/content and pure construction-document code only. No world table, active reducer, shared construction schema/parser, renderer, application, public asset directory or deployed service was changed. Native geometric qualification is not final owner art approval. Stair gameplay and elevator gameplay are not yet live.

## Exact candidate and completed code

The current candidate is `shipyard.structure.stair-dogleg/r000/a003`, not a001/a002 or an older 4×6 m zero-origin review. Its stair assembly occupies a 4×6 m area starting at source XY `[2,2]` within an **8×10 m** two-deck context. Source XY maps to renderer X/-Z; source Z is renderer Y.

| Input | SHA-256 |
| --- | --- |
| `stair-audit.json` | `8df56649474fa8379af3a2c678716fc1f80406e9f9457e85498598f6a0be9831` |
| Native stair `kit.glb` | `8d2f8359f6221a43245fdd9b10671892cbe5d05f5ba8569ff04f1f8e54f728a7` |
| Floor r002 `kit.glb` | `138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585` |
| Roof r001 `kit.glb` | `fe5646a431fcaa21033ca235094188b450c33e55e15735b7834fc18623fb3711` |

Source lives under `assets/art-library/designs/shipyard.structure.stair-dogleg/revisions/r000/a003/`. Editable Blender source, native triangulated collision evidence, capsule-fit evidence and rejected older centre-stop results remain there unchanged.

New files:

- `scripts/stage_construction_stairs_runtime.py`: verifies the pinned audit and all three complete GLB byte hashes. Default generates only the new content module; `--check` is read-only; optional `--stage-assets` copies exact GLBs into private `.runtime/art-library/stairs/r000-a003/`. It does **not** publish runtime assets or mutate a database.
- `packages/content/src/construction-stairs-room.ts`: exact generated audit text, delivery, proposed runtime URLs and pins. The URL declarations are a contract, not evidence those assets are publicly installed.
- `packages/sim/src/construction-stairs-document.ts`: exact fixture creation/validation, native source installation, matching roof plan, conservative ordinary-deck collision and pure binding-remap helper. `NativeStairRoomDocument` is a local staged extension until the shared content schema adopts it.
- `packages/sim/src/construction-stairs-document.test.ts`: 20 passing tests covering exact layout/support/roof geometry, source corruption, unqualified mutations, independently mapped identities, reload equivalence and both landings/upper shaft.

The fixture has 20 lower-floor panels, 16 upper-floor panels, 16 lower-roof panels and eight stair-kit groups: **60 separate placed objects** sharing only three immutable GLBs. There are 18 independently bound walking support patches and 17 qualified riser transitions. Deck origins are 0 and 3.1875 m (lattice 0/102); actual floor tops are 0.1875 and 3.375 m. The lower roof is at 3 m (lattice96). Upper floor and lower roof omit four panels at source XY `(2,4)`, `(2,6)`, `(4,4)`, `(4,6)`, leaving a real 4×4 m opening `[2,4]..[6,8]`. Lower floors beneath the stair remain present.

## Narrow shared integration patch contract

The release owner should reconcile these changes after the current rollout freeze. Do not mechanically reuse an old ladder patch.

1. Add content export `"./construction-stairs-room": "./src/construction-stairs-room.ts"` in `packages/content/package.json`; add sim export `"./construction-stairs-document": "./src/construction-stairs-document.ts"` in `packages/sim/package.json`.
2. Move/copy `NativeStairRoomBinding` into the content schema boundary and add optional `ConstructionDocument.stairRoom`. Keep exact fields: `pin`, `lowerDeckId`, `upperDeckId`, `stairId`, `parts[{id,sourcePartId}]`, `apertures[{id,sourceApertureId}]`, `supports[{id,sourceSupportId}]`. Do not use a client-authored audit, `nativeReady` boolean or opaque arbitrary extension. Remove the staged local extension when the shared type exists; the content package must never import sim.
3. In `construction-transactions.ts`, explicitly allow `stairRoom`, invoke `validateNativeStairRoomDocument` during draft parsing **and** final compilation, and canonically sort each binding array by placed ID. Keep draft/document byte caps before parse/insert. Ensure pressure and ladder fixture validators reject a mixed stair binding too; stair validation already rejects both. No pressure/services/native-damage/flight readiness follows from stair qualification.
4. In `construction-roofs.ts`, dispatch to `planNativeStairRoofs` before generic roof derivation for a stair fixture. The generic mapper would silently cover all four openings because lower floors still exist beneath the stair.
5. In `construction-instance.ts`, enforce this candidate's exact radius0.3 m/height1.8 m body before safe spawn, use `nativeStairRoomCollision` for source/current deck collisions and include stair IDs, native parts, apertures and support IDs in cross-domain uniqueness/allocation checks. Add separate `stairLinks`, `stairSupports` and `stairApertures` mappings (native parts can share the existing mapping domain when fixtures are mutually exclusive). Add their allocation kinds. Preserve the actual source IDs in bindings. Remap the binding with `remapNativeStairRoomBinding` after semantic layout/floor IDs are mapped. This helper consumes a server allocator's map; it does not allocate or validate a live authority grant. Revalidate the exact remapped serialized document before insert.
6. Extend instance tests through the **real** `compileConstruction → planConstructionInstance` path: spawn lower and upper deck independently, disjoint native/support/aperture UUIDs, exact reload, source native IDs unchanged, safe landing and shaft collision. The current new tests exercise the pure binding-remap contract; they do not claim the shared instance planner is wired.
7. Add a trusted published stair compiler registry in world, analogous to the qualified ladder registry, populated only by the generated build content. Use `nativeStairRoomInstallation` with actual bound document/instance revision and server stair revision. Do not infer seals, ratings, utility power or authority from the asset manifest.
8. Root must deliberately install the three exact authored GLBs to the proposed `assets/runtime/construction/stairs-r000-a003/` URLs, update its manifest/provenance and run managed app preparation/build when ready. Preserve native mesh/material data and separate collision/support data. The staging script intentionally cannot make assets public.

## Remaining gameplay authority and presentation

The existing `construction-stairs.ts` pure solver supports actual horizontal intent, stopping/reversing, qualified lift/advance/settle steps and supported recovery of one incomplete riser. It is **not** the ladder's timed whole-flight transport. The next world adapter must:

- Persist private installed stair/link, active walk, reservation and acceptance state with actor, visit, proof and revision checks. Stop ordinary deck motion while active. Current source deck remains effective until the actor reaches a real exit landing; only then commit destination deck/location atomically.
- Begin from the actor's actual accepted standing landing while consuming normal `setIntent`; never accept client elevation/support selection or start from cursor teleportation. Revalidate body, instance/doc/proof, character presence, permissions and movement-control ownership. Keep supported landing handover atomic so entry/egress cannot oscillate or duplicate starts.
- Reserve shared passage conservatively, including actual accepted actor bodies and exit regions. A nonparticipant must not walk into a reserved capsule/path. A future multi-occupant stair policy needs new tests, not removal of reservation checks.
- On stale input, disconnect or permission loss stop on support, or physically return the currently incomplete riser to its last supported stance. Unlike a ladder, do not auto-return the whole flight. Keep the remaining supported stair occupancy/reservation durable and visible to its own admitted actor, and define explicit recoverable reacquisition/egress if access remains revoked; do not leave a permanently unusable actor or release geometry underneath them. This is unresolved world policy, not completed by the document bridge.
- Gate seating, inventory/combat interactions, refit, leaving review and deletions against active occupancy as appropriate; preserve accepted shot sequences and inventory state. Compile/index occupants by instance, avoid idle clock/row rewrites and follow the recently corrected tick/network contracts.
- Expose only authorized own accepted XYZ/support/phase/revision and permitted stair discovery; private instance layout/other accounts remain protected. Same-account reconnect and foreign-account denial need isolated database tests.

Renderer then loads the three pinned sources once, selects the60 authored node groups by placed identity, preserves materials and uses current accepted XYZ after pose solving. It must show both flights, guards and the real opening during transit; floor/roof cutaway cannot replace the stairs with a hidden slab. Existing character rig/pose code retains its independent owner; gait/foot IK polish is not an authority prerequisite and numerical clearance is not final visual acceptance.

Actual gameplay acceptance still requires visible Shipyard publication/spawn, lower→upper and upper→lower walking, lateral intermediate landing, stop/reverse, exit handoff to ordinary movement, reconnect midflight, obstruction/reservation/permission loss, two independent instances and browser images from the exact candidate. No service was started or published by this specialist.

## Validation performed

- `python3 scripts/stage_construction_stairs_runtime.py --check`: exact audit plus all three complete native source hashes passed; generated module byte-for-byte current; no public artifact writes.
- `npx vitest run --config .runtime/stair-document-vitest.config.ts`:20 new tests passed. Temporary alias maps only the new unexported content module during shared-file freeze.
- `npx tsc -p .runtime/stair-document-tsconfig.json`: focused new module/test dependency typecheck passed with the same temporary path mapping.
- Aggregate repository checks/build/authority smoke and real browser review belong to the combined integration after shared parser/world/render wiring. This slice does not claim those integration gates passed.

Elevators remain the separately specified powered cab/shaft/doors/controller work in `construction_stairs_elevators.md`, not another stair or ladder visual skin.
