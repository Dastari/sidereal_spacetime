# Planet and character-preview flicker — 2026-09-15

Agent Mail identity: SageCanyon. Branch: fix/planet-preview-coordinate-state. Owner reports off-center planetary glow alternating sides in Observe, plus ship lighting and planetary geometry corruption while Character is open. Exact owner screenshots were inspected; no geometry/art redesign is involved.

## Causes and changes

Babylon9.25 keeps FloatingOriginCurrentScene and matrix-upload overrides process-wide. The production HUD paints onBeforeRender, and draws a separate-engine character scene inside that callback. Portrait scene.render replaced the main scene context without restoring it; disposing the portrait engine's last scene also resets matrix overrides globally. The portrait engine's default precision option additionally lowered precision for new matrices across engines.

A synchronous scene-coordinate-context scope now preserves/restores the caller's getter and eye mode in finally, including re-installing floating-origin uploads after nested disposal. Portrait construction/render/disposal use it; its engine retains high-precision matrices. No asynchronous context lease is held across await.

Shared planetary surface/effect shaders previously uploaded worldViewProjection. Babylon reconstructs the world transform by inverting the combined large-coordinate matrix before rebasing; this is numerically unstable. Separate world and viewProjection uniforms rebase directly. Atmosphere, stellar corona, distant stellar light and common sky/legacy surface bindings use the same corrected interface. PBR/native geometry, materials, camera behavior, asset hashes and LOD lifetimes remain unchanged.

## Validation

NullEngine reproductions fail before fixes: nested portrait leaves the main coordinate context undefined; old combined shader transforms shift the atmosphere center (including with high-precision matrices). After fixes, a40-position orbit at24.7Mm remains centered within0.0001 normalized screen units. Nested render and last-scene disposal/error restoration pass. Full TypeScript and289suites/1443tests pass,2skip. Full build passes. The full check still ends on inherited missing documentation links; no false green claim. Compatible release TypeScript/3regressions/client build also pass.

Production createWorld fixture, Dunes Observe plus actual createCharacterPreview inside onBeforeRender: saved closed/open screenshots show intact native geometry, centered effect and visible ready portrait. Initial browser dependency optimization produced504s and reloaded successfully; no repeated shader/runtime error was observed afterwards. Initial all-bodies-pending wait was too strict because an offscreen body remained pending; selected Dunes itself was visibly rendered. First closed screenshot uses1280x720 browser viewport over1574x907 rendering; open screenshot is1574x907. These are SwiftShader visual/count checks, not hardware performance acceptance. Evidence: output/playwright/render-plan/planet-preview-flicker/.

## Deployment

Renderer-only patch is staged in canonical development/Genesis source and the existing compatible client composition. Hash guards preserve the published client baseline and unrelated construction work; canonical atmosphere formatting is retained. No world or simulation source changed or was published. Public client activation result and PR URL are recorded at closeout.

Public client activated via managed SHA-guarded stage/activate:1ea3f5f74d3860bf3d0768462382401d4d1a22be0c277a1787ed78cf61149ae7, replacing28e7213e90582861829db00aef661158f0bb4563f9da240460a5c06807c94fe0. Public index bytes match the immutable release. Development/Genesis TypeScript passes. No authority publication. Deck portrait-open screenshot shows coherent geometry and lighting; software world draw counts remain1502Deck/437DunesObserve. The local review server later disconnected; the already-loaded browser still rendered the saved frame. New hardware timing/visual acceptance is unclaimed. Refresh an existing game tab to discard the old renderer state.
