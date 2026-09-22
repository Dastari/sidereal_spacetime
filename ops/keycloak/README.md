# Dedicated Dastari identity provider

Installed and externally reachable; no Orchard dependency or account migration. This supersedes the earlier Orchard issuer plan for new Sidereal login integration.

- Proxmox: `root@10.0.1.253`, node `pve-ms-02`.
- Dedicated CT116 `dastari-auth`, unprivileged Debian13 template13.1-2,2vCPU/4GiB RAM/32GiB nvme_pool root disk. Ownership marker `dastari-auth-managed`.
- DHCP address `10.0.1.230` onvmbr0. Configure a router DHCP reservation for its existing MAC before relying on a permanent upstream; no router configuration was changed in this task.
- Keycloak26.7.3 native distribution, Java21.0.12.1, PostgreSQL17.11. Keycloak archive pinned to official release SHA256 `77657f30b7e90d70f727712ce1c967f430fd6a5e9f458d32d8c6df0635345f47`.
- Issuer `https://auth.dastari.net/realms/dastari`; public discovery and trusted TLS verified.

Managed lifecycle: `python3 scripts/dev.py keycloak-setup|start|stop|status|bootstrap`. `scripts/keycloak_service.py` owns the marked CT only, never repurposes an existing unmarked container. Setup imports the realm only when absent, preserving existing accounts on later starts. Configuration/client changes after initial import require the real Admin API rather than overwriting the realm. `bootstrap` configures the exact NPM host and exact SNI allowlist entry, then prints only the private credential location.

## Proxy/TLS

Nginx Proxy Manager host: `toby@10.0.1.248`, container `nginx-proxy-manager-app-1`. New proxy host34 maps only `auth.dastari.net` to `http://10.0.1.230:8080`, TLS certificate44 issued by Let's Encrypt. All pre-existing host database rows were compared and preserved, including Orchard. NPM's existing administrator-maintenance API generated the configuration and audit records; no login credentials/tokens were forged or exported.

The upstream public HAProxy SNI allowlist needed the one exact new hostname. `/etc/gema/haproxy/gema-web-sni.lst` was backed up, appended in place to preserve its Docker bind mount, syntax-checked, and reloaded with master-worker USR2. Other SNI routes and TLS passthrough remain unchanged. NPM SQLite backups are private under `/data/backups/dastari-auth-before-*.sqlite`; SNI backups under `/etc/gema/haproxy/gema-web-sni.lst.dastari-auth-before-*`.

## Realm/client contract

Realm `dastari` is reusable across applications. Self-registration enabled; minimum password length12; brute-force protection enabled. SMTP is not configured, so email verification and password-reset email are disabled; email must not grant verified-email authorization. No external identity-provider link or Orchard migration was created.

Clients are public authorization-code clients, implicit/password grants disabled, PKCES256 required, exact redirect URLs and exact web origins. Access-token audience mapper explicitly includes the respective client ID.

| Client | Callback | Web origin |
|---|---|---|
| sidereal-game | https://sidereal.tail7a58a6.ts.net:8444/auth/callback | https://sidereal.tail7a58a6.ts.net:8444 |
| sidereal-dashboard | https://sidereal.tail7a58a6.ts.net:8445/auth/callback | https://sidereal.tail7a58a6.ts.net:8445 |

Actual Admin API read verified those settings. These app HTTPS endpoints were NOT provisioned by this task; root/new integration agent owns final secure app origins, callback routing and PKCE login verification. If final app origins differ, update only these dedicated clients through the Admin API and update the source realm recipe. Do not loosen redirects to wildcards.

## Secrets, persistence and backup

Only inside CT116: `/etc/keycloak/service.env` mode640 root:keycloak contains DB/bootstrap environment; `/root/dastari-keycloak/bootstrap-admin.json` mode600 contains initial administrator credentials. They were generated cryptographically and never printed or copied to git. Create a permanent administrator through real Keycloak admin flow and remove the temporary bootstrap account afterward; this operator handoff remains outstanding.

Postgres data persists in `/var/lib/postgresql/17/main` on the CT disk. Keycloak source lives `/opt/keycloak`; systemd unit `/etc/systemd/system/keycloak.service`. A private initial logical backup was completed: `/var/backups/dastari-keycloak/initial-provider.dump` (custom format,444654bytes), `initial-globals.sql`, `service.env`, all under mode700 directory and mode600 files. These backups are inside the same CT, not disaster recovery. No recurring/off-host backup was configured; new infra owner should schedule and test restore/off-host protection. Never restore over a running/shared provider casually.

## Evidence and remaining integration

