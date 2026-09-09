# Stairs and elevators after the native ladder proof

2026-09-09. Owner requirement: stairs and elevators are required for larger ships and stations. This is the next bounded design and interface proposal, not a publication, gameplay rating or completed implementation. The current ladder code and its exact native fixture remain unchanged. [The construction roadmap](../ship_construction_rebuild.md) remains the completion contract: a complete authored Wayfarer, independent template spawns, pressure/airlocks, cargo/support, utilities, mounts and localized structural voxel destruction are still required. Planets remain paused; character models/poses and inventory UI retain their external owner.

## Next concrete slice: walkable native stairs

Deliver one preserved Blender stair assembly joining two actual structural decks, with matching real lower-roof and upper-floor openings, supported treads, guards and clear landings. First support one exact dogleg assembly with two flights, one supported intermediate landing and the current radius 0.3 m, height 1.8 m standing collision body. Larger bodies, additional flights, other landing arrangements, ramps, ladders and elevators require their own qualified interfaces. Existing character art is not replaced; stair stepping/animation is a separately coordinated presentation concern.

The player walks onto the stairs using the existing planar movement intent. The server recognizes the installed entry surface and derives elevation from the qualified support geometry. Releasing movement stops on a supported tread; opposite movement walks back down; lateral input moves within the permitted stair width and collides with actual guards. No action button starts an automatic ride, and no client supplies height, progress, support ID or destination deck. A camera/deck tab is never a traversal command.

The native author has proposed the dimensions below. Until the delivered native audit exists, these are **unqualified proposed content**, with no runtime registry entry. Retain the existing lattice/structural baseline: 2 m modules; lower origin 0 and walking top 0.1875 m; lower roof underside 3 m with full envelope to 3.1875 m; an upper structural origin of 3.1875 m gives walking top 3.375 m and a 3.1875 m walking-plane rise. These values are compatible starting constraints, not a requirement to cram a stair into the ladder's 2 × 2 m aperture. Extend the fixed fixture footprint and omit additional complete panels where native headroom requires it. Never shorten a flight, scale a GLB or hide a slab to force clearance.

### Candidate dimensional interface from the native author

| Interface | Proposed exact value; measured acceptance pending |
| --- | --- |
| Native design | Separate `shipyard.structure.stair-dogleg`; existing ladder untouched. |
| Kit reservation | 4 × 6 m, covering two 2 m flight lanes; target clear width at least 1.5 m between actual handrails. |
| Total rise | 3.1875 m = 17 risers × 0.1875 m; each riser is 6 lattice units. |
| Tread going | 0.3125 m = 10 lattice units; exact nosing/edge/support patches still need measurement. |
| Flight A | Nine risers from walk Z 0.1875 to intermediate Z 1.875 m; eight goings over 2.5 m, along local +Y from 1.6875 to 4.1875 m, center X 1 m. |
| Intermediate landing | Local X 0–4 m, Y 4.1875–6 m; depth 1.8125 m, walking Z 1.875 m. Guards may reduce usable width, so native support and turning-body proof control admission. |
| Flight B | Eight risers from Z 1.875 to upper walking Z 3.375 m; seven goings over 2.1875 m, along local −Y from 4.1875 to 2 m, center X 3 m. |
| Approach/exit | Lower approach local Y 0–1.6875 m; upper landing local Y 0–2 m on intact upper-floor panels. These regions require exact supported handoff boundaries. |
| Validation board | Two 8 × 10 m structural decks; kit origin `[2, 2, 0]` m. This is a fixture board, not a proposed Wayfarer deck layout. |
| Actual upper-floor/lower-roof opening | Omit the four 2 m panels at board XY `(2,4)`, `(4,4)`, `(2,6)`, `(4,6)`; free aperture X 2–6, Y 4–8 m. Two-metre outer floor margins preserve a real interior semantic hole. Retain the lower floor below the stair. |
| Native evidence required | Evaluate worst-case body/gait clearance where the retained entrance-strip roof meets the first flight; then both flights, full intermediate turn, upper threshold, underside intrusions and guards. The current arithmetic headroom estimate is not a passed mesh check. |

