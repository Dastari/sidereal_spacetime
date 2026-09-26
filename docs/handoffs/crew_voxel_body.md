# Voxel crew body, rig and animation library (CHAR-BODY)

Status: this is **proposal art** behind a local preview flag. The owner has not approved it, and none of it is published. The live game still uses the r008 modular crew. See `docs/implementation_plan.md` for the live character state.

## What exists

- **Authoring.** Headless Blender scripts in `scripts/art_library/crew_voxel/` produce everything below.
  - `voxkit.py`: brick-island voxel parts. Each island is bevelled separately, the per-slot materials are glTF-exportable, and the pixel face gets its own UV.
  - `rig.py`: the `crew_rig` bones, sockets, landmarks and equipment slots.
  - `body.py`: the masculine, feminine and neutral layers — underwear base, hands, head, suit, gear and default hair.
  - `anims.py`: 36 baked actions. Poses are authored parametrically and solved with analytic IK, with landmark retargeting and expression tracks.
  - `face_atlas.py`: the default pixel-face atlas and its reference compositor.
  - `export.py`, `render.py`, `compare.py`, `loops.py`, `review_revision.sh`, `bake_all.sh`: export and review renders — turnarounds, matched side-by-sides, pose sheets, wardrobe sheets, and MP4/GIF loops.
  - Build command:

    ```
    blender -b --factory-startup -P scripts/art_library/crew_voxel/build_body.py -- --out <dir> [--no-render]
    ```

  - Run one Blender at a time, with scratch on disk.
- **Contract for the other character agents.** Written by the build to `body-spec.json` and published at `/root/sidereal-progress/_shared/CHARACTER_SPEC_BODY.json` (`spec_version` 2, revision r004). It covers:
  - bones, sockets and their rest matrices;
  - segment and layer bounds;
  - mesh regions and the rules for hiding them;
  - material slots, including `face`;
  - grip profiles;
  - the face canvas.
- **Runtime assets.** These are proposals only.
  - `assets/runtime/crew/voxel/r004/crew-body.glb` holds the rig, 3 bodies × layers, sockets and 36 actions.
  - `face/face-default.png` and `face-atlas.json` are the default atlas; `face-neutral.png` is the reference composite.
- **Content.**
  - `packages/content/src/crew-voxel-bundle.ts` holds the bundle contract:
    - action names, looping set, nominal stride speeds;
    - regions and outfits, expression tracks;
    - `resolveCrewBundle`.
  - `packages/content/src/crew-voxel-face.ts` holds `composeFace`, the pure face compositor. It matches the Blender pipeline to ±1 per channel.
- **Render.**
  - `packages/render/src/crew/voxel-crew.ts` — `createVoxelCrewVisual`:
    - **Animation:** AnimationGroups with lower-body and upper-body masks, so aim and hold layers play over walk and run. One-shots cover shoot, reload, emotes and so on.
    - **Attachment points:** `sockets`, `socketNodes`, `itemSockets` (CHAR-WEAPONS item frame), `joints` and `attachPart` (re-links a part skeleton to the body joints).
    - **Layers:** `setOutfit` and `setHiddenRegions`.
    - **Face:** `face` exposes `setExpression`, `setViseme`, `blink`, `setLook`, `setAtlas` and `setTints`.
    - **Support hand:** `setSupportTarget` runs two-bone IK on `socket.hand.L` every frame after animations.
  - `voxel-crew-clips.ts` maps gameplay state to clips (pure).
  - `voxel-face.ts` is the RawTexture face with auto-blink.
  - `voxel-ik.ts` holds the IK solver.
- **Integration.**
  - `WorldOptions.crewBundle = "voxel"` selects the new crew.
  - `apps/client/src/App.tsx` sets it only when `import.meta.env.DEV` or `VITE_CREW_VOXEL_PREVIEW=1`, and only together with `?crew=voxel`.
  - Every other case keeps the legacy r008 bundle.
  - The legacy equipment pose controller targets the 16-bone r008 rig, so it is not bound for the voxel crew.
- **Local review page.** `scripts/crew-voxel-review/` renders the voxel crew in the actual game renderer with no database, with mode, body, action and shoot controls.

## Known gaps

These are recorded honestly in `/root/sidereal-progress/char-body/PROGRESS.md`.

- Foot planting relies on the stride speed matching playback. There is no terrain foot IK yet; decks are flat.
- Crouch, carry, climb, hover, downed and dead need authoritative state. For now they are reachable only through `setMotionOverride` in review.
- Per-weapon holds, holster and draw belong to CHAR-WEAPONS, built on the upper-body layer and `setSupportTarget`.
- Production face atlases and per-head variants belong to CHAR-HEADS. The default atlas is a placeholder.
- The owner has not signed off on any of the art.
