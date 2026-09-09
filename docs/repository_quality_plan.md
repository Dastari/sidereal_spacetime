# Repository quality checkpoint and follow-up

2026-09-09. This records the owner audit against the active shared tree. It does not supersede the construction gameplay milestone.

## Immediate changes

- Packaging now ships runtime assets and explicit public product help only. Internal `docs`, `reference` and `PIVOT.md` copies are removed from generated public and previous dist output. Dashboard help links use the public guide. Source documents and art references remain private repository inputs. Both Vite servers also deny internal workspace paths through `/@fs`; actual internal-document requests returned403 while application modules and allowlisted help remained accessible.
- Git LFS attributes cover GLB, Blender, PNG/JPEG, HDR/EXR and ZIP for new revisions. The local filter/hook is installed. Existing history is not rewritten; no remote/LFS endpoint is configured. A local commit is not off-host backup. Never blanket-stage the asset library; review exact revisions and staged sizes.
- Client declares canvas-ui and removes unused sim/UI/lucide direct dependencies. Cross-package imports remain separately tracked debt.
- Source CI runs TypeScript, Vitest, Python unit tests, ESLint boundary checks and formatting checks. It does not publish services, require production credentials or imply GPU acceptance. Python art-library tests need the pinned Pillow requirement; locally use the existing `.tools/art` environment.
- ESLint prohibits relative imports across app/package ownership boundaries. Existing occurrences are explicitly counted in `scripts/quality-lint-baseline.json`; new occurrences fail. `lint:all` reports all remaining violations. Do not refresh the baseline to admit a new shortcut.
- Formatting covers app and package source, including render/canvas-ui/world, plus scripts; generated transport bindings are excluded. Existing unformatted files are pinned by content SHA in `scripts/quality-format-baseline.json`. New or changed unformatted files fail. `format:check:all` reports full debt. No shared files were mass-formatted.

CI becomes a remote gate only when this source checkpoint and all required dependencies are committed and pushed to a configured repository. Until then local execution is the evidence; no GitHub run is claimed.

## Findings reconciled with current code

The 11-test verification table is preserved as dated M0 history, with a current checkpoint above it. The latest recorded construction-walking release had 415 tests/94 files. Authentication now uses dedicated Dastari Keycloak; Orchard text was historical and the active implementation plan is corrected. Multiple decks can be stored and compiled; the selected playable deck is not proof of operational traversal. Actual immutable publication and native-floor walking now exist, although the original layout activation did not deliver either. Full doors/airlocks and shared-world multiplayer remain incomplete.

## Local verification and commit

Packaging/LFS checkpoint: `558e2fa`. Only explicit packaging/help/deny-policy hunks and LFS attributes were committed; concurrent application/asset work remains outside that commit. Both independent app builds passed. Thirteen Python tests (including three packaging tests) and two ESLint-rule tests passed. Actual HTTP checks show private document/reference filesystem routes denied403 and public help/application modules still served. The integration owner also clicked the real dashboard help link and verified the guide popup and forbidden filesystem route in its browser (`.runtime/boundary-help-review.log`).

Aggregate checkpoint:442 tests passed, one failed (`inventory-windows.test.ts`, missing `character-preset` in the short-window test) during concurrent external character changes. The external implementation subsequently updated that test; all13 focused window tests then passed. Fresh character integration imports/formatting still trip the new ratchets; do not call the whole tree clean or absorb them into the debt baseline. CI configuration and dependency changes await the coherent shared source checkpoint; no remote CI run or complete-source commit is claimed.

The commit triggered automatic Git packing. It completed without forcing concurrent maintenance:29,995 objects in one1.77GiB pack, approximately14.26MiB loose afterward, versus2.17GiB loose before. This is compaction, not a claim that all historical/recoverable objects fit the30MB source-tree size. No aggressive history/LFS migration or manual pruning was performed.

The next aggregate snapshot had446 passing tests and two existing planet-generator timeouts during concurrent work. Both timed-out files then passed all13 tests with one worker, without increasing timeout thresholds. CI caps Vitest workers at2 to bound resource contention. The subsequent bounded aggregate run passed typecheck, all448tests in99files and73document/provenance checks. Boundary lint passed with215 existing debt entries and zero new violations. Changed-file formatting and the final coherent source commit remain coordinated with the active integration owner.

## Ordered structural follow-up

1. Finish a coherent tested construction source checkpoint; stage its explicit dependency list separately from native boundary-art work in progress. Pack Git without pruning recoverable unreachable objects. Record hashes and remaining untracked scope.
2. Expand Shipyard tests at the pure state/geometry and real save/load/CAS boundaries while construction is being wired. Existing new compiler/authority tests complement UI tests; they do not substitute for pointer-based review.
3. Migrate relative cross-package imports in bounded package batches, add deliberate export surfaces/dependencies, then retire lint exemptions. Avoid wildcard exports merely to hide architectural coupling.
4. Introduce a `useSyncExternalStore` adapter with stable cached snapshots/selectors over authoritative subscription cache. Validate subscription disposal, reconnect, actor switching and batched row changes; cache parsed appearance by row/revision. Rendering optimizations must not create a second writable authority cache.
5. Enable `noUncheckedIndexedAccess` by a measured migration: inventory unsafe iterator/index uses, fix absent-row cases and boundary tests, then turn on the root flag. Do not replace errors with blanket non-null assertions.
6. Keep the current canvas HUD while adding DOM-accessible controls/semantics to settings and inventory. Evaluate reusable SVG icons and a gradual DOM migration using accessibility, testability and frame-time evidence. No immediate whole-HUD rewrite during construction.
7. Rendering performance follows its measured plan: light budget is installed, then profile CPU work and the scene-wide transmission render target. Batching must preserve future part/damage/deck identities. Post-processing and higher IBL remain a separately measured visual/quality pass; there is no guaranteed FPS gain from adding them.

Shared-world visibility/remote actors remain a dedicated authoritative integration. Authored instance deck rows are already being implemented; do not restart that work from an outdated audit snapshot.
