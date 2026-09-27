# Combat pose parent integration

Status: local development review integrated; final pose art acceptance remains open.

Root regenerated, inspected, overlay-typechecked and applied the specialist's narrow parent patch on 2026-09-09. The delivery contract's "unapplied patch" statements describe the specialist handoff, not the current shared client. The normal client retains canonical crew and handheld GLBs. `?poseReview=r002` on the managed development client loads the paired staged rig, aim library and handheld sockets; production builds do not enable this review parameter.

The shared beam follows the transformed physical muzzle, with current obstacle clipping. Client raycasts remain presentation only. SpacetimeDB continues to validate equipped item identity, aim, energy, cooldown and accepted shot sequence. No visual pose or ray grants hit/damage authority.

Actual local game review confirmed two accepted carbine shots (120 to 112 energy, four per shot) and pistol/carbine UUID switching without replaying the carbine's previous shot sequence. All item placements were restored through validated reducers. A browser-discovered tap bug was fixed by retaining one item-bound press across the asynchronous aim heartbeat; release does not erase that press, while cancellation, permission loss, item replacement or failure does. Focused tests cover these cases.

Actual deformed shoe vertices confirmed a 0.0625m gap above the new native deck. Root corrected the presentation avatar base to 0.1875m and selection ring to 0.2075m. Simulation coordinates and rig source geometry are unchanged. Actual normal-client rechecks passed: quick click accepted exactly one shot (120 to116 energy); deformed shoe minimum is0.187500149m, effectively flush with the0.1875m deck. The App now releases held repeat on ordinary pointerup and reserves cancellation for pointercancel/blur. Canonical physical-muzzle ancestor refresh passed a fresh normal-client recheck: beam-start distance from the physical muzzle was6.94e-18m. The r002 physical muzzle also matched the beam start to numerical precision. Root-to-leaf ancestor matrix refresh fixes a stale intermediate attachment transform after pose/IK changes.

The specialist's low rifle carry, stock/shoulder gap, optic alignment, grip acquisition and constrained-pose fallback limitations remain. This integration is not final owner art sign-off, and no new canonical rig or weapon revision is published as finished art.
