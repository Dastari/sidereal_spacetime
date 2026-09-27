# Construction collision adapter

Status: pure selected-deck collision adapter implemented, 2026-09-09. Live movement, interaction and multi-deck traversal are not wired by this change.

## Files and verification

- `packages/sim/src/construction-collision.ts`
- `packages/sim/src/construction-collision.test.ts`

Twelve focused tests pass. Full `npm run typecheck` passes. Tests cover floor union seams, 1,000 m displacement without perimeter tunnelling, wall sliding/corners, door state and jamb clearance, unsupported sill handling, diagonal triangle walls, enclosed floor holes, ship/deck identity, reach/LOS, explicit equipment colliders, validation and deterministic non-mutating behavior. The parent retains aggregate check/build/smoke responsibilities. No authority, shared exports, assets, service or browser changes were made.

## Integration API

`compileDeckCollision(document, deckId, options)` invokes the existing deterministic layout compiler and rejects any invalid result. It selects one explicit deck and returns nominal floor-support polygons, perimeter/hole walls, partition jambs, door spans and optional approved convex obstacle polygons. It converts the document's 1/32 m lattice to ship-local XY metres once. Elevation is returned as metadata; it never changes an actor's authoritative deck.

Options require the live `shipId` and explicit perimeter/partition half-thicknesses in metres. The caller must bind those dimensions and nominal polygons to approved native interface/collision definitions. This adapter does not infer collision from GLB bounds, asset appearance, room names or fixed Wayfarer constants. Optional obstacle footprints require a definition ID and are already expressed in metres. The caller resolves the actual approved definition; merely supplying an ID is not authorization or certification. Layout fitting rectangles are not automatically promoted to collision proxies.

Compile/cache on a structural revision. The current adapter recompiles its document for safety and does not accept an independently supplied compiled result that could be paired with stale intent. Its fingerprint is the existing non-cryptographic cache fingerprint, not a publication/authentication digest.

`resolveDeckCollision(base, states)` creates a collision frame from the actual authoritative opening states. Missing door/airlock states fail closed. Passages default open but can be explicitly obstructed. A passable state means the actuator has fully cleared the opening, not merely received an open command. Fixed jambs remain present and therefore constrain the body's actual radius. Nonzero sills remain blocked pending a vertical step/clearance adapter. Unknown and duplicate state IDs reject.

`canOccupyDeck(frame, location, radiusM)` checks matching ship/deck, supported floor union, obstacle interiors and circle clearance from all effective segments. Adjacent tiles do not create artificial seam walls. Explicit floor holes retain perimeter collision. Invalid or penetrating starts are not automatically relocated.

`sweepDeckCircle(frame, start, deltaM, radiusM)` analytically sweeps the moving circle against finite segments expanded by body radius and physical wall half-thickness. It resolves earliest contacts and projects remaining displacement tangentially for bounded sliding. Finite segment ends provide rounded jamb/corner contacts. It never samples a sequence of movement endpoints that could tunnel through a thin wall. The result includes position, contacted segment IDs and an exhaustion flag; exhaustion discards the remaining displacement. Numerical/topology inconsistency fails closed to the original valid position. The caller derives displacement from authoritative movement intent and bounded simulation time, never an arbitrary client-authored transform.

`deckLineOfSight(frame, from, to)` checks same-frame supported endpoints and effective opaque boundaries. `canReachOnDeck(frame, from, to, maximumDistanceM)` adds the distance limit. Identical XY on another deck or ship rejects. Interaction targets need a reachable interaction anchor; a point inside an obstacle body or embedded in a wall correctly does not pass this generic LOS test.

## Bounds and limitations

The underlying layout compiler's bounds still apply. This adapter admits at most 16,384 combined segments/openings, 2,048 convex obstacles with at most 16 vertices each, coordinate magnitudes up to 512 m, displacement components up to 1,024 m, and body radii up to 4 m. Wall half-thickness is explicitly bounded to 0–2 m. Each sweep permits eight contact/slide iterations. These are bounded admission limits, not measured per-actor throughput targets; a spatial broad phase and server workload benchmark remain appropriate before accepting worst-case content.

All segments currently block both walking and planar LOS. Low dividers, transparent windows, sloping canopy clearance, different body heights, moving door leaf sweeps, ramps/steps, stairs/ladders/lifts and dynamic actor contacts need explicit adapters. Zero thickness is supported for geometric fixtures; it is not an inferred physical material rating.

Exterior perimeters remain closed; an airlock kind on an internal partition does not establish an exterior portal or EVA. Structural damage/open boundaries must be supplied by a future damage-aware compiler rather than toggling rendering. Floor holes remain impassable in this planar adapter. No renderer cutaway or camera selection alters collision.

Still pending: native definition lookup/binding, compiler revision storage, world tables/reducer movement dispatch, door state synchronization, server interaction/LOS integration, real multi-client and restart tests, traversal authority, and installed-game visual/collision evidence.
