# Studio release source overlays

These audit patches record the exact Studio changes applied to three different existing live source snapshots. Most hunks are the already-reviewed PR #15 changes; conflict resolutions retain each baseline's existing features. They are not patches against main and are not automatic deployment scripts.

- `authority.patch`: apply to an independent copy of canonical `.runtime/worktrees/solar-authority-deployment` (IFCS phase3 `cd09510c` plus released solar overlay).
- `client.patch`: apply to an independent copy of canonical `.runtime/worktrees/solar-client-deployment` (recovered live game source).
- `dashboard.patch`: apply to the source snapshot previously served by canonical Studio on 2026-09-21. Preserve the canonical working tree unchanged.

Each corresponding manifest contains SHA-256 for every patch target before and after. A null before hash means the path must not exist. Verify every before hash before applying with `git apply --unidiff-zero`, then every after hash. Never force-apply an overlay to a changed baseline. Regenerate bindings using the combined authority; hydrate only previously published runtime assets; copy PR #15 map-snapshot public assets unchanged. The patches intentionally omit generated bindings, public binaries, configuration, credentials, database data and unrelated source files.

Exact runtime paths, validation, module/game hashes and activation status are in [the release handoff](../../../docs/handoffs/studio_live_release_20260921.md). Retain the isolated source snapshots for reproducibility; patches alone do not replace their baseline source.
