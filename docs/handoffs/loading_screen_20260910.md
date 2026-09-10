# Game loading barrier

Status: implemented in the combined refit candidate; browser acceptance and publication pending.

The game surface stays rendered underneath an inert, opaque loading screen until the accepted scene state, authored ship, environment, crew, initial held equipment, shared exterior prototype and Babylon scene readiness have all completed and a frame has rendered. Actual loading phases replace a fabricated percentage. Failure keeps the cover in place with retry/sign-out controls. Camera, selection, movement, combat and window-level Canvas UI shortcuts are blocked underneath it. Reduced-motion styling uses a static indicator.

The scene key uses authenticated account identity and accepted instance/document/visit/attachment identity. Routine socket replacement during token renewal must not rebuild geometry or redownload the ship. The shared presentation bridge continues selecting the current connection's store. Grant/document/visit changes still invalidate the previous scene; this does not cache private geometry across lost access or replace authoritative transforms.

Initial accepted camera state is applied before the first visible frame, preventing the former brief flight-to-interior transition while boarding. Mounted fuel visuals and ship refit remain separately accepted, hash-checked attachments; loading does not initiate a refit.

Validation: TypeScript check and 13 focused refit/inspection/object/remote-ship tests passed. Initial browser retries found limitations in the manual RAF review harness and a route-delay callback using unavailable sandbox `setTimeout`; these were corrected in the harness. They are not evidence of a production HUD texture defect. Browser completion, failure, reload and token-renewal evidence must be appended before publication.

Initial resource loading can still be expensive. This screen does not claim to reduce download bytes or eliminate later loading of newly encountered assets. The next measured steps are in [the delivery audit](delivery_optimization_audit_20260910.md): compress GLB transfers while preserving decoded bytes, then reuse verified libraries and adopt versioned cache URLs. No unmeasured database retransmission or client FPS benefit is claimed.
