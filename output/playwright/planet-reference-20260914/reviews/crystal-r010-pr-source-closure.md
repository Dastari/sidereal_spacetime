# Crystal r006–r010 PR closure (read-only inspection)

Current PR copied lists r005 and r006 were inspected. The PR worktree was not modified. Final r010 script names and fixtures must be refreshed after authoring completes.

## Missing source paths

- scripts/art_library/build_crystal_moon_fractures_r006.py
- scripts/art_library/build_crystal_moon_fractures_r007.py
- scripts/art_library/build_crystal_moon_fractures_r008.py
- scripts/art_library/build_crystal_moon_fractures_r009.py
- scripts/art_library/crystal_moon_reference_composition_r006.test.ts
- scripts/art_library/crystal_moon_reference_composition_r006.ts
- scripts/art_library/crystal_moon_reference_composition_r007.test.ts
- scripts/art_library/crystal_moon_reference_composition_r007.ts
- scripts/art_library/crystal_moon_reference_composition_r008.test.ts
- scripts/art_library/crystal_moon_reference_composition_r008.ts
- scripts/art_library/crystal_moon_reference_composition_r009.test.ts
- scripts/art_library/crystal_moon_reference_r006.tsconfig.json
- scripts/art_library/crystal_moon_reference_r006.vitest.config.ts
- scripts/art_library/crystal_moon_reference_r007.tsconfig.json
- scripts/art_library/crystal_moon_reference_r007.vitest.config.ts
- scripts/art_library/crystal_moon_reference_r008.tsconfig.json
- scripts/art_library/crystal_moon_reference_r008.vitest.config.ts
- scripts/art_library/crystal_moon_reference_r009.tsconfig.json
- scripts/art_library/crystal_moon_reference_r009.vitest.config.ts

## Runtime updates that differ from PR

- scripts/art_library/planet_reference_worker.ts
- scripts/art_library/planet_reference_worker_lifetime.ts
- scripts/art_library/planet_reference_worker_lifetime.test.ts

## Required fixture and dependency closure

- Current worker and r009 tests import crystal_moon_reference_composition_r008.ts. Its sole local dependency is packages/render/src/environment/native-planet-composition.ts, already in the repository.
- Native r006–r009 builders import scripts/art_library/audit_native_kit_attributes.py (already identical in PR) and consume both moon r005 kit.blend, kit.json and orientation-validation.json.
- r006–r008 tests consume their matching source revision kit.json, native-panel-plan.json (r006) or native-fracture-plan.json (r007/r008), plus prior r005 kit.json and orientation-validation.json.
- r009 tests consume both moon r009 kit.json and native-fracture-plan.json, r008 kit.json for exact nonterminal preservation, and r005 kit.json plus orientation-validation.json. Retain these output fixture paths or explicitly restore them from canonical snapshots before running tests.
- Final r010 authoring/material tests and their r009 predecessor fixtures must be added once created; do not infer coverage from r009 passing.
- Refresh root-owned worker lifetime allowlist/tests for actual r009/r010 revision identity. Worker compositor remains r008 unless author changes its contract.
- Canonical final addition is assets/art-library/designs/environment.planet.crystal/revisions/r016/** plus design.json and DESIGN.md. Prepared checkpoint includes all6–10 recursive native/capture/trace/parity history, selected source/tests/configs and exact final verdict.
- r006/r007 historic builder scripts hardcode /root/sidereal_spacetime. Preserve those recipes as history; current r008/r009 builders derive their repository root. This distinction matters if replaying old failed authoring from the PR worktree.

## Fixture presence observed in PR

- output/playwright/planet-reference-20260914/crystal-moon-1-r005/kit.json: present
- output/playwright/planet-reference-20260914/crystal-moon-1-r006/kit.json: missing
- output/playwright/planet-reference-20260914/crystal-moon-1-r007/kit.json: missing
- output/playwright/planet-reference-20260914/crystal-moon-1-r008/kit.json: missing
- output/playwright/planet-reference-20260914/crystal-moon-1-r009/kit.json: missing
- output/playwright/planet-reference-20260914/crystal-moon-1-r010/kit.json: missing
- output/playwright/planet-reference-20260914/crystal-moon-2-r005/kit.json: present
- output/playwright/planet-reference-20260914/crystal-moon-2-r006/kit.json: missing
- output/playwright/planet-reference-20260914/crystal-moon-2-r007/kit.json: missing
- output/playwright/planet-reference-20260914/crystal-moon-2-r008/kit.json: missing
- output/playwright/planet-reference-20260914/crystal-moon-2-r009/kit.json: missing
- output/playwright/planet-reference-20260914/crystal-moon-2-r010/kit.json: missing
