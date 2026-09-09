# Dedicated account authentication

The owner superseded the Orchard provider plan on 2026-09-09. Sidereal uses the reusable dedicated Dastari provider; Orchard remains untouched.

## Installed provider and application origins

- Issuer: `https://auth.dastari.net/realms/dastari`.
- Game client: public `sidereal-game`, canonical callback `https://sidereal.dastari.net/auth/callback`. The exact tailnet review callback remains registered separately.
- Dashboard client: public `sidereal-dashboard`, exact callback `https://sidereal.tail7a58a6.ts.net:8445/auth/callback`.
- The public game is an immutable client build behind NPM host23, forwarded to `10.0.1.200:5183`. Managed deployment and recovery are documented in [public game routing](public_game_routing.md). The game8444/dashboard8445 review routes remain tailnet-only Tailscale Serve proxies, managed by `python3 scripts/dev.py auth-https-setup|status|stop`; existing port443 is preserved. Dashboard authorization remains independent.
- Provider lifecycle, private backup locations and remaining operational work: [provider handoff](../ops/keycloak/README.md).

The 2026-09-09 public cutover has passed HTTP routing, actual PKCE callback into the game, reload, logout and credential re-login with character/items preserved. A five-minute continuity run passed with software-render frames paused. A render-stalled run exposed slow renewal retry; the transport recovery fix subsequently passed a public failure-injection check: a stalled second subscription retried at46.056seconds, before the original60-second ticket expiry, preserving the same character, seven items and appearance. These are distinct gates; do not treat the paused-render test as hardware rendering acceptance. See [current public verification](handoffs/public_login_verification.md).

## Client implementation

The game uses `oidc-client-ts` Authorization Code + PKCE S256 with no browser secret or password grant. The dedicated provider handles credentials; the game receives the callback and supplies the ID token to SpacetimeDB. OIDC session and pending authorization state live in sessionStorage. The pinned SpacetimeDB SDK exchanges the ID token for a 60-second WebSocket ticket. The client therefore opens a replacement connection every30seconds and waits for its subscription before closing the old one, preserving the authoritative presence lease and occupied controls. ID-token renewal uses the same overlap. Expiry/logout unmounts the game and disconnects all its sockets. OIDC tokens are never written to `sidereal.lab.token`.

The game landing screen uses the current Barlow typography, navy/cyan frames and shipped nebula asset. Account opens a separate panel with sign-out and the explicit migration flow. Actual provider PKCE/callback and game Account transfer have passed. The transferred review character retained its UUID, seven inventory item UUIDs/placements, appearance and position; the old development identity lost access. A72-second actual browser continuity check crossed multiple ticket rotations; logout cleared the session and re-login retained the same character and inventory.

Development builds retain an explicit development-character entry. Existing HTTP development sessions with a stored lab token continue directly to avoid stranding current work. Production builds do not offer that UI fallback. The database remains explicitly hybrid-development during this migration; do not describe it as production OIDC-only enforcement.

## Preserve an existing character

1. Keep the development character open in its original browser/origin.
2. Sign in to the secure game in another window. Before creating a new character, open Account and copy its destination account code.
3. Paste that code into Account in the development session and request transfer.
4. Accept the named character on the signed-in destination account.

Both identities must have authenticated active sessions; the invitation expires after five minutes. The target must have no existing world state. Reducers atomically transfer ownership while preserving character, ship, inventory, equipment, appearance and audit identities. No email-to-character mapping or client-written owner/transform is used. The old development identity is retired; its local token is retained rather than silently overwritten. Transfer is not an account merge.

## Server enforcement and boundaries

IFCS owns the exact issuer/audience/expiry checks and two-sided link reducers. Dashboard-only tokens are rejected from the game database, including when the same subject has a concurrent game session. Private base tables remain private. See [persistence and auth evidence](character_persistence.md) for actual tests and the principal-scoped view expiry limitation.

Completed gates include isolated auth/persistence smoke, additive normal development publication, provider PKCE/callback, actual game account transfer,72-second overlapping connection continuity, logout/re-login, genuine-token isolated transfer/reconnect, and genuine dashboard-token rejection while the same subject held a valid game socket. A managed database process restart retained both full character appearance/inventory/container snapshots, equipped/displaced weapon IDs, combat energy/sequence, ship and operation receipts. The aged moving asteroid remained in the private table but had left discovery; the durable-row restart check explicitly excludes that transient discovery assertion. Logs: `.runtime/auth-real-provider-smoke.log`, `.runtime/auth-real-dashboard-admission.log`, `.runtime/auth-controlled-restart-persistence.log`; browser evidence is under `output/playwright/dastari-*`. Foreign-issuer rejection has focused policy coverage, not a second real-provider experiment. Occupied helm renewal over72seconds also passed without losing the station; a changed Medic appearance survived reload with its authoritative revision and seven item UUIDs retained (`.runtime/auth-seated-continuity.log`, `.runtime/appearance-and-sprint-proof.log`). Concurrent private fixture testing does not yet establish visible shared-space multiplayer.

Protocol reference: [oidc-client-ts UserManager and PKCE](https://authts.github.io/oidc-client-ts/).
