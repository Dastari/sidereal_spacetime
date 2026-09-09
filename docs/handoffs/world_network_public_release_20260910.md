# Coordinated world/network release — 2026-09-10

Status: coordinated module/client deployment completed; final public browser acceptance owned by the root integration agent. Owner explicitly authorized deployment on 2026-09-10. This is publication permission, not final art acceptance or shared-universe completion.

## Exact candidate

- Validated source commits `ce099d0e` and `af5bed19`; preserve the external inventory/character work included in these source checkpoints.
- World bundle SHA256 `a75d8f94fe748455ced851e81d2da692037a2bd92c716da57dd8ca161a3738e0`.
- Staged immutable public client SHA256 `c4dfeec5e5df197b4983daab667a471341e85d4b1be6417e19c8ff110a3f0ca7`.
- Previous actual live client SHA256 `2affa484dc8bc4cf457ad4f7baa68f756ae0919e986ade98ae87d3497b88f048`, release `20260909-200402-2affa484dc8b`. Earlier routing documentation lists an older release and is not the rollback selection.
- Private source hash manifest, exact candidate module, pre-release schema and 12 gameplay-table snapshots: `.runtime/releases/world-network-20260910/`. Never publish these operator snapshots.

## Installation and compatibility

The new input protocol requires both module and client. Old clients do not claim input; new clients cannot claim against the old module. Stage the client before interruption, take a cold recovery archive through the managed database-only backup command, publish the world additively (`--delete-data=never`), then immediately activate the staged client. Refresh existing browsers. Preserve the database identity, all character/ship/item/container IDs and existing gameplay state. No reset, identity reassignment, proxy edits or dashboard release is part of this rollout.

The managed `public-client-stage` builds and verifies an immutable release without changing the running app; `public-client-activate` verifies that exact staged digest again before switching the managed public client. `backup-database` stops/restarts only the managed database and never publishes a module; its private cold archive includes the full database directory, CLI config, development settings and old public-client release metadata. It restarts the database even if archive creation fails. Archive creation/manifest checks do not constitute a tested full restore or off-host backup.

## Recovery

Prefer a forward repair preserving state. A client-only rollback is incompatible with the newly required input lease. Do not restore the database archive over a running server or roll back accumulated gameplay as an application rollback. For a pre-acceptance full recovery, coordinate downtime, validate/extract the private recovery archive into a separate path, retain the failed current data, and restore the matched server data/config plus explicitly selected previous immutable client. Full restoration remains an operator action and requires preserving post-backup changes where applicable.

## Validation

Candidate: 685 tests across 132 files, build, art validation, Python tests, isolated authority smoke and real-browser A/B/A control/idle/reconnect checks passed in the preceding acceptance record. Added lifecycle helpers pass private-archive and failure-restart tests plus public-build validation. Public baseline, cold archive hash, installed routes/hashes, state continuity and post-release OIDC browser evidence will be recorded below after execution. No hardware FPS, 100-player capacity, shared-world gameplay or production durability claim follows from these checks.

## Executed rollout

- Root captured a real Dastari PKCE public login baseline before the outage: one account's character/ship, 71 visible items and appearance, in `output/playwright/public-audit-rollout/before.json`.
- `python3 scripts/dev.py backup-database` completed with a 21.406-second database interruption. Private archive `.runtime/recovery-20260910-001924.tar`: 24,977,530,880 bytes, 6,983 members, SHA256 `a76a1f0cb1670ea736acb6b549976f122e3a58f002a5af79257abad4be2dd21f`, mode0600. Archive keys/config stay private. Full restore has not been exercised.
- `python3 scripts/dev.py publish` successfully updated normal database `sidereal-spacetime-dev`, preserving identity `c2005c24147323197826efa22f24e30d2d99a93a5a5091949f2ad25fa2127572`. Its rebuilt bundle matched the exact accepted SHA above. The CLI warned that view/schema changes disconnect clients; it did not reset data.
- `python3 scripts/dev.py public-client-activate` immediately selected immutable release `20260910-001333-c4dfeec5e5df`; entry `/assets/index-BX1yKSF4.js`. Public root, callback, database ping and entry returned200. Root HTML and JS bytes exactly matched the installed release; entry SHA256 `b4f3603063954f35be9be171b1782a6f32fdb35d2f90e7f7749d983d4b210a54`.
- Private before/after SQL snapshots confirmed all 25 ships, 25 characters, 603 items, 165 containers, 17 inventory-state rows, 85 hotbar rows, 40 storage bindings, three appearances, six weapon-energy rows and 25 stations retained. Inventory/appearance rows were unchanged; movement/connection fields were excluded from stable-state comparisons. Normal-world construction instance/location counts remain zero; qualified fixtures were installed in isolated review databases only.
- Dashboard and development-client processes were preserved unchanged. No proxy/provider settings or dashboard artifact was changed. Shared source freeze was released only after publication and exact bundle verification.
- Seven focused Python lifecycle checks pass, including failure recovery, private archive permissions, immutable staging without stopping the live client, and rejection of tampered stages before activation.
- Full `npm run test:python` passed after rollout:20 lifecycle/publication tests and nine art tests. Schema comparison shows44→46 private tables, adding only `inputControl` and `inputControlCursor`; no tables were removed.
- Root's actual post-release browser reload restored the same account's character, ship, appearance and all71 visible item records; `before.json` and `after.json` in `output/playwright/public-audit-rollout/` were byte-equivalent. Fresh sign-in and movement acceptance follow separately.
