# Crew Characters and Ship Interiors

Status: Active
Lifecycle: source-of-truth
Category: feature
Last updated: 2026-09-07
Owners: gameplay + replication + client + art
Scope: Persisted characters, cockpit occupancy, deck movement and private multiplayer interior presentation.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/active/ship_construction_blocks_contract.md
- docs/features/active/visibility_replication_contract.md
- docs/plans/active/modular_space_assets_and_interiors_plan_2026-09-06.md
- docs/decisions/dr-0040_distribution_and_persistence_authority_model.md
- docs/guides/blender_space_asset_pipeline.md

## 0. Implementation Status

2026-09-07 moving-interior camera fix: RPG presentation keeps the ship's +Y bow
facing screen-left. Walking keys remain screen-relative and are converted to deck
axes before sending intent. Avatars and doors attach to the canonical rendered
frame; the camera resolves that same frame after interpolation and rollback visual
correction, using the exact collision-constrained local pose drawn for the avatar.
There is no world-space camera spring while aboard in RPG view, including after
leaving the seat. This prevents fixed-tick/render-phase differences and ship-control
role changes from shaking the cabin. Stars, nebula, foreground dust and the separate
celestial-body camera use the same final view heading. Native and WASM share the
fix; no gameplay, ownership, handoff, persistence or wire schema changes are involved
(protocol 23 remains current). View orientation never changes authoritative hull
rotation, character coordinates, seat occupancy or control permission.

2026-09-07 airlock and presentation update: horizontal/vertical airlocks have
server-owned opening state, eight-frame animation and closed-door collision.
E uses the nearest reachable door or control seat; TAB remains a view switch.
The large RPG help frame is removed. Only the contextual E action or a brief
rejection message appears. Enclosed interiors use neutral cabin lighting,
isolated from stellar and external light color. Both native and WASM share this
implementation; matching protocol 22 builds are required.

2026-09-07 RPG expansion proposal: `docs/features/proposed/character_inventory_and_interaction_proposal.md` covers personal inventory, equipment, effective carried mass, general interactions and proximity text chat. Those systems remain unimplemented. Current suit/helmet choices are cosmetic and crew frame load still uses body mass; the proposal describes the required equipment and inventory integration for native and WASM.

2026-09-07: E enters/leaves the nearby cockpit; TAB independently selects Space
Sim or RPG Explorer. Changing view never changes seat occupancy or local position.
RPG view shows the interior/avatar even while seated. Space view shows the exterior
even while standing. Walking inputs require RPG mode; flight inputs require Space
Sim and an authorized occupied cockpit. Both transitions clear stale input intent.
The former mode/help frame is removed; a nearby E action prompt remains. R remains the sensor-ring key.
This supersedes the original combined TAB behavior described in the dated history.
Shared native/WASM controls now use protocol 22; a matching client download is required.

2026-09-06: Implemented the first attached-character runtime: the persisted player
entity owns `LocalFramePose`, `CrewMember` and `CrewAppearance`; modular hulls own
an authored `InteriorDeck`. TAB leaves/enters the cockpit, WASD walks, SHIFT runs.
Seat entry requires proximity, vacancy and pilot authorization. Both native and
WASM use the same inputs, deck rendering, animated avatar layers and camera mode.
Deployment and live acceptance are recorded below as they complete.

The original approved Wayfarer interior now compiles 84 walkable floor cells (including its airlock threshold),
fixture obstacles and its existing bridge chair into a control seat. The chair
is at the bridge sprite's physical position. Exterior hull collision is separate
from deck collision. Boarding between vessels, EVA physics,
oxygen, injury gameplay and delegated piloting are subsequent work; this release
does not claim these systems are implemented. Avatar float/thrust/hurt/downed
art is exported in preparation for those interactions.

## 1. State and motion ownership

`LocalFramePose` is generic engine spatial state: parent UUID, f64 local position,
velocity and heading. It persists on the player ECS entity. `CrewMember.seat_id`
is scoped by that frame; null means walking. No account or per-player SQL table
stores character position, seat or appearance.

