# CI reproducibility repair — 2026-09-15

Status: repair implemented and locally validated; GitHub workflow remains paused pending review. Owner requested stopping CI failure emails and investigating/fixing the reported Source quality failure. Workflow quality.yml is disabled manually during repair; this is not a passing check or a change to personal email preferences.

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

## Implemented repair and clean-checkout procedure

The native archive contains 1,336 exact files, 693,536,375 raw bytes, compressed to 2,303,120 bytes. Archive SHA-256: `ab51baf161126dddaa74c05ecaf8f5f4378f9b08bc7d85d41ae28071641eab94`. Its two private inputs are the original r003 aim-space metadata and Wayfarer transition GLB; all other entries were already in the published runtime allowlist. `scripts/build_ci_assets.py` deterministically repacks only this manifest, verifies the captured bytes, and stages output before replacing the bundle. Seven isolated tests cover restoration, idempotence, corruption, incomplete/duplicate/extra inventory, traversal, symlinks, local edits and preservation of a good archive after failed repacking.

Further failures exposed by reaching the Python steps required the unchanged native fuel GLB, locker specification, signed side-armor material Blender source and paired equipment delivery manifest. These small explicit inputs retain their original paths; they are not new publication admissions. The private gas preservation fixture preserves all original JSON, GLB and PNG comparisons: 28 logical paths deduplicate to 19 files, 64,910,195 raw bytes compressed to 16,348,472 bytes. Its SHA is `9ffb9ff11334ef17afa37c2b69e1f6ddc33902be1f102d4b7ad5e422dde35676`; the adjacent manifest lists every source and member pin. The separate density PNG retains SHA `55dda2e150e20197164a2026e05983d2ce18baf2d41a5c151691f1634721ddb5`. Neither private fixture reader extracts files into application output, and neither publication allowlist includes them.

The paired character renderer tests now read the existing canonical runtime assets, verified byte-for-byte against the former developer-only source paths. The historical delivery manifest and all expected native hashes remain unchanged. The art tests decode the same saved PNGs with the already declared Pillow dependency; Blender is not needed to read pixels. The existing moon-family test now parses TypeScript independently of whitespace and quote style.

All 47 additional import violations use declared exports (one missing render debug-feature export was added). Formatting is mechanical and isolated in commit `f1cd6989` for 403 files; remaining formatting accompanies the narrow functional fixes. The lint/format baselines and immutable-source ignore list are unchanged. Local Vitest uses the same two-worker limit as CI, following a CPU-contention timeout observed with unrestricted local workers during build compression. No timeout or numerical threshold was relaxed.

Missing linked art documentation is retained in Git. The large generated HTML art index remains generated and untracked; its documentation now gives the index command. Historical untracked browser captures are identified as local evidence rather than broken distributable links.

For a clean checkout (Git LFS, Node 24 and Python 3.12 or later):

```sh
git lfs pull
python3 scripts/prepare_ci_assets.py
npm ci
python3 -m venv .tools/art
.tools/art/bin/python -m pip install -r scripts/art_library/requirements.txt
python3 -m venv .runtime/construction-enclosure-python
.runtime/construction-enclosure-python/bin/python -m pip install -r scripts/geometry_tests/requirements.txt
npm run check
node --test scripts/quality-rules.test.mjs
npm run lint
npm run format:check
npm run test:python
npm run setup
npm run build
```

CI installs the same pinned Pillow dependency in its isolated job Python instead of `.tools/art`. `npm run setup` installs the pinned SpacetimeDB CLI; build/generate do not publish a database. No credentials or live database are needed for this check sequence.

## Notification handling and release status

Source quality is `disabled_manually` at the repository level. This stops new runs while the repair is reviewed; it does not mute account email preferences, erase historical failed runs, or make GitHub CI green. No existing PR was merged, and no live game/editor was rebuilt or activated by this repair.

For permanent personal email control while retaining CI, use GitHub **Settings → Notifications → System → Actions** and change email delivery/choose **Don't notify**: [GitHub's Actions notification guidance](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications). Personal preferences were not changed through repository credentials. Re-enable the workflow only after this repair is integrated and the desired notification behavior is settled, then validate a new exact GitHub run. PR creation while paused deliberately produces no new automatic job.

Independent review confirmed archive preservation, captured-byte verification, argument parsing before bootstrap, the seven bootstrap regressions and exclusion of private fixtures from publication. The shared checkout remains at entry HEAD with the same dirty list and an empty index.


## Validation on the repair candidate

- Node 24.18.0, Python 3.13.7, pinned art/geometry dependency environments; CI declares Node 24 and Python 3.12.
- `npm ci`: passed in the isolated checkout. Native bootstrap restored and verified all 1,336 missing inputs without using generated app/public files.
- `npm run check`: passed — 349 TypeScript test files, 2,080 tests, typecheck and 89-document/provenance check. No tests skipped.
- `npm run lint`: passed — zero new violations; 156 pre-existing debt keys remain. `npm run format:check`: passed — zero new/changed violations; 143 pinned pre-existing entries remain. Neither baseline changed.
- `node --test scripts/quality-rules.test.mjs`: 2 passed.
- `npm run test:python`: passed — 120 standard, 65 art and 40 native geometry tests. The private semantic conversion fixture was rebuilt from its tracked source pins.
- `npm run build`: passed — world build/code generation and independent client/dashboard builds, including precompression. Existing large-chunk warnings remain. No publish or service activation command ran.
- Additional `npm run art:check`: the initial mesh/material/source/icon gates pass after hydrating assets/source LFS files, but the separate installed-art historical audit stops at omitted `assets/art-library/shipyard-equipment/inventory.json`. That broader art-library preservation gap is outside Source quality and is not claimed fixed. No art contract, live-game qualification or new artistic approval is claimed here.

The full application check/build and every Source quality step passed locally. GitHub's exact hosted candidate has not run while disabled. The formatting-only commit is separated from functional changes; linked historical documentation retains its content with trailing whitespace cleaned in two restored design documents. Detailed logs remain local under `.runtime/ci-repair-20260915/`, not in Git.
