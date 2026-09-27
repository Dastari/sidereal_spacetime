# Graphics local-light budget integration

Status: policy and existing light-owner adapters implemented and tested; final game/UI wiring pending integration owner.
Date: 2026-09-09
Owner: `/root/render_light_budget` for policy/tests and the explicitly delegated light-owner adapters; `/root/integration_continuation` for index, diagnostics and Graphics UI wiring.

This is the bounded performance foundation authorized alongside construction. It does not resume planet art, global post-processing or broad batching. Follow the scheduling/corrections at the beginning of [rendering performance plan](../rendering_performance_plan.md). Authentication/pose acceptance and the semantic multi-deck construction work retain priority.

## Delivered files and behavior

- `packages/render/src/local-light-budget.ts`: pure deterministic allocation plus an optional-storage lifecycle wrapper.
- `packages/render/src/local-light-budget.test.ts`: 15 focused behavior tests, including Babylon `NullEngine` light/shadow sinks and current cabin/equipment owner integration.
- `ship-lighting.ts`: `getLocalLightSources(allowed = true)` exposes cabin/door/bridge descriptors, separate desired eligibility, stable sinks, current-frame positions and shadow reactivation invalidation. Sun/fill remain outside allocation.
- `equipment-lighting.ts`: `getLocalLightSources(allowed = true)`, `setPowered(value)` and `setCabinVisible(value)` keep intended fixture state separate from budget output.
- `cabin-visibility.ts` and `object-presentation.ts`: route desired state through those setters. Legacy fixture fallbacks remain for older callers without the new controller methods.

`installed-equipment.ts` already returns `placement.lighting`, so it needs no additional edit. The first descriptor call hands final light enable ownership to the budget; call `budget.update` before rendering that frame. Descriptors currently force the parent world matrix once per descriptor-owner call so moving parents/origin changes cannot leave a stale position; this is a correctness-first foundation, not the later transform-freezing optimization. Assign `root.metadata.shipId` before `createShipLighting` for multi-ship instances; current lab falls back to its single root name. Placed equipment already has per-instance `partId` metadata.

Graphics label: **Local lights**. Choices: **Off / 4 / 8 / 16 / 32 / All**. Initial default **All** preserves existing appearance while measurements establish a recommended default. This caps eligible cabin and equipment lights across the presented scene. Global sun/fill and planet lights are deliberately outside this count. Explain that distinction in a short UI hint.

Three limits are different:

| Limit | Meaning | This change |
| --- | --- | --- |
| Local-light budget | Maximum selected local light objects enabled for rendering | User setting implemented by policy; wiring pending |
| Per-material `maxSimultaneousLights` | Maximum light contributions compiled/selected for one material | Unchanged; do not imply this caps scene/shadow work |
| Local-shadow budget | Maximum selected shadow-dependent local lights | Optional separate policy input, currently preserve authored capacity |

Rank is `(1 + priority) / (1 + distance / range)`, with 15% incumbent preference. Priority defaults to 0 and is bounded to 4; use it only for explicit task/selection relevance, not a permanent fixture/material hierarchy. Stable placed-object plus socket IDs break ties. Range-normalized distance favors lights capable of affecting the focus. This is a stable artistic selection approximation, not an occlusion solver. Existing receiver memberships and partition shadows remain responsible for light containment.

Setting storage uses `sidereal.local-light-budget.v1`, containing a number or `"all"`. Missing/corrupt/unavailable storage safely preserves All/session behavior. No migrations of character, inventory, equipment power or account rows occur. `setLimit` immediately reapplies the last frame; `update` must still receive fresh eligibility before each scene render. `reset` restores All; F3 Reset visuals must not erase the saved Graphics setting. `dispose` suppresses managed sinks and cannot re-enable anything later.

## Shared integration contract

1. Create one budget per game scene with guarded local storage, separate from `createGraphicsSettings`. Do not add a non-neutral light count to the brightness/contrast/gamma/saturation neutral-pass test. Changing only Local lights must leave `graphics-display-adjustments` detached when color settings are neutral.
2. Use the implemented `lighting.getLocalLightSources(allowed)` and `placement.lighting.getLocalLightSources(allowed)` APIs. They include room spots, door accents, bridge spill and authored equipment fixtures, preserving stable IDs/sinks and excluding disposed sources. Keep sun/fill and planet lights out; do not discover light roles with another name regex.
3. Compose source eligibility from original enabled configuration, scene lighting/debug flags, cutaway/cabin visibility, actual parent visibility, powered state, and nonempty permitted receivers. Do not use last frame's budget-suppressed `light.isEnabled()` as source eligibility: that permanently latches disabled fixtures. Avoid letting an empty `includedOnlyMeshes` array turn an otherwise ineligible light into an unrestricted one.
4. The current owners in `ship-lighting.ts` (`syncReceiverLights`), `cabin-visibility.ts` and `object-presentation.ts` have now been adapted: after descriptor activation they retain intended state and no longer overwrite final budget suppression. Run the final budget after their desired-state work and the F3 layer. Exactly one final renderer decision must reach each light before `scene.render()`. The policy reapplies every frame deliberately; adapters skip Babylon setters when the value is already correct.
5. Feed positions and focus in one consistent frame. For current Wayfarer, all cabin/equipment sources can use ship-local renderer coordinates and the actor/camera target converted into that same frame. For multiple ships, use the current camera-relative renderer frame for all sources and focus. Never compare metadata source XYZ with render X/Y/-Z or mix a parent-local light position with a world-space camera. Recompute after ship motion and origin shifts; the test proves shared translation invariance.
6. Normal shadow-dependent room/bridge lights set `requiresShadow: true`, with `shadowEligible` representing a usable authored map/caster arrangement. An exhausted local-shadow budget suppresses the **whole light**, not just its shadow, to avoid shining through walls. Existing scene-level F3 **Shadows Off** is an intentional diagnostic override and must retain its current meaning: leave quality allocation intact, then suppress shadow rendering through the scene/debug gate. Do not feed that diagnostic flag back as unavailable authored shadow capacity and unexpectedly switch off room lighting. F3 **Lighting Off** does suppress local source eligibility. F3 hidden equipment never gets resurrected by a larger Graphics cap.
7. A Babylon sink sets `light.setEnabled(decision.enabled)` and `light.shadowEnabled = decision.shadowEnabled` with disposed/state guards. Keep existing scene-level F3 overrides in force. Maps can remain allocated for reversible settings; avoid refreshing/computing suppressed maps unnecessarily. On light reactivation, invalidate any cached map whose geometry/actor state changed while it was suppressed; do not show stale occlusion. The current fixed-room shadow ownership/caches must be preserved.
8. Dispose budget before its light owners or guard all sinks against disposed lights. When replacing a light with the same stable ID, the old sink is disabled before the replacement is applied. Callbacks must remain stable across ordinary frames, otherwise the wrapper correctly treats them as replacements and incurs needless disable/enable transitions.

