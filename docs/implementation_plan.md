# Implementation sequence and acceptance gates

Status: Accepted direction; implementation staged
Last updated: 2026-09-08
Owners: Sidereal project

## Status discipline

M0 is the original verified scaffold. The dated checkpoints below record later delivered slices; the milestone rows are full acceptance targets, not a claim that every feature remains unimplemented. See the [verification record](verification.md). Old implemented features are reference behavior to port and revalidate. Never mark a phase complete just because its navigation or schema exists.

| Phase | Work and dependencies | Acceptance gate |
| --- | --- | --- |
| M0 — pivot foundation | independent game/dashboard apps; lifecycle contracts; full reference inventory; pinned toolchain; managed local server; generated bindings; private lab identity/ship; Blender GLB; new UI specimens; revision edit | clean install/build/check; two identities cannot read/edit one another; unseated thrust rejected; server movement/walking; rename idempotency/conflict; restart restores UUID/name/receipt; browser renders actual GLB |
| M1 — identity and network foundation | M0; trusted OIDC/account mapping, multi-character/session binding, MFA/scopes/admin bootstrap; actor selection; rate limits; indexed visibility views; timebase, input sequence/ack/replay; lifecycle action/binding/state/timer foundation; telemetry | spoofed/expired credentials and wrong character rejected; no full-world public subscription; revoke grants removes rows; movement/stop/reconnect tests under 150±50 ms latency; same camera/actor/frame timeline; session takeover tests |
| M2 — functional modular 3D ship | M1; glTF part/sockets/collision/material schema; shared assembly compiler; rooms/corners/doors; mounts; live mass/CoM/inertia; actual engines/thrusters; roof/decals; rigged crew; installed-component lifecycle hooks | starter ship built from persistent parts; no engine=no thrust; correct attachment and mirrored nozzle tests; move cargo/crew conserves mass; roof hides interior without network disclosure; two admitted players aboard a moving/rotating ship remain smooth |
| M3 — Shipyard and live authoring | M2; block/hull catalogs; 3D/ortho editor, full gestures/undo/drafts, layer drawer/resizable palette; explorer context edit; package/source/baseline/receipt foundation; initial Script Studio and bounded behavior publisher | palette drag/move/replace/rotate/flip/delete/copy; browser refresh restores draft/history and original revision; two editors conflict safely; aggregate refit preserves crew/cargo/ammo/UUIDs; interruption/retry/crash cannot create partial refit; publish/live/capture separation |
| M4 — utilities and control | M2/M3; power/fuel networks, reservoirs, generator/battery black-start, core-driven IFCS, direct local engine operation, AI module/manual/orders | resource/energy conservation under shared demand; disconnected tanks unavailable but still mass; supply loss revokes grants; occupied seat priority; direct engine pulse cannot pilot other devices; orders pause/cancel/resume correctly |
| M5 — inventory, equipment, cargo and sharing | M1/M2/M3; item definitions/instances/locations; variable footprint grids; mass/nesting; equip/ground/install; container/faction grants; paper doll and drag/drop | no duplication/loss under concurrent split/merge/transfer; reject nesting cycles/overweight ancestors; same UUID across storage/install; loss of reach/grant revokes view and mutation; character versus account persistence; reload/restart conservation |
| M6 — combat, crew gameplay and tactical instruments | M1/M2/M4/M5; turret traversal/fire/projectiles; shields/armor/damage; personal combat and equipment stats; doors/airlocks; full tactical map/scanner/active scan/fog; proximity/ship/faction chat | real mounted/supplied weapons only; correct actor origins and collision; private ammo/cargo withheld; unknown contacts reveal no true IDs; scan expiry/countermeasures; downed actor loses station; chat recipients server filtered; high-latency combat tests |
| M7 — industry, NPCs, factions and progression | M4/M5/M6; extraction/depletion/refining/facilities; recipe escrow/jobs; trade/market foundations; NPC crew/fleet tasks and tiers; faction standings/unlocks | extraction output equals depletion; jobs complete once across restart; no offline free power/fuel; trade escrow atomic under disconnect; NPCs use common validators; bounded work for cold populations; exact currency accounting |
| M8 — complete universe and content authoring | M3/M6/M7; Firmament/Genesis/Foundry/Atelier/material/sound/script studios; immutable versioned content; universe baseline merge; voxel asteroid/mining pipeline; advanced lifecycle scripting tools; docking/boarding/EVA/atmosphere staged subfeatures | authored source previews equal runtime; AI-generated imports stay drafts until validation; failed package rollback; deletion history survives merge; scripts cannot bypass authority/exhaust tick budget; correct local/world frame transitions and suit/oxygen consumption |
| M9 — operational release | prior phases as selected launch scope; measured 50-client and 100-client runs; crowded combat/station/industry fixtures; browser profiles, downloads/cache, production TLS/auth, backup/restore/upgrades | published benchmark with hardware/workload/latency; p95 tick/frame and bandwidth/memory budgets; no unbounded history/rows; tested abrupt restart and full restore; cross-browser quality/fallback; security/abuse checks; release manifest and rollback runbook |

## Concrete next work package

Current priority (2026-09-09): authenticated persistent accounts and the pose/Graphics functional checkpoint passed. Complete authored construction next: tileset interfaces, independent blueprint instances, walls/doors, operational deck transitions, pressure, cargo/services and damage, then the Wayfarer template. The first published two-deck document and native-floor walking instance are an intermediate checkpoint. Shared-world exterior/crew views, visible remote actors and network replay remain required M1 work; private per-account fixtures are not shared-world multiplayer. Keep base spatial tables private; no sharding.

