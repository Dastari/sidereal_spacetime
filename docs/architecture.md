# Authority, data and networking

Status: Accepted direction; implementation staged
Last updated: 2026-09-08
Owners: Sidereal project

## Execution model

One SpacetimeDB database owns all characters, ships, NPCs, world objects, inventories and authoring records. The DB module uses typed rows and reducer transactions. Browser code calls generated bindings. No separate authoritative SQL/JSON snapshot or Bevy process. The dev host is local; production auth is a separate milestone. Database module-owner credentials never reach browser code.

`packages/sim` contains pure deterministic rules; server adapters load rows, validate actors, execute rules and commit results. Client prediction uses the same math. Rendering consumes permitted snapshots and never feeds transforms into authority. SpacetimeDB does not provide all game prediction behavior automatically. The M0 fixture intentionally uses latest bounded input and 20 Hz state, not final replay prediction.

## Coordinate and motion contract

World positions/velocities use TypeScript numbers / `t.f64`, meters and seconds. World XY retains Sidereal's heading zero toward +Y; positive heading turns toward -X. Babylon maps world `(x,y)` to `(x,height,-y)` using a right-handed scene. Rendering subtracts a f64 camera origin before GPU conversion. A ship is one world-space rigid frame. Crew, rooms and installed devices have local poses; moving the ship does not rewrite every tile/crew world position. Cameras, characters, exhaust and background use the same presented frame transform. Initial simulation is planar; 3D is geometry/material/lighting presentation. Multi-deck heights and EVA vertical freedom need an explicit later physics decision.

Target a fixed 60 Hz shared simulation and 20 Hz initial publication/scheduling, three fixed substeps per authority update. Measure catch-up policy and watchdogs; never turn client frame delta into authority time. Final prediction stores sequence/tick input history, authoritatively acknowledged simulation intervals, bounded replay and correction presentation. Remote entities use timestamped interpolation; child poses are evaluated on the parent's matching presentation timeline. Long browser suspension clears stale input and resynchronizes, with no offline speed credit. Packet loss/jitter tests must include fast turn/stop and walking on a rotating ship.

## Target table domains (M0 implements only the marked subset)

| Domain | Canonical rows / relationships | Disclosure |
| --- | --- | --- |
| Accounts | identity mapping, sessions, roles, MFA claims, bans | caller/admin views only; production M1 |
| Characters | UUID, account owner, active session binding, local/world pose, progression, appearance | private full rows; public appearance summary only; basic character M0 |
| Frames | ship/station UUID, blueprint revision, motion, structure revision, owner/access references | derived visible hull/motion; full own fixture M0 |
| Control | station UUID, actor occupancy, grant source/generation, expiring input, AI orders | actor/authorized crew views; station fixture M0 |
| Construction | placement keys, fitting UUIDs, room topology, compartment IDs, mounts, roof/markings | exterior summary and admitted interior views |
| Items | item UUID, pinned definition, state and exactly one location | permission-filtered item/container views |
| Containers | owner principal, capacity, payload limits, location, revision, access grants | authorized inspect/deposit/withdraw views |
| Utilities | topology revision, segment IDs, port references, reservoirs, batteries, switches | authorized engineering views; redacted public readiness |
| Combat | installed weapon state, turret aim, projectile seed/motion, damage, shield/armor | visible poses/events; sensitive ammo/system detail restricted |
| Factions | membership/roles/relations, reputation, ownership grants | explicit public versus member/admin fields |
| Economy | catalog revisions, facility/jobs/escrow, extraction depletion, trade sessions | recipient/facility permission checks |
| Intel | actor discovery/fog, pseudonymous contacts, scanner grants/countermeasures, last-known memory | server-computed contact views, no secret base rows |
| Authoring | package revision, baseline, source provenance, draft, operation receipt, tombstone/audit | capability-scoped editors; rename receipt fixture M0 |
| Lifecycle | scheduled jobs, NPC state, script revision, action queue, operation keys | private server state |

Use stable UUIDs for instances and string catalog keys for definitions. Keep hot motion separate from cold layout/metadata and private detail. Avoid one huge JSON world/ship row. Bound each table, view, queue and retained history. Full database-table memory survives inactivity; unsubscribe does not release server table storage. Cold simulation reduces CPU only. Archive/retention policies and restoration must be explicit.

## Security and subscriptions

