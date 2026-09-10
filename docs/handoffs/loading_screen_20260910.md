# Game loading barrier

Status: implemented and accepted in the isolated combined candidate; coordinated public activation is in progress. Final public acceptance is recorded separately in the release ledger.

The game surface stays rendered underneath an inert, opaque loading screen until the accepted scene state, authored ship, environment, crew, initial held equipment, shared exterior prototype and Babylon scene readiness have all completed and a frame has rendered. Actual loading phases replace a fabricated percentage. Failure keeps the cover in place with retry/sign-out controls. Camera, selection, movement, combat and window-level Canvas UI shortcuts are blocked underneath it. Reduced-motion styling uses a static indicator.

The scene key uses authenticated account identity and accepted instance/document/visit/attachment identity. Routine socket replacement during token renewal must not rebuild geometry or redownload the ship. The shared presentation bridge continues selecting the current connection's store. Grant/document/visit changes still invalidate the previous scene; this does not cache private geometry across lost access or replace authoritative transforms.

Initial accepted camera state is applied before the first visible frame, preventing the former brief flight-to-interior transition while boarding. Mounted fuel visuals and ship refit remain separately accepted, hash-checked attachments; loading does not initiate a refit.

Validation: the isolated candidate passes TypeScript checking, 1,160 tests across 200 suites, app builds, art checks and the exact retained world smoke. Initial browser retries found limitations in the manual RAF review harness and a route-delay callback using unavailable sandbox `setTimeout`; these were corrected in the harness. They are not evidence of a production HUD texture defect.

The named `refit-browser-review` session reviewed immutable files from source `f29ff4a7` plus approved data-only `aada6bcc` and corrective `d1d716d1`. The latter stops hidden GPU submissions after initial asset failure and avoids duplicating the boarding error in the unrelated action-error popup. Review artifact SHA is `2aa4040804099f220953521474809a93796b27aff4d8114833d0ad7dffe567a4`, entry `/assets/index-9OO8MYiW.js`. It uses the isolated refit-upgrade database and HTTPS review callback; it is not the production-origin artifact.

Actual evidence in `output/playwright/refit-browser-review/`:

- `loading-finish.json` and `loading-screen.png`: a delayed shared-exterior manifest keeps the game surface inert and covered; the completed first frame releases it.
- `corrected-failure.json` / `corrected-load-failure.png`: deliberately aborting that required manifest shows the full failure cover, `aria-busy=false`, and retry/sign-out controls; underlying game input remains inert.
- `corrected-retry-final.json` / `corrected-retry-complete.png`: the real Retry button navigates and loads the exact corrected entry, with 3,209 meshes, Babylon readiness true, loading cover absent, game surface no longer inert and initial interior camera beta 0.9553166181. Both images were viewed. The first screenshot command timed out under software rendering; a subsequent paused-render capture succeeded. No programmatic click substituted for this corrected retry.
- `renewal-paused-control.json`: natural provider token renewal preserves the same scene object, leaves it ready/uncovered, and leaves the GLB request count at 106 before and after. Rendering was paused to isolate connection behavior from software-GPU stalls; private state and reducer permissions were unchanged.

The earlier sustained-software-rendering renewal experiment is retained in `renewal-render-stall.json` and the read-only diagnostic `trace-check.json`. Main-thread stalls delayed replacement admission past the old signed token expiry. Private views correctly emptied for about 207 ms; the scene was disposed and rebuilt after admission returned. The authority comparison found no durable record changes, including the existing visit, ship, appearance, 198 items and 36 containers across both fixtures. Do not reinterpret this as permission to retain private geometry after actual access withdrawal, or claim that recovery from expired authentication avoids a rebuild. Routine timely renewal and recovery from lost admission are different cases.

Playwright file fulfillment required a local-network permission on the review origin; otherwise Chromium blocked its WebSocket because of the fulfilled document's address-space classification. No production browser permission workaround or bundle change was installed. The software-GPU review timings are not representative user hardware performance measurements.

Initial resource loading can still be expensive. This screen does not claim to reduce download bytes or eliminate later loading of newly encountered assets. The next measured steps are in [the delivery audit](delivery_optimization_audit_20260910.md): compress GLB transfers while preserving decoded bytes, then reuse verified libraries and adopt versioned cache URLs. No unmeasured database retransmission or client FPS benefit is claimed.
