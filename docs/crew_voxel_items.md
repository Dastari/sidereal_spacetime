# Crew voxel handhelds, tools and FX (r001)

Status: proposal art. It is exported and has tests, but it is not owner-approved, not published and not the default runtime.
Last updated: 2026-09-26
Owners: Sidereal art (CHAR-WEAPONS, Agent Mail `CopperHorse`)

This kit replaces the r002/r003 pose-paired handhelds and the twelve `equipment-kit` models with the owner's detailed voxel reference style. The references are:

- the equipment sheet's WEAPONS & TOOLS and EFFECTS LIBRARY panels;
- the crew roster's LOADOUT EXAMPLES;
- the TOOLS & HAND ITEMS panel in `character-animations-2`.

The exact reference tiles are listed in `scripts/art_library/crew_items_reference_crops.json`. `scripts/art_library/crop_references.py` produces lossless crops and a SHA-256 receipt. The crops themselves are local evidence and are not committed.

## What exists

| Deliverable | Where | Notes |
| --- | --- | --- |
| Authoring recipe | `scripts/art_library/crew_items/` (`voxel.py`, `items.py`, `fx.py`, `themes.py`, `body_frames.py`) | Pure Python. Boxes are painted onto the 1/32 m grid, and a later paint overrides an earlier one. Each paint call becomes a component. A greedy merge per (slot, component) turns components into bevelled brick islands. |
| Blender build | `scripts/art_library/crew_items/build.py`, run as `npm run art:crew-items` | Headless. Writes the GLBs, manifest, content JSON, `.blend` source, icons and review renders. |
| 28 items | `assets/runtime/crew/items/r001/<id>.glb` plus `<id>.lod1.glb` | LOD0 has chamfered bricks. LOD1 uses the same boxes with no bevel, for crowds. |
| 15 FX | `assets/runtime/crew/items/r001/fx/<id>.glb` | Voxel emissive or alpha layers, with no bevel. |
| Manifest | `assets/runtime/crew/items/r001/manifest.json` | Per-file SHA-256, triangle and primitive counts, node, material and animation names. |
| Content data | `packages/content/src/crew-items-r001.json` + `crew-items.ts` | Validated at import time. |
| Default holds | `packages/content/src/crew-items-r001-holds.json` | Solved against the CHAR-BODY r001 rig. |
| Runtime hook | `packages/render/src/equipment/voxel-items.ts` | Opt-in; see Integration. |
| Source | `assets/source/crew-items-r001.blend` | Editable bodies, parts, sockets and NLA tracks. |

**Items**

- Ballistic: pistol, SMG, compact carbine, rifle, shotgun, heavy gun, grenade.
- Energy: beam rifle, rail rifle, stun gun, baton.
- Medical: medgun, med kit.
- Tools: utility cutter, repair tool, welder, multi-tool, mining drill, wrench.
- Utility: scanner, sample scanner, data pad (which is also the reference "tablet"), shield emitter, flashlight, grapple, drone, cargo box, shield pack.

**FX**

- The reference twelve: muzzle flash, laser bolt, plasma bolt, healing beam, scan pulse, shield bubble, impact spark, smoke puff, thruster glow, pickup glow, repair sparks, teleport.
- Three more that items reference: tracer, beam lance, stun arc.

## Data model

Every item declares the following:

- **Frame.** In Blender: +X right, +Y forward, +Z up. In glTF: +Y up and -Z forward, the same frame as `EquipmentPoseItem`.
- **Grip socket.** This is the item origin, at the centre of the cross-section that `socket.hand.R` closes around.
- **Optional sockets.**
  - `support`, the target for `socket.hand.L`
  - `muzzle` or `emitter`
  - `stock` (shoulder contact)
  - `sight` and `eye`
  - `display`, for view-screen devices
- **Socket nodes in the GLB.** Sockets are exported as `socket.<name>` nodes that follow the project convention: local -Y is outward.
- **Classification.**
  - `category`: ballistic, energy, medical, tool or utility.
  - `animationSet`: rifle, pistol, tool, device, melee, throw, carry or worn.
  - `poseProfile`: the existing r003 aim-space profile. It is null for melee, throw, carry and worn items.
  - `twoHanded` and `supportMode`.
- **Holster.** The holster socket, its socket-local rotation and its offset, derived from the CHAR-BODY r001 socket frames.
- **FX ids per trigger**, for example `fire`, `projectile`, `impact` and `use`.
- **Reference crop ids.**
- **Legacy replacement.** `replacesLegacyAsset` covers compact-pistol, heavy-handgun, carbine, long-rifle, plasma-cutter, sample-scanner and medkit.
- **Materials.** There are ten material **slots**: primary, secondary, accent, trim, metal, dark, grip, emit_a, emit_b and glass. There are six variant themes: orion, engineer, security, medic, salvage and recon.
  - GLB materials are named `slot:<slot>@<theme>`.
  - `applyCrewItemTheme` recolours them in place.
  - Albedo is the slot colour multiplied by a baked per-part gradient, the `shade` vertex colour exported as `COLOR_0`. Each part is lit from the top and gets AO on its downward faces.
  - There is no per-voxel texture, grid or cell noise. On 2026-09-25 the owner said "you shouldn't need to see each individual block". The voxel read comes from the stepped silhouette and chunky part blocks, each with soft, single-segment bevelled edges and smoothed normals.
- **Item part animations.** These are glTF clips on `part.*` nodes:
  - slide or bolt recoil, and magazine drop (`fire`, `reload`);
  - shotgun pump;
  - gatling spin;
  - energy-cell swap;
  - drill bit, repair emitter and multi-tool head spin (`use`);
  - grapple jaws;
  - baton deploy;
  - grenade pin;
  - drone rotors (`idle`).

