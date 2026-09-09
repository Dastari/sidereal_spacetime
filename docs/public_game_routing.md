# Public game routing

2026-09-09. Owner-authorized public cutover, independent of dashboard releases and world-module publication.

## Installed routes

| Route | Installed target |
| --- | --- |
| `https://sidereal.dastari.net` | NPM host23, certificate33, `http://10.0.1.200:5183` |
| `https://auth.dastari.net` | NPM host34, certificate44, dedicated CT116 `http://10.0.1.230:8080` |
| Game `/v1/*` including WebSocket | Same-origin proxy to the existing private database at `127.0.0.1:3100` |

The old game upstream was port3000 and returned502. Its Rust services remain stopped. The dedicated provider already worked; its route was preserved. The existing SNI allowlist contains both names. No Orchard, dashboard or unrelated proxy host was changed.

The canonical game PKCE callback is `https://sidereal.dastari.net/auth/callback`. Existing exact tailnet review redirects remain registered. `dev.toml` distinguishes the canonical `client_origin` from `client_review_origin`; changing only the reverse proxy would leave the client's origin gate pointing at the old review URL.

## Managed release

Run all lifecycle actions through `python3 scripts/dev.py`:

- `keycloak-game-origin`: add the exact public callback, origin and logout URL to the existing dedicated game client. Uses the real Admin API, private backup and preserves users and other clients.
- `public-client-deploy`: build only the client, reject internal-document trees and symlinks, copy and hash an immutable release, then restart only the public client.
- `public-client-stage` / `public-client-activate`: separate the same verified immutable build from activation, allowing a matching world-module release between staging and the client switch. Activation rechecks the staged hash before stopping the existing client.
- `public-client-up` / `public-client-stop`: start or stop that installed release.
- `public-client-proxy`: back up NPM privately and reconcile only the existing dedicated game host to port5183; preserve its certificate and verify unrelated host rows unchanged.

The public build currently uses a managed Vite preview process with a pinned output directory and same-origin database proxy. This establishes a separate built-client release, not completion of production hosting hardening. Development and dashboard builds cannot silently replace the pinned release. The database remains hybrid-development during account migration; removing the public development-entry button is not OIDC-only server enforcement.

Installed release metadata is `.runtime/public-client/release.json`; immutable directories are under `.runtime/public-client/releases/`. Initial cutover digest: `6c5fdfd00e0c849da3336238ebc0577ef2e4a469236bf781bca6cb2bc54a4b1a` (ordered relative paths and per-file SHA256 digests). The subsequent recovery-fix release is `400dc9fdda68accabaa3fbed166b66d97b0a1690767c84a8016cf71596f64116`, installed under `20260909-171343-400dc9fdda68`. It includes bounded connection-retry recovery and the isolated shadow-cache CPU change, preserving the current published character assets. Aggregate `npm run check` passed534tests/116files, typecheck and75-document/provenance checks; `npm run build` and `npm run art:check` passed. Build retains existing Vite large-chunk/config warnings. Python public-build and public-preparation suites passed six tests. No world module was published and no database was reset for this cutover.

### Earlier authentication protocol release — 2026-09-10

The preceding hashes are historical cutovers. The authentication corrective client was `c1cebc65e0e1521083da2aa353e0c15973a241c0b6bd69cf853778fcc1adf3d7`, directory `20260910-010212-c1cebc65e0e1`, entry `/assets/index-DDJznEWm.js`. It pairs with normal-world bundle `bc9d19cd61858407b2bd892e27efb75b6180a8a43366f905fc77a935c00c306c`, published additively to the existing database. This release requires the input-control and original-provider-token admission protocols together; do not roll back only one half.

The initial audit rollout exposed a60-second OIDC admission failure despite the socket remaining open. The corrective release binds each game connection to the host-verified original provider expiry; bootstrap OIDC tickets alone grant no gameplay. See the [coordinated release ledger](handoffs/world_network_public_release_20260910.md) for exact artifacts, the preserved pre-release client, private cold-backup metadata, isolated real-provider verification and final public browser evidence. The route, dedicated provider, dashboard and durable character/inventory state were preserved. This is not shared-universe or production-durability completion.

### Current normal shared-world release — 2026-09-10

The installed client is `66b5a92b0b6d0c1db0dbbc3ceba0bbd7b0706e909de94d469de15a07a84fddf1`, directory `20260910-030916-66b5a92b0b6d`, entry `/assets/index-Cenf-nBs.js`. It pairs with additive world bundle `317c007a22ae5a5a2fe5c6fb8c041f567c022f48954d08085b5fd327cb41e1ec`. New characters enter the shared system directly; existing private characters choose **Map → Join shared system**. Existing identity, inventories and private access remain authoritative. The input-control and original-provider-proof protocols above are retained.

The public entry bytes match the immutable artifact through NPM. The normal database identity was preserved, and authoritative inventory/appearance/character continuity was checked across publication. A fresh managed cold archive was captured before deployment. See the [normal shared activation record](handoffs/shared_world_normal_activation.md) for pinned artifacts, checks, upgrade/explicit-join evidence, recovery scope and actual public account/join/two-exterior evidence and the pending onboarding-copy correction. The independently deployed dashboard is unchanged.

## Verification and recovery

Public root, SPA callback, database ping and provider discovery returned200 after cutover. Actual browser PKCE reached the clean public root and authoritative game state. Real login, reload, five-minute paused-render continuity, logout and credential re-login passed. A deliberately stalled renewal recovered before the old ticket expired with character/item UUIDs and appearance unchanged. See [the current browser verification record](handoffs/public_login_verification.md) for the separate software-renderer limitation and exact evidence; do not equate an HTTP200 with a complete account flow.

NPM's private pre-cutover backup is `/data/backups/sidereal-game-before-1788936634667.sqlite` inside `nginx-proxy-manager-app-1`. Do not restore the whole shared proxy database to undo one route. Preserve all unrelated hosts; use its normal host editor/API for a targeted correction. Reverting to the old port3000 would restore the known broken upstream, not a working game.

For an application rollback, stop only `public-client`, repoint `.runtime/public-client/current` to the explicitly selected previous immutable release and update `release.json` to its verified digest, then use `public-client-up`. Keep the domain, exact provider redirects and database state intact. Do not use rollback to revert character, inventory or construction authority.