The sketch path through each flight and intermediate landing is a geometric reference only. Normal planar walking retains lateral freedom and may stop or reverse anywhere supported; it does not follow that path automatically.

A stair needs two distinct proofs: actual tread support and body clearance throughout a step. A polyline with clear endpoints is insufficient. The audit must measure the real native tread/nosing/riser geometry and the complete capsule motion through each supported step, including the actor's head below the lower roof and alongside the upper slab edge. Model handrails, posts and overhead members in that proof. A single enclosing corridor AABB is not a claim that every point inside it is empty.

## Proposed native and installed interfaces

The following TypeScript sketches name the contract to implement after the dimensions are reviewed. They are not existing exports. Ship coordinates use metres in XYZ, with Z vertical; renderer Y is height and renderer Z is negative ship Y. Lattice coordinates remain a distinct document representation. Source hashes refer to exact delivered bytes; a boolean supplied by a reducer never certifies geometry.

```ts
type Vec3M = readonly [number, number, number];
type Polygon2M = readonly (readonly [number, number])[];
type Bounds3M = { min: Vec3M; max: Vec3M };
type NativePin = { adapterId: string; revision: string; auditSha256: string };
type SourcePin = { sourceId: string; sha256: string; nodePrefix: string };

type StairTread = {
  sourceTreadId: string;
  sourcePartId: string;
  supportPolygonM: Polygon2M;
  topZM: number;
  nextTreadIds: readonly string[];
};
type StairLanding = {
  sourceLandingId: string;
  side: "lower" | "upper";
  supportPolygonM: Polygon2M;
  entryRegionM: Polygon2M;
  exitRegionM: Polygon2M;
  walkingZM: number;
};
type NativeStairAudit = {
  schema: "sidereal.native-stair-audit.v1";
  adapterId: string;
  revision: string;
  body: { radiusM: number; heightM: number };
  sources: readonly SourcePin[];
  parts: readonly NativeTraversalPart[];
  apertures: readonly NativeTraversalAperture[];
  treads: readonly StairTread[];
  landings: readonly StairLanding[];
  walkableFootprintM: Polygon2M;
  riserAndGuardSolids: readonly NativeConvexSolid[];
  // Per-step admissible motions and native exclusion evidence, not one free AABB.
  stepClearance: readonly QualifiedStepEnvelope[];
  stepLimits: { maxUpM: number; maxDownM: number; maxSlope: number };
};
type StairInstallation = {
  instanceId: string;
  stairId: string;
  instanceRevision: bigint;
  stairRevision: bigint;
  pin: NativePin;
  originM: Vec3M;
  quarterTurns: 0 | 1 | 2 | 3;
  lowerDeckId: string;
  upperDeckId: string;
  parts: readonly InstalledTraversalPart[];
  apertures: readonly InstalledTraversalAperture[];
  treadIds: readonly { id: string; sourceTreadId: string }[];
  landingIds: readonly { id: string; sourceLandingId: string }[];
};
```

`NativeTraversalPart`, `NativeTraversalAperture` and their installed forms can reuse the existing content contracts. `NativeConvexSolid` and `QualifiedStepEnvelope` must specify their exact representation, tolerances and maximum count in the new audit schema before acceptance. The serialized audit contains adapter ID/revision; its exact SHA belongs in external delivery and installation, not recursively in the hashed audit. Preserve original source, evaluated mesh, export validation, collision/support derivation and evidence. Neither an audit status nor an installed registry entry implies final artistic sign-off or pressure qualification.

An offline factory verifies all source GLB bytes and the native audit. A separate compact runtime factory consumes only generated, build-verified pins/audit from trusted server content. Its compiler binds exact installed part transforms, actual deck/slab datums, support identities and physical openings to a frozen `CompiledStairWalkSurface`. It cannot accept arbitrary client-authored height functions or certify a changed document from an old asset pin. Native solids, support surfaces and collision remain separate representations, with explicit agreement tests.

