# Laboratory combat authority

Status: Implemented bounded intent/energy slice; isolated authority acceptance passed; published by normal additive migration without resetting the development database. No damage, projectile, hit, armor or ammunition simulation is claimed.

SpacetimeDB owns private `combat_aim`, `weapon_energy` and bounded `combat_receipt` rows. `own_combat` projects only the authenticated character's aim and currently equipped supported weapon. Item UUIDs remain the inventory UUIDs. The view exposes no other character IDs or hidden weapon state.

`set_combat_aim(active, angle)` accepts finite local direction intent, normalizes to [-π, π], and requires a connected character standing on deck. Angle zero is local +Y; `atan2(dx, dy)` is the client intent convention. Aim expires after 300 ms without renewal; the authoritative tick clears it. Helm/couch seating and disconnect clear it immediately. Walking and aiming are separate intents; aiming grants no movement, transform or helm authority.

`fire_weapon(itemId, expectedRevision, operationId)` rechecks connection, seating, actual hand item ownership, supported definition, fresh aim, action revision, cooldown and energy. An accepted shot deducts energy and increments per-item action revision and shot sequence. Exact retries use at most 128 receipts per character; conflicting retries reject, and expected revision protects against replay after receipt pruning. No client sends balances. Replay still requires current ownership, equipped hand and standing permission; it creates no new shot.

Provisional lab definitions in `packages/content/src/weapons.ts` are:

| Weapon | Capacity | Shot cost | Cooldown | Range |
| --- | ---: | ---: | ---: | ---: |
| Compact pistol | 100 | 8 | 250 ms | 60 m |
| Heavy handgun | 100 | 16 | 500 ms | 60 m |
| Carbine | 120 | 4 | 100 ms | 60 m |
| Long rifle | 120 | 24 | 700 ms | 60 m |

Energy recovers at 12 units/second starting 1.5 seconds after the last accepted shot, capped at capacity. This provisional lab rule allows offline elapsed recovery and consumes no fuel or other resource. First use lazily creates an energy row at full capacity. Existing depleted rows recover on the server at no more than four updates/second; firing evaluates exact elapsed recovery before deduction. Passive recovery does not change the action CAS revision. Equip, unequip, reconnect and repeated kit requests do not refill or replace weapon instances. Scanners and cutters have no weapon authority in this slice.

The client may render a raised pose and a geometry-blocked laser from this state. Those are presentation; 60 m is an authored range parameter, not a claim of authoritative hit detection. The private fixture world still lacks other-player admission and remote actor projection; see [multiplayer_status.md](multiplayer_status.md).

Acceptance: four pure combat tests and the isolated smoke passed. Smoke covers private-table rejection, foreign item denial, helm/couch restrictions and resets, expired aim, revision/retry conflicts, cooldown, energy exhaustion, carried item swaps, passive recovery, and disconnect/reconnect UUID/revision/sequence persistence. The restart smoke now also asserts weapon UUID and action state after an actual managed server restart; the final restart run is coordinated with the parent integration task. The full test run recorded 168 passes and three planet-suite timeouts under concurrent work; focused combat, cabin and lighting/cache tests pass. Final whole-project build and the actual integrated combat browser review belong to the coordinated integration gate.

## HTTP operation ID acceptance

The live browser check on `http://sidereal.tail7a58a6.ts.net:5173/` confirmed `isSecureContext=false` and `crypto.randomUUID` unavailable. The default `createOperationId()` helper used `crypto.getRandomValues` to generate a valid UUID v4, then passed that ID to the actual `fireWeapon` reducer for the separate Inventory Review identity. Carbine energy changed from120 to116 (cost4), and revision/shot sequence advanced from0 to1. All inventory UUIDs, placements and equipment slots were unchanged; aim was cleared and the test connection closed. Evidence: `output/playwright/http-operation-live-shot.png`.

Chromium1243's separate Local Network Access policy initially blocked HTTP/WS to the development server. The final test disabled those network-check features only in its disposable browser launch configuration; the page remained an insecure HTTP context and used the real server connection without API mocks. No service or production browser setting changed. This gate proves the HTTP-safe operation ID and authoritative energy action; the laser/raised pose remains presentation, with no projectile, damage or hit authority added.

## Actual App r002 and normal input review (2026-09-09 local)

The explicit development URL `?poseReview=r002` loaded the staged rig/equipment contract without publishing it as canonical art. With the existing Inventory Review character, a180 ms actual pointer hold accepted two carbine shots: energy120→112, item revision1→3 and shot sequence1→3, using the same equipped carbine UUID. Actual validated equipment switching carbine→pistol→carbine retained item identities and carbine shot sequence; every inventory placement was restored, including the pistol's original cell. The physical r002 beam started at the transformed authored `Aim.Muzzle` within4.97e-16 m and stopped at geometry after1.10008 m. `output/playwright/combat-r002-actual-beam.png` records the actual App view, not a standalone pose mock or art approval. The screenshot's energy has recovered under the existing server lab rule; the decrement evidence is the immediately sampled server projection.

The live review caught quick taps being lost across the asynchronous aim heartbeat. The input adapter now latches the press, and ordinary pointerup releases held repeat without cancelling that pending press; blur/pointercancel retain cancellation. After the corrected normal App reload, an actual immediate mouse.click accepted exactly one shot: sequence4→5, energy120→116. Combat-off cleared authoritative aim. An earlier quicktap completed during the interruption as sequence3→4. No client energy mutation, kit reset or UUID recreation was used. This remains energy/cooldown/intent authority with cosmetic beam feedback, not authoritative projectile damage.

Actual skeleton-applied shoe vertices initially measured minimum world Y0.2499992 over native floor0.1875, proving the6.25 cm gap. After the presentation-only base-height correction, the minimum was0.187500149 (approximately1.49e-7 m residual). No authoritative planar pose or source rig geometry changed.

A normal canonical beam discrepancy remains under separate integration-owner investigation: after a rendered frame, current transformed canonical muzzle and the beam origin differed by1.10922 m, whereas the r002 path matched. This was reported as a possible hierarchy/animation update-order issue, not declared fixed by the r002 result. `combat-normal-actual-beam.png` is diagnostic evidence, not acceptance of canonical alignment. Final status must use the integration owner's subsequent fix/verification.

Canonical follow-up: after a fresh normal-client reload on 2026-09-08, the corrected complete attachment ancestor refresh produced a beam-origin error of6.94e-18m against the actual imported GLB muzzle socket (previously1.109m). The beam remained geometry-clipped and the authoritative carbine UUID was retained. This closes the canonical muzzle regression; it does not add projectile or damage authority.
