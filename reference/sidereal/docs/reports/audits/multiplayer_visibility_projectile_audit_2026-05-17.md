# Multiplayer Visibility and Projectile Audit - 2026-05-17

Status: Archived
Lifecycle: historical-report
Category: report
Last updated: 2026-06-04
Owners: report author
Scope: Multiplayer Visibility and Projectile Audit - 2026-05-17.
Source of truth: no
Supersedes: n/a
Superseded by: n/a
Primary references:
- n/a

## 0. Status Notes

2026-05-17 update:

1. Audited the server visibility membership path, client local-view delivery hints, combat tracer delivery, ballistic projectile replication setup, tactical scanner/gravity-well contacts, and planet visual delivery/culling path.
2. Implemented a server-side fix so tactical candidate generation and range-checked delivery cannot be narrower than the client's authoritative scanner/default visibility source range.
3. Added focused visibility tests covering tactical scanner candidate inclusion and range-authorized delivery when the viewport delivery hint is smaller than scanner range.

## 1. Findings

### High: scanner-authorized ships could be dropped by viewport delivery

Before this audit, tactical-mode candidate generation used only the client-reported local-view delivery radius. Range-checked entities also had to pass delivery using that same viewport-derived radius. The native client can report a delivery radius smaller than the starter corvette's 1300m effective scanner range, so a valid scanner contact could be authorized but never enter the membership worklist or fail delivery.

Impact: one-way visibility was possible when clients had different viewport sizes, zoom states, startup/local-view timing, or minimized/headless delivery hints. This matches the reported "player 2 can see player 1, but player 1 cannot see player 2" class of symptom.

Change: `bins/sidereal-replication/src/replication/visibility/spatial_index.rs` now includes visibility-source range in tactical candidate cells/sets, and `bins/sidereal-replication/src/replication/visibility/policy.rs` uses `max(client_delivery_range_m, max_visibility_source_range_m)` for range-checked dynamic delivery.

### Medium: weapon tracer visibility is intentionally tied to shooter visibility

Starter gatling fire is hitscan with server-authored tracer messages, not ballistic projectile entities. `broadcast_weapon_fired_messages` sends the shooter owner their fire event, and sends observers the event only while the shooter entity is visible to that observer.

Impact: if player 1 loses visibility membership for player 2's ship, player 1 also stops receiving player 2's tracer stream. The reported tracer stream stopping is downstream of the ship visibility issue, not a separate projectile spawn bug for the starter weapon.

### Medium: gravity-well signal is redacted and does not grant planet replication

Planet/star signal detection can emit an unknown tactical contact and `long_range_gravity_well_detected`, but current contract says signal-only detection does not insert `DiscoveredStaticLandmarks` and does not authorize full world entity replication. Direct landmark discovery is the path that discloses the planet identity and world entity.

Impact: with Aurelia defaults, the gravity-well message can arrive thousands of meters before direct discovery. The planet visual then appears later, once direct discovery plus delivery passes. This explains the observed "gravity well detected" followed by late planet snap-in. The older V2 doc wording was stale; this audit clarified the current signal-only rule.

### Low: existing e2e coverage does not pin default two-client scanner symmetry

The existing two-headless-client motion diagnostic proves remote motion can flow, but it runs with large server-side visibility settings and does not assert default scanner-range membership symmetry, nor weapon tracer delivery after visibility churn.

## 2. Follow-Up Coverage

Recommended next tests:

1. A two-client integration test that positions two controlled ships between the viewport delivery radius and scanner range, then asserts both clients gain each other's root entity.
2. A combat integration test that verifies observer tracer messages continue while the shooter remains scanner-visible and stop only after shooter visibility is legitimately lost.
3. A planet discovery test that separately asserts signal-only gravity-well notification, direct `DiscoveredStaticLandmarks` insertion, and first world-entity delivery timing.

## 3. Native and WASM Impact

Native impact: server-side visibility membership behavior changes for native clients immediately. No native client code changed.

WASM impact: shared server behavior only. No browser transport, client runtime, or WASM-only branch changed.
