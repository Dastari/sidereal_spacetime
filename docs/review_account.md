# Retained game and Studio review account

Owner authorized2026-09-21: retain a semi-permanent account for in-game and
in-editor development/testing. Do not delete it as session cleanup. Retirement
requires the owner's go-live decision; do not infer that a deployment means
permission to delete it. This supersedes the temporary-account cleanup plan.

- Issuer: `https://auth.dastari.net/realms/dastari`, dedicated managed CT116.
- Username: `sidereal-development-review`.
- Provider subject: `cd533b9d-db67-4317-ad07-d75b679f6fd2`.
- Managed owner marker: `sidereal-development-review-v1`.
- One account works through normal `sidereal-game` and `sidereal-shipyard` PKCE.
  Game characters and editor grants remain separate server-owned records.
- Canonical credentials: CT116 `/root/dastari-keycloak/sidereal-development-review.json`,0600.
- Local credentials: `~/.local/share/sidereal-review/account.json`,0600 in a0700 directory.
  Never put passwords/tokens in chat, source control, screenshots, traces or command output.

## Reuse

From the active project checkout:

```sh
python3 scripts/dev.py keycloak-development-review-account
```

This verifies the existing provider ID, reuses the saved credential, and refreshes the private local
file. It does not rotate credentials, reset characters, change grants, or recreate
a missing/disabled account. Genuine PKCE verifies password acceptance. It refuses to adopt a same-name account without the
managed credential record. Creation is only for the initially absent account.

Open the genuine sign-in page using the Playwright skill, then:

```sh
python3 scripts/review_signin.py --session map-auth-review --return-url https://sidereal.tail7a58a6.ts.net:8445/map
```

For game work, use the game session and its actual post-login URL. The helper
accepts credentials only from the private file and discards CLI code-echo output.
Do not use direct password grants, fabricated provider tokens, or cookie injection.

## Authoring access

The account is an ordinary player by default. Provisioning authoring grants uses
a temporary provider role, distinct from retaining the account:

```sh
python3 scripts/dev.py keycloak-development-review-grant
# Sign in again for fresh claims. Set short, explicit workspace grants on the
# intended isolated database, then test normal authority paths.
python3 scripts/dev.py keycloak-development-review-revoke
```

Remove the temporary construction-administrator role after grant setup/testing.
Revoke isolated workspace grants after the scenario, and end privileged browser
sessions. Do not remove the account or reset its character/inventory state.
Future test runs explicitly choose the target database; retaining this identity
is not blanket authorization to mutate the public game world. Record database,
workspace grants, character UUIDs, scenario evidence and cleanup in the task handoff.

The deleted historical `sidereal-review-7aaa4143` account and its stale credential
record are history, not this identity. Do not run its old password-rotation or
`keycloak-review-grant` helpers for this account.

Interrupted provisioning retains a private pending credential. `ensure` resumes
before creation or after a saved provider ID without changing the password. If a
POST response was lost, recovery additionally requires the provider ownership
marker; when user-profile policy omits that marker, it stops for operator ID
verification instead of adopting a same-name account. Never discard the pending
credential or reset the account to bypass that check. Normal reuse pins the exact
provider ID in the private record and rejects contradictory ownership markers.