The hull compiler resolves the explicit block `interior` authoring field into
floor cells, fixture bounds and control-seat entry/exit points. It rejects a
seat without a clear exit floor. Angled exterior armour is not walkable floor.
Character radius is 0.28 m, walking is 2.4 m/s and running is 4.2 m/s. Movement
uses fixed time, normalized intent, circular boundary checks and swept substeps.
There is no authoritative client position packet. Intent expires after 350 ms.

Each starter character contributes 85 kg through its persisted `BaseMassKg`.
The server derives a generic `FrameLoad` aggregate (mass, centre and inertia)
from occupants, including their changing local positions. Shared hull physics
includes that aggregate in Avian mass/centre/inertia and fly-by-wire prediction.
Only this aggregate is replicated publicly; individual crew records remain private.

An attached player has no independently integrated rigid body. After hull physics,
the owner shard projects world position and velocity in f64, including angular
velocity crossed with the rotated local offset. The old observer-follow system
excludes characters with a local frame. Render transforms never feed this pose.
Visibility follows the projected body rather than a remote vehicle lease.

2026-09-07 control-station authority: an occupied control station is the source of
ship-control permission. Ownership alone never grants a ship lease. E entry grants
`ControlledEntityGuid` and the transport route; E exit revokes them, advances the
control generation, drops buffered input and neutralizes flight/weapon intent.
Seat and control target are persisted in the same actor record. TAB only changes
presentation/input mode and never grants or revokes this permission.

Control requests and realtime input drains use the same shared station check. It
requires exactly one living actor at a real station's local position in the target
frame; missing crew/deck/station, conflicting claims and frozen/ghost state fail
closed. Station removal, death and invalid occupancy revoke derived leases during
reconciliation. Frozen handoff state retains its persisted choice while inputs
remain denied; the destination rebuilds routing from authoritative occupancy.

The authoritative simulation applies this rule again before consuming flight and
weapon intent, including scripted/NPC intent and navigation commands. Unoccupied
ships coast without commanded thrust; this does not freeze physics. The server
also removes `FlightControlAuthority` before input/simulation when the station is
invalid: a zero velocity target alone would still make IFCS apply braking thrust. NPCs need the
same `LocalFramePose`/`CrewMember` station assignment; there is no PlayerTag or
session prerequisite for the shared gameplay permission check. No autonomous
unoccupied-ship exception is implicit. The planned explicit exception is an
installed, working AI module granting owner remote control; it is not yet
implemented. Its power/core dependencies and direct-engine interaction are
specified in `docs/plans/proposed/building_blocks_phase_2_utilities_and_control_plan_2026-09-07.md`. Multiple piloting stations do not yet have
an arbitration model: conflicting occupied stations deny control. Human cockpit
admission still requires the existing owner authorization; delegated boarding and
crew piloting permissions remain separate future work.

Server-driven station transitions use the existing reliable control acknowledgement
with request sequence zero and an increased control generation. The client discards
pending requests from the previous lease and changes prediction roles through the
existing role reconciliation. Seat commands are processed before role delivery.

## 2. Multiplayer and privacy

Protocol 20 adds authenticated crew commands and a private crew view. The session
binding supplies player identity; clients cannot claim a different player's UUID
in a movement/seat/customization request. Commands carry monotonic sequence and
view-generation checks. Interactions are rate limited; invalid outfit values fail.

The player ECS entity stays owner-only. Other occupants receive only an avatar
read model: player UUID, local pose, seated flag and appearance. No account email,
auth state, inventory or fitting entities are included. The access list is removed
from the transmitted deck. Interior membership comes from authoritative frame
state, not a requested camera mode or arbitrary frame ID supplied by a client.

