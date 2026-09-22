# Exterior shadow optimization release — 2026-09-22

Owner requested merge and deployment of PR #17. Agent Mail identity: GrayLotus.
Implementation and browser evidence are in [the optimization handoff](render_optimization_20260921.md).

## Released composition

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

## Published state

PR #17 merged through GitHub as `3a768539fae69622b6382ef562d36e69dd8af7ec`.
Guarded activation succeeded on 2026-09-22. Public client now serves the exact
prepared hash above from immutable directory
`/root/sidereal_spacetime/.runtime/public-client/releases/20260922-113005-0c48930c709a`.

- Public HTTPS HTML and entry JavaScript return 200 and match the installed bytes
  exactly. The entire installed tree rehashes to the pinned candidate digest.
- Real Chromium loads the new entry and normal sign-in gate with zero console or
  network errors. Authenticated production gameplay and FPS are not claimed.
- Database and independent Studio process PID/start identities are unchanged.
  Independent delivery metadata is byte-identical. No world publication occurred.
- [Machine-readable public verification](../../ops/releases/shadow-cache-20260922/public-verification.json).
  Private lifecycle/HTTP logs are in canonical `.runtime/releases/shadow-cache-20260922/`.
- Main-derived implementation worktree: `/root/sidereal-render-performance`.
  Live-compatible source: `/root/sidereal-shadow-release-20260922`. Future game
  releases must preserve this live composition rather than deploy main wholesale.
- Prior immutable client remains at
  `/root/sidereal_spacetime/.runtime/public-client/releases/20260921-110505-1285899d7817`.
  If explicitly rolling back, stage that exact old artifact with its recorded
  SHA, then activate with expected live `0c48930c...` and staged `1285899d...` full
  digests above through canonical `scripts/dev.py`. Never roll back the database.

GrayLotus releases reservations at closeout. Review/development services were not
started for this deployment; only the public client was restarted.
