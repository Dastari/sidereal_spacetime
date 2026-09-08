# Character Inventory, Equipment and Interaction

Status: Proposed
Lifecycle: proposed
Category: feature
Last updated: 2026-09-07
Owners: gameplay + client + replication + content
Scope: A shared item and container model for physical characters, equipment, cargo, placement, interactions and proximity text chat.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/features/active/crew_interiors_contract.md
- docs/features/proposed/resources_and_crafting_proposal.md
- docs/plans/proposed/building_blocks_phase_2_utilities_and_control_plan_2026-09-07.md
- docs/features/active/ship_construction_blocks_contract.md
- docs/features/active/dashboard_game_authoring_runtime_contract.md
- docs/features/active/visibility_replication_contract.md
- docs/decisions/dr-0040_distribution_and_persistence_authority_model.md
- docs/guides/ui_design_guide.md

## 0. Status Notes

2026-09-07: Repository-grounded design proposal in response to the expansion of
physical characters and component-built ships. The new schemas, interfaces and
mechanics below are recommendations, not implemented behavior or a new runtime
security exception. This document does not replace the industrial material tree
or the construction Phase 2 plan. No server, client build or world data changes
accompany this proposal. Future implementation shares native/WASM gameplay and UI
systems, with native acceptance first and both targets compiled.

2026-09-07 sharing clarification: section 11 specifies proposed actor/faction
ownership, action permissions, recipient-specific payloads and their integration
with Bevy, interest management and private read-model delivery. These permissions
are not implied by current `FactionVisibility` or by the inventory component's
owner-only replication annotation; the sharing service still needs implementation.

| Foundation | Verified current state | Missing for this feature |
| --- | --- | --- |
| Character | `LocalFramePose`, `CrewMember`, E seat interaction and independent TAB view mode. | General interaction targeting, equipment and character combat. |
| Inventory | `crates/sidereal-game/src/components/inventory.rs` persists owner-replicated entries containing an item UUID, quantity and unit mass. | Resolved item catalog, grid placement, capacity, transfer transactions and equipment slots. |
| Cargo | `data/scripts/bundles/container/goods.lua` spawns a scannable demonstration container. | Playable looting, item pickup and container management; the demo payload is not a full item-instance registry. |
| Mass | `mass.rs` and `hull_physics.rs` include inventory/mounted fitting mass and tank contents. | A canonical containment graph and proof that portable/nested contents contribute exactly once. |
| Crew load | `crew.rs::derive_frame_load` sums occupant `BaseMassKg` at local positions. | Carried inventory and equipped-item mass in the frame aggregate. |
| Character survivability | Generic `HealthPool`/destruction primitives exist in `engine-gameplay`; starter character authoring sets 85 kg body mass. | Starter character vitals, stamina, injuries, personal weapon handling and death/recovery rules. |
| Appearance | `CrewAppearance` supports layered avatar cosmetics. | Equipment-derived appearance/protection; a cosmetic suit currently supplies no oxygen or armor. |
| Client UI | `engine-ui` has themed frames, controls and reusable text input state. | Inventory grid, paper doll, drag/drop, crafting queue and proximity chat. |
| Resources | Existing resource/crafting proposal defines a Lua-authored industrial economy. | Runtime catalogs, extraction-to-inventory transactions and crafting jobs. |

## 1. One identity, explicit capabilities and locations

An inventory item, equipped item and installed machine should not be unrelated
copies. Separate **what something is**, **its particular state**, and **where it
currently exists**.

- A definition has a stable catalog `item_id`: presentation, canonical dry mass,
  stack compatibility, storage footprint, allowed containers, equipment slots,
  world placement, installation and resource/utility requirements.
- An instance has a UUID, definition reference/revision, quantity and applicable
  state: condition, charge, ammunition, contained resources and nested storage.
  One homogeneous stack needs one identity, not an entity per cartridge or ingot.