Static deck/visual data uses reliable view replacement on entry or content change.
The small full crew roster uses sequenced unreliable delivery at up to 20 Hz while
changing and 2 Hz when idle. Generation checks reject obsolete packets. A reliable
inactive-view message clears geometry and occupants when membership/authority is
lost. This uses explicit read-model revocation and does not depend on Lightyear's
component-disable override removing a component already sent on a public hull.

DR-0040 answers:

1. The shard owning the frame owns attached character motion and seat interactions.
2. The frame and every attached character are captured together in the canonical
   handoff snapshot and retired together after commit, preserving UUIDs. Walking
   and interactions stop while the frame is frozen; the target recreates transient
   input state. Passenger transport redirection still needs multi-shard acceptance;
   the existing production handoff route is pilot-oriented.
3. Crew private state is not published through the cross-shard ghost lane. Public
   hull state keeps the existing visibility/redaction rules; permitted local
   occupants receive the dedicated private view from the authoritative shard.

## 3. Presentation and customization

TAB switches Space Sim/RPG Explorer view; E interacts with the cockpit seat.
R toggles the tactical sensor ring.
Interior camera zoom and orientation follow the ship's deck. The pilot exterior
camera restores its previous zoom on returning to Space Sim. Outside observers retain the armour
roof. Interior occupants see fixtures and other characters on separate layers.

Original Blender geometry exports 48 overhead poses in six aligned 64 px atlas
layers: body, skin, hair, suit, faction accent and helmet. Continuous planar
rotation supports every facing direction without duplicating directional strips.
Nine clips have explicit frame counts/timings: idle, walk, run, seated, interact,
float, thrust, hurt and downed. Current runtime selects idle/walk/run/seated.

The six suit themes reuse the industrial, Aegis, Helix, Corsair, Verdant and Umbra
palette family. Interior controls C/H/U/K/J change colour/helmet/suit/skin/hair;
changes are server validated, persisted and visible to other occupants. Helmet
requires the pressure-suit visual. These are appearance choices, not inventory
grants or an implemented environmental-protection/oxygen model.

Build with `scripts/siderealctl art-crew`. Editable source and review boards live
under `artifacts/crew`; published asset definitions use `crew.avatar.*` and the
ordinary authenticated asset cache. Pixel sampling uses nearest neighbours.

## 4. Validation and activation

Targeted checks cover circular collision/fixtures, bounded diagonal speed, f64
rotating-frame projection, seat reach/contention, frozen parent motion, expired
intent, outfit validation, binary protocol roundtrips, graph hydration, and a
two-session private roster with departure revocation. Native/WASM compilation and
live transport checks are required before release acceptance.

Character birth explicitly seats the new player using the compiled deck. Hydration
and login do not synthesize missing components in an older evolved world. Use the
documented explicit development reset/reseed procedure for a canonical starter
cutover, preserving accounts and authored content and taking a backup first.

2026-09-06 validation tooling: `build-client` prepares the native development
binary; `full-stack-public-capture` runs its real renderer on managed Xvfb
display 97 using the existing authenticated phase-capture bootstrap. Credentials
are supplied privately through the declared client-capture passthrough. The
transport-only profile accepts `SIDEREAL_CLIENT_HEADLESS_CREW_SCRIPT=walk` for
a seat exit, outfit change and bounded walking test over the normal protocol.

2026-09-06 live validation: authenticated protocol-20 transport verified cockpit
exit, 4.8 m walking, idle stop and outfit synchronization. Restart testing exposed
a graph merge bug retaining the previous seat when `seat_id` became null.
Component writes now replace their complete property maps, preserving identity
and tick fencing while clearing null/removed fields. The new database regression
test fails before this fix and passes afterwards. Final restart and rendered
interior acceptance remain pending.

2026-09-06 acceptance: after the component snapshot fix, restarting the public
stack preserved the walking character's local position, red suit palette and
removed helmet. The actual native renderer showed the persisted interior and
avatar (`artifacts/crew/in_game_persisted_interior.png`); keyboard walking and TAB
back to the cockpit produced `in_game_reseated.png`. Client v0.2.62 is published,
and its authenticated public download hash matches the release manifest. Protocol
20 and native/Windows/WASM compilation are verified. Browser WebTransport play
and cross-shard passenger reconnection have not received live acceptance.

