# Shared-world next slice: integration contract

Status: read-only planning,2026-09-09. No schema/public-table/service changes. Implements phase3 of [world network audit](../world_network_audit.md), after the current input/write candidate passes. This is one authoritative database/system, not sharding.

## Supported mechanisms and decision

Installed `spacetimedb@2.10.0` contains `schema.anonymousView` (`src/server/schema.ts:564`) with no sender and **no supported parameter argument**. Use it only for deliberately universal, nonsensitive data such as public asset metadata. It cannot enforce per-account discovery. Official documentation describes shared materialization for anonymous views, but100 users×25 definitions is not evidence of2500 executions per ship write; measure actual dependencies/recomputations/bytes. [Official views](https://spacetimedb.com/docs/functions/views/).

`schema.clientVisibilityFilter.sql` exists at line696 and emits `moduleDef.rowLevelSecurity`; there is **no TypeScript opt-in flag in this implementation**. The available official RLS page is explicitly version1.12.0, calls the feature unstable and recommends views; its Rust `unstable` feature/C# warning directives do not establish a TypeScript/server configuration requirement. It permits joins, ORs multiple rules and exempts the module owner. Treat2.10 runtime semantics, especially revocation and arbitrary-query enforcement, as unproven until tested with ordinary principals on the pinned server. Do not enable public presence merely because the export typechecks. [Official RLS caveats](https://spacetimedb.com/docs/1.12.0/how-to/rls/).

The installed `src/lib/indexes.ts` accepts `btree`, `hash` (point lookup) and `direct`; official current index documentation emphasizes B-tree and direct. **Use B-tree initially** on spatial integer columns. Direct is for dense unsigned keys, not signed/sparse spatial cells or UUIDs; hash requires an isolated publication/query test and profiling before replacing B-tree. [Official index constraints](https://spacetimedb.com/docs/tables/indexes/).

**First delivery uses private spatial rows plus keyed authorized views.** Public lean presence with proven RLS is a later interchangeable transport optimization. Client SQL/cell selection is never authority. This preserves the repository's row AND column privacy contract. [Official access permissions](https://spacetimedb.com/docs/tables/access-permissions/).

## Minimal interfaces and discovery policy

Proposed new private authority:

| Contract | Fields / index |
| --- | --- |
| `worldSystem` | stable`id`,seedRevision,seedHash,migrationRevision; no per-owner copy |
| `shipWorldMotion` | `shipId`PK,systemId,x,y,vx,vy,heading,omega,serverTick,cellX:i64,cellY:i64; B-tree(systemId,cellX,cellY) |
| `systemBody` | stable`id`PK,systemId,authoredKey,appearance,kind,seed,radius,height,massKg; unique deterministic seed key |
| `bodyWorldMotion` | `bodyId`PK and same motion/cell columns; integrate each body once |
| `worldAdmission` | characterIdPK,owner,systemId,revision; server-authored, not a client-requested viewport |

Ship static description remains private keyed by the existing ship UUID; move dynamic fields through an explicit additive migration and keep the existing own-ship projection shape temporarily. No client-owned transform path is introduced.

Exact first-slice visibility rule:

1. Require existing game admission plus server-owned selected character/system admission. Reject retired principals. Review construction instances do not implicitly join space or expose their contents.
2. For ships/asteroids: same system, current authorized observer center to entity center squared distance≤`400²`meters. Obtain candidates from the observer's nine cells with `cellWidth=400m`, `cellX=floor(x/400)`, `cellY=floor(y/400)`; then exact-distance filter **on the server**. Include the controlled own ship by stable identity. Test negative boundaries and validated finite coordinate bounds before conversion to i64.
3. Authored charted planets remain available system-wide to members of that system, preserving current Observe behavior; return only published chart/body descriptors. Moving rocks are proximity contacts. No cross-system charts by arbitrary subscription.
4. `visibleShipMotion` columns: shipId,systemId,cellX,cellY,x,y,vx,vy,heading,omega,serverTick. `visibleShipDescription`: shipId,publishedExteriorAssetId,appearanceRevision,approved displayName. Exclude owner/identity,internal layout,inventory,stations,control grant,fuel/energy,mass/thrust and hidden installed equipment. Each view uses `t.row` with one stable PK.
5. Body descriptor columns: bodyId,kind,appearance,seed,radius,height; motion is a separate keyed view. Exclude legacy shipId/private alias keys and mass. Descriptors are removed when contact authorization ends, except explicitly charted planets.
6. Remote **interior** characters remain hidden across separate ships. A future `visibleCharacterPose` requires same admitted ship+deck and server visibility/access, not ship ownership alone; expose appearance/pose only, never item/container UUIDs. First shared-space acceptance shows other players' exterior ships, not an unsupported promise of cross-ship crew visibility.
7. Admission/cell changes recompute authorized results; revocation removes rows even when a malicious client retains `SELECT *`. No stale contact cache may continue updating after revocation. Existing connection-versus-principal admission limitations require explicit expiry tests, including a dashboard socket sharing an admitted game principal.

If later implementing public presence, retain only the columns above and a server-maintained private `(owner,entityId)` visibility relation (or another proven equivalent). An RLS join must authorize by `:sender`; reject filters that merely match client-selected cells. Publish only after tests prove wildcard/direct-key/foreign-cell subscriptions, revoked grants and mixed-application tokens cannot bypass it. This may still have per-principal authorization cost: benchmark rather than promise constant cost.

## Canonical seeding / migration

`enterLab` currently seeds `LAB_BODIES` per ship with newUUIDs and ships all at(0,0). `ship` already has world x/y; its missing part is a system/cell index. `ownShips`/`ownSpaceBodies` are owner-only; `spaceBody.by_ship` controls the entire physics/discovery path.

Add an idempotent, authority-only `seedSystem(seedRevision,manifestHash,operationId)` path. Pin authored keys and UUIDs in its receipt, seed once independently of any identity and preserve canonical body IDs on repeated logins/restarts. No random re-seeding on account creation.

Migration must preserve all character/ship/station/item/container/fitting UUIDs, appearance,inventory,combat state and receipts. Generate a reviewed inventory of legacybodyUUID→canonicalbodyUUID aliases; retain legacy fixture rows/state as private migration evidence instead of silently deleting duplicate moving asteroids or pretending their divergent momentum can be merged. Newly allocated canonical body IDs are explicitly recorded; never rewrite item/target references by string replacement.

Move existing ships into the shared system via a validated `joinSharedSystem(expectedShipRevision,expectedAdmissionRevision,operationId)` migration/entry transaction with a server-reserved nonoverlapping berth. Record old/new system and transform, retaining local deck/item/crew coordinates. Existing ships cannot all remain at(0,0). Interrupted batch migration resumes by receipt; login does not reset the berth or convert the ship again. Keep legacy compatibility until each selected ship is migrated and checked; remove per-account seeding only after the transition is explicit.

**Physics prerequisite:** current `stepLabSpace` advances a ship and its private rocks three substeps inside each per-ship tick. Do not replace `by_ship` with shared bodies and keep that loop: a shared rock would advance/receive collision twice for two players. Add bounded per-system contact stepping that integrates each motion once per tick, applies each ship's IFCS forces and resolves shared-body/ship contacts deterministically. This is required before claiming shared rocks are authoritative.

## Client/render boundary and file ownership

| Owner area | Narrow integration |
| --- | --- |
| `packages/content/src/space.ts` | pinned canonical system seed; retain legacy fixture definition until migrated |
| NEW `packages/sim/src/spatial-cells.ts`,system-contact helper | finite/bounds/negative-cell tests; once-per-system stepping |
| NEW `packages/world/src/shared-world*.ts`; root`index.ts`,`space.ts`,`lab-flight.ts` | tables,migration,discovery,physics; root schema exports/generated bindings |
| `packages/net/src/index.ts`,NEW`world-subscriptions.ts` | own/private subscriptions separate from contacts; retained cell handles |
| NEW client world store | per-table entity-ID maps,insert/update/delete; active own character selected by explicit ID, not first iterator |
| NEW render remote-entities adapter; root`render/index.ts`,`App.tsx` | multiple exterior ship roots keyed by shipId; per-entity motion buffers; remote interiors omitted |

Current App picks `[...ownShips][0]` and `[...ownCharacters][0]`; renderer has one`shipRoot`,one`avatar`,scalarSceneState. Do **not** broaden those existing own views to contain foreign actors. Add separate contact arrays/maps and preserve local controls/camera identity.

Cell subscriptions: derive desired cells from accepted own motion, retain old queries until new ones apply, deduplicate by primary key/serverTick, then unsubscribe obsolete handles. On rejected replacement, keep only still-authorized existing rows; on reconnect rebuild from accepted admission. Coalesce rapid boundary changes and cap active/pending scopes. Authorized views remain the server filter even if SQL reduces their result further; no claim of indexed incremental view execution without measurement. Remote interpolation must handle deletion/reinsert and reconnect epochs, never write authority or extrapolate indefinitely.

## Smallest real acceptance

Two **different Dastari accounts**, same isolated system, separate ships at reserved nearby berths: both observe the same canonical planet and moving-rock UUIDs and both exterior ships. A pilots; B sees A move and the shared rock reacts once. Disconnect/reconnect and role expiry preserve IDs, remove forbidden contacts, and do not reveal inventory/internal layouts. Move through a negative cell boundary and beyond400m: insert/update/delete are correct, no duplicate render roots, old subscriptions released. Arbitrary wildcard/foreign-cell/base-table queries cannot disclose hidden contacts or private state. Snapshot both accounts' inventories/appearance before and after. Count calls, row writes, view events and bytes for1/2/more clients before claiming a fanout or FPS gain.

Shared crew boarding, multiple stations, avatar visibility on a common deck and pressure/airlock admission are subsequent explicit tests. `station.shipId.unique()` must become a by-ship index plus station-ID-based control selection before claiming multiple seats. No production publish or destructive fixture migration belongs to this read-only contract.

## Publication dependency

The current input-control protocol requires its matching client: an old client never calls `claimInputControl`, so the new module correctly ignores its motion. Release the new input module and matching client as a coordinated compatibility change, with pinned artifacts and a managed installation/recovery order. Do not independently roll out old-client/new-server combinations. The shared-world migration likewise needs schema/bindings/client compatibility and an isolated restore proof before live conversion; see the parent audit's release-compatibility section. Once-per-system physics is a blocker for enabling canonical shared-body simulation, not follow-up polish after seeding it live.