- Every instance has exactly one authoritative location: a container and grid
  anchor/rotation, an equipment slot, an installed mount, a local-frame ground
  pose, a free-world pose, or a crafting escrow container. There is no durable
  "on the mouse cursor" location.
- Containers/equipment expose derived occupancy indexes. Do not maintain two
  independently writable copies of item location. Persist the item/location
  relationship and affected container revisions together.

Moving a unique generator preserves its UUID, damage, fuel and nested contents.
Splitting a stack creates a new stack UUID atomically; merging retires the emptied
source identity with a deletion record. Stacks only merge when their definition,
revision and relevant state agree. Charged batteries, loaded weapons and filled
containers should initially be non-stackable.

Pin definition revisions for existing instances/jobs. Publishing a balance or
footprint change must not silently resize loaded bags or change live stored mass;
an explicit validated resync can adopt a newer definition. Update all producers
and consumers to one canonical runtime schema when implemented, without legacy
payload aliases or login-time backfills.

## 2. What can be carried, placed, installed or stored?

These are independent capabilities, not exclusive item categories. Rendering an
object as a tile does not grant placement or installation permission.

| Example | Storage | Ground representation | Functional use |
| --- | --- | --- | --- |
| Pistol, helmet, repair tool | Backpack or suitable rack; individual grid footprint. | Pickup visual or shared loot pile. | Matching equipment/tool slot. |
| Ore, ammunition, trade goods | Compatible stacks in an allowed container. | Loot pile, sack or crate; no requirement for a sprite per unit. | Recipe input, reload or trade. |
| Backpack or portable crate | Only in compatible larger storage within nesting limits. | Persistent container with contents intact. | Provides its own storage when carried/equipped/placed. |
| Fuel canister or gas bottle | A sealed, non-stackable container item. | Portable container with a world visual. | Transfers compatible contents through an approved interaction. |
| Loose fuel, oxygen or coolant | Typed reservoir storage; no naked liquid in grid slots. | No loose-floor form initially. | Pumping, refilling, life support and consumption. |
| Portable generator or deployable turret | Cargo grid if its portable dimensions and mass fit. | Valid floor/support position; may require anchoring. | Enabled only in a declared deployed/installed state with required supply. |
| Large engine, reactor or fuel pod | Appropriate freight storage or handling equipment; never an arbitrary backpack. | Assembly support or freight cradle. | Valid installed mount and required utilities. |
| Armor plates, structural sections, doors | Materials/section kits where a packing recipe exists. | Construction preview or supported assembly placement. | Validated structural placement; doors also have persistent operating state. |
| Decals, lettering, faction paint | Authoring/cosmetic definitions initially. | Surface decoration. | No implicit mass, cargo slot or functional ability. |
| Recipe knowledge and character progression | Persisted character unlock/state. | None by default. | Unlocks recipes/actions; a tradable blueprint document can be a separate item. |

Storage dimensions and world dimensions are distinct. A hypothetical rifle could
use a 2×4 inventory rectangle while its world visual/collision shape uses meters.
A 2×3 structural kit does not necessarily create a 2×3 deck footprint. Start with
rectangular inventory footprints and 90-degree rotation; irregular silhouettes
can be a later content extension. World placement retains existing polygon,
attachment, floor, obstacle and utility-port rules.

Some things therefore exist **only as contents**: fluid in a tank, cartridges in
a magazine, or unpacked bulk material in a specialized bin. To drop them, the
server needs a valid packaging/loot-container transition. If none exists, reject
the action with a useful reason. Never silently delete contents or invent free
packaging through an unlimited drop/pickup loop.

Installing a stateful device moves the same item identity into the fitting
relationship and enables its declared providers. Structural batches are different:
consume a kit/material quantity into stable assembly placement keys in one
transaction, recording invested material/provenance. Salvage yields an authored
recovery output; removal does not necessarily recreate a pristine portable kit.
Unique doors or other stateful fittings retain UUIDs across valid moves.