## 5. Independent view preference — 2026-09-07

`PlayerViewMode` is an optional, server-only persisted player ECS component with
`SpaceSim` and `RpgExplorer` modes. No preference means Space Sim; newly authored
characters explicitly start there. Existing components are not reshaped and login
does not backfill state. An authenticated `SetViewMode` crew command writes the
preference independently of `CrewMember.seat_id`. It does not grant pilot access,
move a character or reveal another frame's interior. E retains seat proximity,
vacancy, ownership and shard-freeze validation. A passenger's view switch does not
neutralize another character's ship controls.

The client renders from confirmed view/crew snapshots, preserves exterior zoom
when entering the interior, and suppresses flight during a pending interaction.
The owner shard also gates flight and walking by the character's mode. A mode
change clears existing walking intent and seated pilot intent; seat changes clear
intent without changing mode. Private `ServerCrewState` carries only the receiving
character's preference, outside the shared avatar roster. Command/binary tests
cover both modes; component hydration retains mode separately from the seat.

DR-0040: the player's owning shard owns the preference. It freezes and transfers
with the player's canonical snapshot during handoff, retaining identity. It is
not publicly replicated or shared with other occupants; only the authenticated
recipient receives it over the existing private crew lane. Native and WASM share
the same control, camera, avatar and input-gating implementation.


2026-09-07 native acceptance: all four seat/view combinations were exercised in
an authenticated native renderer using physical keyboard events. Owner-shard reads
confirmed E exit clears `ControlledEntityGuid`, TAB preserves occupancy/local pose,
RPG walking updates local pose, and E re-entry restores the lease in either view.
After reseating, W produced authoritative throttle and acceleration; braking was
also exercised. A native reconnect restored the saved RPG view and seated state.
The mode hint now sits above the playfield instead of overlapping flight telemetry.
Review captures: `artifacts/crew/rpg_explorer_seated.png`,
`artifacts/crew/rpg_explorer_on_foot.png`, `artifacts/crew/space_sim_on_foot.png`,
and `artifacts/crew/space_sim_pilot_restored.png`. The test character was restored
to seated Space Sim; the user's character was not modified for acceptance.

Validation includes all 412 replication unit tests, focused crew/station/input
security tests, client key/mode tests, bincode/graph roundtrips, strict workspace
checks/Clippy and Windows/WebGPU-WASM compilation. The browser assets build from
the shared runtime; live browser multiplayer acceptance remains separate from
this native check. Phase 2 utilities/AI-module grants remain planned, as linked
above; the current release enforces the station requirement.


2026-09-07 publication: client v0.2.63 (protocol 21) was published through
`siderealctl publish-client-windows`. The public authenticated dashboard download
was checked against the publisher's local executable by byte length and SHA-256.
A full backend restart restored the test character's Space Sim preference,
occupied seat and matching controlled UUID from graph persistence.


2026-09-07 actuator acceptance: after leaving the seat during motion, owner-shard
reads showed all eight fitted actuators at zero output, force and torque, and
unchanged fuel during the sampled interval. Collisions remained active. Re-entry
restored piloting and braking; the fixture ended seated in Space Sim. This covers
the distinction between clearing intent and disabling IFCS execution.


## 6. Airlock authority and persistence — 2026-09-07

`InteriorDoors` persists on the hull root through the generated component registry.
It contains stable mount IDs, frame-local f64 centers/sizes/rotation, frame asset
IDs, travel duration, openness and target. It is not publicly component-replicated.
A living, authoritative on-foot actor can issue `ToggleDoor { door_id }` only for
its current frame, within 1.6 m with a clear floor/fixture/door path. The client
sends intent; it cannot set openness, door position or another frame's identity.
Using a door never grants vessel control. Seated, distant, dead, ghost or frozen
actors cannot activate a door. A close command rejects an occupied doorway.

