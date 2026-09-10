# Character visibility and initial portrait — 2026-09-10

Status: portrait cause confirmed and focused correction implemented; actual browser review pending the shared GPU slot. Walking disappearance remains under investigation. Candidate13990 and external character/face/pose work are unchanged.

## Confirmed portrait defect

`packages/canvas-ui/src/character-sheet.ts` rendered a static `createCrewPortrait` PNG both before the preview module arrived and whenever the preview was not ready. That image is selected by outfit preset, not the accepted body, cosmetics and equipped component UUIDs. The renderer resolver defaults to the engineer preset when outfit is absent. A personalized character can therefore briefly display engineering gear even though no inventory or appearance mutation occurred.

The sheet now displays neutral Loading character / unavailable text. The actual preview reports presentation readiness only after the current appearance's selected equipment has loaded and a fully ready frame has rendered. Failed held-item loading cannot substitute preset gear. External `crew/appearance.ts`, `crew/index.ts`, appearance controls, equipment poses and materials remain untouched.

Five focused tests cover the real sheet draw path and the readiness state: no preset Image request, latest body/hair/component customization before render and draw, neutral failure, pending/superseded equipment, shader readiness, empty hand, and cleanup. Full typecheck passed. Browser acceptance is still outstanding, so this is not claimed live.

## Walking disappearance: findings, not a confirmed cause

The gameplay renderer has no wall-distance branch that disables the avatar. Its root enable gate is Cabin visibility (Deck/Flight/observing), with an independent F3 Characters override. Appearance customization toggles component meshes from body/coverage selection; it has no room-distance dependency. The new retained opaque walls can legitimately occlude a still-enabled character through ordinary depth testing. Do not hide walls or force every avatar mesh active as a speculative fix.

A second concrete framing candidate is the Deck camera: at full Deck blend its target is `0.4 * shipCenter + 0.6 * actorPosition`, while native Deck zoom permits a 2m half extent. At a room far from the ship center the actor may leave the viewport at close zoom despite remaining enabled. The camera near plane is radius*0.02 (minimum0.1m); no code evidence yet establishes near clipping as the cause.

The required actual disappearing-frame observation is: actor accepted XY/deck/support; root and parent enabled states; selected child mesh visibility and active/frustum state; projected actor head/torso/feet screen coordinates; camera radius/target/near plane; and any opaque wall between the camera and actor. Compare to one nearby visible frame without changing actor identity, equipment or F3 toggles. This will distinguish depth occlusion, offscreen framing, component selection and an authority/session replacement. Root owns that live integrated browser while the shared GPU slot is occupied.

## Confirmed close-zoom framing defect

Checkpoint3717f5bd verifies a real framing failure without any occluding geometry: canonical deck centre(0,2), valid accepted approach(0,8.8,0.21875),2m zoom and90-degree orbit at1600×900 project the feet toy1095 and torso toy922, outside the900pixel viewport. Near depth remains valid. At portrait aspect some equivalent positions are outside horizontally. This independently confirms one way the actor disappears; it does not explain every wall-related report.

The pure `deckCameraActorWeight` retains60%actor follow at the initial overview zoom and smoothly increases to100%at the2m close limit. Thirteen focused tests and full typecheck pass, including480 combinations of valid positions, zooms, aspects, ship headings and orbits. Exact numerical evidence: `.runtime/deck-camera-projection-proof.json` and `.runtime/deck-camera-projection-summary.log`. Root runtime wiring replaces only the camera target's actor weight; authoritative coordinates, projection, orbit and mesh visibility are untouched. That wiring is a separate follow-up to the combined antialiasing/remote-exterior candidate and needs actual game browser acceptance before being described as live.