## Walk authority and safe reuse

Reuse the ladder work's exact source/installation binding, UUID mapping, finite fixed clock, actor/visit/grant checks, narrow own-character accepted-position view and bounded reservation primitives. Do not reuse its automatic progression, one-dimensional path lock, source-landing-only standing predicate or forced return-on-disconnect behavior as the stair movement algorithm.

Proposed pure API:

```ts
type StairWalkState = {
  stairId: string;
  actorId: string;
  instanceId: string;
  visitId: string;
  sourceDeckId: string;
  supportId: string;
  positionM: Vec3M;
  inputSequence: bigint;
  lastTick: bigint;
  revision: bigint;
  mode: "walking" | "stopped" | "blocked" | "egress-only";
};
type StairWalkIntent = {
  sequence: bigint;
  dx: number;
  dy: number;
  // Received time, speed policy and expiry are server data, not these arguments.
};
// All contexts are server snapshots; no public reducer accepts these snapshots.
compileInstalledStair(installation, trustedNativeCompiler): CompiledStairWalkSurface;
tryEnterStair(surface, actorSnapshot, planarSweep, reservations): EntryDecision;
stepStairWalk(surface, prior, intent, fixedTick, authority): StairWalkDecision;
// Decision includes accepted XYZ/support, blocked contacts, reservation changes,
// and optional atomic exit {deckId, positionM}; no partial commits.
```

The solver first bounds/freshens planar intent, then sweeps the body through the proposed native-supported step. It checks risers, guards, overhead solids and other accepted bodies, and derives accepted Z/support from the result. Stepping up requires a measured supported lower contact, bounded riser, valid next tread and a clear lift/forward/set-down body sweep. Stepping down requires a bounded drop onto measured support. Motion consumes only the fixed horizontal movement budget; it cannot skip several risers because a client sent a large delta or time elapsed during restart. A capsule-clear smoothed support proxy is permissible only if explicitly qualified against actual tread contact, the maximum step gap and full native solids; a generic ramp drawn over decorative stairs is not sufficient. Decide that exact controller representation during pure geometry tests, before world integration.

A static first stair fixture may serialize admission to one actor per assembly using a reservation for both flights and the intermediate landing. That is a capacity limitation, not the long-term requirement for larger stairs. The accepted actor still walks freely within its qualified width, stops and reverses. The source and destination approach regions stay protected until the actor exits; ordinary planar movement sweeps against reservations, not only candidate endpoints. A later multi-actor stair uses separated moving body reservations and deterministic avoidance; do not label a one-person proof as shared-crew completion.

Enter automatically only when an authoritative sweep crosses a qualified entry region from its actual supported deck. Reserve first, then commit accepted stair state and input acknowledgment together. During stair occupancy the legacy planar actor coordinates must not move independently. Collision, render position and reach use the same accepted XYZ/support; the retained deck reference is only the source-deck association until an exit commit. At a qualified exit, verify the whole body on actual deck support, commit the destination (or original) deck and accepted position once, clear stair state/reservations and stale movement together. Do not choose an exit by nearest deck, camera height or midpoint progress.

No input or expired input stops on the currently supported stair position. Disconnect or game-admission loss freezes accepted supported state and its reservation; a reconnect cannot replay old movement or catch up by wall time. Workspace traversal-permission loss changes state to `egress-only`: an admitted owner may submit fresh ordinary movement toward the reserved original landing under a narrow server egress rule, with all physical checks intact. It cannot continue toward a newly inaccessible destination. Lack of input still means stop; no automatic ladder ride is introduced. A lost game admission exposes no views or input acceptance. On restored admission, the own-character position/status view survives workspace read-grant loss until safe exit, while link discovery and other construction operations stay grant-restricted.

For the first bounded implementation, disable inventory handling, seating, firing and unrelated reach actions while on stairs, with guards before receipt replay. Keep carried item/container/equipment UUIDs and balances unchanged. Station use can resume only after supported exit. General combat/reach on stairs needs real accepted 3D origins and target/support rules later. Review exit and identity migration cannot erase stair occupancy or reset its transform; they reject or use the explicit physical egress route. Structural edits cannot remove a reserved fixture in the static slice.