Fixed-step simulation advances doors and reopens a closing door if any character
intersects its slab. Walking and seat access use the same derived door obstacles;
only fully open doors permit crossing. The existing floor boundary still prevents
walking into vacuum. Pressure simulation, docking traversal and EVA remain future
work. Exterior observers currently see the static closed exterior door artwork;
animated door state is delivered only to occupants of the interior.

Static definitions use the reliable crew-view message. Motion (door ID, openness,
target) shares the private crew state lane: at most 20 Hz while changing and 2 Hz
idle. Animated state does not resend deck geometry. Clients interpolate only the
presentation and use server snapshots for collision previews. View revocation
clears door definitions and visible sprites along with the crew roster.

DR-0040 answers: the hull's current owner shard owns door state. Handoff freezes
simulation and interaction; the same persisted state hydrates on the destination,
with no independent ghost simulation. Cross-shard delivery uses the existing
authenticated crew lane scoped to current frame occupants; public world observers
receive neither interior geometry nor private door state. A live refit preserves
surviving door state and participates in the aggregate persistence barrier.

Cabin sprites explicitly use neutral ambient illumination and no stellar/local
external lights. This is a Lighting V2 presentation exemption for enclosed
interiors; exterior sprites retain Lighting V2. Starter stellar illumination is
warm white `[1, 0.97, 0.92]`, independent from the star artwork's emissive color.


2026-09-07 acceptance: all six starting themes and every imported armour shape
compile; room-boundary tests cover joined cells, reentrant corners and holes.
Door tests cover both orientations, obstruction, freeze and JSON/binary/hydration
roundtrips, including fractional opening state. Server tests reject seated,
distant and incapacitated door users. Seat access checks the authored clear entry
point, preserving entry into the chair's fixture while closed doors block the path.
The native walkthrough verified closed-door collision and walking through an
opened door. Shipyard browser tests cover the floating palette, layers, drag/drop,
context rotation/deletion and undo/redo, plus durable live cosmetic/physical refits.

The existing Wayfarer instances were explicitly refreshed through owner-shard
refits; fitting UUIDs were retained. Helion's illumination was updated through a
durable live edit and captured into the published Maw baseline (revision 16).

2026-09-07 publication and final acceptance: client v0.2.64 (protocol 22) was
published through `siderealctl publish-client-windows`; the authenticated public
download matched the published executable's size and SHA-256. Native rendering
and authoritative state reads verified the contextual E prompt, closed-door
collision, animated opening, crossing, occupied-door closure rejection, closing
after clearing the doorway, and cockpit re-entry. Re-entry restored ship control;
TAB changed view while retaining seat occupancy. The fixture finished seated in
Space Sim. All 414 replication tests, the targeted gameplay/transport/hydration
tests, dashboard unit and browser checks, and native/Windows/WASM compile gates
passed. The normal `full-stack-public` profile was restored after capture.


2026-09-07 firing extension: roof turret aiming and fire consumption recheck the
current control-station occupant. Exiting invalidates transient cursor aim along
with movement intent. Mouse-left/Space fires in piloting mode; TAB remains a view
switch and E remains seat interaction. Public turret angle/art is separate from
owner-only gun settings/ammunition. See the construction contract's roof section.

2026-09-07 moving-interior acceptance: the native fixture accelerated through normal
player input, left the seat, coasted more than 613 m in RPG view and retained less
than 0.00002 m camera-to-rendered-avatar displacement across the capture. Screen-right
walking moved along deck -Y with the bow on the left. The fixture then returned to
its occupied cockpit and Space Sim view. The shared camera/startup regression tests,
shader source/cache and binding checks, workspace quality gates and native/Windows/
WebGPU WASM compile checks pass. The browser runtime was rebuilt from the same code;
this acceptance run exercised the native client.
