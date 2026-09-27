# Character face r009 runtime integration

Status: implemented in the shared working tree; native r009 candidate, browser acceptance and publication remain coordinated by the main character agent. No art revision is signed off by this handoff.

## Cosmetic contract

`packages/content/src/character-face-options.ts` is the ordered atlas and picker contract, re-exported by `@sidereal/content/appearance`. The existing server appearance validator receives these allowlists through `packages/content/src/appearance.ts`; the persisted document is still character-owned JSON, and an old empty `{}` stays valid.

| Key | Ordered choices | Legacy render default |
| --- | --- | --- |
| `eyes` | Any six-digit RGB hex; eight named picker presets | `#754c2b` |
| `expression` | neutral, happy, stern, sad, surprised, wink, grin, determined | neutral (tile 0) |
| `faceDetail` | none, freckles, scar, scratch, tattoo, bandage, dirt, warpaint, cyber, birthmark | none (tile 0) |
| `facialHair` | none, stubble, short, full, goatee, moustache, handlebar, sideburns | none (tile 0) |
| `faceAge` | young, adult, mature, elder | adult (tile 1) |

These fields grant no inventory equipment, stats or gameplay capability. Hair has 32 named natural/dyed presets, retaining the original first eight swatch IDs; eyes have brown, blue, green, hazel, grey, amber, red and cyan presets. Both body types can select every cosmetic option.

## Native material interface

`crew/face-materials.ts` is created once for each loaded character container and applied after the existing shared skin/clothing tint pass. `crew.face.*` is explicitly excluded from that generic pass.

| Material | Atlas selector | Runtime color |
| --- | --- | --- |
| `crew.face.eyes` | expression | Authored ink and highlights |
| `crew.face.iris` | expression | Selected eye color |
| `crew.face.brows` | expression | Selected hair color × 0.5 in linear space |
| `crew.face.mouth` | expression | Authored |
| `crew.face.detail` | faceDetail | Authored |
| `crew.face.facialHair` | facialHair | Selected hair color × 0.72 in linear space |
| `crew.face.age` | faceAge | Authored |

Each albedo PNG has 16 columns and one row; authored mesh UVs already span the first cell (`U=0..1/16`). Runtime changes only `uOffset = tileIndex / 16`, preserving UV scale, vertical orientation, alpha, sampling and other authored texture/material settings. Blender numeric material suffixes are accepted. Different atlas roles get separate Babylon texture wrappers, even if glTF shares one source texture; immutable image data can remain shared. Repeated customization allocates no further textures. Wrapper disposal restores source references before the owning asset container is disposed. Legacy characters with no face atlas remain supported.

`crew.hair.modular` receives the selected linear hair color, `crew.hair.shadow` receives × 0.58, and `crew.hair.highlight` receives an 18% blend toward white. The native candidate must use matching factors for representative Blender versus in-game captures. The actual tintable atlas pixels should be neutral so hue selection remains predictable.

The existing `base-male-core` / `base-female-core` component visibility and head rig interface stay unchanged. The parent agent owns native geometry, face weights, editable texture/source preservation and candidate acceptance.

## UI and outfit changes

All controls remain in Escape → Crew. The existing scroll region uses the returned content height; swatches have named accessibility labels and face selectors cycle through every accepted option. No face controls were added to equipment slots.

`mergeCrewAppearance` preserves explicitly selected body type, hair style, skin, hair, eyes, expression, face detail, facial hair and age when a new uniform resets its outfit slots. Both the render character and the CanvasUI uniform callback use this function. Unchosen fields may still use the uniform's historical preset colors/styles.

Narrow shared-file edits:

- `packages/render/src/crew/index.ts`: create/apply/dispose face materials; use appearance merge; exclude face roles from generic tinting.
- `packages/canvas-ui/src/index.ts`: import/use appearance merge in the uniform preset callback only. Existing F3 and combat cursor edits are preserved.

## Validation

Passed `npm run typecheck` and 41 focused tests across:

- `packages/render/src/crew/face-materials.test.ts`: real Babylon UV matrices, independent role/character offsets, immutable authored ink/alpha, wrapper cleanup, hair shading, legacy defaults and uniform identity preservation.
- `packages/render/src/crew/crew.test.ts`: legacy loaded crew behavior, animation and disposal regressions.
- `packages/canvas-ui/src/appearance-controls.test.ts`: every face option is reachable, named color swatches, and non-overlapping controls at 280/430/640 pixels.
- `packages/canvas-ui/src/inventory-windows.test.ts`: equipment/inventory and prior Crew color control behavior.
- `packages/sim/src/appearance.test.ts`: existing appearance validation compatibility.

These are CPU/NullEngine behavior checks; they are not pixel rendering or final artistic acceptance. The main agent coordinates the actual r009 loaded-asset review, browser evidence, full aggregate checks and release. The authority specialist adds separate actual reducer/view tests for the new fields.
