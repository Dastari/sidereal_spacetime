# Studio spatial and test-ship workflows — 2026-09-21

Owner chose dedicated test ships, preserving normal ship and inventory. Candidate branch `feat/studio-spatial-workflows`, isolated checkout `/root/sidereal-studio-workflows`, Agent Mail identity **GrayLotus**. No production database, public client or dashboard activation. The shared working checkout and its unrelated edits remain untouched.

## Delivered

- Persistent accessible workspace icon rail with Shipyard, Map editor and Genesis.
- Stars-only Deep space default, no nebula/procedural gas/dust; shared deterministic normalized system/field feather resolver. Sanitized actor-admitted background geometry excludes resources, seeds, body rosters and authoring history.
- Explicit primary star/radius, preserved legacy centers, validated parent links and static orbit guides; parent movement keeps descendants together. Editor height slice previews elevated field backgrounds.
- 29 actual asset portraits, 192px WebP, **152,534 bytes total**, plus source/render hashes and provenance manifest. Hash-matched recorded renders use planet reference seed117 and native r013 star. Rebuild with `.tools/art/bin/python scripts/art_library/package_map_snapshots.py --source-root <checkout-containing-capture-evidence>`. No 3D asset download is needed for map portraits. Background raster runs in a cancellable worker with ordered field bounds prepared once.
- Shipyard Templates dialog available from all five design stages. Server draft save, exact-revision publication and independent instance creation remain distinct. Full qualified construction wrappers survive workspace load/save, copied drafts, recovery export and imports. Mismatched imported wrappers fail before overwriting other local drafts. Incomplete floor drafts retain recovery saves; publishing still invokes the full compiler.
- Normal game Test ships controls no longer require a query flag. Atomic A → B switching checks grants, ownership, target and visit revisions, standing/flight/traversal state, home and occupied entry; receipts make replay idempotent. Native and legacy home return preserve inventory and current ship state. Panel scrolls for larger collections.

## Validation

- `npm run check`: TypeScript passes; **291 suites, 1,463 tests pass, 2 skipped**. The command exits nonzero on the repository's existing missing documentation links (including `docs/visual_theme.md`, `docs/space_environment.md`, `docs/ship_layout_editor_design.md` and historical art/handoff evidence). Do not describe the aggregate check as green.
- Optional repository lint still reports pre-existing cross-package import debt; newly added test imports use declared exports.
- `npm run build`: passes world build/generated bindings and independent client/dashboard builds. Existing circular dependency and large bundle warnings remain. New spatial module cycle was removed.
- `npm run smoke -- --smoke-name studio-workflows --fresh-smoke`: passes on new isolated database `sidereal-studio-review-studio-workflows-r0001-smoke`, server `127.0.0.1:3291`. Includes unprivileged map/template/switch denials and normal game authority journeys. No live database publication.
- Targeted regression coverage: normalized feathering and polygon notches; off-origin anchor/legacy center; parent moves/cycles; sanitized connected-actor projection; native home → A → B → home with unchanged inventory/current home motion; stale revisions, disconnect, revoked spawn grant, occupied destination, seated actor, exact replay; qualified wrapper round-trip and mismatched imports.
- Chromium software-WebGL review at local dashboard `http://localhost:5474`: persistent rail, 29 actual portraits, field background controls, static orbits, local floor placement/save and Structure/Rooms/Objects/Hull/Systems navigation, Templates dialog. Evidence in `output/playwright/studio-workflows/`. Console has no application errors; software GPU readback warnings occurred.

## Integration limits and follow-up

This branch starts from upstream main `f19a4b21` and incorporates map PR11's three commits before this feature. PR11 is still open and overlaps; review/merge sequencing must account for those included commits. The separate unmerged IFCS/armor/palette and dirty R16/v2 construction work is not incorporated. Do not claim this verifies the R16/v2 publication pipeline or arbitrary ship flight/pressure/traversal; those remain governed by their own native qualification contracts.

Signed-in provider-admin browser save/publish/spawn and game template switching were not exercised with a real account in this session. Reducer/unit tests verify the native/legacy switch journeys and isolated smoke verifies denials. No credentials or auth policy were changed to bypass that boundary. Asset portraits are catalog reference renders, not exact seeded planet screenshots. Existing 16-instance allocation limit remains; no instance retirement or destructive cleanup was introduced.

Managed dashboard remains at5474 and isolated DB server3291; local `dev.toml` port/database edits and hydrated reviewed asset files are excluded from the PR. Required checks use hydrated local asset sources. Reservations are released at handoff; next session must register/read inbox and reserve its own paths. Production activation and PR merge were not requested.
