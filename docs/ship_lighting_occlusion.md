# Ship light occlusion

Status: Implemented; controlled occlusion, integrated ship and cache performance proofs passed
Date: 2026-09-08

The owner reported lighting through walls. The audit found separate direct-light and glow-mask causes. Room lights affected shared deck/wall batches while only the nearest two lights had shadows; bridge lighting had no shadow map. Cutaway also hid normal wall casters. Ordinary opaque ship walls were absent from the selected glow mask, so concealed emitters could bloom through them.

Room and bridge lights now retain seven bounded 256px spot shadow maps in both views, alongside the existing 512px exterior map. Receivers and occluders are selected independently. Structural shadow-only sibling meshes share immutable geometry but use separate opaque materials and a reserved render layer; visual cutaway does not remove physical wall occlusion. The actual visible ship meshes also contribute depth/black emission to the glow mask. This does not modify equipment models, authoritative collision or world state.

Cabin spot shadow near/far bounds are explicitly .05m and the light's 5–6m range. The prior implicit camera far plane could be 1,600m or more, turning .001 depth bias into a room-scale offset; a close-camera test with far=10,000m reproduced missing wall shadows. Camera zoom could additionally move the inherited near plane beyond the casters. Both bounds now remain independent of the camera.

The controlled browser comparison uses the actual lighting module, a matte deck and an authored-size partition hidden by presentation. With unbounded shadow depth, the pixel behind the partition stayed RGB(26,24,21) with shadows both on and off. Explicit light bounds reduced it to (9,8,7), while the lit side remained (165,152,134). The remaining direct contribution came from the old .1 shadow-darkness setting; cabin maps now use zero, with ambient illumination handled separately. Evidence: `output/playwright/ship-light-unshadowed-control.png` and `ship-light-bounded-depth.png`.

Unshadowed door accents are restricted to their room receivers and partition-visible actors. Empty receiver lists disable their lights, because Babylon otherwise treats an empty include-list as unrestricted. Disposed crew references are removed from light and shadow lists. Tests cover both camera modes, hidden occluders, independent receiver/caster sets, native equipment without legacy room batches, actor reload cleanup, eight eligible lights per mesh and invariant shadow depth bounds.

The initial correctness fix increased shadow work substantially: in the same real runtime scene, shadows raised draws from453 to2,255 and active indices from2.37million to13.4million. This explained a major contributor to the owner's reported170+ to70FPS regression without blaming the replacement equipment assets.

Spot shadow maps now cache static results and conservatively cull casters by local bounds, range and cone. The nearest two in-range actor maps refresh for animation; other maps invalidate on local placement, visibility/disposal or geometry changes. Retained cutaway proxies remain physical blockers. As a bounded shadow LOD, actors do not cast into every distant room light, while relevant static walls and equipment remain occluders.

The corrected actual frame-callback measurement is **876 draws and5.35million indices**, down from2,255/13.4million with the same models. After a .9-radian ship turn and render-only translation, cached and forcibly refreshed spot maps produced pixel-identical framebuffers. Seven spotlight textures plus the exterior map remain allocated; the optimization saves repeated rendering, not texture memory. Hardware FPS recovery is not claimed from SwiftShader measurements. The separate exterior nearest-sampled bevel shadow artifact remains open; rejected bias-only experiments are recorded in [the plastic material iteration](ship_plastic_iteration.md).

## Stationary receiver-list CPU correction

The installed Babylon Light implementation rescans all scene meshes when `includedOnlyMeshes`/`excludedMeshes` arrays are replaced, when included meshes are pushed, and even when `setEnabled` receives its unchanged value. The previous Deck update rebuilt those lists and reasserted enabled state every frame. A NullEngine probe of actual `_resyncMeshes` calls measured1090 rescans across ten unchanged Deck updates.

Receiver membership and enabled state are now assigned only when different. The same probe records zero rescans over ten stationary updates, while changing room still updates actual receiver membership and disposed actor references are removed. Eleven focused lighting/cache/cabin tests pass. This is a measured CPU-work reduction, not yet a measured user FPS improvement; ship wall shadows, nearest-room actor policy, cutaway proxies and supply/visibility behavior remain in place.

SceneInstrumentation's frame counter starts inside `scene.render` at `onBeforeAnimations`, so the main loop's lighting update and other presentation preparation were outside the earlier displayed scene CPU time. FPS frame duration also includes scheduling/presentation waits; its difference from scene CPU time is not itself a GPU timing measurement.
