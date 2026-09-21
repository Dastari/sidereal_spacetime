# Live map and Genesis follow-up — 2026-09-21

Work in progress: GrayLotus, `/root/sidereal-studio-release`, branch `feat/live-map-genesis` from main faf2b916. Canonical worktree contains unrelated IFCS changes; do not reset or publish it.

Implemented candidate: viewport-bounded orbit paths/culling and frame-coalesced wheel zoom; naturally scaled alpha portraits; planetary/moon orbit LOD; fixed planar 10% editor feather; compact two-decimal XY controls; draw-in-place zones/fields; authenticated live-world map and Genesis native-instance editing through existing validated map reducer. No schema changes or procedural visual migration.

Validation so far: 300 suites, 1505 passed and 2 skipped; typecheck and edited-file lint pass. Full `npm run check` reaches the inherited missing-document link failures. Full build succeeds (existing bundle/cycle warnings). Fresh isolated smoke completed against `sidereal-studio-review-live-map-genesis-r0001-smoke`, server3291. Baseline planet-focus probe stalled400ms; candidate same views17ms worst. Signed-out browser gate confirms no tree/canvas mounted.

Browser interaction fixture passes XY same row/two decimals, no height/feather controls, 29 overview bodies and 9 planetary/0 moon guides, 2 moon guides in a planetary neighborhood, exact2× physical portrait scaling, draw without zoom, deselect and undo. Evidence `/tmp/live-map-planar-review.png`, `/tmp/live-map-moon-guides.png`; browser fixture is explicitly not authenticated authority evidence. Genesis loads Desert and edits radius to35.57; full-size Ocean switching remains under browser investigation (software WebGL preparation slow).

Independent multi-model review completed: corrected subscription-confirmed canonical save, star seed lookup and runtime/authority catalog parity. Existing tick-driven grant expiry verified in code. Edited files pass lint/format; lockfile dry-run resolution passes. Versions Studio0.10.0/content0.6.0/render0.8.0/UI0.4.0/world0.6.0.

Pending: signed-in integration (retained dedicated Keycloak test account was deleted; requested permission to provision/remove temporary reviewer), final Genesis switching evidence, PR and release. No task changes deployed. Failed role-grant attempt returned404 and changed no account. Existing credential was read privately without password rotation; never copy it into git/logs.

Public Studio snapshot `/root/sidereal-studio-dashboard-release` includes additional armor/palette features. Compose scoped changes rather than replacing App wholesale. Live authority source `.runtime/worktrees/studio-authority-20260921` preserves IFCS phase3; candidate world change must be overlaid/rehearsed there. Public client needs no code changes for existing radius/appearance/seed projection. Preserve all character/inventory/body UUIDs. Previous merge/publish authorization remains in conversation; CI inherited failures must be reported honestly.
