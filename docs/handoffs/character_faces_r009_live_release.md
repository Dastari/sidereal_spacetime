# Character heads, hair and faces r009

Status: r009 character models, cosmetic controls and native-ship backpack/drop fixes are live. Normal-game cosmetic save/reload and recovered/fresh ground drop/pickup reviews passed. New r009 final art approval remains pending. Existing owner approvals of r008 character/armor and r003 paired equipment are preserved.

The owner requested bright/neon hair colours and finer reference-led faces and hair, using `reference/art/characters-facial-assets.png`. The live controls remain in **Escape → Crew**. The equipment window has no duplicate body/hair selectors. All new settings are cosmetic and use the existing server-validated character appearance row.

## Delivered scope

Both native heads have stepped cheek/jaw planes, shallow noses, ears and seven alpha facial texture layers. The female upper head is about2% narrower and its lower jaw6% narrower than the male head. Below-neck geometry, all90 inventory equipment definitions/components, the16-bone shared rig/rest/binds and all12 original animation clips are preserved. Modesty garments remain part of the bases. This revision does not replace the approved armor or handheld weapons.

All eight existing styles were rebuilt in Blender with finer directional stepped locks: swept, cropped, crest, scientist, bob, ponytail, bun and braids. There are32 distinct hair-colour swatches, eight eye colours, eight expressions, ten face-detail choices, eight facial-hair choices and four age settings. Young/adult currently share clean skin; mature/elder add lines. Existing arbitrary valid hex colours remain supported. Hair is dyed albedo with authored light/dark surface roles; no extra hair lights were added.

The new facial sheet has155 exact indexed entries and eleven study queues. This pass covers the existing hairstyle roster and the implemented face layers, not every one of the sheet's26 hairstyle silhouettes or its separate glasses/headset/accessory designs. Future agents start at [the facial index](../../assets/art-library/FACIAL_REFERENCE_INDEX.md), [the component ledger](../../assets/art-library/character-components/INDEX.md), and [the independent A–G review](character_faces_r009_reference_review.md).

## Exact native delivery

Directory: `assets/art-library/designs/crew.base-and-outfits/revisions/r009/final-delivery/`.

- `blender-source.blend`: `d48a56102afb03cbc9b7fb1990054f28f9b1bc808d3f26c98cb6a8d4f4d48334`.
- `modular-crew.glb`: `7c7de06aec3e9482d786fb72723ff36675c170cf94b0fc38046fa806de64f89a`.
- Eleven GLBs: combined, two bases and eight hair components. Ten provenance-bound preview PNGs accompany their installed counterparts.
- `final-validation.json`:169 native/export checks pass. `hair-topology-validation.json`: all eight native and actual exported hair surfaces are closed, consistently wound and manifold, without collapsed triangles.
- `export-factor-record.json`: three existing native Multiply factors are encoded in glTF baseColorFactor because Blender's exporter omits that constant. No pixel, UV, geometry, weight or animation edits occur in this packing step.

A–G sources, failed captures and review records are retained. E removed visible intersecting crown slots with exact mesh unions. F repaired degenerate Boolean junctions; G removed one cropped-style dangling triangular fin only2.31µm high. Seven other F surfaces/standalone GLBs were retained exactly and cropped bounds were unchanged. There was no voxel resampling or smoothing of the authored hair surfaces.

Native protected geometry is unchanged. Joined GLB exports introduce at most0.000000123104m position drift and0.000189133 normal-vector delta in protected geometry; validators explicitly bound these floating-point export differences. They do not claim byte-identical exported vertices. The bundle contains164,094 triangles versus132,832 previously and18,026,492 bytes versus14,775,768 previously. It bundles all styles, while a character displays only its selected style; these are asset-cost measurements, not a measured frame-rate claim.

Historical A–E capture records incorrectly labelled Cycles24 samples; the saved recipes/scenes used32. Those original records are preserved with this correction. G's first front cropped-hair PNG was blank; the corrected exact-source capture and provenance are retained alongside it.

## Runtime and authority

The seven embedded1024×64 atlases have16 cells of64×64 pixels. Native UVs cover one cell. Each independently selected layer owns a texture wrapper and offsets U by optionIndex/16; it never rescales UVs or changes another character's material. Iris, brows and facial hair accept their documented colour factors. Disposal restores/releases per-character wrappers. See [runtime contract and tests](character_face_r009_runtime.md) and [authoring contract](../character_component_authoring.md).

The first isolated appearance-only world candidate `62453c2f…` passed the full managed persistence smoke against its exact module, including actual saves/reconnects and invalid choices. It was not published. The live server subsequently advanced to accepted collision world `81f5582a…`; the final appearance/backpack release must preserve that newer authority and any later accepted changes. See [appearance authority evidence](character_faces_r009_authority.md).

Publication uses the standing owner authorization and creates no backup or database restart. Publication permission is separate from new r009 final artistic sign-off. Exact initial activation and browser evidence follow.


## Initial normal publication and browser evidence — 2026-09-10

