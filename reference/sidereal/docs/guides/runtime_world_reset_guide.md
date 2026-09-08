# Runtime World Reset Guide

Status: Active
Lifecycle: guide
Category: guide
Last updated: 2026-09-06
Owners: backend runtime + developer tooling
Scope: Controlled local reset and verification of Sidereal's persisted runtime world.
Source of truth: yes
Supersedes: n/a
Superseded by: n/a
Primary references:
- docs/decisions/dr-0043_local_dev_orchestration_and_config_sot.md
- docs/decisions/dr-0054_universe_baseline_vs_evolved_world_separation.md

## 1. Use the Narrow Reset

Use `scripts/siderealctl world-reset` when authored world seed or universe-baseline
changes must be applied to a clean evolved world. It calls replication's canonical
`reset_runtime_world_blocking` implementation, clearing the runtime graph and its
bootstrap/seed markers while preserving account, authentication, script-catalog, and
other control-plane SQL state.

Do not use `pg-reset` for this workflow. `pg-reset` recreates the entire Postgres
volume and removes accounts as well as runtime data.

## 2. Procedure

2026-09-06: Before a cutover, take a validated private backup with
`scripts/siderealctl world-backup --output /path/to/new-backup.dump`. The command
uses `dev.toml` database settings, refuses to overwrite an existing file and creates
the archive with mode 0600. Run it after stopping the stack for the final saved state.

1. Stop the tracked stack: `scripts/siderealctl down`. If no supervisor is running,
   confirm with `scripts/siderealctl status` and continue.
2. Run `scripts/siderealctl world-reset`. The command ensures Postgres is healthy,
   refuses to run beside a tracked service stack, resets the runtime graph and
   bootstrap markers, and exits.
3. Start `scripts/siderealctl up persistence-maintenance`, then run
   `scripts/siderealctl reseed-characters` to preview and
   `scripts/siderealctl reseed-characters --apply` to recreate missing active
   character worlds through the canonical starter compiler and persistence service.
   Existing player records are skipped; orphaned owned records abort the operation.
   Stop the maintenance profile with `scripts/siderealctl down`.
4. Start the required profile, normally
   `scripts/siderealctl up full-stack-debug` for local clients, or
   `scripts/siderealctl up full-stack-public` for remote clients and the dashboard.
   Replication applies `world_init.lua`
   and the configured universe baseline before hydrating the fresh graph.
5. Re-authenticate existing accounts and enter the world. Login alone does not
   recreate a deleted player graph; the explicit maintenance step above must have
   completed. Account and character identity, names and authentication settings
   remain unchanged.
6. Verify the seed before continuing authoring work:
   - the starter asteroid field has members in all four coordinate quadrants;
   - baseline-placed planets exist once and the registry self-spawn did not duplicate
     them;
   - the pinned baseline application target and per-entity
     `universe-entity:<baseline_id>:<uuid>` creation markers exist;
   - current `world_init.lua` defaults are represented in the hydrated world.

## 3. Safety and Distribution

The command is a local-development maintenance operation. It deliberately enables
the documented in-process persistence fallback for the one-shot reset while the
service stack is down; normal runtime validation continues through
`sidereal-persistence-service`.

Reset is realm-wide maintenance. Stop every shard that can access the world before
resetting it; do not run independent resets beside active shards. Routine baseline
changes use the owner-shard preview/application workflow instead of a reset.



2026-09-05: Baseline saves no longer trigger replacement/reseeding on restart. The
initial projection is pinned, births have atomic per-entity markers, and live changes
use retained-base reconciliation. Worlds seeded with the older group markers are
preserved and cannot use this reconciliation lane until a fresh history is explicitly
established. Reset clears active baseline targets/application receipts and cancels
pending live-edit commands, while preserving authored packages and accounts. See
`docs/features/active/dashboard_game_authoring_runtime_contract.md` for the current
application and persistence contract.


2026-09-05 reset isolation correction: AGE `drop_graph(..., true)` drops its entire
schema. PostgreSQL's default `$user` search path previously let ordinary account,
registry and audit tables enter the `sidereal` graph schema. Infra initialization now
sets the database search path to `public`, and graph deletion refuses any relation
that is not an AGE label. Deletion and write-version cleanup share a transaction.
Do not force a reset past this guard: preserve/recover the control-plane tables into
`public` first. This is operational SQL schema isolation, not a gameplay payload
compatibility path.


2026-09-05 remote availability: local readiness does not verify a public reverse proxy.
For remote clients, verify the configured public gateway's `/health` and
`/startup-assets/manifest`, and run a public profile so connection grants advertise
the public replication hostname instead of loopback. A proxy 502 must be resolved
at the proxy/upstream connection even when all local services are healthy.

2026-09-06: Added explicit post-reset character reseeding. Run it only with the persistence service active and every gateway/shard stopped. It recreates missing active player worlds using current authored starter content, preserves existing entities, and refuses partial worlds with orphaned fittings. This is an operator-invoked reset step, never an automatic login backfill.
