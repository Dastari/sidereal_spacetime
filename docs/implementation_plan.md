# Implementation sequence and acceptance gates

Status: Accepted direction; implementation staged
Last updated: 2026-09-08
Owners: Sidereal project

## Status discipline

M0 is the verified current scaffold; see the dated [verification record](verification.md). The remaining rows are planned implementation, not delivered gameplay. Old implemented features are reference behavior to port and revalidate. Never mark a phase complete just because its navigation or schema exists.

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

M1 is next: extract identity/session domain from the fixture; connect a real trusted issuer; persist independent character IDs and active binding; replace owner-only private labs with authorized nearby exterior views and admitted interior/crew views. Keep base spatial tables private. Add bounded movement replay and shared frame presentation. Build a two-client scene with one pilot and one passenger before adding more ship content. Do not implement sharding.

## Launch policy decisions to settle before their dependent phase

- Existing Orchard Keycloak issuer is selected; register the two Sidereal clients, exact HTTPS callbacks and transition of original accounts; never migrate credentials through browser assets. Preserve Toby's verified admin intent through explicit trusted operator account linking.
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