## 3. Containers, capacity and physical mass

Use the same container mechanism for pockets, backpacks, lockers, crates, cargo
modules and manufacturing buffers. Multiple bags are separate grids. A ship cargo
summary aggregates real installed containers; it must not add invisible storage.

Each container declares grid dimensions, payload mass limit, allowed item tags,
nesting policy and, where useful, payload volume. Slot fit and weight are separate
checks. A bottle also has a typed reservoir capacity; enlarging its inventory icon
does not enlarge the reservoir. Filled containers include shell plus contents.

Reject containment cycles and excessive depth. Moving a filled bag checks every
affected ancestor's payload limits. A bag cannot contain itself, nor be stored in
one of its descendants. Start with shallow, explicit nesting. Unequipping a bag
with contents moves the complete subtree; it cannot disappear when the slot clears.

Mass follows one containment/attachment tree:

`item dry mass + stored resources + contained items → carrier load → frame load`

Character effective mass includes body, equipment, carried bags and their contents.
Frame load includes that effective mass at the character's actual local position.
Moving cargo from a locker to a character on the same ship conserves ship total
mass but can change its center of mass and inertia. Nested contents must not be
counted again as independent fittings. A dropped container on deck contributes at
its ground position; free cargo has its own world body and leaves the old frame's
mass. Derive physics mass/inertia and gameplay values in the same fixed-step flow.

Encumbrance should initially affect walking/running stamina and handling, with a
hard carrying limit. Heavy freight requires equipment to move. Keep gravitational
load/bulk separate from inertial mass so future EVA does not make a huge reactor
easy to accelerate merely because it is weightless.

Fuel has a resource type and finite amount, not just a currency-like ship counter.
Track consumable mass in kg and reservoir capacity consistently, converting volume
through authored density where needed. Fuel remaining in a disconnected tank is
still cargo mass but is unavailable to the engine. Refilling debits source and
credits destination together, bounded by compatibility, free capacity and transfer
rate. Battery charge is energy storage, not a second fuel tank or extra mass gain.

## 4. Character equipment, stats and combat

Build equipment on the physical character, using the same rules for players and
NPCs. Suggested initial slots: head/helmet, torso/suit, hands, legs, feet, back,
primary weapon, secondary weapon and utility slots. Definitions express mutually
exclusive layers: a full pressure suit can occupy multiple body slots. A backpack
and a life-support pack need compatible attachment slots, not magical overlap.

Start with health, stamina, carry capacity, movement/handling modifiers and typed
damage resistance. Add oxygen reserve, suit integrity and battery energy when
equipment and their authoritative consumption paths exist. Keep base character
values separate from derived equipment modifiers and temporary effects; avoid
persisting conflicting copies of an effective stat. Define modifier order and
caps so equip/unequip/reconnect cannot accumulate bonuses.

RPG progression can then add engineering, medicine, weapon handling and piloting
proficiencies on the persisted character. Skills modify permitted actions; they
never substitute for a mounted engine, a powered computer core, actual ammunition
or a valid control-station lease. Recommend equipment-led progression before
committing to classes, large talent trees or many attributes without gameplay uses.

An equipped weapon supplies attack capability. The owner shard validates the
actor, weapon location, ammunition/energy, cadence, aim and interior collision.
Personal shots originate from the character's frame; they do not reuse the ship
control target or hit through hulls because the space collision shape is different.
Clients request fire/reload/use; damage, ammo consumption and item durability are
server outcomes. The initial personal combat slice needs one weapon, one reload
type and one damage model before melee or a larger weapon family.

Keep skin/hair/faction colors cosmetic. Derive suit/helmet/weapon render layers from
equipped instances and transmit a small public appearance summary. The existing
cosmetic suit toggle must stop granting a visual claim to functional equipment
once gear is implemented. Add held-tool/weapon, reload/use, hurt and downed poses
to the layered avatar animations as their corresponding actions become playable.

