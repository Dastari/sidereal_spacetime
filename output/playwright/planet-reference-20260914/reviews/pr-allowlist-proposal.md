# Planet reference draft PR allowlist audit — 2026-09-14

Read-only source/worktree audit. No files copied or committed. This proposes a reviewable isolated reference-candidate PR, not production integration or full artistic/performance completion.

## Exact machine-readable allowlists

- `pr-allowlist-minimal-runtime.json`: 35 new runtime harness/composer/helper files, 30 matching test/dependency files, and 48 already-present source dependencies. The existing dependencies are byte-identical in the target worktree; no package/render source edits are needed for this snapshot. Include the first two lists; do not copy the existing-dependency list unnecessarily.
- Add `scripts/art_library/planet_reference_review.html`, `scripts/art_library/capture_planet_reference.py`, `scripts/art_library/stage_planet_reference.py`, `scripts/art_library/test_stage_planet_reference.py`, `scripts/art_library/audit_native_kit_attributes.py`, `scripts/art_library/test_native_kit_attribute_audit.py`, `scripts/art_library/preserve_native_kit_ior.py`, `scripts/art_library/test_preserve_native_kit_ior.py`, `scripts/art_library/planet_reference_applied.tsconfig.json`. Select a dedicated config with exactly the matching tests; existing historical broad configs pull substantially more fixtures. Do not include unused `_proposed` successors merely because they exist.
- `pr-allowlist-test-fixtures.json`: 214 exact literal fixture/texture paths (472.9 MiB), plus 25 dynamic path expressions that MUST be expanded before a fresh-checkout test claim. Tests depend on earlier sources (e.g. Ice21 and25), not just newest kits. Native GLB comparison tests also require their dynamically named GLBs. This is an identified closure gap, not a ready-to-copy complete fixture manifest.
- `pr-allowlist-canonical-ledger-evidence.json`: exact nine main-world canonical `design.json`/`DESIGN.md` files and their referenced history/evidence plus all exact planet crops: 1,746 files, 1,672.0 MiB, zero missing ledger targets at audit time. These include native source/GLB/exported kit/texture/capture history wherever registered. Do not regenerate global library index/status/catalog from the dirty tree. Moon-specific canonical records still require reconciliation; main-family ledgers alone do not cover moon review states.
- `pr-allowlist-static-closure.json` is deliberately an OVERINCLUSIVE historical comparison inventory (290 new files), NOT the minimal allowlist. It demonstrates why copying every test matching a generic helper balloons the PR.

## Documentation and evidence scope

Include `docs/planet_reference_iteration_20260914.md`, `docs/planet_next_passes.md`, and only relevant authored hunks from `docs/planet_lod_authoring.md` and `docs/rendering_performance_plan.md`. Inspect links before adding other untracked planet docs: they may describe earlier separate performance or lab work already represented by main. Include independent review reports and the exact captures/JSON they cite; preserve failed meaningful revisions in canonical history, explicitly mark invalid/interrupted/old-shadow captures. Do not label all screenshots equivalent to corrected captures.

For each current candidate preserve native editable `.blend`, its exact GLB, `kit.json`, referenced maps, generator/foundation sources and source-hash/validation records. Canonical evidence manifest provides registered copies, but newer moon revisions and unregistered generation inputs still require explicit closure. Builders sometimes read predecessor Python sources or absolute output paths: do not claim reproduction from just the latest builder filename.

## Concrete closure and size constraints

The output evidence tree is 4,303 files / 3,818.3 MiB; do not sweep it wholesale. Canonical history duplicates many artifacts. A single test kit is 91.3 MiB (Ice moon1 r002); Ice moon2 is83.6 MiB; Toxic7 is66.7 MiB; Desert14 is65.2 MiB. `stage_planet_reference.py` rejects kits over64 MiB: at least those four selected candidates cannot use its current staging path. Its revision regex also omits numbered moon folder forms accepted by `planet_reference_direct_paths.ts`. Fix or document as unsupported before claiming the staging tool handles all candidates.

Capture/staging direct URLs hard-code `/root/sidereal_spacetime`; running from `/root/sidereal-planet-reference-review` can silently serve the source worktree instead. Parameterize/verify actual served source before any clean-branch reproduction claim. CLI capture also depends on the managed dev service, cached browser/session, HDR and dynamic weather kit selection. A checkout-only test pass does not prove live LOD behavior.

Binary transport policy is not established by this audit. Check existing repository artifact/LFS policy and actual remote limits; do not assume a1.7GiB history push is acceptable or invent a remote rejection. Preserve required history without duplicate binary copies where ledger tooling permits verified immutable references. No artifacts were deleted/reorganized by this review.

## Exclusions and honest PR framing

Target worktree HEAD observed `599d2c7a`; it already has unrelated modified `assets/source/blender/industrial_kit.blend`, `ship_3d_study.blend`, `ship_top.png`, `station_3d_study.blend`: EXCLUDE. Also exclude construction, crew, world/sim, client/dashboard, lockfile/package/config changes unrelated to this harness; no entire assets/output/scripts directory staging.

Suggested draft title: **Add isolated native planet reference candidates and visual review evidence**.

Suggested description: Adds a Babylon worker-based review harness and preserved native Blender candidate sources for reference-led planet/moon iteration. Records per-revision independent visual decisions, material/geometry parity and retained-LOD checks. Production environment integration, remaining moon optics/morphology, selected Ice26 glass review, shadow artifacts/planet-ring shadow proof, and actual hardware Flight/Map transition acceptance remain open. Working agent visual gates are not owner artistic approval or publication authorization.

Before ready-for-review: expand dynamic fixture/source closure; make worktree URLs portable; address staging size/name mismatch; synchronize exact moon and newest main ledgers; run clean-branch dedicated tests then `npm run check` and `npm run build`; record current failures honestly. This audit itself did not run those checks.
