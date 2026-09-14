# Modular r008 and combat pose r002 compatibility review

Date: 2026-09-09. Reviewer: Astra subagent `/root/character_art_review`.

**CPU compatibility: PASS within the explicit matrix below.** Normal-game
activation is owner-authorized. This review does not confer final art sign-off;
that remains null. Final production browser actions and the complete release
checks are owned by the integrating root agent.

## Exact assets and rig

The tests load the installed `assets/runtime/crew/components/modular-crew.glb`
(r008, SHA-256
`ae4a7e12096bd9aaac0bdfb178354d899b89af15cbc20293815c301871694150`),
not the old monolithic character. They compare its actual GLB data with the
paired r002 `crew-poses.glb` (SHA-256
`44af8cbc0bb6f08aa558b9ac2f30359c832e8b52f5a45a3f351ff2a8e25ae00c`).
All sixteen joint names, hierarchy links, local rest transforms and inverse bind
matrices match exactly. Every installed mesh has finite positions, valid joint
indices and normalized nonnegative weights. Different authored vertex layouts
are not incorrectly claimed to have identical vertex-by-vertex weights.

The modular GLB retains twelve clips; the paired rig contains seventy-five.
Compatibility uses the separate exact authored aim-space JSON, hash
`ec269e27b11673dc9080da6114d51ddfdfff26f8acad773c4e0951c4168e1885`,
with actual paired carbine, long-rifle, heavy-handgun, compact-pistol, flashlight,
sample-scanner and plasma-cutter GLBs and their socket metadata. The tests verify
all seven item hashes against the preserved delivery manifest. This does not
substitute the old long-gun geometry under the new socket definitions.

## Real defects found and corrected

1. Sprint release could retain a physical muzzle. An early inactive exit left
   old penetration diagnostics, then the correction retry treated `active` as
   sufficient and forced full pose weight during sprint. The solver now clears
   frame-specific contacts/errors, excludes sprint/lower/unequip from retries,
   and requires a nontrivial active weight. Hidden and inactive frames cannot
   revive a prior penetrating solve.
2. The original correction search coupled every useful lower/forward offset to
   additional lateral displacement. Mixed heavy armor during actual walk
   phases forced the carbine primary grip approximately 4.65 cm from the hand
   and heavy-handgun support approximately 5.44 cm away. Independent late
   search candidates keep the same twelve-candidate cap and avoid unnecessary
   displacement away from the arms.
3. The scoped long rifle still lost contacts against the heavy torso as Walk
   pitched the spine about 4.75 degrees and rolled the pelvis about 2.6 degrees.
   Its previous worst sampled primary/support errors were approximately
   5.07/3.38 cm, with a 15.41 cm shoulder gap. Shoulder-contact profiles now
   stabilize the chest from the authored neutral spine rotation, compensating
   pelvis gait rotation before the existing aim/stance layer. Pelvis translation,
   legs and foot gait remain animated; the existing final pose-weight blend
   fades stabilization in and out. Non-shouldered profiles keep their original
   upper-body gait. There is no skeleton stretch, transform-authority change,
   native art edit or relaxed profile limit.

The earlier wrong-gait test used plain Walk instead of the actual equipped
Walk-Rifle/Walk-Pistol clips. Correcting that fixture did not remove the heavy
fit defects; the corrected production-clip tests are the final evidence.
Failed diagnostic logs are retained under `.runtime/modular-pose-*`.

## Equipment-derived clearance

`packages/render/src/crew/equipment-pose-bulk.ts` exports:

```ts
equipmentPoseArmorBulk(equippedComponents?, legacyArmor?): number
```

For modular crew, explicit equipped slot IDs override cosmetic `armor`, including
an empty equipment map. IDs must belong to the named slot. Existing calibrated
padding remains 0.02 m or 0.045 m; the heavier category follows authored bounds:
chest depth at least 0.50 m, shoulder width at least 0.95 m, or helmet width at
least 0.82 m and height at least 0.65 m. Bounds are Blender width/depth/height,
not inventory footprint or mass. This covers the marine torso/shoulders and large
closed pilot/salvage/legacy shells. Boots, gloves or backpack alone do not inflate
upper-body proxies. Legacy cosmetic fallback applies only without modular data.

The integrating agent wired the helper into both `crew.customize` and controller
creation. The final modular test makes no manual `setArmorBulk` call, so it
exercises that production wiring with a deliberately contradictory cosmetic
`armor: "none"` for heavy equipped parts.

This scalar padding selects a conservative proxy category. It is not exact
triangle collision, a claim that every armor surface fits inside every box,
or an approved gameplay-stat change.

## Validation and limits

`packages/render/src/crew/modular-equipment-pose.test.ts` covers both bodies with
the full nine-piece medic set and a mixed heavy set: marine helmet/chest/shoulders,
medic visor/gloves/belt/boots, engineer legs and salvage backpack. All seven paired
items acquire and settle, reverse aim to ±0.7 radians, and pass five actual Walk
clip phases in strafe and backward motion. Sprint uses the matching Sprint clip.
Hidden, seated, lowered, unequip, resumed aiming, unbind and disposal are checked.
Actual visible skin positions remain finite, the selected modesty body stays
visible, opposite-body meshes stay hidden, and equipped components remain visible.

Across 420 settled contact samples the existing limits remain:

