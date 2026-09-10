# Planar ship collision release — 2026-09-10

Status: live; parent-authorized algorithm-only server update. Cargo registration and the client were excluded.

Normal database `sidereal-spacetime-dev` retains identity `c2005c24147323197826efa22f24e30d2d99a93a5a5091949f2ad25fa2127572`. Its active module is now `81f5582aab0c55a7fd37c3c3310fae0af12fa1dab718c2a932fcd63f995b47c0`, independently verified from `st_module.program_bytes`. The existing client `8246fafc6e13048bd1eaabd5a63d6c06dc9ca1ba983de4bdb6e466de676c4a35` and delivery configuration were retained; actual public JavaScript bytes match that current immutable client.

## Exact scope and provenance

The detached checkout `.runtime/release-checkouts/collision-2ade-r001` reproduced the previous live module `2ade8d75a75f75e5d555c8f2c3a666c69c736300dff13611dd7964ea6984ac8c` from source `a265df28`. Only collision checkpoint `0023e0cf` was then cherry-picked, producing detached source `60d4d765`. Its third-party dependencies and workspace links resolve inside that checkout. The preceding release's 361 support inputs were copied only after checking their recorded hashes.

The change adds conservative swept-AABB pair rejection before the existing capsule/circle solver. It changes neither the one-capsule stock hull shape nor interior walking, picking, cargo, damage or camera contracts. There are no table/view/reducer changes; binding regeneration was byte-identical. The later carrier schema in the shared working tree is **not** part of this public module. See `ship_contact_simplification.md` and `ship_contact_performance_evidence.json` for measured operation counts, CPU benchmark scope and remaining dense-contact limits.

## Gates and activation

The isolated source passed typecheck, all 1,167 tests in 201 files with two workers, 35 document checks, full client/dashboard/world build and `art:check`. Default high-parallel tests hit two known procedural-planet timeouts; the complete bounded-worker rerun passed without changing those tests. Fresh normal-module smoke passed against `sidereal-spacetime-dev-review-collision-only-r001-smoke`, including native starter, control/IFCS/collision, inventory/combat and reconnect checks. Its active module hash was verified and cargo reducers were confirmed absent.

After the expected old-module/database-identity/client guards passed, the main managed runner took a cold recovery backup and restarted the same database without publication. The isolated runner then published with `--delete-data=never`. Its initial copied CLI config was unauthorized and returned403 without changing the database; that private config was preserved, the checkout linked to the current managed CLI config, and the guarded retry succeeded. No client activation or rollback was performed.

## Persistence and recovery

Thirty privately captured table identity sets were preserved across backup/restart and publication: 27 characters/ships/stations, all 709 full item rows, 190 containers, inventory revisions and hotbars, appearance, memberships, native-instance state, fresh fitting IDs and the owner's existing refit receipt/attachment. No items, containers or identities were added or removed. Ongoing motion advanced normally. Actual disconnect cleared one occupied pilot station and incremented its flight-control binding revision; other ownership/fitting fields remained unchanged. That pilot may need to enter the station again.

Recovery archive `.runtime/recovery-20260910-125125.tar` is mode0600, 34,657,208,320 bytes, SHA-256 `5ece5ebac41d6ab7b6ee3317d81bbabde780c191993462d1101740016444a7a4`, with9,718 members. The measured database interruption was61.348seconds. Its private manifest and earlier recovery archives are preserved. This archive was hashed and inventoried; a new full restore test was not performed in this slice. Do not expose the credential-bearing archive or replace live data with it incidentally.

Private artifact, guards, snapshots, comparison and public-route evidence are retained under `.runtime/releases/ship-contacts-20260910/`. The published `world.js` and previous `baseline-world.js` are independently pinned there. The world schema is unchanged, but any operational rollback still requires explicit coordination and must preserve current state; do not publish the shared working tree as an accidental rollback.
