# Crew head kit v1 (CHAR-HEADS)

Status: **proposal.** The art is unsigned: no owner approval, and no revision is signed off. Nothing here is wired into the live game. The data contract and exported GLBs exist; runtime integration waits on CHAR-BODY's voxel crew runtime (`feat/crew-voxel-body-rig`). Only the owner can approve this per [WORKFLOW.md](../assets/art-library/WORKFLOW.md); passing tests and agent review are not approval.

## What exists

| Piece | Path | State |
| --- | --- | --- |
| Catalog (single source of truth) | `packages/content/src/crew-heads.v1.json` | implemented |
| TypeScript contract + rules | `packages/content/src/crew-heads.ts` (`@sidereal/content/crew-heads`) | implemented and tested |
| Headless Blender generator | `scripts/art_library/crew_heads/` | implemented |
| Exported GLBs + manifest | `assets/runtime/crew/heads/v1/` | generated. The delivery allowlist is not yet updated. |
| Runtime attach and expression switching | CHAR-BODY runtime | pending |

Run the generator with `npm run art:crew-heads`. It uses headless Blender 4.3 only and never the shared Blender MCP instance. `scripts/art_library/crew_heads/compose.py`, run with the `.tools/art` Python, turns the review renders into labelled contact sheets. Each sheet puts the exact art-library reference crops next to the native render.

## Coverage

| Category | Count | Notes |
| --- | --- | --- |
| Base faces | 8 | male/female × young/adult/middle/older. All share one skull envelope, so every hair style and hat fits every face. |
| Expression feature sets | 8 eyes, 6 brows, 9 mouths | These combine into 13 expressions: the 8 on the reference sheet plus blink, pain, unconscious, confused and talk. Each of the 35 animation names in the character spec maps to an expression. |
| Hairstyles | 28 | 15 short (the 13 male-row reference styles plus curly top and afro) and 13 medium/long/updo (the female row). Each has a `full`, `cap` and `fringe` node. |
| Facial hair | 12 | Includes long, braided and grey beards. Grey is a colour value, not geometry. |
| Facial details | 12 | Markings sit 1/256 m proud of the skin; overlays (bandage, cyber, eyepatch, monocle, visor implant) stand further out. |
| Accessories | 24 | Hats, caps, hood, goggles (up/down), glasses, headset, earring, nose ring, cigar, masks, scarf, antennae |
| Helmets | 9 | open, closed, tactical, hazmat, pilot, mining, security, explorer, engineer |
| Visors | 5 per closed helmet | clear, tinted, HUD (emissive glyphs), mirrored, AR (emissive reticle). 40 visor nodes in total. |
| Masks | 2 | oxygen mask and rebreather, for no helmet or the open helmet |
| Presets | 13 | Specialty looks from the reference: pirate, military, corporate, scientist, and so on |

## Geometry and frame

- **Head space.** The origin is the `head` bone rest head. Axes are the armature axes: x = character right, y = forward, z = up. The face looks along +Y. Units are metres. In glTF the face looks along -Z.
- **Skull.** Spec v2 chibi: about 17 × 16 × 18 fine voxels (0.53 × 0.50 × 0.56 m).
- **Authoring units.** Parts are authored in compact *design units* and mapped to the v2 skull by a piecewise-linear per-axis map (`vox.py`: `SKULL_D`, `SKULL_V`, `KO`). Thicknesses in front of the face are preserved exactly, so swappable face layers never share a front plane:
  - 1/256 m: markings
  - 1/128 m: eyes, brows, mouth, age relief
  - 3/256 m and up: stubble and beards
  - further out: overlays, eyewear, masks
- **Surfaces.** Each part is meshed from the voxel volume as brick islands, and a bevel is baked into the mesh.
  - Large parts get soft, rounded bevels (skull 16 mm, three segments; helmets 13 mm).
  - The voxel read comes from the stepped hair clumps (about two-voxel strands, some lifted half a voxel), the silhouettes and the chunky details, not from a per-voxel grid.
- **Materials.** Exactly the 10 character slots, named `crew.<slot>`. Skin, hair and eye colours, themes and player colours are slot values.
  - Face nodes use `emit` for the soft eye catchlights and the teeth. The catalog gives `faceEmitStrength`.
  - Face nodes use `accent` for the painted blush, which is skin blended toward `blush.hex`.
  - Brows are the hair colour × `BROW_SHADE`.

## Runtime contract

- `resolveHeadLoadout(loadout, expression, theme)` returns the GLB nodes to show, each with its slot values.
- `validateHeadLoadout` enforces:
  - layer conflicts between accessories, helmets and masks (`ears` covers `ear.L`/`ear.R`);
  - detail zones and the `maxDetails` limit;
  - visors only on helmets that list them;
  - masks only with no helmet or an open-face helmet.
- **Hair variant.** The most restrictive worn item decides it: `full` < `cap` (hats sit from design z 9.5) < `fringe` (hoods, open helmets) < `hidden` (closed helmets).
- **Hides.** `hides` removes the mouth and/or facial hair nodes, for example under masks and closed helmets.
- **Expressions.** `expressionNodes(baseFace, expression)` gives the three face nodes. `expressionForAnimation(animation)` maps the spec animation names to expressions. `blink` holds the idle blink timing.
- Colour fields accept a palette id or any `#rrggbb`. Cyber eyes are emissive.

These cosmetics grant no inventory item, stat or gameplay capability. Helmets, visors and masks are the visual side of equipment. Equipment authority stays with the inventory contracts.

## Known gaps

- There is no skinned or `crew_rig` export yet: parts are rigid in head space, waiting on CHAR-BODY `spec_version: 2`.
- Expression switching is node visibility; there are no blend shapes.
- `hair.glb` is large (~11 MB uncompressed). Compressing it or merging islands per hair variant is a follow-up.
- The art is iterating against owner feedback: no visible block grid, alive expressions. Progress evidence is in `/root/sidereal-progress/char-heads/`.
