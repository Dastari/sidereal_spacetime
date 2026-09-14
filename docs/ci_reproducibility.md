# CI reproducibility repair — 2026-09-15

Status: implementation in progress. Owner requested stopping CI failure emails and investigating/fixing the reported Source quality failure. Workflow quality.yml is disabled manually during repair; this is not a passing check or a change to personal email preferences.

Entry: shared HEAD9c58c07774d7d3c4a58a40c49e90f2a2c647249c with the previous armor integration unstaged. Full status is saved in `.runtime/ci-repair-20260915/entry.json`. Work occurs only in isolated branch fix/ci-portability, based on armor PR4 commit293a437fca692d60c1de2fe60b3839f2872e726a. Existing shared changes and deployed apps remain untouched.

## Observed failure

GitHub run34902147712 ran npm ci/typecheck successfully, then failed ten test files: omitted native fixtures, developer-absolute source paths, a generated public-directory assumption, and a single20second test iterating all solid planet styles. The workflow also ran once for push and again for pull_request. Existing subsequent quality gates have47 import-boundary violations and407 changed formatting violations; they must be fixed without broadening the pinned baseline. A fresh checkout lacks1,334 explicitly published runtime inputs (about693MB raw) despite the local build passing.

## Repair contract

- Keep checks fail-closed and preserve all native hashes, geometry, gameplay bounds and test assertions.
- Supply missing existing published runtime files and required native test metadata through one versioned Git-LFS tar.xz bundle plus a reviewed JSON manifest. No references, source Blender files, credentials, databases, builds or caches enter the bundle. Do not regenerate native geometry.
- Bootstrap verifies the archive and every member before writing any file, rejects extra/missing/duplicate/unsafe paths and links, and refuses to overwrite differing files. Exact existing files are left unchanged. Extraction writes only allowlisted repository-relative native input paths. A missing LFS download produces an actionable error.
- Use this bootstrap in CI and the normal build preparation entrypoint so clean checkout behavior agrees. Unit-test valid extraction/idempotence, mismatches, traversal/links and refusal to overwrite local edits.
- Resolve historical source pins against the current checkout in test adapters, leaving signed audit bytes unchanged. Renderer tests read canonical runtime inputs, not generated app/public files.
- Parameterize terrain budget assertions by style/extreme case, preserving each assertion and the20second per-test timeout; identify the failing recipe independently.
- Correct import-boundary violations using declared package exports. Format only files newly failing the existing formatter baseline. No rule exclusions, skipped tests, continue-on-error or baseline expansion.
- Run a single PR check and pushes to main; use concurrency to replace obsolete runs. Allow manual dispatch. Keep the workflow manually disabled until the repair is reviewed and email preference/reenablement is decided explicitly.

Success is a clean isolated install/bootstrap, full TypeScript tests/typecheck, lint/format, Python checks and build where tools are available, with every new file reproducible and local live-native pins unchanged. GitHub runtime status remains separate from local results while the workflow is paused. Deliver through a scoped PR stacked onPR4; do not merge other PRs.