`crewItemActionPlan(item, action)` pairs each action with three things: the CHARACTER_SPEC clip (for example `aim_rifle`, `shoot_pistol`, `reload`, `repair_loop`, `use_interact`, `melee_swing`, `throw` or `carry_walk`), the item clip, and the FX. `toEquipmentPoseItem` adapts any item that has a profile to the existing r003 pose controller.

FX definitions carry the following:

- kind and anchor;
- duration and loop;
- tint (either fixed, or recoloured from the firing item's emissive slot);
- blend;
- normalised scale, opacity and emissive keys;
- projectile speed, beam base length and an optional light.

`sampleCrewItemFx` is the pure sampler. `createVoxelItemFx` applies it in Babylon. FX are presentation only. They are spawned from accepted events or local previews, and they never decide hits, healing or shields.

## Armed animation layer (owner round 2)

`scripts/art_library/crew_items/armed.py` bakes 78 clips onto `crew_rig`. There are ten classes: pistol, SMG, carbine, rifle, shotgun, heavy, beam, rail, melee and tool. Each class gets these clips:

- `idle_armed`, `walk_armed` and `run_armed`
- `aim` and `shoot`: the shoot clip is melee attack for the melee class and use for the tool class
- `reload`: not baked for melee or tool
- `draw` and `holster`

The output is `assets/runtime/crew/items/r001/armed-actions.glb`, one glTF animation per `<class>.<clip>`, with metadata in `armed-actions.json`.

**How the body moves.** The body comes from CHAR-BODY's own pose library (its `anims.py` Poser, published in the shared body folder).
- `gait` provides foot IK with planted stance feet, hip sway and bob, and a counter-rotating chest.
- CHAR-BODY's aim, shoot and reload key poses provide the body.

**How the weapon is placed.** CHAR-WEAPONS positions the weapon with a weapon-frame solver:

| Weapon and state | Placement |
|---|---|
| Long guns, aim | Stock seated in a right-shoulder pocket, barrel level, bladed about 15° |
| Long guns, ready (idle, walk, run) | Stock at the shoulder, muzzle down 22°, across the body |
| Heavy | Stock at the right hip in every clip |
| Pistol, aim | Sights on the eye line at arm's length |
| SMG | Rear cap shouldered like a carbine |

CHAR-BODY's authored weapon motion (breath, recoil kick and reload tilt) is applied as deltas on top of that placement.

**How the arms follow.** Both arms are IK'd onto the item every frame: right hand on the grip, left hand on the item's support socket.
- The clavicle swings up to 24° when the chibi arm would otherwise fall short.
- A per-frame settle step slides the weapon up to 4 voxels toward the support shoulder when the gait carries the grip out of reach.

**Draw and holster.**
- The right hand reaches the item at its holster and closes on it at frame 6.
- For pistols and tools, the item then comes straight to ready.
- Long guns rise muzzle-up over the right shoulder, then drop into the ready.

**What gets measured.** Each clip records its maximum support-hand gap and the maximum number of item voxels inside the torso or head boxes. On body r004:
- The support-hand gap is at most 0.014 m on every clip.
- Long-gun aim puts about 5–10 item voxels inside the boxes.
- Long-gun walk and run put 22–58 inside.
- Draw and holster put 23–52 inside.
- The heavy gun's hip carry puts 120–160 of its roughly 2,400 voxels inside the torso box during idle and walk.

**Runtime.** `crewArmedClip(item, clip)` in `packages/content/src/crew-items.ts` maps any item to its class clip name. Items outside the representative set use their class clip. For those items, a runtime can re-target the support hand with `createVoxelItemVisual(...).socketWorld("support")`. Animated evidence (MP4 and GIF at the game camera and a 3/4 close-up) is produced by `build.py -- --armed` into the review folder.

## Integration status

- **Standalone and tested.** The content validators, the GLB/manifest/content cross-checks and the runtime hook (`createVoxelItemVisual`, `createVoxelItemFx`) are all covered by tests.
- **CHAR-BODY path.** CHAR-BODY's voxel crew runtime (`feat/crew-voxel-body-rig`, flag `WorldOptions.crewBundle = "voxel"`) parents item roots to `crew.itemSockets.R`, which applies the item +Y → socket +X adapter. That call site belongs to CHAR-BODY. This branch does not change `packages/render/src/index.ts` or `apps/client`.
- **Default game is unchanged.** It still uses the owner-approved r003 handhelds with the r008 bodies. Switching is a separate owner decision.
- **Holds.** `crew-items-r001-holds.json` records each item on CHAR-BODY's baked action at a key frame, on the spec-v2 body (revision r004, read from the published spec at build time), with measured hand errors. The build refits socket positions and grip profiles from `CHARACTER_SPEC_BODY.json` automatically. Item scale targets v2:
  - pistol about 0.52–0.56 m, roughly head width;
  - rifles 0.84–0.94 m, roughly 1.5–1.7 × shoulder width;
  - heavy gun 0.94 m.

## Honest gaps

- Final art has no owner approval. The existing r003 handheld approval does not transfer to these meshes.
- Nothing has been captured in a browser. Aimed long guns still clip the chest box, and draw/holster passes through the torso (see Armed animation layer).
- Content `package.json` exports are unchanged, because that file was reserved by another agent. Consumers import `packages/content/src/crew-items.ts` directly, as the render package already does for `equipment-poses`.
- Inventory definitions and weapon stats are unchanged. Gameplay authority, ammunition and FX spawning from accepted combat events are not part of this kit.
- `HEAVY_WEAPON` (the hip stance) exists only in the r003 release code, not on `main`. The heavy gun and mining drill use `RIFLE` until it is ported.