Specify downed/death/recovery before enabling lethal character combat. Downing
revokes station authority and clears attack/movement intent; the persisted player
identity survives. Loot/recovery follows an explicit access policy and atomic
inventory transition. Generic entity despawn must not erase the player and all
possessions. Full atmosphere/pressure simulation and EVA remain later dependencies.

## 5. Interactions and multiplayer transactions

A shared interaction query returns server-valid verbs for a target: open, take,
equip, use, reload, install, dismantle, refill or operate. E performs the highlighted
default action. While seated, E exits the seat. On foot it targets a reachable
object; a context menu exposes alternatives. The interface explains unavailable
actions, such as "tank full", "requires mount", "no power" or "out of reach".

Viewing a ship, owning it or having a cargo scan is not permission to take its
contents. Check authenticated actor identity, liveness, frame, reach/obstruction,
container/device access and current location on every command, including the final
commit. Separate read access from transfer, install and device-operation rights.
Shared crew lockers use explicit grants; personal bags remain private.

Requests carry an operation UUID, actor/target identities, source and destination
revisions, item/quantity and intended placement. The owner shard validates the
whole operation, reserves affected state, applies one atomic transfer and returns
authoritative revisions plus application/persistence status. Client previews do
not create items. Retry/reconnect returns the same recorded result for the same
operation; it never repeats consumption or output creation.

Two users grabbing the same stack cannot both succeed. A stale drag is rejected
and refreshed. Shared viewers receive committed deltas, not every cursor movement.
Commit item locations, both containers, reservations, deletion records and relevant
job changes together through canonical persistence. Hold ordinary snapshots and
handoff behind the affected aggregate's persistence acknowledgement. Receipt
reconciliation after timeout/restart must distinguish uncommitted from committed
operations; an acknowledgement lost on the network is not permission to retry as
a new transfer. Define a bounded deduplication/reconciliation policy without
discarding unresolved receipts during handoff.

Initially require all participants in a transfer to have one owner shard. Reject
cross-owner-shard transfers explicitly until a handoff/co-location or escrow
protocol is implemented. Do not implement independent debit/credit writes on two
shards. A shared container cannot be modified by two authorities.

## 6. Client UI and input

Extend the existing Bevy `engine-ui` widgets and shared client runtime. Reusable
pieces: inventory grid, item icon/count/condition overlay, equipment slot, drag
preview with footprint/rotation, tooltip/comparison, stack split input, context
actions, capacity meter, recipe list/queue and focused chat entry/log.

Default composition is compact and closable: paper doll and character summary,
personal bag grid, and an optional adjacent container grid. Crafting opens when
needed, showing ingredients, valid source containers, required tools/facility,
power status, output space and queue. Avoid permanently surrounding the play area
with all panels. Support moving/resizing panels within the game window, UI scale,
keyboard selection and explicit action buttons as alternatives to dragging.

Suggested bindings (remappable, not changes made by this proposal):

| Context | Input | Result |
| --- | --- | --- |
| World | TAB | Existing Space Sim/RPG Explorer switch; no occupancy or authority change. |
| World | E | Exit seat, or highlighted nearby interaction. |
| World | I | Personal inventory and equipment. |
| Inventory drag | R | Rotate permitted item footprint; consumes the key before sensor-ring input. |
| Inventory | Shift-click / right-click | Quick transfer / context actions; explicit split command. |
| World | Enter | Focus local chat; Enter submits. |
| Focused UI | Escape | Cancel drag, dismiss context/panel, or leave chat focus. |
| World | Number keys | Use bound equipment/consumable references after validation. |

Implement a central input-focus/context layer before enabling chat or item dragging.
Typing must not move the character, fire weapons, exit the seat or switch views.
Entering UI focus flushes held gameplay intent; loss of focus/disconnect cancels
the local drag preview. Hotbar entries reference real items/actions and become
unavailable when items move or are consumed. Existing C/H/U/K/J cosmetic debug
controls need an explicit retirement/rebinding when equipment UI replaces them.

