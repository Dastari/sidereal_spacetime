# Integration continuation — root ownership transfer

User explicitly requested a NEW agent take over root's ongoing integration while root concentrates on the ship's molded-plastic material assessment. Preserve all shared work. This record supplements the full conversation; source files are already edited, no specialist commit to apply.

## Active work and ownership

- Root/shared integration transferred: `packages/render/src/index.ts`, `packages/render/src/combat-aim.ts`, `apps/client/src/App.tsx`, client login/PKCE, managed lifecycle `scripts/dev.py`, combined generation/build/browser checks and integration handoffs.
- `authoritative_ifcs` owns new appearance/presence and upcoming identity-link/module auth policy in world/sim/net. Coordinate schema generation/publish; do not duplicate its edits.
- `procedural_planets` owns exact native volcanic r018 integration in environment/native planet paths. Root reviewed actual r018 screenshot and passed WORKING-CANDIDATE gate only; significant art limitations remain, no final owner art approval. It will request actual App Observe browser verification after GPU release.
- `geometry_snap_bevel` completed Graphics/Escape/compact top HUD and installed dedicated Keycloak on Proxmox; finishing provider handoff. Existing Orchard MUST remain untouched. It is not assigned root continuation.

## Pose integration already applied, new fixes awaiting complete browser evidence

Read original requested handoff/patch/inputs/reference. Most parent patch was applied earlier; generator is now idempotent and emits an empty diff on integrated sources. Never apply stale diff blindly.

Recent root fixes:
- `crew/pose-review-config.ts` fetches paired r002 `profile-socket-metadata.json` with aim-space instead of relying on separately copied hardcoded socket constants.
- Controller exposes `isBound`; unsupported equipment restores legacy aim/snap; beam uses solver only while bound.
- Walking movement yaw sign fixed (previous expression doubled avatar heading).
- Hidden solve clears muzzle; sprint suppresses laser; physical post-solve clipping remains.
- Earlier quick-click latch, accepted sequence history, canonical muzzle ancestor refresh and deck datum .1875 fixes retained.
- 15 focused pose/beam/input tests passed `.runtime/pose-integration-focused.log`; overlay typecheck passed `.runtime/pose-integration-overlay.log`. Need full new checks and add useful regression coverage of new fixes.
- Canonical assets unchanged. Dev-only `?poseReview=r002` loads exact staged geometry and metadata; do not publish/approve pose art.
- Remaining art: low stock/rifle, scope-eye distance, acquisition/fallback/gait polish, corrected two-hand pistol final browser review.

## Browser/GPU currently held by root, transferable to new agent

Named browser `pose-parent` open at actual http://sidereal.tail7a58a6.ts.net:5173/?poseReview=r002, 900x850 SwiftShader. Uses real same-origin route.fetch, real DB reducer/subscription, blocked HMR and manually stepped engine for GPU budget (not hardware FPS).
- Setup `.runtime/pose-parent-setup.js` derived from cargo-final-setup; physical scene/UI/connection available as `__liveScene`, `__liveUI`, `__reviewConnection`; `__cargoPaint()` runs actual saved frame loops.
- Diagnostic instrumentation failed to match transformed source: `__poseDiagnostics` currently false. Fix route injection against compiled text, reload with same identity (do not mock data/solver).
- Fresh private normal-db fixture created through reducer: character `Pose Integration Review`, UUID689b973d-a007-42cc-9177-293eef7035d5, at original helm (0,10.25). Existing user's identity untouched. All starter gear still in backpack except equipped pack; no weapon equipped yet. Need actual rapid reversal, movement, weapon switches, accepted recoil, seating, sprint/hidden/cleanup + final pistol images/playback. Do not claim initial load proves them.
- Current outstanding command session27727 prints snippet of actual compiled pose source near `const diagnostics` to fix hook. Poll if useful; no ongoing rendering loop while idle.
- Use `bash .agents/skills/playwright/scripts/playwright_cli.sh --session pose-parent ...` (wrapper lacks executable bit). Read skill. Close/blank session afterward, transfer GPU explicitly to planet if needed.

## Appearance/persistence