## Elevator contract and utility dependency

An elevator is a moving installed platform inside a real shaft with indexed landing thresholds and actual doors. Its car, shaft, landing apertures, doors, guide/drive/brake geometry and maintenance clearances require separate preserved native qualification. A cabin mesh moving between two Z values is not an operating elevator. The shaft connects gas volumes unless separately enclosed and qualified; door closed state alone does not imply a pressure seal.

Proposed interfaces, separate from stairs and ladder:

```ts
type ElevatorLanding = {
  id: string;
  deckId: string;
  sillZM: number;
  landingDoorId: string;
  entrySupportM: Polygon2M;
  doorSweepM: readonly Bounds3M[];
};
type ElevatorInstallation = {
  instanceId: string;
  elevatorId: string;
  platformPartId: string;
  carDoorId: string;
  landings: readonly ElevatorLanding[];
  nativePin: NativePin;
  driveDefinitionId: string;
  brakeDefinitionId: string;
  powerPortId: string;
  // Exact installed shaft/platform/door parts and apertures also bind here.
};
type ElevatorOccupant = {
  attachmentId: string;
  entityId: string;
  kind: "character" | "cargo";
  platformLocalPositionM: Vec3M;
  supportId: string;
  admittedMassKg: number;
  // Authoritative body/load/support revision refs, never client load figures.
};
type ElevatorState = {
  elevatorId: string;
  revision: bigint;
  commandRevision: bigint;
  tick: bigint;
  carPositionZM: number;
  velocityMps: number;
  phase: "docked" | "closing" | "moving" | "leveling" | "opening"
       | "obstructed" | "braked" | "recovery-required";
  targetLandingId: string | null;
  occupants: readonly ElevatorOccupant[];
  queue: readonly ServerAdmittedElevatorCall[];
  // Persistent exact door, brake and accounted energy transaction references.
};
```

These definitions are incomplete until native dimensions, safety envelopes, authored load/drive/brake definitions and the utility allocator are accepted. Numeric speeds, acceleration, capacity, brake holding load and energy usage are explicit gameplay/functional definitions, not inferred from rendered machinery. No proposed motor power or carrying capacity is approved by this document.

- **Calls and dispatch:** callers send installed elevator/landing IDs, intent, expected command revision and operation ID. Server validates actual landing reach or attached passenger access. Use a bounded deterministic queue with deduplication and stable receipts. Scheduled motion updates a separate state revision, so network delay does not make a valid cancellation race every simulation tick. A queued destination is rechecked before dispatch and arrival; a passenger remains entitled to its own accepted position and safe recovery status after a grant loss.
- **Door interlocks:** motion requires the actual car door and all relevant landing doors in their accepted closed/latched state, clear sweeps and a verified shaft. A landing door opens only when that same car is level, stopped, docked and held at that landing. Collision and permission do not disappear at an animation target. Landing access remains physically blocked while the car is elsewhere. Interlock overrides are separate explicit maintenance/emergency actions and never preserve a fictional seal or floor.
- **Obstruction:** validate continuous door and car sweeps against native shaft solids, accepted actors and actual cargo envelopes, including threshold crossings. An obstructed door stops or reopens by its authored policy before motion. A blocked shaft prevents progression. Do not clamp occupants to another landing or erase cargo to clear a car.
- **Passengers and cargo:** multiple passengers have independent stable actor IDs and platform-relative accepted poses. Cargo uses existing entity/item/container IDs, actual contents mass, support/contact patches and restraint rules. Admission checks support union, capacity, overhead/door clearance and handling reservations. Boarding and leaving change the support attachment atomically; the car's moving platform is the authority frame between landings. Inventory contents do not become duplicate car inventory. Actor or cargo deck IDs are committed only on validated disembarkation, not when the car passes a deck height. The loaded platform and all attachments move as one committed state.
- **Power and losses:** drive, door and control demand must obtain bounded allocations from actual connected utility ports. Debit named reservoirs/generation allocations in the same accepted step; never award power on reconnect or infer it from a light being on. The authored drive profile accounts for motion work, losses and the project's explicit effective-gravity/acceleration policy; do not silently assume terrestrial gravity aboard every ship. Regeneration is disabled unless its return path, efficiency and storage-capacity accounting are implemented. Brownout cannot move the car farther than the accepted allocation permits.
- **Brake and recovery:** define a physically supported hold or bounded safe stopping envelope for the accepted brake design; loss of power does not permit an instantaneous position reset. A passive brake can hold without continuous electrical allocation only if that behavior is an explicit installed functional definition. An emergency battery must have a persistent accounted charge and valid connection. Manual crank, rescue release and maintenance access require their own supported mechanism and reach/interlock rules. If no accepted recovery exists, persist `recovery-required`, keep doors/shaft blocked appropriately and preserve occupants; do not label an unpowered review animation as an emergency-powered lift.
- **Persistence and concurrency:** store car/door/brake poses, velocity, occupant attachments, queue, receipts and energy checkpoints. Disconnect removes player input, not passengers or mass. Restart resumes accepted state with bounded fixed steps and no elapsed-time catch-up or new energy. Concurrent calls, boarding, cargo edits and door commands must serialize against expected revisions and reservations; no half-loaded car state can commit.

