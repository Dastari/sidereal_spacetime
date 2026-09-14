# System menu and local graphics preferences

Implemented UI/module; root owns full-App wiring and combined release. Escape retains existing modal behavior and opens the System menu when no closer inventory/object window is active. Vertical side tabs include Display, Graphics, Vessel, Crew and Controls. Existing menu movement, resize, scroll and keyboard/pointer focus behavior remain.

Graphics provides Brightness50–150%, Contrast50–150%, Gamma50–200% and Saturation0–200%, default100% each. Reset returns all four to100%. One Babylon PostProcess performs display-space correction after the existing scene image processing: luminance-based saturation, brightness multiplier, midpoint contrast, then inverse-gamma power. This does not change authored materials, exposure/tone mapping, sun/planet parameters or authority. Existing CanvasUI is composited after camera postprocessing, keeping menus readable while tuning the world image.

Neutral defaults have no active adjustment pass and preserve the image exactly. Non-neutral settings create at most one reusable pass, attach only after shader readiness, and update uniforms without per-slider allocations. Reset detaches it; world disposal releases it. Safe local persistence uses `sidereal.graphics.v1`; malformed/nonfinite/out-of-range values are ignored or clamped, and blocked storage falls back to session-only behavior. These are device preferences, not account settings.

## Root integration contract

`createGraphicsSettings(scene)` in `packages/render/src/graphics-settings.ts` should be created after the active camera exists. It returns `snapshot()`, `set(Partial<GraphicsSettings>)`, `reset()` and `dispose()`. Set/reset are closure-safe callbacks. World/App should pass snapshots through `GameUIState.graphics`, and actions through `GameUIActions.graphics` and `graphicsReset`. Call dispose with world teardown. This task did not edit the shared renderer entrypoint or App.

The top HUD now uses a small vessel-name panel at upper left and independent action buttons aligned upper right. Narrow views wrap buttons below the vessel panel; navigation/status panels account for the resulting header height. The full-width connecting panel is removed. The Combat label is shortened to preserve readability; the existing V binding remains unchanged.

## Validation

Six focused transfer/persistence/validation/layout tests initially passed. The actual isolated browser fixture loads the real CanvasUI and Babylon graphics module on the required tailnet game host. Desktop1100×760 and compact540×760 views were visually inspected. Actual pointer input changed brightness1→1.38; a world-background pixel changed[51,89,128,255]→[70,123,177,255], with one active adjustment pass and GL error0. Clicking Reset restored the exact original pixel and zero active passes. Gamma/saturation/contrast transfer behavior is covered by pure tests; this is not a full-App or hardware FPS benchmark.

Evidence: `output/playwright/graphics-menu-desktop.png`, `graphics-menu-compact.png`, `graphics-menu-adjusted.png`, `graphics-hud-desktop.png`, `graphics-hud-compact.png`. Reproducible fixture and interaction scripts are `.runtime/graphics-menu-review.js`, `.runtime/graphics-menu-check.js`, `.runtime/graphics-pixel-check.js`; initial direct dependency-import failure is preserved in logs, then resolved with an isolated esbuild fixture bundle. The browser was closed after review. Root performs final full check/build and live wiring acceptance; concurrent unrelated dashboard syntax errors temporarily blocked an earlier full typecheck.
