# Same-box setup, lifecycle and recovery

Status: Accepted direction; implementation staged
Last updated: 2026-09-08
Owners: Sidereal project

## Preserved reference installation

`/root/sidereal` source, data/content, Blender sources, original downloadable client and Docker volume remain available. Its managed services were stopped through `scripts/siderealctl down`; `docker compose stop` stopped its Postgres service. `cargo clean` removed only build outputs. A validated 1,149,265,346-byte custom-format database backup exists at `/root/sidereal-backups/pre-spacetime-pivot-2026-09-08.dump` with mode 0600. Backup listing was validated; a full restore of that large reference database was not performed. The backup and old volume are not imported into the new project.

Do not start old and new stacks through each other's tooling. Restarting old Sidereal requires rebuilding its Cargo binaries first. The legacy Rust services remain stopped. On 2026-09-09 the owner authorized repointing `sidereal.dastari.net` to this project's managed public client build; see [public routing](public_game_routing.md).

## New installation

Requires Node 24+, npm, Python 3.11+ (tomllib), Linux process groups and, for art, Blender 4.3+, Python NumPy, Xvfb and Python venv. Installed versions are captured in the verification report. Node/package dependency versions are pinned by package-lock; SpacetimeDB CLI and server are isolated under `.tools/spacetime`, pinned to 2.10.0. The tool wrapper requires `--root-dir=<absolute-path>` with an equals sign; the project runner supplies it. It does not change shell PATH or select a global SpacetimeDB version.

```sh
cd ~/sidereal_spacetime
npm ci
npm run setup
npm run art:setup       # optional to reinstall the local Blender MCP environment
npm run art:export      # regenerate GLB from the preserved .blend collection instances
npm run dev
npm run status
npm run stop
```

`npm run dev` starts the local durable database, waits for HTTP readiness, publishes the module with `--delete-data=never`, then starts both independent Vite applications and waits for readiness. It refuses occupied ports. PIDs and Linux start times are recorded privately, so stop cannot kill an unrelated reused PID. Logs are under `.runtime`. The server data is `.spacetime-data`; secrets/CLI keys are `.tools/spacetime/config`. Never commit either.

Default browser: `http://localhost:5173`, LAN `http://10.0.1.200:5173`. The explicit Tailscale host allowed for this machine is in `dev.toml`. Browser WebSocket/API traffic uses the same origin `/v1` proxy; database port 3100 binds loopback. The HTTP development route retains explicit local identities. The public HTTPS game uses the dedicated Dastari PKCE provider; server authority remains hybrid-development during migration. See [authentication evidence and limits](authentication.md). No original user token/account was copied; anonymous lab identities can only access their own test rows.

## Build and test

```sh
npm run check
npm run build
npm run smoke
npm run stop
npm run dev
npm run smoke:restart
```

`smoke` republishes/reset ONLY `<configured database>-smoke`, then tests two independent identities. The normal developer database is never reset by tests. Keep `.runtime/smoke-identity.json` private. Restart verification reconnects to the smoke identity and checks the same ship UUID, name and receipt. M9 adds abrupt termination/restore/fault injection. M0 does not claim production durability or load acceptance from a successful graceful restart.

For scripts after source changes: `npm run world:publish` validates/publishes a non-destructive update; `npm run world:generate` refreshes bindings. Breaking schemas must use an explicit planned migration or an explicitly isolated reset, never automatic data deletion on ordinary startup. Matching client/CLI/module versions are essential.

## Backup and restore

Stop the new stack, then `python3 scripts/dev.py backup` produces a mode-0600 cold archive in `.runtime`. Copy it to private off-host storage through an operator-controlled workflow. A complete recovery set includes database data, the local server JWT keys/config (privately backed up separately), exact module artifact/source, package lock, asset manifests and content revisions. Protect credentials and encryption keys independently. Test recovery into a separate folder/port before replacing active data. Never restore over a running database, and never use the old AGE dump as a SpacetimeDB restore file.

The M0 backup helper captures data only and is a development recovery aid. M9 must automate encrypted key/config backup and a complete validated restore before public release.

For coordinated releases, `python3 scripts/dev.py backup-database` now interrupts only the managed database, preserving the running application processes. It writes a mode0600 cold archive containing database data, CLI config, `dev.toml` and the previous public-client release metadata, then restarts the same database without publishing even if archive creation fails. Hashing and archive inventory happen after restart. The2026-09-10 release archive took21.406seconds of database interruption; its exact private path/hash and limits are recorded in the [release ledger](handoffs/world_network_public_release_20260910.md). Keep its credential-bearing contents private.

