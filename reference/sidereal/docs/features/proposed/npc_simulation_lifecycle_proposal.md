# NPC Simulation Lifecycle Contract

Status: Proposed
Lifecycle: proposed
Category: feature
Last updated: 2026-06-04
Owners: feature owners
Scope: NPC Simulation Lifecycle Contract.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

Primary references:
- `docs/architecture/sidereal_design_document.md`
- `docs/decisions/dr-0040_distribution_and_persistence_authority_model.md`
- `docs/plans/completed/distribution_scaling_and_single_shard_hardening_plan_2026-05-21.md`
- `docs/features/active/visibility_replication_contract.md`

## 0. Implementation Status

2026-05-22 status note:

1. This is a contract document only. No `NpcSimulationTier` component, tier-transition system, cross-shard NPC handoff, or reduced-cadence AI implementation has landed.
2. The contract exists now so content and gameplay authoring do not assume that every NPC is always simulated at full cadence in one process.
3. Implementation remains Phase 9 of the DR-0040 plan. Until then, existing NPC-like entities follow current single-shard runtime behavior.
4. Native/WASM impact: documentation only. No client runtime, transport, protocol, or asset behavior changes.

## 1. Tier Definitions

NPCs are runtime entities whose authoritative behavior is owned by exactly one shard at a time. The tier controls how much simulation work that owning shard performs.

| Tier | Meaning | Intended cadence |
|---|---|---|
| `Hot` | Full tactical/physics/AI simulation. Used for NPCs near active players, involved in combat, directly visible through scanner gameplay, or otherwise gameplay-critical. | Authoritative fixed tick. |
| `Warm` | Reduced-cadence simulation. Used for NPCs in active regions where approximate behavior matters but full per-tick work is not justified. | Configured reduced cadence, e.g. 1-10 Hz depending on behavior class. |
| `Cold` | Statistical or dormant state. Used for NPCs in cold-persisted sectors with no active player interest. | No full ECS physics/AI tick; durable state advances only through coarse/statistical rules when rehydrated or scheduled. |

Tier names are gameplay/runtime terms. They do not replace visibility `Sector` lifecycle states or compute-authority `ShardRegion` ownership.

## 2. Transition Rules

The implementation must derive tier changes from server-authoritative state only:

1. Promote to `Hot` when an NPC enters scanner/interaction range of an active player, becomes combat-relevant, is directly targeted, or is otherwise required by current gameplay rules.
2. Demote to `Warm` when no active player requires full-fidelity simulation but the NPC remains in a hot or warm runtime region.
3. Demote to `Cold` only when the owning visibility sector is eligible for cold persistence and no pending visibility membership, combat, script, or persistence operation requires runtime presence.
4. Promotion from `Cold` hydrates durable graph state through the persistence service before resuming runtime simulation.
5. Tier transitions must not create raw Bevy `Entity` identity dependencies across service boundaries. Durable NPC identity remains GUID/entity-ID based.

## 3. Shard Ownership and Handoff

1. The shard owning the NPC root entity is the only authoritative writer for NPC AI, physics, inventory, damage, and persistence snapshots.
2. During `ShardRegion` handoff, NPC authoritative simulation is frozen between `Prepare` and `Commit`. The source shard emits the final dirty snapshot, the target shard hydrates/accepts ownership, then simulation resumes on the target.
3. If a region-level migration moves many NPCs at once, the same freeze rule applies per root entity. Reduced-cadence `Warm` or `Cold` work must not continue on the source shard after commit.
4. If handoff aborts, the source shard resumes the previous tier with the same authoritative state it had at prepare time plus any explicitly retained local changes allowed by the handoff protocol.

## 4. Cross-Shard Visibility

1. NPC ghosts follow the same cross-shard ghost lane as player/entity ghosts in DR-0040.
2. A receiving shard may use an NPC ghost for visibility, tactical display, interpolation, and client delivery only.
3. A receiving shard must not run authoritative NPC AI, damage, inventory, script mutation, or persistence writes for a ghost.
4. Payload delivery remains `Authorization -> Delivery -> Payload`. Ghost delivery must respect existing redaction rules in `docs/features/active/visibility_replication_contract.md`.

## 5. Persistence Contract

1. Durable NPC state is graph persistence state. Components that represent durable behavior/progression must follow the gameplay component registry and persistence mapping rules in `AGENTS.md`.
2. Runtime-only AI scratch state may be excluded from persistence only when it can be recomputed deterministically or safely discarded across hydration.
3. `Cold` NPC advancement, when implemented, must record enough durable state to avoid discontinuities when the NPC returns to `Warm` or `Hot`.

## 6. Open Implementation Work

Implementation is deferred to DR-0040 Phase 9:

1. Add a concrete `NpcSimulationTier` component or equivalent runtime resource.
2. Implement tier-transition systems and metrics.
3. Add handoff freeze/resume tests for NPC roots.
4. Add ghost-lane tests proving receiving shards do not authoritatively mutate NPC ghosts.
5. Add persistence/hydration coverage for durable NPC state.