Use the existing semantic themes and typography. Show fit and rejection reasons
with text/icons as well as color. Update changed items/cells and render visible
lists; do not stream or draw every freight unit. Ordinary rejected drops use local
feedback; persistence/connection failures needing acknowledgment use persistent
dialogs. Live inventory has no unrestricted undo history: a reverse move is a new
validated transaction. Shipyard blueprint editing retains its own undo history.

## 7. Proximity text chat

First implement local speech on the character's owner shard using authoritative
frame and local distance. Camera zoom or remote ship control does not relocate
the speaker. Use a configured radius plus conservative deck-wall/closed-door
obstruction checks; richer room/acoustic paths can follow. Do not deliver speech
to a neighboring ship merely because world positions are close.

Start with an explicit local channel, compact log and optional short-lived speech
bubbles. Suit radio/ship intercom are separate future channels requiring equipment
and channel access; local speech in vacuum should not become an implicit radio.
Server messages use character display identities, never account email addresses.
Bound text size, submission rate and retained history; render as plain text and
support mute. Recipients are selected by the server's hearing/channel policy,
independently of camera culling and inventory visibility. Minimal speaker metadata
must not expose private character or interior records.

Chat is transient reliable event delivery, not a 60 Hz replicated string component
or a growing persisted player log. Cross-shard radio delivery is a future scoped
event lane with deduplication/redaction, not public world broadcast.

## 8. Crafting, construction and authoring integration

Keep the material/recipe/facility ladder in
`docs/features/proposed/resources_and_crafting_proposal.md`. This proposal supplies
the missing identity, containers, equipment and transaction foundation.

Crafting selects explicit accessible input containers, reserves inputs and output
space, and advances a persisted job under fixed-step authority. A portable crafting
kit and an installed powered fabricator advertise different recipes. Completing a
job atomically consumes inputs and creates outputs; full output storage pauses it
or uses its reserved staging container, never discards or duplicates the result.
Cancellation has a defined consumed/reserved/refund state. Input availability alone
is insufficient without the required tool, facility, permission and supply.

Initially use deterministic recipes, no offline catch-up, and conservative pause
on missing utility supply. Disconnecting a player does not cancel a running facility
job; unloaded/frozen simulation cannot invent elapsed production. Hydration restores
the job/escrow/remaining work together. Broader economy scheduling stays in the
existing background-world proposal.

Publish Lua-authored item, equipment, container and recipe definitions through the
canonical content catalog workflow. Cross-reference block definitions with item
installation/packing rules and asset IDs; do not maintain unrelated mass and ability
tables in the shipyard and inventory. Validate catalog references at publication.

Normal gameplay construction spends real items and checks tools/access. Authorized
dashboard authoring is a distinct administrative command policy, with its existing
owner-shard expected-value checks and persistence receipts. In both paths, refitting
a locker or fuel pod preserves contents and stable identities or refuses an unsafe
removal. A baseline blueprint describes initial loadout; a runtime cargo move must
not rewrite the original world blueprint unless explicitly authored/published.

## 9. Distribution and code boundaries

DR-0040 answers for the proposed durable state:

1. **Owner:** the authoritative shard of the character/container/frame owns its
   items, equipment, stats, resources and jobs. Attached inventories follow their
   owning aggregate; permission does not create another writer.
2. **Handoff:** freeze the complete affected attachment/containment aggregate,
   complete in-flight durable transactions, transfer stable identities and job
   reservations/receipts, then reconstruct occupancy, mass and utility caches.
   Revalidate viewer grants and actor inputs at the destination. No permanent
   deletion for handoff, and no simulation by ghosts.