Example shape (integration pseudocode; shared files intentionally untouched):

```ts
const budget = createLocalLightBudget(safeLocalStorage);
// After power, cutaway, debug and transform decisions; before scene.render():
budget.update([
  ...lighting.getLocalLightSources(lightingDebugEnabled),
  ...placements.flatMap(p => p.lighting.getLocalLightSources(lightingDebugEnabled)),
], { focus: focusInCurrentRenderFrame });
```

Do not infer source IDs, power, receiver permissions, room labels, or physical functionality from geometry batching. The forthcoming Shipyard construction system needs independent placed-object identity and explicit semantic roles even when visuals share GPU geometry.

## Diagnostics and actual acceptance still required

Show configured local limit, eligible local source count, selected local lights, and selected local shadow lights. These policy counts are distinct from allocated resources and actual whole-scene enabled lights. `diagnostics.ts` currently counts an enabled light with a shadow generator as an eligible map without checking `light.shadowEnabled`; update that predicate when wiring this setting so F3 remains truthful. Account separately for global `scene.lightsEnabled` / `scene.shadowsEnabled`. Babylon 9.25.0's installed `shadowGeneratorSceneComponent.pure.js` gathers maps only for enabled lights with `shadowEnabled`, which is why lowering the budget removes eligible shadow passes rather than merely reducing emissive intensity.

Integration owner must review real client Graphics and F3 together at All/8/4/Off: preserve UI reset/persistence and neutral postprocess detachment; room/door/bridge/fixture visibility; equipment power; hidden equipment; Deck/Flight/Observe; moving actor and ship; camera-origin shifts; multiple visible ships once supported; reconnect/scene disposal; and reactivated shadow correctness. Capture settled Deck/Flight evidence at the same viewport with nothing selected. Use actual app state, not a mock scene, for installed acceptance.

Record owner-hardware frame/GPU/update CPU, draw calls, active meshes, eligible/allocated lights and shadows, and postprocess chain before/after. SwiftShader screenshots and NullEngine tests establish behavior, **not a hardware FPS gain**. Neither plan performance targets nor a lower cap prove the source of the historic Deck/Flight gap.

## Validation so far

- Initial `npx vitest run packages/render/src/local-light-budget.test.ts packages/render/src/graphics-settings.test.ts`: **15 tests passed** (12 initial budget + 3 existing Graphics), 2026-09-09.
- Adapter follow-up: budget + ship-lighting + ship-shadow-cache + cabin-visibility + equipment-lighting + object-presentation suites: **32 tests passed**, plus `npm run typecheck`, 2026-09-09. New tests cover no per-frame suppression churn, power/cutaway/debug composition, moved parent positions, stable sinks and cached shadow reactivation.
- `npm run check`: **passed**, 83 test files / 315 tests plus typecheck and 71 document/provenance checks, 2026-09-09.
- Adapter follow-up combined `npm run check`: **passed**, 85 test files / 328 tests plus typecheck and 71 document/provenance checks, 2026-09-09. The larger total includes concurrently integrated tests from other owners.
- Shared `npm run build` reserved to integration owner because aggregate build regenerates shared network bindings. This isolated handoff is not an installed release or a completed performance-plan phase.
- No browser/GPU slot used; integration owner was already performing prerequisite pose/Graphics review.
- No authority edits, asset changes, publication or art sign-off.

## Parent integration and actual game review — 2026-09-09

Shared renderer, App, Graphics and F3 wiring is applied. Actual pointer controls produced All27/7 shadow lights, 8→8/6, 4→4/3 and Off0/0, with zero display postprocesses at neutral color settings. Equipment Off reduced eligible locals27→8; Lighting Off produced0; restoring either returned27. Settled Flight hid all locals; Deck restored27/7. Camera transitions were stepped through the actual update loop before checking. Browser screenshot: `output/playwright/graphics-local-light-budget-actual.png`; logs `.runtime/light-budget-pointer-proof.log`, `.runtime/light-budget-debug-proof.log`, `.runtime/light-budget-view-proof.log`. SwiftShader evidence verifies behavior, not hardware FPS. Named browser closed and GPU released. Combined328tests/typecheck/docs passed; aggregate build/art is being recorded by integration owner.