An actual same-host isolated recovery was subsequently verified through `restore-review-prepare`, `restore-review-up`, `restore-review-restart` and `restore-review-stop`. The fixed private recovery copy uses its archived signing keys and a separate loopback port; it cannot overwrite or publish the live database. Stable normal-world records, two isolated restarts and basic private-table/view checks passed. See the [recovery verification](handoffs/restore_review_20260910.md) for the exact archive, commands, excluded dynamic fields and scope. Off-host recovery, point-in-time recovery, replica failover and subsequent migration replay remain unverified.

`public-client-stage` prepares and verifies an immutable client without changing the live process. After a compatible additive world publication, `public-client-activate` verifies and activates that exact stage. The commands use the same managed entrypoint, `python3 scripts/dev.py`; the independent dashboard is not published. The current protocol requires coordinated world/client rollout and existing browser refresh. Never treat an old client-only switch as a safe rollback across an authority protocol change.

## Publishing and long-running service plan

Vite dev is the review server. Production will serve `apps/client/dist` and `apps/dashboard/dist` through a managed static server/reverse proxy with HTTPS, WebSocket upgrade, bounded payloads, trusted origins, safe caching and production OIDC. Pin assets by content hash and publish manifest atomically. Add systemd supervision/restart policy, disk/memory/tick alerts, log retention, scheduled backups, graceful draining and release rollback at M9. Do not treat a terminal-launched development process as a production service.

## Independent application operations (2026-09-08)

`npm run dev:client` starts only the game frontend (and its database if needed); `npm run dev:dashboard` starts only the dashboard review app. `npm run stop:client` and `npm run stop:dashboard` stop only that app; the world and sibling stay running. `npm run build:client` and `npm run build:dashboard` build only the selected package and write only its public preparation/output. `npm run build` explicitly builds all three projects. The shared workspace lockfile pins library versions but does not couple app runtime or deployment. Each app also has a standalone workspace `typecheck` command.

Dashboard: http://10.0.1.200:5174 (localhost:5174). The root `dev.toml` configures both ports, peer links and trusted hostnames. Before a production app build, set `VITE_CLIENT_URL` / `VITE_DASHBOARD_URL` to the chosen exact external origins. No privileged browser secrets belong in Vite settings. The same [Keycloak provider](authentication.md) will serve separate PKCE app registrations at M1.

## Fresh named shared-world smoke fixtures

The generic shared collision proof requires the first two deterministic safe berths. Reusing a populated named review database changes berth allocation and is not a repeat of that fixture. Use:

```sh
python3 scripts/dev.py smoke --smoke-name construction-combined --fresh-smoke
```

The runner reserves the first unused `construction-combined-rNNNN` name atomically, checks that the corresponding project-prefixed `…-smoke` database does not exist on the host, and publishes with data deletion disabled. Allocation is bounded to 256 attempts; use another label if exhausted. Concurrent runs cannot share a local reservation. An already existing host database is skipped even if its old local evidence was removed. The normal database and prior review instances are never selected or reset by this mode.

The command prints the exact restart command, for example:

```sh
python3 scripts/dev.py smoke-restart --smoke-name construction-combined-r0001
```

Run that command only after the coordinated managed process restart; it reuses the exact database and its private per-run identity evidence rather than allocating another fixture. Reserved directories under `.runtime/smoke-runs/` are mode0700; credentials and reservation records are mode0600. Keep them private and preserve failed-run evidence. A new test run uses the original label with `--fresh-smoke` again. Do not use the printed run name for another seed pass.

Existing ordinary disposable `smoke`, historical fixed named upgrade fixtures and `publish-review` retain their separate semantics. Fresh allocation is explicitly a `smoke` option; it is rejected for normal publication and restart. The scripted collision assertion fails early with this guidance if invoked against the wrong berths; it does not silently skip or weaken the contact proof.

## Current construction release checkpoint

The2026-09-10 matched world9388/clienta561 deployment preserved normal database identity and stable inventory/character/appearance records. Its private05:26 cold archive and actual isolated-review browser continuity across the managed database restart are recorded in [the release ledger](handoffs/construction_cargo_release_20260910.md). The disposable earlier restore working directory was removed only after verifying it was stopped and both original archives remained intact; its successful restoration evidence remains preserved. Current dashboard source is independently available at `https://sidereal.tail7a58a6.ts.net:8445/shipyard`.
