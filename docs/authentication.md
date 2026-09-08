# Shared OIDC provider, separate applications and game permissions

Status: Provider selected; registrations prepared; live sign-in remains M1
Last updated: 2026-09-08
Owners: Sidereal project

Reuse Orchard's existing Keycloak issuer: `https://auth.orchard.dastari.net/realms/orchard`. Public discovery was fetched successfully on 2026-09-08 and advertises Authorization Code endpoints, JWKS and PKCE S256. The provider's existing users, verification/recovery and MFA flows remain provider-owned. No new identity server is required for this pivot.

Prepare two public browser clients, `sidereal-game` and `sidereal-dashboard`, using the JSON registrations in `ops/oidc`. Each uses Authorization Code + PKCE S256, with implicit flow, password grant and service accounts disabled. The prepared registrations contain only exact localhost callback/origin values; add the chosen exact HTTPS production origins before deployment. There are no wildcard callbacks or browser client secrets. These files are reviewable registration inputs; they have not been imported into the live Keycloak realm, and the existing Orchard client has not been changed.

The two apps have separate storage/origins and separate OIDC state/nonce/PKCE flows. The provider can give SSO through its own session; do not pass tokens through cross-app query strings or share browser localStorage as an authentication bridge. Configure audience mappers and verify exact issuer, intended audience and expiry at the SpacetimeDB authentication boundary and in module policy. Use provider refresh/session behavior via a maintained OIDC library. Production mode must reject anonymous local tokens; never silently fall back to the lab identity.

One issuer/subject links to one Sidereal account identity, with multiple independently owned character UUIDs. The original Sidereal email account and local scaffold test identities are not automatically the same account. Do not grant ownership/admin by matching email text. Explicitly link the owner's verified provider identity through a trusted bootstrap procedure, preserving Toby's requested admin privileges without copying passwords or MFA secrets.

Game membership and dashboard permissions live in private, revocable server records. A valid provider account grants no automatic authoring rights. Check separate scopes such as `world.read`, `blueprint.write`, `world.refit`, `script.edit`, `script.publish`, `account.manage`; revalidate every privileged operation and enforce MFA/session assurance for sensitive publication according to the selected policy. Keycloak realm administration is a separate permission plane from game administration. The same validation applies to direct reducer calls from modified clients.

M0 remains explicitly `mode = "development"` in `dev.toml`: the game creates private test identities, while the dashboard provides read-only assembly/design review. M1 must implement real PKCE login, callback/renewal/logout, verified membership and character binding, admin scopes and tests for wrong issuer/audience, revoked access and stale sessions before public exposure or live dashboard mutation. Provider selection is now settled; production origins, application registration and trusted bootstrap remain concrete deployment work.

The lifecycle runner refuses startup/publication when `auth.mode` is anything other than `development` until M1 provides the production adapter. Changing a configuration label alone cannot enable or claim secure production login.
