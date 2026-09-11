# Planet LOD authoring contract

Status: Required for new and revised planet integrations
Owner: Sidereal owner, 2026-09-11


Every new or revised planet renderer must account for transitions in seated Flight and Map → Observe, including a sudden jump to a distant body's close view. Follow R15 in [the rendering performance plan](rendering_performance_plan.md). LOD selection follows the render camera's projected body size, independently of ship position. Preserve authored surfaces, materials, body identity and authority state.

Generate terrain/composition, optical attributes and weather buffers in the planet worker. Build ahead before thresholds; retain the visible level until its replacement is uploaded and precompiled, then swap synchronously within one frame. Retain lower LOD nodes for revisits and share compatible materials/textures per body. Do not share distinct per-level/per-placement material state accidentally. Yield GPU preparation between frames, reject results for removed/revised bodies and release body-owned resources on disposal. Fixed-detail renderers must not rebuild merely because a LOD threshold changes.

Add NullEngine tests for swap ordering, retained levels, material/attribute preservation and disposal. Review approach, retreat and Map → Observe on real hardware with F3 open, recording build/pending counters and frame intervals; require no missing planet and no transition frame above20ms under the R15 acceptance setup. Save screenshots and JSON, including failures. Still images and geometry budgets alone do not establish transition performance; mark missing hardware verification explicitly. This requirement does not authorize visual redesign or waive art approval.