3. **Visibility:** personal item entities use whole-entity privacy. Authorized
   container viewers receive revisioned snapshots/deltas through a scoped private
   lane, without removing whole-entity restrictions. Public avatars carry approved
   appearance/action summaries only. Physical dropped cargo has a public world
   representation with separately restricted contents. Ship mass and visible
   effects use existing approved public/owner lanes; cargo manifests remain subject
   to access/scan disclosure rules. Cross-shard public physical state follows the
   existing distribution lane, never an unrestricted inventory broadcast.

Put generic container packing, item location transactions, equipment/stat mechanisms
and interaction validation in `engine-gameplay`; generic widgets/input focus in
`engine-ui` and the appropriate shared runtime layer. These modules do not currently
exist just because the crates do. Move/replace the current simple Sidereal inventory
through an explicit canonical schema change. Space equipment, fuel, suit rules,
weapon behavior and Lua content live in `sidereal-game`/`data`. Service command
routing, visibility and persistence orchestration stay outside gameplay core.

## 10. Recommended delivery order and acceptance

Respect existing authority/persistence phase gates and coordinate the shared
reservoir/device schema with construction Phase 2. Do not make the first inventory
slice depend on full atmosphere simulation or autonomous navigation.

1. **Container foundation:** catalog, UUID locations, grid fit/rotation, capacity,
   nesting, atomic transfer and crash/retry behavior. Update all existing inventory
   producers, scanner read models and mass consumers to the canonical schema.
2. **Playable inventory:** starter pockets/backpack, one shared ship locker, pickup
   and drop, weight-aware crew/frame load; reusable grid/paper-doll UI and focus
   routing. Two players can trade physical custody through the locker safely.
3. **Equipment and social:** equip a suit/helmet/tool; derive appearance and starter
   stats; local chat and generic E interaction. Add one personal weapon/reload and
   downed/recovery flow as a separately validated combat slice.
4. **Supplies and manufacture:** canister-to-tank refilling, utility-backed fabricator,
   one useful recipe, install/uninstall a physical device; integrate construction
   Phase 2 fuel/power and the real source-of-capability rules.
5. **Expansion:** deeper crafting, progression, boarding, atmosphere/EVA, radios,
   richer personal combat and NPC use of the same action/permission systems.

First acceptance scenario: leave the seat with E, walk to a locker, open it, rotate
and transfer a multi-cell tool, equip a helmet, drop/recover a filled container,
and have another admitted player observe appearance and speak locally. Reconnect
and restart preserve every item/quantity/location. Transfer from locker to backpack
changes load distribution but not ship total mass.

Required implementation tests include overlapping/out-of-bounds packing, occupied
equipment slots, nested capacity/cycles, stack-state compatibility, last-item races,
forged/out-of-reach transfers, access revocation while dragging, lost acknowledgements,
crash between apply/persist, hydration/handoff with reservations, mass conservation,
resource conservation and no private inventory leakage. Cover typing/focus without
movement/fire/seat exit, keyboard operation, shared native/WASM serialization and
real bincode plus JSON/persistence roundtrips. Add utility/refill, crafting full-output,
cancel/reconnect and device-installation tests when those slices land.

## 11. Ownership, sharing and recipient-specific disclosure

### 11.1 Separate authority, property, custody and permission

Four independent facts must be represented:

1. The **simulation owner shard** is the sole runtime writer.
2. The **property owner** is an actor (player character or NPC) or a faction,
   represented by a typed principal using its canonical stable identity.
3. **Custody/location** identifies the containing bag, locker, equipped slot or
   installation. Moving a personal bag aboard a faction ship does not by itself
   change the bag's property owner or expose its contents to the captain.
4. An **access policy** grants specific actions and information to principals.
   Ownership transfer is an explicit transaction, separate from moving custody.

Persist ownership and container policies on their ECS entities. Character identity
is not interchangeable with the account that authenticated the connection. Faction
membership/rank and NPC assignments are server-resolved inputs; clients cannot
assert them in a command. Faction membership alone grants nothing unless a policy
names that faction and, where appropriate, its role/rank.

