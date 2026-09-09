# Current integration ownership — 2026-09-10

This checkpoint distinguishes deployed behavior, isolated acceptance and unfinished work. The owner authorizes continued implementation and deployment after validation; this does not grant final artistic sign-off or permit loss of existing state.

| Work | Owner | Current state and next gate |
| --- | --- | --- |
| Dedicated Keycloak and public game | Root + release_rollout | Live auth.dastari.net provider and sidereal.dastari.net game. Corrective client c1cebc65e0e1521083da2aa353e0c15973a241c0b6bd69cf853778fcc1adf3d7 and world bc9d19cd61858407b2bd892e27efb75b6180a8a43366f905fc77a935c00c306c installed without reset. Fresh login, keyboard movement and 100-second admission continuity passed. Original provider proof fixes the host's 60-second re-signed socket-ticket expiry. |
| Recovery proof | release_rollout | Managed cold backup restored twice on isolated loopback3190; stable inventory/container/character state matched, private reads denied. Review server stopped and port closed; live data untouched. |
| Native ordinary-walking stairs | stair_document + root | Exact r000/a003 sixty-placement two-deck fixture, private accepted movement/support/reservations and minimum safe-egress projection integrated. Isolated real server journeys found and fixed input-sequence reset on reconnect. Root browser accepted ascent/descent, expired-grant minimum egress across reload and ordinary safe return. Scoped source checkpoint complete. Not yet a normal Wayfarer refit. |
| Shared universe | shared_space_rules + root | Indexed private spatial/motion tables, canonical once-per-system bodies, authorized keyed contact views, shared collision rules, retained cell subscriptions and interpolation store staged. World registration follows stair ownership handoff. Root browser now shows two real accounts and native exteriors; accepted pilot movement propagated into the other account’s camera-relative ship root. Fresh direct-entry and existing-private upgrade validation precede normal activation. Not publicly deployed yet. |
| Complete Shipyard and semantic Wayfarer | Root integration, next construction slices | Native pressure room, ladder and stair fixtures have isolated acceptance. Two independent full262-placement Wayfarer review instances passed provider-driven corridor walking and partition collision; functional cargo/equipment allocation and final authored-assembly browser review remain pending. Powered airlocks, elevators, complete cargo support/utility routing, mount validation and full template reconstruction remain unfinished. Authored native R006 cockpit, current floor/cargo/roof/armor assets must be preserved by stable identity. |
| Character/pose and inventory UI | External owner agent | Owner confirms live. Preserve paired modular bodies/equipment and external UI changes; no competing redesign. |
| Rendering optimization and materials | Deferred behind construction | Existing shadow-disable and light-cap preference fixes retained. Full performance plan, hardware measurements and broader material/IBL pass remain outstanding. |
| Procedural planets | Paused by owner | Preserve installed assets and next-pass specifications. |

## Verified public persistence

Evidence is in output/playwright/public-audit-rollout and world_network_public_release_20260910.md. The final post-release snapshot matched the original character, ship, appearance and71 visible items. Actual movement then changed proximity-based container visibility: fresh login showed81 items, with53 common unchanged rows,18 old locker rows hidden and28 newly reachable locker rows shown. This is not an exact visible-set persistence comparison. Direct authority comparison confirmed all603 inventory rows remained identical: no deleted, added or changed item rows. Character, ship and appearance IDs were retained. The public named browser was signed out, blanked and closed; no GPU slot remains reserved for it.

## Execution order and remaining acceptance

1. Recovery restore/restart proof and cleanup complete.
2. Native stair authority/browser safe-egress proof complete; retain regression checks during shared-world activation.
3. Integrate shared-world schema and client, prove two distinct accounts observe the same ships/bodies while private interior/inventory state remains hidden, and test reconnect/cell changes and authority persistence before deployment.
4. Continue the full construction roadmap: real multi-deck authoring, stairs and elevators, pressure/airlocks, separate penetrable armor, external mounts, supported cargo-only grids,3D utility routing and a semantic Wayfarer template spawning fresh independent item/container instances. Preserve current live ships until an explicit validated migration/refit is ready.
5. Resume the remaining rendering/performance work after construction acceptance; planets remain paused.

Native visuals, collision/damage proxies and sealing interfaces are separate. Furniture/containers use entity health and later damage states. Structure, hull, armor and applicable external hardware retain localized destructibility requirements. A room label does not establish pressure sealing. A stock remote exterior whitelist does not prove a sealed physical hull.

App and dashboard releases remain independent. All authority changes require isolated smoke; UI changes require real browser review. Scoped commits preserve other agents' sources; no blanket git add or historical snapshot replacement. See the respective handoffs for exact source hashes, test evidence and known limitations.
