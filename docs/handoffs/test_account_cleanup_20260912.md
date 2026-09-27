# Test account cleanup — 2026-09-12

Status: live cleanup finished for 26 confirmed test/development ship owners. Dastari and Desparil remain. The owner was asked whether the second personal login, Desparil, should also be deleted; that decision is pending.

The owner authorized removing other players' ships and their associated accounts. Provider inspection verified the exact Dastari subject/identity against its current ship owner. The second personal login was excluded pending clarification; it was not assumed to be a test login. Three provider test logins and 23 development identities were in the applied scope.

## Applied operation

- Deleted 26 ships and characters, their inventory and related runtime/account rows: 2,398 pinned rows in total. Two ships, two characters and 14 starter inventory items remain.
- Deleted the three exact test users from the dedicated Dastari Keycloak realm after verifying their UUIDs, usernames and test email addresses. Logged out their provider sessions first. Both personal provider account representations remain unchanged. Other realms and service configuration were untouched.
- Retained minimal retired-identity tombstones, including the historical linked source, so old game/development tokens cannot recreate deleted characters. These are denial records, not usable accounts. A fresh real-provider test token received HTTP 403 from the existing retirement guard on both isolated and live databases.
- Preserved the retained characters' and ships' UUIDs and ownership. Their complete construction-instance, inventory-item/container and appearance rows, plus celestial-body definitions, compare byte-for-byte with the pre-cleanup snapshot.

This is explicit database-owner SQL maintenance, not a public gameplay endpoint. The script pins primary keys in a private audit, validates ownership before applying, retires target identities first, and removes simulation roots before dependent rows. Each DELETE is transactional; the batch is resumable rather than one database-wide transaction. Exact replay is harmless. No database reset, server/client publication, restart or native asset change was needed. Normal database PID458746 and public-client PID901687 remain running.

## Verification and evidence

`scripts/cleanup_test_accounts.py` defaults to planning. `scripts/test_cleanup_test_accounts.py` passes five tests covering nested inventory, empty parent IDs, protected passenger/reference rejection, explicit protected scope, and SQL literal escaping. The provider operation is `ops/keycloak/delete-ship-test-accounts.py`, restricted to the three exact test users and read-only unless `--apply` is supplied.

Isolated replacement-database cleanup and replay passed. The first attempt exposed timer recreation of actuator rows; the final operation removes ship/character simulation roots first. A second isolated run removed nine accounts and 1,024 rows while retaining the protected account's ship geometry, inventory, appearance and celestial state. Both isolated databases were preserved.

`npm run check` passed typechecking but hit the existing planet-terrain 20-second timeout twice under default parallelism (all other 1,837 tests passed). The complete unchanged suite then passed with `npm test -- --maxWorkers=2`: 1,838 tests / 309 files. Documentation validation and `npm run build` passed. No gameplay authority or UI code changed in this cleanup.

Private evidence under `.runtime/shipyard-completion/`: `account-cleanup-live.json`, `account-cleanup-provider-before.json`, `account-cleanup-provider-result.json`, `account-cleanup-reconnect-denial.json`, and `account-cleanup-isolated*.json`. Execution logs are `/tmp/account-cleanup-live.log`, `/tmp/account-cleanup-isolated-final.log`, `/tmp/account-cleanup-tests-limited.log`, and `/tmp/account-cleanup-build.log`. Entry dirty-file list is `account-cleanup-entry-status.txt`; entry HEAD was `1da95ec173fe81e81b3fa005889ec7dbbc93e97e`. Shared changes were not staged, reset, cleaned or restored.

The world module and public client retain the preceding [Wayfarer release](wayfarer_player_replacement_20260912.md) pins. This account maintenance does not mark any Shipyard contract or art revision complete.