Proposed independent rights are `view_summary`, `view_manifest`, `view_layout`,
`deposit`, `withdraw`, `rearrange`, `use_contents`, `install`, `manage_access` and
`transfer_ownership`. Manifest/layout rights include only their approved item
details; ACLs and unrelated character stats require separate disclosure. Access
management and delegated grants cannot expand beyond the issuer's grantable scope.
Viewing, taking and operating a device are distinct decisions; cargo permissions
never grant ship control or bypass the occupied-station/explicit AI-module rules.

Policies are default-deny with explicit inheritance boundaries and deny rules.
Ship/faction access does not recursively unlock personal bags or sealed lockers.
Container owners may administer their own policies, but ownership alone does not
bypass physical reach, device requirements, character liveness or shard authority.
A container subtree cannot become public just because its parent is visible.

Useful policy examples:

| Container | Granted principal | Example rights |
| --- | --- | --- |
| Personal backpack | Its character owner; explicitly selected trusted actor | Owner management; optionally view or specific transfers for the trusted actor. |
| Shared crew locker | Current crew members | Manifest/layout, deposit and withdraw while reachable. |
| Faction supplies | Current logistics role | View/deposit/withdraw; other members may receive summary only. |
| Donation/input bin | Allowed visitors | Deposit only, using server auto-placement without exposing existing contents or occupied cells. |
| Ammunition magazine | Assigned loader NPC | Task-bounded transfer of compatible ammunition from/to named containers. |
| Engineering fuel store | Authorized engineer or maintenance NPC | Compatible refilling/use, without access-management or unrelated cargo rights. |

NPCs use their actual actor identity and bounded assignment, not their employer's
unrestricted identity. Their perception queries and action intents go through the
same policy evaluator, including reach and item/quantity filters. Running on the
server does not grant an NPC omniscient inventory knowledge or unrestricted writes.
A player commanding an NPC first needs delegation authority; the resulting NPC
task still cannot exceed its own assignment. Persistent tasks and reservations
remain on authoritative ECS entities; scripts emit validated intents only.

### 11.2 What each recipient gets

| Recipient/context | Permitted payload | Not implied |
| --- | --- | --- |
| Character owner | Own inventory/equipment and relevant private stats; container detail on demand. | Another character's bag because it is aboard an owned ship. |
| Nearby admitted crew | Existing private interior/avatar view, visible outfit/held item and permitted action effects. | Backpack contents, private stat sheet, item UUID graph or locker access. |
| Authorized container viewer | Explicit summary, manifest and/or layout projection; allowed actions and committed revisions. | Whole item entities, unrelated nested contents or permission administration. |
| Deposit-only visitor | Deposit result and permitted capacity/error information. | Full manifest/layout needed to implement a client-side auto-placement algorithm. |
| Exterior observer | Authorized hull appearance/motion/effects through local world delivery. | Deck, crew inventory, fitting internals or utilities. |
| Distant observer | Approved tactical contact/last-known intel. | Live container or interior subscriptions. |
| Scanner observer | Existing granted `cargo_summary`/`cargo_manifest`/other scan snapshot fields, bounded by the target's disclosure policy. | Live inventory subscription or any withdrawal/management rights. |
| Faction member | Only the inventory information/action scopes granted to their current role. | A broadcast of every faction container's contents. |
| NPC | Server-side filtered perception and valid task actions. | A client subscription or automatic replication of its knowledge to its employer. |

Scan projections must be constructed for the scanned target's permitted cargo
domain. Do not recursively enumerate private crew bags when calculating a ship
manifest. Raw UUID references in the current demonstration inventory scan payload
need review when the real catalog/location schema replaces it. A scan result and
an interactive container view remain separate products with separate grants.

Every game client, including a modified or independently written client, receives
data according to its authenticated actor and grants. No first-party executable
trust flag, hidden UI field or local menu restriction is a security boundary.
Once information has legitimately been transmitted it cannot be made unknown to
a malicious recipient; revocation prevents future updates/actions and clears the
official client's view, rather than promising to erase past knowledge.