`.runtime/keycloak-setup.log`, `keycloak-client-verification.json`, `keycloak-proxy-final.log` retain non-secret installation/read-validation output. Provider runs production `start --optimized`, hostname strict, HTTP only on private upstream behind trusted NPM forwarded headers. Health endpoint is not publicly proxied separately. Local `journalctl` returned no persistent journal records in this minimal CT; add persistent service logging as operational follow-up.

No game TLS routes, browser account signup, account-to-character binding, SpacetimeDB JWT integration or appearance persistence were implemented by this provider task. Those remain with root/new integration agent. Existing Orchard provider, other containers and other proxy hosts remain unchanged.

Primary sources checked: [official26.7.3 downloads](https://www.keycloak.org/downloads), [production configuration](https://www.keycloak.org/server/configuration-production), [hostname/proxy configuration](https://www.keycloak.org/server/reverseproxy), [database support](https://www.keycloak.org/server/db), [realm import behavior](https://www.keycloak.org/server/importExport). Release archive SHA256 was read from the official GitHub release asset metadata.

## Subsequent game integration — 2026-09-09

The integration owner installed the exact game8444/dashboard8445 tailnet HTTPS routes through managed `auth-https-setup`, preserving the existing443 route. The game now uses the dedicated provider's real Authorization Code/PKCE login, explicit account-to-character transfer, session-scoped token handling, overlapping renewal of the SDK's60-second game tickets and logout. Actual login, character/item UUID preservation,72-second renewal, logout/re-login, genuine-token isolated transfer and process-restart durable-state tests passed. A genuine same-subject dashboard-only token was denied game admission while the game session remained active. See `docs/authentication.md` and `docs/character_persistence.md` for evidence and remaining limits. This supersedes the provider-task-only pending integration statements above; dashboard authoring permissions remain separate work.

## Shipyard world authoring client

Managed `python3 scripts/dev.py keycloak-authoring` installs the distinct public PKCE client `sidereal-shipyard`, callback `https://sidereal.tail7a58a6.ts.net:8445/shipyard/auth/callback`, exact dashboard origin and explicit `sidereal-game` resource audience. This intentionally admits the authoring session to the world resource, while `sidereal-dashboard`-only tokens remain denied. No password grant, browser secret or wildcard callback is enabled. The command creates the `sidereal-construction-admin` provider role but assigns it to no user. That verified role may issue explicit workspace grants; ordinary login and ship ownership cannot.

Actual PKCE and isolated role/grant/publication proof passed. The dedicated review account received the role only for testing and it was revoked immediately afterward; its short-lived isolated grants expire separately. Production/operator grant ownership and live construction installation remain separate from this proof. Configuration source: `ops/keycloak/configure-authoring.py`; exact Admin API behavior follows [the official REST reference](https://www.keycloak.org/docs-api/latest/rest-api/index.html).

## Public game origin cutover — 2026-09-09

The owner explicitly authorized replacing the stopped legacy game upstream. Managed `python3 scripts/dev.py keycloak-game-origin` added the exact `https://sidereal.dastari.net/auth/callback`, web origin and logout root to the existing `sidereal-game` client, preserving its exact tailnet review URLs, public PKCE settings and existing accounts. The source realm recipe now includes both origins. Managed `public-client-deploy` and `public-client-proxy` installed a pinned client build and changed only NPM game host23 from port3000 to port5183, retaining certificate33. Auth host34 still targets CT116 at10.0.1.230:8080 with certificate44; all unrelated NPM host rows were verified unchanged. See [routing runbook](../../docs/public_game_routing.md) and [browser verification](../../docs/handoffs/public_login_verification.md); successful routing alone is not continuity acceptance.

## Compressed login resources — 2026-09-09

Public browser verification exposed CSS/JS404 only when the request accepted gzip. Direct CT requests reproduced the same failure, ruling out NPM. `/opt/keycloak/data` had been created as root after installation and the service could not create its runtime gzip cache. Managed `python3 scripts/dev.py keycloak-repair-cache` created only `/opt/keycloak/data/tmp` as keycloak:keycloak0750. The install recipe now ensures this directory exists. No restart, realm change or source/config permission broadening was needed. The exact failing stylesheet and password-visibility script now return200 with their proper MIME and gzip content encoding through the public proxy. Browser recheck is recorded in the public login handoff.

## Retained development review identity (2026-09-21)

The owner requested a reusable semi-permanent game/editor account, retained until
an explicit go-live retirement decision. Use the [review account runbook](../../docs/review_account.md)
for its stable identity, private credential locations and normal PKCE workflow.
Managed `keycloak-development-review-account` verifies/reuses the account without
password resets. Separate `keycloak-development-review-grant` / `-revoke` commands
manage temporary construction-administrator access; role cleanup never deletes
the account. The older deleted review identity is not silently recreated.