Authorization precedes interest narrowing, then payload redaction. Client-selected SQL predicates can narrow the server-approved result, never broaden it. Treat all clients, including custom clients, as untrusted. Derive character binding from authenticated session; input cannot choose another account/character. Views resolve owner/faction/crew grants and current sensor capabilities server-side. Use indexes by principal, frame and spatial cell, bounded result limits and explicit revocation. A private base table must never remain public beside a filtered view. Tactical discovery must not leak the true target through public asset lists, labels, audio, IDs, errors or side queries.

Station control checks actor/station/frame liveness, membership, reach on entry, unique occupancy and lease freshness at execution. Future remote AI grants are explicit installed capabilities and never ownership shortcuts. Inventory permissions are action-specific; visibility/scan does not grant withdrawal. Every mutation validates bounded arguments, rate/sequence, current revision, distance/frame, capability and supply. Script and NPC actions use the same validator. Define session takeover/multiple tab policy before production; the M0 local fixture supports one active character connection per identity.

## Persistence and authoring

Reducers atomically mutate canonical rows. Keep blueprint authoring, initial world baseline and evolved runtime separate. A refit commits frame layout, retained fitting/item identities, moved crew/cargo, derived mass, permanent deletions and operation receipt together. Reject stale expected revisions. A receipt binds actor, operation ID, payload fingerprint, result revision and outcome; replay is idempotent, reuse for a different payload fails. Metadata-only M0 rename is the first transaction proof. Full refits require explicit aggregate size limits and crash/restart tests before M3 completion.

A process restart reconstructs rows from SpacetimeDB durable storage; derived caches rebuild. Track durability/ack configuration explicitly during release hardening and verify abrupt restart, not only graceful shutdown. A subscription update alone is not a substitute for tested storage durability. Backup recovery and upgrade rollback preserve identity, grants, source revisions and audit.

## Code and scripting decision

Catalog data starts as schema-validated JSON/TypeScript authored files, published as immutable versioned packages. Preserve legacy Lua as source reference. Lifecycle authoring must support readable code, diagnostics, preview, publish/rollback and bindings for spawn/tick/interaction/damage/destruction/timers. The 2026-09-08 owner refinement establishes lifecycle contracts now, authority integration in M1/M2 and Script Studio from M3. Use reviewed compiled TypeScript for full trusted server logic and a bounded behavior interpreter for live data-driven edits, as specified in [scripting lifecycle](scripting_lifecycle.md). A broader scripting language remains a later feasibility gate; never `eval` untrusted dashboard code in a reducer. A sandbox controls time/operations/memory, deterministic RNG, permitted APIs and emitted action count. External AI generation, Blender and HTTP work occur outside reducers and publish through authenticated content commands.

## Single-server load budget

Provisional goals: 50 concurrent players, 100 stress clients; compare dispersed activity and concentrated fleet combat. Record tick p50/p95/p99, overdue schedules, subscription CPU, row mutations, bytes/client/s, memory growth, startup time and client frame time. At 20 Hz keep p95 authority work below 30 ms as an initial engineering margin, then revise with measured tests. Do not claim supported CCU from an empty-world connection test. Bound tick candidates with active spatial cells and installed active devices; use lower-frequency jobs for noncritical NPC/economy work with explicit catch-up rules. Keep overload response as admission/queue limits and degraded noncritical updates, without silently slowing gameplay time.

## 2026-09-08 application and lifecycle boundaries

`apps/client` owns gameplay presentation/input. `apps/dashboard` owns authoring navigation, editors and administration. They have separate manifests, TS entrypoints, Vite configs, ports, `dist` outputs and release lifecycles. Neither imports the other. Shared `packages/ui`, `render`, `content`, `net`, `sim` and `scripting` are libraries only. Rebuilding one application does not rebuild/restart the other or republish `packages/world`. Generated protocol changes require explicit compatible deployments, not an automatic dependency rebuild cascade.

Use the existing Keycloak provider as specified in [authentication](authentication.md). Adopt the event/binding/state/capability model in [scripting lifecycle](scripting_lifecycle.md); full compiled TypeScript and live bounded behavior programs have different trust/deployment properties. Core authority and data privacy remain enforced for both.

Planet reference tooling computes tight shadow envelopes in its body worker and qualifies fixed-detail caching against complete worker output, including weather. The shared planet shadow manager selects active semantic planet meshes and restores prior light/receiver state when changing bodies. See docs/planet_lod_authoring.md for authoring and acceptance constraints.
