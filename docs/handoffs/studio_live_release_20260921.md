# Studio live release — 2026-09-21

Agent Mail: GrayLotus. Owner requested “merge and publish”. PR #15 merged by GitHub squash as `b18a64810a561b60076b37bce1dff745036a2d59`.

## Release composition

The public authority was already ahead of main: IFCS phase 3 plus the solar migration. The public game used its own recovered source snapshot, and the served Studio had additional armor/paint/measure/planet changes. Deploying main wholesale would regress these. This release applies PR #15 separately to each preserved live baseline. No canonical checkout edits, database reset, old-stack deployment, or incidental art publication.

- Authority source: `/root/sidereal_spacetime/.runtime/worktrees/studio-authority-20260921`; baseline `solar-authority-deployment` at IFCS `cd09510c` plus its released solar overlay.
- Game source: `/root/sidereal_spacetime/.runtime/worktrees/studio-client-20260921`; baseline `solar-client-deployment` recovered public source. Previous public artifact SHA-256 `1ea3f5f74d3860bf3d0768462382401d4d1a22be0c277a1787ed78cf61149ae7`.
- Studio source: `/root/sidereal-studio-dashboard-release`; independent snapshot of the previously served Studio, preserving armor publishing restrictions, paint, measuring, palette and Genesis tools. The source must live outside `.runtime`, which the Vite file-access deny policy correctly blocks.
- Private audit evidence: canonical `.runtime/releases/studio-20260921/`; SQL captures remain mode 0600 and are not committed.
- Reviewable source overlays and before/after hashes: `ops/releases/studio-20260921/`. These target the named live baselines, not main. Generated bindings are regenerated from the combined authority.

The one shared simulation extension permits accepted solver traces to follow a caller-selected reference point. The live adapter supplies the authored ship origin while IFCS continues integrating its center of mass. This preserves zone positioning for asymmetric ships and rotation without altering integration or telemetry. Independent merge-critical review found no blockers.

## Validation

- Follow-up main tree: `npm run check` passes TypeScript and 296 suites / 1,494 tests (two existing skips); it exits nonzero at the pre-existing missing documentation-link gate. `npm run build` passes.
- Combined authority: 117 suites / 916 tests passed. Focused authored-frame and accepted-trace follow-up: 19 tests passed.
- Combined Studio: TypeScript and build passed; 30 suites / 103 tests passed.
- Combined game: TypeScript and production build passed.
- Isolated full smoke passed: `sidereal-studio-release-studio-live-r0002-smoke`, server 3291. Map read/apply and private zone subscriptions are denied to ungranted identities. r0001 failed before publication due to using the live server token against the isolated server; corrected tool identity, no database reset.
- Pinned old module → candidate upgrade passed with `--delete-data=never` on `sidereal-studio-release-review-upgrade-20260921`, server 3291.
- Expanded schema comparison confirms all 86 prior tables, 56 reducers and 52 views retain their definitions. Additions: five private tables, two reducers, five filtered views. Index-list ordering and generated type/view ordinals are normalized for semantic comparison.
- Browser review uses the Playwright skill. Map/sidebar and Shipyard load without console errors after preserving local dependency/font serving. Interaction and public checks are recorded below.

## Activation

Prepared module SHA-256: `3d0d994add24b945d2db847767dae1edbf1640d872bb76f441c8d652a26d3bcc`.
Prepared game tree SHA-256: `1285899d78177c92813dc6f4f1bbf1a97d16212b0d618419407364ba42e08b73`.

Status: **published and verified** on 2026-09-21. Follow-up compatibility/source-audit PR: https://github.com/Dastari/sidereal_spacetime/pull/16.

- Authority publish succeeded with `--delete-data=never`, preserving database identity. The rebuilt publish artifact exactly matches the rehearsed module SHA above.
- Guarded public-client activation changed the previous pinned tree to the prepared hash above. Public URL: https://sidereal.dastari.net/ . HTTP 200 and browser login gate verified.
- Studio now runs from `/root/sidereal-studio-dashboard-release` through its own `python3 scripts/dev.py up-dashboard`, on the existing port 5174 and HTTPS route https://sidereal.tail7a58a6.ts.net:8445/map . Canonical dashboard was stopped through its managed lifecycle; no sibling service was stopped. Manage this Studio process from the release snapshot, not the canonical dirty source. Temporary review port 5484 is stopped.
- Exact before/after comparison: all three character ID/owner/ship references, all three full ship rows, all 21 full inventory rows and the existing grant set are preserved. No live template switch, map edit, solar migration or inventory mutation was invoked for verification.
- Real Chromium review: live Studio sidebar/map and public game login load without console errors; local release browser verified zone creation/duplication/undo, template dialog, and focused-canvas V/H. The existing Studio Ctrl+D handler was reconciled with the shared duplicate command in Structure/Objects/Hull. Keyboard assertions wait for React updates; typing outside the focused editor remains ignored by design.
- Screenshots, publish logs, schema comparison, immutable artifact hashes and private row comparisons are retained in canonical `.runtime/releases/studio-20260921/`. Signed-in production gameplay/template switching is not claimed; isolated authority tests and smoke provide that validation without altering player ships.

## Operational boundaries

The geometric zone hierarchy does not implement cross-system admission/travel. Existing art restrictions and dedicated test-ship behavior remain. Future releases must reconcile the live IFCS baseline before replacing the world module. Canonical `ifcs-update` edits and unrelated PRs are preserved. Never run canonical `publish`/`public-client-deploy` as a shortcut: it would build unrelated work.
