# Source quality repair handoff — 2026-09-15

Owner requested stopping failure emails and fixing Source quality for armor PR #4 at `293a437`. The repository workflow is manually paused. Personal notification preferences were not changed.

Delivered PR: https://github.com/Dastari/sidereal_spacetime/pull/5 (`fix/ci-portability`, stacked on `shipyard-armor-editor`). Tested implementation commit: `7d70dbc0`; formatting-only commit: `f1cd6989`; specification/ADR: `c9a5fbad`. Final handoff changes are documentation only. No PR was merged.

All Source quality steps passed locally. `npm run check`: 2,080 tests in 349 files, typecheck and 89-document/provenance check. Python: 120 standard + 65 art + 40 native geometry tests. Lint/format: zero new violations, original baselines unchanged. Rule tests: 2 passed. Full build and precompression passed; existing chunk-size warnings remain. Node 24.18.0 / Python 3.13.7 were used locally; workflow declares Node 24 / Python 3.12. Hosted CI has not run while paused.

The fix preserves exact native bytes in compressed LFS inputs, makes test paths portable, removes duplicate push/PR runs and separates terrain cases. See [repair contract and operational procedure](../ci_reproducibility.md) for hashes, safe bootstrap behavior, clean-checkout commands and notification settings. Independent review found no remaining blocker in the bundle tools or private fixture publication boundaries.

The extra historical `art:check` audit remains incomplete: after initial native/source/icon gates pass, it stops at the separately omitted `assets/art-library/shipyard-equipment/inventory.json`. This is outside the Source quality workflow and not an art approval or live-game completion claim.

Shared checkout remains at `9c58c07774d7d3c4a58a40c49e90f2a2c647249c`, with exactly its entry dirty list and an empty index. Work occurred only in `/root/sidereal-ci-repair`; no live service was restarted, rebuilt or activated. Existing editor review remains live; game pins remain unchanged. Local logs, baseline reports and entry/final status are under `.runtime/ci-repair-20260915/` in the shared root, excluded from Git.

Next delivery action is owner-reviewed integration of PR #5 into PR #4's branch. Keep Source quality paused until the repair is integrated and notification behavior is settled; then enable it and validate the exact hosted candidate. A disabled workflow must never be described as green CI. Do not infer authority to merge other open PRs or activate game assets from this CI repair request.


## Hosted validation follow-up

The owner requested fixing the still-red Actions page. Its newest entries were the historical failed runs at `293a437`; no repair candidate had run while the workflow was disabled. Source quality is now re-enabled for validation of PR #5. Shared HEAD and its dirty list remain as recorded above; isolated repair entry HEAD is `a3810a66dc9ff75610ad3003428a0fa88710bfbf` with no local changes. Fetch confirmed PR #5/#4/#1 are still open at their recorded heads. Native pins and live services are unchanged. This follow-up supersedes the instruction above to keep the workflow paused; hosted results are pending. Historical failed runs are retained as audit history.
