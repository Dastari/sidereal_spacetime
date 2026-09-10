# Planar ship contacts: conservative proxy and swept broad phase

Status: implemented in source; isolated acceptance pending. No public activation.

The authoritative ship-to-ship path already used one forward-offset capsule for each ship, plus one circle per asteroid. `LAB_HULL` in `packages/content/src/space.ts` declares radius 5.4 m, spine half-length 7.125 m and longitudinal offset 1.125 m. The current approved flight definition carries that proxy into shared physics. It is independent of native visual meshes, detailed interior walking collision, ray picking, cargo collision, roof visibility and eventual destruction proxies. Changing the camera cannot change this authoritative shape.

The missing optimization was broad-phase rejection. `stepContacts` previously ran conservative advancement for every pair on every contact event, even for distant ships. The new `collision-broadphase.ts` builds each body's complete swept AABB, sorts by minimum X, rejects disjoint X/Y intervals, then returns candidates in canonical body-index order. Every impulse rebuilds the bounds because velocities may change. Translation and rotation of the offset capsule are both included; the angular allowance bounds the spine-point arc and is capped by its full diameter around the physical centre of mass. Narrow phase still decides whether contact exists. No body pair is truncated from crowded candidate sets.

The existing 64-body, 48-event and 64-iteration bounds remain. Unresolved narrow-phase motion still stops at the last safe point without inventing an impulse or discarding momentum. A clearly separated axis-aligned grazing sweep now advances fully instead of exhausting an iterative calculation that broad phase can prove unnecessary. The exhaustion regression uses a diagonal grazing pass whose swept bounds overlap, preserving real bounded-fallback coverage.

`stepContacts().work` reports event passes, the old exhaustive-pair count, broad-phase axis checks, narrow-phase pairs and conservative iterations. These are diagnostic return values, not new database rows or per-tick writes. No schema or generated-binding change is required.

## Measured evidence

Run `npx tsx scripts/benchmark_ship_contacts.ts`. The offline harness reads the exact previous solver from commit `26d9586c`, records its source SHA, verifies unchanged motion for its benchmark scenarios, warms both implementations and records five 100-step batches. Results are retained in `ship_contact_performance_evidence.json`.

| Scenario | Previous narrow-phase pairs | New pairs | Previous median | New median |
| --- | ---: | ---: | ---: | ---: |
| 16 separated ships | 120 | 0 | 0.092 ms | 0.007 ms |
| 64 separated ships | 2,016 | 0 | 1.772 ms | 0.034 ms |
| 64 ships in eight spaced rows | 2,016 | 0 | 2.205 ms | 0.051 ms |
| One fast contact among 64 ships, two events | 4,032 | 2 | 3.122 ms | 0.085 ms |

These are local Node CPU microbenchmarks, not browser FPS or a full SpacetimeDB load test. Dense overlapping sets remain quadratic and retain the same bounded conservative fallback. Of 256 deterministic rotated-contact comparison cases, all 128 that the previous solver resolved match exactly; the other 128 previously exhausted and are counted separately, not claimed as resolved matches.

Forty-two focused tests initially passed across capsule contacts, broad phase, per-system stepping and the world adapter. New tests cover the complete rotating/translated envelope at ±1e9 m, all 2,016 pairs retained in a crowded set, zero narrow-phase work for separated ships, deterministic input order, high-speed opposing ships, rotation-only contact and candidate rebuilding after an impulse causes a second collision. Existing momentum/energy, no-double-advance, idle writes and authority checks remain.

Shared-tree checks: typecheck and full build passed. The first default-parallel test run passed 1,313 tests and hit the existing planet-terrain 20-second timeout; a bounded two-worker full run passed all 1,314 tests in 210 files. Document checks passed. Release preparation uses a separate checkout of the exact deployed `2ade` source baseline, plus this collision-only change; cargo registration and unrelated character/render changes are excluded from that server artifact.
