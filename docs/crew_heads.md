# Crew head kit v1 (CHAR-HEADS)

Status: **proposal.** The art is unsigned: no owner approval, and no revision is signed off. Nothing here is wired into the live game. The data contract, atlases and exported GLBs exist. Runtime integration (attach, `crew.face` DynamicTexture, the `setExpression` / `setViseme` / `blink` API) is owned by CHAR-BODY's voxel crew runtime and is pending. Only the owner can approve this per the art-library workflow (`assets/art-library/WORKFLOW.md`); passing tests and agent review are not approval.

## What exists

| Piece | Path | State |
| --- | --- | --- |
| Part catalog and rules | `packages/content/src/crew-heads.v1.json` | implemented |
| Face atlas contract | `packages/content/src/crew-face-atlas.v1.json` | implemented (draft spec: `FACE_ATLAS_SPEC`) |
| TypeScript contract | `packages/content/src/crew-heads.ts` (`@sidereal/content/crew-heads`) | implemented and tested |
| Face atlases (6 variants) | `assets/runtime/crew/heads/v1/face/face-<variant>.png` | generated |
| Head/hair/gear GLBs + manifest | `assets/runtime/crew/heads/v1/*.glb`, `crew-heads.manifest.json` | generated; the delivery allowlist is not updated yet |
| Generators | `scripts/art_library/crew_heads/` | implemented |
| Runtime attach + face texture API | CHAR-BODY runtime | pending |

**Generators.**
- `npm run art:crew-heads` builds and exports the geometry with headless Blender 4.3. It never uses the shared Blender MCP instance.
- `.tools/art/bin/python scripts/art_library/crew_heads/face_atlas.py --out assets/runtime/crew/heads/v1/face --json packages/content/src/crew-face-atlas.v1.json` regenerates the atlases.
- `compose.py` lays the review renders out beside the exact art-library reference crops.

## The animatable face (owner feedback round 2)

- **Canvas.** The face is a 16 × 16 px pixel-art canvas: 1 px = one 1/32 m voxel. It sits on the flat front of the skull in material `crew.face`.
- **Layers**, bottom to top: `under` (blush), `age`, `marks`, `eyes`, `iris` (× eye colour), `glint`, `brows` (× hair colour × 0.6), `mouth`, `over` (sweat, tears, KO stars, anger vein, sleepy Z).
- **Expressions (14):** neutral, happy, sad, angry, surprised, confused, hurt, determined, scared, smug, sleepy, knocked_out, wink, grin.
- **Talk visemes:** closed, A, E, O, MB.
- **Blink:** half → closed → half, one 1/24 s frame each, every 2–6 s at idle.
- **Look:** left, centre or right iris.
- **Action tracks:** every character-spec action maps to an expression.
- **How it changes at runtime.** `resolveFaceFrames()` picks the frame names and `composeFace()` produces the RGBA canvas. There is no mesh swap, so a change is a 16 × 16 CPU recomposite plus a texture upload.
- **Face variants (6):**
  - `m_classic`, `m_bold`, `m_bright`
  - `f_classic`, `f_bright`, `f_sharp`

  They differ in eye shape and size, lashes, brow weight and arch, and mouth width and lip colour.

## Other coverage

| Category | Count | Notes |
| --- | --- | --- |
| Heads | 2 | masculine and feminine jaw. Every hair style and hat fits both. |
| Ages | 4 | young, adult, middle, older. Middle and older use the `age` atlas layer; hair colour does the rest. |
| Hairstyles | 28 | 15 short (the reference male row plus curly top and afro) and 13 medium/long/updo (the female row). Each has `full`, `cap` and `fringe` nodes. |
| Facial hair | 12 | geometry; beard colour is a slot value |
| Facial details | 12 | 7 markings (atlas `marks` frames) and 5 overlays (geometry: bandage, cyber, eyepatch, monocle, visor implant) |
| Accessories | 24 | |
| Helmets | 9 | 8 closed helmets with 5 visors each (clear, tinted, HUD, mirrored, AR) |
| Masks | 2 | oxygen mask and rebreather; they hide the canvas mouth |
| Presets | 13 | specialty looks from the reference |

## Geometry and frame

- **Head space.** The origin is the `head` bone rest head. Axes are the armature axes: x = character right, y = forward, z = up. The face looks along +Y, which is -Z in glTF. Units are metres.
- **Skull.** Per owner round 2: 16 × 14 × 16 fine voxels, 0.50 × 0.44 × 0.50 m.
- **Design units.** Parts are authored in compact design units and mapped to the skull by a piecewise per-axis map (`vox.py`: `SKULL_D` → `SKULL_V`). Thicknesses in front of the face are preserved exactly, so swappable layers never share a front plane.
- **Surfaces.**
  - Each part is meshed from its voxel volume as brick islands, and a soft bevel is baked into the mesh: skull 16 mm with 3 segments, helmets 13 mm.
  - COLOR_0 carries a per-island tone. For hair this is 0.82–1.0, so the clumps read as textured locks; the other parts vary only slightly.
  - The voxel read comes from the hair-clump silhouettes and chunky details, not from a visible grid.
- **Materials.** `crew.<slot>` for `skin, hair, eye, suit_primary, suit_secondary, accent, metal, dark, emit, glass, face`. Materials are `baseColorFactor × COLOR_0` (the face uses its texture × COLOR_0). Skin, hair and eye colours, themes and player colours are slot values.

## Rules

`validateHeadLoadout` enforces:
- layer conflicts between accessories, helmets and masks (`ears` covers `ear.L` and `ear.R`);
- one atlas marking at a time;
- detail zones and the `maxDetails` limit;
- visors only on helmets that list them;
- masks only with no helmet or an open-face helmet.

The most restrictive worn item picks the hair variant: `full` < `cap` < `fringe` < `hidden`.

These cosmetics grant no inventory item, stat or gameplay capability.

## Known gaps

- Parts are rigid in head space, with no skinned `crew_rig` export yet. CHAR-BODY's `attachPart` parents unskinned roots to a socket or joint.
- The face is the default neutral canvas until CHAR-BODY's runtime drives `crew.face`.
- `hair.glb` is large (about 10 MB uncompressed). Compression, or merging islands per variant, is a follow-up.
- All of this is iterating on owner feedback. Evidence is in `/root/sidereal-progress/char-heads/`.
