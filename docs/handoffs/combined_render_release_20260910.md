# Combined graphics client release — 2026-09-10

Status: live; exact public browser and byte checks passed. This client update preserves the independently published r009 character/backpack source and its accepted authority. No database restart, backup, world publication or art replacement occurred.

## Exact release

- Public client: `0dfa23b86f777d56e34c4e7cc46caae6aeab4e43bd20b2fbfe59cc8b46970db9`.
- Entry: `/assets/index-BpDB6_we.js`, SHA256 `5cf41c79fe34f8d751678af9cf602fff7216b61274d0dd12a26e093d4164faec`.
- Unchanged actual world: `fdd790fdee4a6059c33a2b0273fa0228ac5142df1003611cf14de4cb2bc5c49a`.
- Unchanged delivery: `520de12b8dada34e0016524008d5e098af7b5cd1ac42a89f7875024898e5678d`.
- Previous public client: `e1e51225f821716f3560986678aa0f4c9bd43339a292b8c5dca0b8c38c35105d`.

The new isolated source is `.runtime/release-checkouts/combined-faces-render-20260910`. It copies the exact e1 source and adds wall/cabin6fdb5742, remote d4737cb3/fcd44a79, portrait ac8d85ed, AA e8a95e8b/05c9a505/7cf3d131/0848c60a/b62909c4 and guarded skin-history3fb16666. An unrelated dashboard test from the mixed AA commit was excluded. The Graphics menu merge preserves the external dynamic Crew controls. Source/input manifests, artifacts, logs and guarded activation evidence are under `.runtime/releases/combined-faces-render-20260910/`.

The former13990 candidate was deliberately held when the character/backpack owner advanced the public source. Their e1/fdd pair was verified live before this forward integration. All earlier artifacts remain preserved. No pending cargo authority, proposed wall assets, editor camera changes or later uniform-bone AA work were included.

## Behavior and acceptance

Normal Escape → Graphics exposes Off, MSAA, FXAA, TAA, MSAA + FXAA and SSAA / FSAA. The default is4× MSAA. Actual game review verified all six selected modes against their live postprocess/sample/target state with zero GL errors. SSAA rendered1920×1200 before downsampling to the960×600 review viewport. Reset restored4× MSAA; selecting FXAA and reloading restored both the setting and its actual pass.

TAA uses temporal motion history. This release conservatively resets history while visible texture-backed character skin changes because the installed path lacks bone motion vectors; the Graphics status explains that condition. A separately qualified uniform-bone enhancement is a follow-up, not part of this release.

The Character window showed a neutral “Loading character…” placeholder on its first cold frame, then the actual customized r009 character and held weapon. The engineering preset portrait is no longer substituted. Remote ships retain opaque tinted native windows and batched external surfaces; local windows retain their existing materials. Deck orbit retains walls and Flight hides semantic cabin floors/equipment/cargo. The controlled remote scene measured673→80 draws for two stock ships; that result is not a full-game or hardware FPS claim.

Evidence in `output/playwright/combined-render-review/` includes `graphics.png`, `modes.json`, `reset-portrait.json`, `portrait-cold.png`, `portrait-complete.png`, `reload.json`, `public-reload.json` and `public-complete.png`. The final unmodified public page loaded the exact entry with2,589 meshes, ready scene and persisted FXAA; its complete native game screenshot was viewed. Actual Account → Sign out, blank navigation and browser close completed.

The review used a960×600 SwiftShader browser with bounded/paused presentation frames. A Playwright redirected-callback response initially mixed public HTML with routed candidate assets; completing genuine public SSO before candidate routing resolved it without application changes. Long review sessions logged movement-control ownership rejection and reconnect events; this is not a zero-console-error or authentication endurance claim. All final six-mode GPU checks returned GL error0. No gameplay authority was changed by the graphics controls.

## Gates and delivery

Isolated typecheck,1,317 tests and77 document checks passed. Full `npm run build` completed world build/generation plus independent client/dashboard builds; native art validation passed. The final skin guard then passed focused tests, typecheck and a fresh client build. The client source's full build reproduces the external e1 client-source world digest c8b6e62f, because that source deliberately retains its published HEAVY_WEAPON presentation profile. It was never published: the separately accepted authority remains exact fdd, and generated contracts are unchanged.

Managed activation required the expected live e1 client and staged0dfa artifact. Actual world fdd and delivery520de were checked before and after. Public entry bytes match the pin. The native r009 GLB returned the same decoded SHA256 under identity and gzip, with correct `model/gltf-binary` and `Vary: Accept-Encoding`;18,026,492 identity bytes became2,163,188 compressed bytes. No new art approval is implied.