The next deliverable is the stair walking proof. Elevator work may proceed now on native geometry, formal interlock/queue rules and utility interface design, but a powered passenger/cargo browser claim depends on conserved power allocation, load/support and recovery authority. A future unpowered installation review must explicitly report unavailable operation; it cannot acquire travel by setting a `powered` boolean.

## Damage, atmosphere and complete construction remain required

Load-bearing stair treads/stringers, shaft structural walls and floor/roof apertures participate in the owner's localized structural voxel-damage contract, with per-instance material-cell state aligned to preserved Blender art. Elevator structural platforms/cab shells need an explicit structural damage classification; internal drive/control equipment follows entity health where defined. Classify each component explicitly rather than assigning an entire elevator one convenient damage mode. Damage changes support, collision, service continuity and pressure boundaries together; it does not delete and respawn the car or its contents.

The initial undamaged stair proof may reject structural refit while occupied and remain `damageReady: false`. That restriction is not the final destructibility implementation. Combat damage cannot forever be prohibited just because a stair or lift is occupied. Before destruction readiness, implement and test a defined support-loss/fall/restraint or recovery state from the actual damaged cells; a character cannot remain standing in empty air or automatically return through destroyed geometry. Preserve existing damage histories, part IDs, fittings and inventory through repair and source revisions.

Neither the stair nor elevator borrows the R006 room's airtight proof or initialized gas. New open shafts need their own volume/flow topology; qualifying a sealed elevator additionally needs actual cabin/shaft boundaries, effective door seals and explicit gas accounting. A normal elevator is not an external airlock. Power, pumps, airlock cycles and exterior movement remain their separate required systems.

Larger-ship/station stair and elevator variants eventually become authored catalog adapters with explicit dimensions and compatible floor/roof modules. The complete Wayfarer receives purposeful authored spaces and suitable transitions; do not paste demonstration platforms into its template or invent an elevator that does not fit. Independent template spawns allocate distinct ship/deck/part/support/landing/car/door/attachment UUIDs. Existing live conversion is a separate expected-revision migration preserving ship, character, item, fitting and container UUIDs, cargo, damage, energy and gas state. Reconnect, blueprint publication and capture never perform that conversion automatically.

## Ownership and implementation sequence

