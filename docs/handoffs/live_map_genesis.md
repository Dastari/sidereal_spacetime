# Live map, Genesis and retained reviewer — 2026-09-21

Agent Mail: GrayLotus. Source: `/root/sidereal-studio-release`, branch
`feat/live-map-genesis`, [PR #19](https://github.com/Dastari/sidereal_spacetime/pull/19).
Canonical `/root/sidereal_spacetime` has unrelated dirty IFCS/art work; preserve it.

## Owner direction and reviewer

Keep authored Blender visuals. Live editable instance values are native asset,
composition seed, radius, name, XY position and parent. No legacy procedural
terrain/material UI, new art approval or source-mesh migration is implied.

The owner explicitly authorized a semi-permanent reviewer for future game and
editor work. **Retain the account until an explicit owner go-live retirement
decision; never delete it as test cleanup.**

- Username: `sidereal-development-review`.
- Provider subject: `cd533b9d-db67-4317-ad07-d75b679f6fd2`.
- Realm: dedicated Dastari provider in managed CT116; Orchard unchanged.
- Runbook: [review account](../review_account.md), including private credentials,
  managed reuse, PKCE sign-in and temporary authoring administration.
- Cleanup completed: temporary provider administrator role removed; isolated
  read/write grants revoked/expired; provider sign-out verified. Account retained.
- No public game character was created or edited by this review. Future gameplay
  scenarios must record their chosen database and persistent character UUIDs.
- The deleted historical reviewer is not recreated and its password is not reset.

The retained-account response supersedes every earlier temporary-account or
pending-permission plan. Repeat ensure preserves ID/password; genuine PKCE proves
credential acceptance. Interruption recovery and secret-free CLI arguments have
focused tests and independent review.

## Implementation and acceptance

Viewport-bounded orbit paths and culling remove giant dashed circles; wheel input
is coalesced by animation frame. Natural-size alpha portraits, moon guide LOD,
fixed planar10% editor feather, grouped two-decimal XY, no height/feather controls,
draw-in-place fields/zones, and clean selection/deselection are implemented.

Studio requires sign-in; map and Genesis consume live projections. Native
asset/seed/radius edits reuse the existing grant/revision/fingerprint/replay-checked
map transaction. Body UUID/type and unrelated motion/state remain protected.
Saves wait for a newer canonical subscription row before completing.

- Full check:300 suites,1505 passed,2 existing skips; typecheck passes. The command
  reaches inherited missing-document links and exits nonzero there.
- Full build, isolated fresh smoke, edited-file lint/format and lockfile dry-run
  pass. Python review tests:26 passed. Independent multi-model reviews pass.
- Real signed-out gate mounts no map/tree. UI browser fixture verifies planar
  inputs, exact2× portrait scaling, draw without camera changes, deselect and undo.
  Overview9 planetary/0 moon guides; planetary neighborhood2 moon guides.
- Same-view zoom probe: baseline400ms worst frame, candidate17ms. This is measured
  on the review machine, not a universal device-performance guarantee.
- Genuine PKCE against isolated3291 saved moon name/radius8.12/seed118, reloaded
  them, opened the same UUID in Genesis, saved radius8.25 and switched native asset
  to ice-moon-1-r002. Height/XY/parent persisted unchanged.
- Exact replay, stale rejection, revoked-write rejection/disabled Save, and
  two-second read-grant expiry/removal all passed against real authority.
- Evidence: `/tmp/live-map-auth-save-proof.log`, `/tmp/live-map-auth-access-proof.log`,
  `/tmp/live-map-planar-review.png`, `/tmp/live-map-moon-guides.png`.
- Full-size native preview switching is slow under software WebGL; Ocean switching
  completed at192px. No accelerated-GPU performance claim follows from that test.
- GitHub CI fails before project tests because upstream main lacks
  `scripts/art_library/requirements.txt`. This inherited failure is not claimed green.

## Release composition

Status: prepared, not yet published. Prior owner merge/publish authorization
persists; no new permission is needed for these reviewed scoped changes.

- Authority candidate: `/root/sidereal-live-map-authority-candidate`, based on
  `/root/sidereal_spacetime/.runtime/worktrees/studio-authority-20260921` with IFCS
  preserved. Eleven scoped source/test/metadata changes; no migration/schema change.
- Studio candidate: `/root/sidereal-live-map-dashboard-candidate`, based on
  `/root/sidereal-studio-dashboard-release`, retaining armor/paint/palette/measure
  functionality.27 scoped source/metadata changes; no new art publication.
- Complete source/build inventories and exact patches/hashes: `ops/releases/live-map-genesis-20260921/`.
- Composed authority: typecheck plus364 existing and7 Genesis tests pass. Composed
  Studio build passes. Pinned old-module→candidate additive publish passed on
  `sidereal-studio-review-review-genesis-upgrade-20260921` without reset.
- Normalized schemas retain all91 tables,58 reducers and57 views unchanged.
- Before-state audit is private under canonical `.runtime/releases/live-map-genesis-20260921/`.
- Public game client code/release remains unchanged; existing projections already
  carry mutable radius/appearance/seed. Preserve all live UUIDs/inventory/state.

Next: complete final composition review, merge through GitHub, publish exact
rehearsed authority via managed lifecycle, apply scoped Studio source changes,
verify before/after state and public sign-in gate, record release hashes/status.
Never publish a main-derived world over the preserved IFCS module wholesale.
Local branch `dev.toml` remains intentionally uncommitted with review ports3291/5494.