- Primary hand error below 0.004 m.
- Support hand error below 0.025 m.
- Shoulder error below 0.13 m.
- Weapon/body proxy penetration zero.
- Upper-arm proxy penetration below 0.005 m.

Finite acquisition/release checks do not claim that transient hands satisfy
settled grip tolerances before the pose finishes blending. This is a bounded
matrix at neutral pitch, not all angles, every combination of ninety components,
continuous exact-mesh collision or production performance certification. Existing
scoped-eye residual and later art refinements remain separate limitations.

Final targeted command ran seven files: crew, equipment-pose, pose-system,
pose-integration-motion, equipment-pose-bulk, modular-equipment-pose and
physical-beam tests. **36 tests passed.** `npx tsc --noEmit` also passed.
Logs: `.runtime/modular-pose-compatibility-final-tests.log` and
`.runtime/modular-pose-compatibility-final-typecheck.log`.

Reviewed solver SHA-256:
`0114d3beec9bed8548e094ace8d5c2e39b4a1f60696f28c89e9e786c3fd2438f`.
These focused results complement, and do not replace, the integrating agent's
required final `npm run check`, `npm run build`, art validation and real browser
review after the solver corrections.

### Broader regression — settled poses pass; lowering remains failed

Adapted, separately saved copies of the grid and transition scripts ran against
the same final solver and installed modular r008 under
`.runtime/character-live-audit/20260909T063651Z/`. The capture record pins script,
solver and asset hashes. Both handedness paths and the existing rotated-parent
configuration were retained. The grid uses actual male captain/marine component
sets; the transition matrix uses male marine. Female remains covered by the
focused both-body matrix above. The preserved r002 source audit files were read
for comparison and their unchanged hashes verified after completion.

| Audit | Result |
| --- | --- |
| 2,772 settled yaw/pitch cases | 1,997 solved, 775 fallback, no unreachable/clearance-failed cases. Maximum primary/support/shoulder errors: 0.001882/0.024320/0.125474 m. Weapon/body proxy penetration zero; upper-arm penetration at most 0.003314 m. |
| 4,320 transition frames | **FAIL for full transition clearance:** 551 clearance-failed frames and 3 unreachable frames, all during explicit `lowered`. The equip/raised portions have no failure statuses. |

The failed lowered portion reaches 0.264058 m weapon/body proxy penetration and
0.087339 m upper-arm penetration. Maximum blended primary/support errors are
0.427429/0.815944 m. These are actual recorded release defects, not a widened
tolerance or a clean pass. The earlier preserved r002 transition report had no
failure statuses because correction could force full raised weight during
lowering; that behavior also caused the fixed sprint lifecycle defect. Correct
release eligibility exposes the interpolated path's unfinished clearance. The
final settled inactive state and hidden/cleanup semantics still pass the focused
tests; transient release art requires another correction pass.

The wide grid certifies the listed contact/proxy limits, not perfect requested
aim or sight alignment. Its scoped-eye residual reaches 0.495412 m, versus
0.370629 m in the preserved paired baseline. Screen-view devices can intentionally
face away from the requested emitter target. Full per-profile and per-frame
metrics, including these limitations, are retained in `summary.json`,
`grid-audit.json` and `transition-audit.json` in the new audit folder.

These are CPU NullEngine measurements, not GPU performance results. Recorded
median/p95 solve time was approximately 0.163/0.819 ms for the settled grid and
0.225/0.856 ms for transitions. No source changes were made during or after this
broad audit by the reviewer; subsequent corrections require a new recorded run.

## Normal UI evidence inspected

The actual loaded `output/playwright/character-live-r008-paperdoll.png` shows
the male modesty body and paired carbine with bent arms, equipped primary/back
slots and projected disc. `character-live-r008-female-rifle.png`,
`character-live-r008-female-side.png` and
`character-live-r008-female-pistol.png` show the female crest body and both item
types with coherent visible attachments and no broken body. These are suitable
static integration evidence; they precede the solver correction and do not
prove corrected heavy locomotion.

**Rejected capture:** `character-live-r008-male-rifle.png`, as inspected during
this review, showed the full static medic fallback floating without the disc or
held rifle while equipment slots were empty. It is a loading fallback, not a
successful loaded normal-game portrait. The integrating agent was told to mark
that attempt superseded and capture a verified loaded male portrait. Do not
count the misleading filename as evidence of a rifle pose.

**Final capture correction — independently verified:**
`output/playwright/character-live-r008-male-final.png` shows the loaded male
modesty body, crest hair and held carbine, with bent arms, equipped primary/back
slots and the projected disc beneath the feet. The loading verification log
confirms enabled male modular meshes and a ready portrait scene containing
`equipment-placement:carbine` on the normal query-free game URL. Its SHA-256
`e2a219be8344b11393deae2366ddd20478191b5f67ac3947a6223b27a5b3c302`
matches the archived replacement in the publication's
`integration-evidence/final-review.json`. This replacement passes the static
loaded-portrait check; the rejected fallback remains excluded. The documented
lowering failures, scope gap, WebGL warnings and limited playback acceptance
remain open.

The earlier focused art verdict remains in
[the r008 reference review](character_reference_review_stage4.md). Publication
authorization and an agent compatibility pass do not alter owner final sign-off.