Client `e1e51225f821716f3560986678aa0f4c9bd43339a292b8c5dca0b8c38c35105d` and world `fdd790fdee4a6059c33a2b0273fa0228ac5142df1003611cf14de4cb2bc5c49a` were initially activated at https://sidereal.dastari.net/; the final successor below supersedes them. The module preserves accepted collision baseline81f. Public entry `index-xujd2v9E.js` and the actual HTTP r009 GLB were fetched and hashed after activation. The GLB is the exact7c7de06a native delivery above. No backup, reset or database restart was performed.

Publication conservation passed with no differences: all27 character and27 ship UUIDs,709 items,195 containers,19 inventory states,95 hotbar rows,314 inventory receipts,4 appearance rows,107 appearance receipts,49 storage bindings,403 item memberships,84 container scopes and6 uniform-issue rows were preserved. Inventory/cosmetic/receipt rows were compared exactly; active motion was not frozen. Counts are the publication checkpoint, before subsequent dedicated-account browser interactions.

Exact isolated release `npm run check` passed1,291 tests in208 files, typechecking and77 document checks. `npm run build`, `npm run art:check` and the full managed fresh authority smoke passed. Separate real-database occupied backpack swaps, nested fuel, replay, foreign denial and atomic full-grid rejection passed against exactfdd bytes. No fixture code is in the public module. A read-only shared-tree aggregate encountered an unrelated unshipped AA test failure in `packages/render/src/antialiasing-pipeline.test.ts:147` (expected at most4 camera postprocesses, observed8); the isolated release excludes that external work and passes its complete checks.

The dedicated public review account used the normal Dastari login and ordinary menu controls. **Escape → Crew** shows all32 hair colors; actual pointer selections changed the character to female, freckles and Hot pink. The server accepted appearance revision10, and a normal page reload showed those same three selections. The actual normal-game portrait rendered the new head/hair/face layers with the existing paired rifle and backpack. The independent Astra visual review passes this delivered scope, while retaining the style and pose limitations.

Evidence: [public browser record](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/live-release-20260910/initial-public-browser-review.json), [Crew menu](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/live-release-20260910/crew-controls.jpg), [ready paper doll](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/live-release-20260910/character-neon-female-ready.jpg), and [independent review](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/live-release-20260910/independent-live-review.json). Captures use the actual public NVIDIA hardware browser; its intermittent RAF stall required explicitly stepping the real registered render callback. The initial pre-readiness blank portrait is retained and superseded by the ready capture. These stills are not uninterrupted gameplay/FPS evidence.

The same normal review caught an existing integration gap: `App.tsx` suppressed all ground visuals during an active native construction visit. A normal Drop was accepted and preserved the backpack on the server, but no nameplate appeared. The additive successor below corrects the authority qualification and client projection. This did not affect the completed r009 cosmetic save or installed asset bytes.

## Final native-ground successor — live 2026-09-10

Current matched public client is `b3d75db50249b68bd4d954bb8ec61cc4ac3fed898801e410f26fc9b36f8aa45e`, entry `index-CZd2qQsN.js`; world is `8afe80944ba6aaf47f997f8b1de2736d2b88568c1f3cf44753a54ecb82f9fe9a`. Publication preserved the database identity and all captured inventory/appearance rows and character/ship UUIDs. No backup, reset or database restart occurred. Clients should refresh once for the additive ground-view fields.

The client includes all 35 graphics changes from the separately published `0dfa23b8` combined release. Independent review verified all 1,249 runtime art assets unchanged, including the exact r009 GLB and paired r003 equipment. Future AA/uniform/cargo work was excluded. Full build, typecheck, 1,339 tests in 219 files, art checks and 77 document checks pass. The docs gate initially lacked a linked historical evidence directory in the isolated checkout; copying the actual published evidence resolved it without code changes. Exact 8afe fresh-database smoke passes native ground privacy/reach, direct equip with full pockets, replay and nested contents.

Normal public browser review recovered the previously invisible **FIELD BACKPACK** at the server-supported 0.1875 m native floor height. Primary click equipped it directly. A fresh equipment-menu drop wrote the qualified instance/deck/height binding, immediately showed its uppercase nameplate, and ground-menu **Equip backpack** equipped it again. The actual server retained all seven item UUIDs, all six other item rows, both nested container rows, 2 L fuel and the hotbar; revisions advanced 46→49. Empty ground wrappers were removed by successful pickup. Final capture shows the original backpack Tetris contents restored.

Evidence: [final public receipt](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/live-release-20260910/native-public-browser-review.json), [recovered drop](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/live-release-20260910/preserved-ground-backpack.jpg), [fresh ground equip menu](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/live-release-20260910/native-ground-equip-menu.jpg), and [equipped backpack contents](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/live-release-20260910/backpack-equipped-after-pickup.jpg). The receipt hashes release validation, conservation, independent source/artifact review and actual isolated smoke evidence.

The hardware browser intermittently stalled RAF and cached shader compilation. A real viewport resize restored shader completion and the loading gate cleared naturally; readiness was not forced. Captures include explicitly stepped real render callbacks. This is bounded real UI/still evidence, not continuous gameplay or performance acceptance. Actual Sign out returned the welcome page with zero canvases; hardware tab_7 was then blanked. Other sessions and the external software-GPU owner were untouched. Historical ambiguous native drops outside the qualified Wayfarer exception and ground relocation after structural refits remain separate work; see [ground authority details](backpack_pickup_swap_r009.md).
