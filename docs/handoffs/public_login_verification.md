# Public game login verification

2026-09-09. Public callback, real game entry, persistence and interrupted-renewal checks passed. Public routing/deployment is owned by the integration coordinator.

## Scope

Verify the dedicated Dastari PKCE sign-in from `https://sidereal.dastari.net`, callback into the actual game, subscription readiness, reload, logout and subsequent sign-in. Preserve the existing private review character and its inventory. This does not approve character art or change game authority.

## Findings and applied fixes

The client uses its configured authentication origin for both the provider callback and the origin gate before reading a stored OIDC session. The former tailnet-only origin therefore must change alongside the proxy and provider redirect configuration; changing only DNS or NPM does not fix the login destination.

`apps/client/src/auth-session.ts` now consumes the callback and removes its one-use authorization code/state even when provider callback validation fails. Previously, retry could retain those stale parameters as the application's return query. It also checks for an unexpired session with an ID token before mounting the game; a malformed stored or renewed session previously reached a throwing authentication conversion during render. The PKCE library remains responsible for protocol/state validation.

Public browser testing exposed another failure: expensive software-GPU frames delayed replacement WebSocket subscriptions beyond the 15-second timeout. The previous lifecycle waited another 30 seconds to retry, beyond the old ticket's 60-second validity, and reported `ready` while recovery was failing. The coordinator authorized a narrow shared-transport fix: retry after 1/2/4/5 seconds (capped), reconnect immediately when the active socket disconnects, and report `connecting` during failed renewal. The previous socket is retained until the new subscription succeeds. Disposal, obsolete-candidate suppression and overlapping presence remain tested.

The coordinator also authorized one App status callback change: successful connection readiness clears only the known connection-recovery errors, preserving unrelated gameplay errors. Existing canvas UI already hides character creation while connecting. No character, pose or renderer implementation was edited.

## Validation so far

- Five focused callback/session tests passed: successful callback/query restoration, failed-callback cleanup, stored-session reload, external-return rejection and expired/missing-token gating.
- Seven transport tests passed, including timeout retry before the old ticket deadline, bounded backoff, immediate disconnect recovery, disposal and stale-candidate rejection.
- `npm run check`: 116 files / 532 tests passed; TypeScript and 75-document/provenance checks passed. Log: `.runtime/public-login-check.log`.
- `npm run build:client`: passed. Existing Vite configuration extension and large-chunk warnings remain.
- The initial immutable public release (`6c5fdfd00e0c849da3336238ebc0577ef2e4a469236bf781bca6cb2bc54a4b1a`) passed actual provider sign-in to the clean public root, authoritative subscription, stored-session reload, logout and credential re-login. The same existing character `689b973d-a007-42cc-9177-293eef7035d5`, seven item UUIDs and appearance revision 4 survived. Account showed the accepted migration. Logout removed the canvas and OIDC session; no lab token was created.
- Actual render evidence: `output/playwright/public-game-connected-stable.png`; landing/logout: `public-game-login.png`, `public-game-signed-out.png`. The first screenshot `public-game-connected.png` intentionally preserves the renewal failure, not a successful final result.
- With software-render frames queued and stepped manually, actual network subscriptions remained stable for over five minutes across ticket rotations. The initial throttled continuous render encountered long stalls and exposed the recovery defect above. This is authentication/lifecycle evidence, not a hardware-FPS claim or proof that GPU starvation cannot recur.
- Final immutable release `400dc9fdda68accabaa3fbed166b66d97b0a1690767c84a8016cf71596f64116` passed the real-browser interrupted-renewal check: the second subscription was deliberately withheld at 30.055 seconds; the timeout and early retry opened the third at 46.056 seconds, before the original 60-second ticket deadline. The real database connection recovered with identical character, item and appearance state. `output/playwright/public-renewal-recovered.json` records exact attempts/state; `public-renewal-recovered.png` shows the restored ship/HUD without the prior error or creation panel. Network fault injection is explicit; no tokens, database rows or reducer responses were mocked.
- The final release also passed actual logout, fresh credential sign-in and another reload, retaining the same character/seven items/appearance. Final logout removed the session and game; the named `public-login-proof` browser was blanked and closed. Software-GPU slot released.
- Coordinator combined gate for the final release: 534 tests / 116 files, TypeScript, 75-document/provenance, aggregate build and art validation passed. These are combined results reported by the integration coordinator, distinct from this task's earlier local run.

Provider theme assets initially returned 404 with empty MIME in the browser even though uncompressed probes returned 200. The coordinator confirmed that gzip requests failed because Keycloak could not create its compressed resource cache under a root-owned directory, then repaired the cache directory through the managed lifecycle. Actual browser revalidation now returns 200/text/css for all three theme stylesheets; `output/playwright/public-provider-styled.png` shows the complete provider form. No request interception was installed in the initial browser proof.

Credentials remain in private local review storage and must never be committed or copied into evidence.
