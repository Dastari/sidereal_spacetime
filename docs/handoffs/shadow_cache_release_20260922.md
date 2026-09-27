# Exterior shadow optimization release — 2026-09-22

Owner requested merge and deployment of PR #17. Agent Mail identity: GrayLotus.
Implementation and browser evidence are in [the optimization handoff](render_optimization_20260921.md).

## Prepared release

PR #17 was reconciled with `main` at `9d0c2ef6`; only changelog/package-version
conflicts needed resolution. Render is now 0.8.1. The actual cache implementation
and lighting integration are unchanged from the reviewed candidate.

The public game contains released IFCS/character/construction work outside main.
Its preserved source is `/root/sidereal_spacetime/.runtime/worktrees/studio-client-20260921`.
That source's recorded Studio overlay hashes all match, its retained build is the
currently installed artifact, and its lighting file exactly matches PR #17's
original base. Deploying a main-derived full game would lose unrelated live work.

Candidate `/root/sidereal-shadow-release-20260922` copies that source and applies
only the two cache files, lighting integration, render version and dependent
package pins/lockfile. Its existing content/simulation versions and all other
source files are preserved. No world module or dashboard is deployed.

- Previous client: `1285899d78177c92813dc6f4f1bbf1a97d16212b0d618419407364ba42e08b73`.
- Prepared client: `0c48930c709ab6eae5f856e4131de3e2081454f6a80114e93a9d094727db2558`.
- Entry: `/assets/index-BFw94WOd.js`.
- All 3,040 prior non-bundle files match exactly, including published art. Only
  application bundle files and their HTML references differ.
- Reviewable overlay, complete relevant source hashes and complete build inventory:
  [release manifest](../../ops/releases/shadow-cache-20260922/manifest.json).

## Validation and activation boundary

- Reconciled PR: typecheck and 301 suites / 1,531 tests pass (two skips); the
  `npm run check` documentation stage retains the 36 pre-existing missing links.
- `npm run build` passes world, client and dashboard builds without publishing.
- Actual release composition: typecheck, 39 lighting/shadow tests and client build
  pass. Previous pixel/count comparisons remain applicable to the unchanged cache.
- GitHub CI fails before project tests on missing upstream
  `scripts/art_library/requirements.txt`; this is not a passing CI claim.
- Activation uses canonical `scripts/dev.py public-client-stage` with the exact
  artifact hash, followed by `public-client-activate` with both expected old/new
  hashes. It restarts only the public-client service. No database commands, grants,
  player mutations, authentication changes or independent delivery release changes.

This file records the prepared artifact before activation. Verified activation
and public HTTP/browser results will be recorded in the release follow-up.