### 11.3 Preserve Authorization → Delivery → Payload

Use the existing order separately for each world, tactical, owner, crew or container
lane. Spatial candidates and camera hints remain performance inputs. They never
grant access, and opening a client panel cannot authorize an inventory.

Keep `OwnerOnlyVisibility` on private item entities. Shared access uses a typed,
recipient-scoped container read model, similar in approach to the existing private
crew view; do not remove the entity restriction or mark contents `FactionVisibility`.
Public world rendering, cargo scan summaries and permitted container details are
different projections of the authoritative state. Public item definitions/icons
are catalog data, not proof that any particular player owns an instance.

After server authorization, an active container subscription sends one bounded
snapshot, then reliable deltas for committed changes. Include container UUID,
subscription generation, policy revision and base/new content sequence. Apply
snapshots atomically, ignore old generations and resnapshot on sequence gaps.
Requesting arbitrary UUIDs or excessive subscriptions cannot bypass policy or
resource limits. Do not transmit cursor drags or unchanged manifests at motion rate.
Large manifests can be paged only within the same authorized snapshot revision.

Owner asset listings remain available independently of the local bubble; detailed
remote inventory requires an explicitly permitted remote read scope. A faction
summary can likewise be available remotely without granting a local-world entity
or remote manipulation. Physical transfers initially require proximity and one
owner shard. Any later remote logistics/device channel needs its own authorized
mechanism and dependencies, not just an open dashboard or a visible owner listing.

Revocation is an active operation. Container policy, ownership, faction role,
assignment, proximity, death, disconnect and handoff changes invalidate the relevant
viewer/action grants even without spatial movement. Enqueue reliable view closure
or replacement, advance generation, discard pending deltas, and recheck permission
before committing queued actions. Reauthorize existing viewers on policy changes;
do not wait for the next container open. Already committed transfers stay committed.

Authority shards evaluate current membership/policy revisions. Stale or unavailable
security state cannot grant access. Cross-shard membership invalidation and grant
revalidation need an explicit authority/update path before remote sharing ships;
copying a faction role into a long-lived client token is insufficient. Handoff
preserves policies, ownership, reservations and receipts while recreating transient
subscriptions under the destination lease. The existing ghost lane never becomes
an inventory writer or carries private manifests by default.

### 11.4 Bevy integration and implementation gaps

Authoritative item locations, policies, equipment and progression are components;
catalogs and derived lookup indexes are resources; client requests and server
receipts/read-model updates use the shared typed message catalog. The fixed-step
order is policy/authority invalidation, intent validation, transactional gameplay
mutation, derived mass/stats/capabilities, then authorized outbound updates and
persistence staging with the required aggregate barriers. Shared client UI consumes
the approved projections and may preview interactions without authoring gameplay
state. Keep transport, persistence orchestration and gameplay mechanisms separate.

Current integration anchors are `visibility/policy.rs` (whole-entity and faction
authorization), `visibility/entity_cache.rs` and the membership worklist (policy
invalidation), `target_selection.rs` (scoped scan payloads), the tactical/owner
snapshot-delta caches, and the crew view's explicit generation/revocation flow.
The inventory access evaluator, principal ownership schema, delegated NPC/faction
rights, container subscriptions and their policy invalidation are new work. Current
faction visibility and scanner grants do not implement those permissions.

Acceptance must inspect serialized payloads as well as UI behavior: unauthorized
item identity/labels must be absent from local, tactical, owner, crew, ghost and
scanner outputs. Exercise nested personal bags on shared ships, summary-only and
deposit-only access, role revocation without movement, queued transfers after grant
loss, stale subscription generations, NPC privilege escalation and handoff under
load. Confirm revocation cannot be undone by an old snapshot arriving late. Native
and WASM clients consume the same recipient policy and protocol; an adversarial
client requesting hidden UUIDs or forging actor/faction roles must receive no data
or mutation authority.