New API installed via normal managed additive publish, log `.runtime/persistence-live-publish.log`:
`ownAppearance {characterId,revision,appearanceJson}` and `setCharacterAppearance({appearanceJson,expectedRevision,operationId})`.
Private tables/receipts; whitelist content/appearance; excludes inventory-backed toggles. Root App now derives cosmetics from ownAppearance and serializes save callbacks. Check callback's immediate subscription/revision behavior under rapid choices; no optimistic client authority.
IFCS final isolated smoke `.runtime/persistence-appearance-smoke.log` passed two-account complete snapshots/repeated reconnects/same-token two-tab lifecycle; check log76files281tests `.runtime/persistence-check.log`. Private presence ensures only last socket clears character/grant. Actual process restart proof pending: coordinate managed server restart, then `npm run smoke:restart`; do not claim reconnect is restart. Normal world publish done after these tests, no reset.
There is NO other-actor projection/render yet: tests prove concurrent isolated authoritative fixtures, not visible shared-space multiplayer. Document honestly.

## Graphics/Escape/top bar

Root shared wiring applied: `createGraphicsSettings(scene)` get/set/reset/dispose, App GameUIState.graphics and callbacks. Module/UI agent real isolated Babylon+CanvasUI pointer test passed brightness pixel change and reset to exact identity/no pass. All4 sliders + safe local persistence. Vertical tabs; compact Wayfarer panel upper-left, separate right-side buttons. Need combined App review and handoff docs current status. Source/fixture evidence in docs/graphics_system_menu.md.

## Dedicated identity provider: owner override of Orchard plan

User explicitly wants own reusable provider on Proxmox (SSH10.0.1.253), auth.dastari.net, routing via NPM SSHtoby@10.0.1.248. CT creation/installation/domain/proxy configuration explicitly authorized. Never mutate Orchard.
Latest agent report:
- CT116 dastari-auth,10.0.1.230, native Keycloak26.7.3 +Java21 +private PostgreSQL.
- Trusted publicHTTPS discovery https://auth.dastari.net/realms/dastari/.well-known/openid-configuration works.
- NPMhost34/certificate44 created, existing HAProxy exact-SNI route added withbackup/gracefulreload; others preserved.
- Realm dastari, public clients sidereal-game/sidereal-dashboard PKCES256, matching audiences.
- Currently registered callbacks game https://sidereal.tail7a58a6.ts.net:8444/auth/callback; dashboard8445. These HTTPSgame endpoints still need managed proxy setup/verification. Existing Tailscale443 proxies127.0.0.1:3773; preserve it.
- Private bootstrap credentials CT116/root/dastari-keycloak/bootstrap-admin.json; never print/log credentials or tokens.
- Root added dev.py keycloak-{setup,start,stop,status,bootstrap} delegating scripts/keycloak_service.py command(action). Inspect specialist final docs for precise commands/state/backup.
- Root installed `oidc-client-ts@3.4.1` in client; NO login/AuthGate files yet. Use maintained PKCE manager, callback/renew/logout, IDtoken for SpacetimeDB per docs, no password grant/browser secret. Keep actual login style consistent Barlow/condensed, cyan framed navy panels and existing environment imagery. Browser primary official docs inspected; reconsult as needed.
- net.connect third auth arg now available `{token,kind:'oidc'}` and never storesOIDCtoken into labtoken key. Root App still calls old2args and has no auth props yet; wire.
- IFCS implementing proposed exact two-sided identity link with root approval: dev authenticated request target already validatedOIDCidentity, 5min private invitation, target accepts only if no existing character, atomic transfer preservingUUIDs/cargo/appearance/audit, old dev identity retired. No email mapping. API `ownIdentityLinks` plus `requestIdentityLink({targetIdentity,expectedCharacterId,operationId})`, `acceptIdentityLink({requestId,operationId})`; coordinate final details.
- Shared typed server policy hybrid-development until fulltest; issuer auth.dastari.net/realms/dastari,aud sidereal-game; dashboard-only receives no game authority. ProductionOIDConly must not silently fallback. Do not overwrite/delete existing lab token or strand the user's character during login migration.
- Account login needs actual end-to-end browser and direct unauthorized issuer/audience tests. Provider installed does not prove game login integrated.

## Completion checks

Run relevant focused tests; npm run check; npm run build; npm run art:check; isolated authority smoke after auth changes. Coordinate private normal publish only after gates. Keep client/dashboard separatebuild/deployment boundaries. Capture actual final game UI, pose, persistence/login and planet frames. Update current handoffs/records; old failed assembly-overlap test was resolved, do not repeat it as currentfailure. External dashboard transient syntax errors alreadysettled. No final art signoff inferred from numerical tests.