## Launch policy decisions to settle before their dependent phase

- Dedicated Dastari Keycloak is installed at https://auth.dastari.net/realms/dastari; this supersedes the Orchard choice. Actual PKCE, explicit character transfer, reconnect, account persistence and separate authoring access were verified. Keep credentials out of browser assets and preserve scoped grants; provider login does not confer authoring rights.
- Initial public/allowlisted player admission and concurrent-session policy (M1).
- Room scale, deck/vertical/EVA physics and character rig direction (M2/M8).
- Damage/death/recovery, safe zones, friendly fire and loot rights (M6).
- Inventory encumbrance limits, legal nesting and exact item quality/stack rules (M5).
- Facility cancellation, blocked outputs, offline production and market/currency policy (M7).
- Sandboxed lifecycle scripting language/runtime and publish privileges (M8).
- Named reference GPU/server hardware and acceptable CCU / worst-case encounter (M9).

These questions do not block M0. The preserved scope supplies the design constraints; values without an owner decision remain proposals.

## Validation records

`docs/verification.md` records actual commands and evidence from this scaffold. `scripts/smoke.ts` uses only an isolated database ending in `-smoke`. It tests real reducers/subscriptions with two identities, not mocked authorization. It retains a private token in `.runtime` solely for the restart proof. Source tests cover pure physics/input/geometry guards; browser review covers visuals/navigation. Add tests with each new feature rather than speculatively testing unimplemented systems.

## 2026-09-08 owner-requested visual and simulation foundation work

A visual proof extends M0 ahead of the larger network/gameplay milestones: original Blender GLB source review, one furnished voxel model in flight/cutaway, fixed-elevation orbit camera, smooth seat transition, screen-relative walking, server collision for the authored room fixture, four space vistas, voxel asteroid, and metal texture/reflection bake pipeline. Shared pure IFCS mass/controller/allocator/integration math and bounded voxel removal/meshing are implemented with tests. They are not connected as live installed-part flight or persistent damage yet. M1/M2/M4/M6 completion gates remain open. See [theme](visual_theme.md), [voxel contract](voxel_construction.md) and [IFCS integration](ifcs_integration.md).

2026-09-08 continued proof: evaluated Blender solids now voxelize with PBR/emission identities, an independent part catalog feeds a local draft Shipyard, and a worker rebuilds removed-cell previews per placement. Private asteroids receive authoritative swept contacts and persistent motion. This is an owner-requested art/physics/editor proof ahead of M1, not completion of M2/M3/M6: no live modular refit, utility-driven ship, shared crew or authorized combat damage has been released.

2026-09-08 Astra iteration: controller/allocator-driven authoritative fixture flight, private achieved-nozzle telemetry, source-preserving beveled geometry and hydroponics, bounded procedural planet recipes/Genesis, camera-aware dust, wider flight zoom and canvas destination observation extend the proof. The fixture computer/mass/actuator availability remain authored data; no persistent utility/refit milestone is marked complete. See [current iteration handoff](handoffs/2026-09-08_astra_visual_iteration.md) for validation and limits.

2026-09-08 inventory extension: the owner requested playable carried equipment ahead of the larger milestones. Private item/container/hotbar authority now supports a one-time lab kit, multi-cell packing/rotation, stable backpack contents, equip swaps and nearby crate access with revision/retry guards; actual subscribed equipment drives character presentation. This is an M5 foundation slice, not completion: transfers between players, stacking, world drops, permissions beyond the private lab, fluid transfer/utilities, combat and live component mass integration remain open. See [inventory authority](inventory_authority.md) and [current handoff](handoffs/2026-09-08_astra_visual_iteration.md).

2026-09-09 native integration checkpoint: R006 pilot hull, the r002 native floor review candidate and all 73 approved cargo appearances are installed in the local catalogs. Four original storage placements now use approved native pods with private container bindings; actual pointer store/retrieve, reload persistence and out-of-reach rejection passed without changing item/container identities. R006 collision revision 3 aligns walking clearance, the single doorway and forward ship contact capsule; focused tests, isolated smoke and normal-client walking/piloting checks passed. Native finish study04 and ice-r015 remain local visual candidates, not final art approval. The combined ship checkpoint passed 263 tests, typecheck, build, art and floor checks. This extends the M2/M5 foundation slices; multiplayer admission, general assembly-derived collision/refit, pressure zones and production release gates remain open. Exact revisions, evidence, installation and recovery are in [the release record](releases/native-ship-2026-09-08/README.md).

2026-09-09 modular character/equipment checkpoint: all ten existing archetypes are
split into 90 real inventory components, with male/female modesty-covered bases,
eight independent hair styles and the shared 16-bone, twelve-clip rig. The four
existing ship crate UUIDs receive one permanent, idempotent uniform delivery;
real pointer inventory/paper-doll equip and unequip, mixed sets and persistence
pass. Native source/export checks, 450 tests, full build, isolated authority
smoke and real Babylon browser fitting evidence extend the M2/M5 foundation.
This does not complete M2/M5 or grant armor/stat bonuses. Exact revisions,
pending owner art approvals and evidence are in the
[component handoff](handoffs/character_components.md) and
[living index](../assets/art-library/character-components/INDEX.md).