| Owner / files | Bounded work |
| --- | --- |
| Native author: new stair art-library design/revision, audit and validation | Actual treads/risers/guards, footprint, landing/headroom/aperture evidence; no changes to the frozen ladder or character art. |
| Pure rules: proposed `packages/content/src/construction-stairs.ts`, `packages/sim/src/construction-stairs.ts` and tests | Final native schema, trusted compiler, supported continuous walking, entry/exit, stop/reverse and sweep/reservation rules. Send types before world work. |
| Pure document integration: proposed `construction-stairs-document.ts`; coordinated content document/transactions/instance/roof changes | Optional versioned stair bindings; actual panel omission; new-instance UUID mapping; reject incompatible source/refit. Old ladder/pressure documents remain unchanged. |
| Authority owner: proposed `packages/world/src/construction-stairs.ts`, private tables and tests | Persist supported stair position and input acknowledgment, permission/egress, occupancy and exact exit commits. Shared auth/interaction hooks coordinated with root. |
| Root: world index, bindings, net and App/composition | Register accepted types, route ordinary walking intent, narrow own-state projection and actor/render frame. Reuse standing/action guards with an explicit stair state. |
| Native renderer: proposed `packages/render/src/construction-stairs.ts`, narrow construction renderer integration | Load actual native treads and decks; display accepted XYZ/support and cutaway. No client elevation authority or ladder auto-animation substitution. |
| Utility/cargo authority owners, coordinated by root | Elevator power allocations, exact load/support/attachments, car/door/brake controller and recovery. Any inventory authority changes coordinate with its owner; inventory UI remains external. |
| Dashboard owner | Authored stair/lift placement with fit errors and real aperture dependencies; preserve unsupported drafts, live/capture/publish distinctions. |
| Root validation | Managed isolated DB, actual admitted actors, source/art checks, browser walk/cargo evidence, restart and measured budgets. |

Order: freeze native stair dimensions and audit schema; test pure tread/support/body sweeps; compile one exact document; add private continuous walk authority; integrate native rendering and normal input; prove two independent instances, stop/reverse/reconnect and actual browser walking. Only then broaden stair variants. Elevator source/interlock design proceeds alongside the necessary cargo/utility work; powered operation cannot precede those dependencies. Do not mark general multi-deck construction or Wayfarer complete at any intermediate fixture.

## Acceptance gates

1. **Native agreement:** exact source/export hashes and evaluated geometry; real matching slab omissions; every tread/contact and support adjacency; riser/guard/ceiling/body sweeps, including the roof-edge headroom case; correct quarter turns and translated installations. Invalid/unknown/staged geometry never acquires runtime qualification.
2. **Ordinary stair movement:** walk on from both actual landings with planar intent; stop at several tread positions; restart and reverse; lateral collision and simultaneous diagonal input; normal/sprint bounds; stale/duplicate/out-of-order packets; server-only Z/support; one correct deck change on full supported exit. No click-to-ride or client transform is used by the browser proof.
3. **Occupancy and permission:** occupied entry/exit/flight rejects or safely stops; reservations cover swept movement; access loss enables only valid egress; game-admission loss stops; ordinary actions cannot use a stale deck origin while on stairs; cancellation/replay/reconnect never changes character/items or creates a second reservation. Preserve supported state across actual process restart.
4. **Elevator rules before operation:** absent/unaligned car never exposes a landing; motion with an open/unlatched door rejects; actual sweep obstruction; multiple passengers and mixed cargo; threshold occupancy and load/support/capacity; deterministic queued calls and late cancellation; own-position visibility during access loss; valid egress and emergency outcomes.
5. **Resource and failure accounting:** power demand/allocation/debit at each accepted step; load or route change; brownout, brake faults and restoration; finite nonnegative charge; no free emergency battery or reconnect recharge; persisted queue/attachments/velocity; duplicate callbacks cannot double move or double debit.
6. **Construction integrity:** old pressure/ladder fixtures unchanged; two spawns have disjoint live UUID/state; prior inventory/crew/fitting identities preserved; no copied gas/energy; future voxel damage visibly and physically removes local support/enclosure, with explicit actor/cargo consequences and repair. No health-only replacement for structural cell damage.
7. **Evidence:** `npm run check`, `npm run build`, relevant asset validation, isolated authority smoke and actual browser/restart review through managed services. Measure per-tick and renderer cost at the admitted occupancy bounds. Unit mocks, annotated dimensions and standalone previews do not establish the gameplay gate.
