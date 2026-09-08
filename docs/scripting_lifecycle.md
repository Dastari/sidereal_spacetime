# Object lifecycles and owner-managed scripting

Status: Contract foundation; runtime and editor staged
Last updated: 2026-09-08
Owners: Sidereal project

## Owner direction and current implementation

Scripting is a first-class part of the rebuild. The owner must be able to author custom object behavior, lifecycle hooks, interactions and game events from the dashboard. It is not limited to changing component numbers. The game client and the authoring dashboard stay independent applications; authoritative scripts run in the world runtime and never in an untrusted browser.

The scaffold includes `packages/scripting`: typed event envelopes, immutable script revisions, entity bindings, explicit capabilities, manifest validation and lifecycle transition tests. It does **not** yet execute user scripts, publish script revisions to the database or provide a code editor. These contracts move into the foundation and early gameplay phases, rather than waiting until all gameplay is hardcoded. The Script Studio is delivered incrementally from M3.

Orchard demonstrates shared pure rule modules, registered actions, scheduled authority, generic growth stages and bounded inactive-object work. Its reviewed source does not establish a general hot-reloadable arbitrary-script VM. Sidereal will preserve those working principles and add the explicit owner-managed lifecycle/script surface described here. References: [Orchard architecture](../reference/orchard/docs/02-architecture.md), [generic growth](../reference/orchard/docs/37-growth-system.md), [world editor](../reference/orchard/docs/42-world-editor.md), and the legacy Sidereal scripting contracts indexed in [source inventory](source_inventory.md).

## Lifecycle coverage

| Domain | Hooks and semantics |
| --- | --- |
| Existence | `object.created` once for a new UUID; `object.restored` after hydration; `object.activated`/`suspended` for simulation tiers; `object.updated` for committed semantic changes; `object.despawned` removes active presence while preserving identity; `object.destroyed` is final permanent deletion with tombstone. |
| Composition | Component installed/removed and supply changed; validate placement, cargo and resource continuity before invoking post-change hooks. |
| Interaction | Actor interacted/entered/exited; validated target, distance, frame, action and permission. E prompts come from permitted action descriptors, never client-invented permissions. |
| Control and sessions | Control acquired/revoked, actor connected/disconnected. Seat occupancy and installed AI supply/grants remain core validators. Scripts cannot grant themselves piloting. |
| Combat | Before/after damage, death; validated mitigation/modifier proposals, bounded damage amounts, authoritative outcomes and deterministic drops. |
| Items and production | Transfer/equip/unequip; craft start/complete/cancel; same inventory and escrow validators as direct player actions. |
| Time and signals | Durable `timer.fired`, declared `signal.received`, explicit custom event schemas. No blanket per-frame callbacks across all objects. |
| Script deployment | `script.upgraded` with explicit old/new revision and state schema migration, preview and rollback policy. Restart is restoration, not an upgrade or new spawn. |

Generic events use stable entity/actor/frame IDs, an event ID, a per-entity sequence, authority tick, causation ID and validated payload. System-origin events carry no fabricated player identity. Event visibility follows the object's data classification; internal script state, source and private inventory events do not become global network messages.

## Two supported authoring lanes

1. **Full trusted TypeScript logic:** project-owned source modules implement a versioned lifecycle API. The dashboard can edit, diff, compile, test and stage these sources through a separate restricted build worker. An operator-authorized publication produces a new signed/content-hashed world module artifact. This can rebuild/redeploy the backend; it must not rebuild either browser app. Compiled code has the trust of server code, so it requires review and deployment privileges. Do not present it as sandboxed.
2. **Live bounded behaviors:** a declarative, versioned behavior program handles state machines, guarded interactions, timers, signals and requests to registered actions. Compile/validate in the authoring worker; evaluate a bounded instruction representation in a deterministic interpreter inside the authority transaction. This lane changes object behavior without recompiling the game, dashboard or world module. No unbounded loops, recursion, reflection, `eval`, `Function`, filesystem, network, ambient clock or native host access.

A future broader scripting language is a separate feasibility gate: demonstrate instruction/memory interruption, deterministic numeric behavior and compatibility with SpacetimeDB's actual runtime before selection. Do not assume Lua/WASM nesting or arbitrary JS execution is supported simply because the server module is TypeScript.

Both lanes share the same events and requested-action API. Pure rule code can be reused in client prediction where safe; secret logic and authoritative script state are server-only. Cosmetic animation/effects hooks are a separate client presentation surface and cannot mutate gameplay.

## State, transactions and retries

Persist normalized `script_definition`, immutable `script_revision`, `script_binding`, schema-versioned `script_state`, `scheduled_event`, bounded `event_receipt`, deployment/audit and retained deletion records. Bindings pin an exact revision; changing the catalog's default does not silently retarget existing ships. State lives with the object/character, not in process globals or account metadata.

Validation hooks and their requested writes execute with the initiating action in one transaction; failure rejects the entire transaction. Post-commit notifications, external compilation and long jobs use a durable outbox and separately authorized worker completion reducers. They do not run as asynchronous side effects during an open reducer. Retries carry operation/event IDs and idempotency checks. Timers validate generation/binding/revision and target liveness when consumed; deletion or upgrades invalidate stale timers. Exactly-once reward/output effects require receipts and atomic state checks, not a claim of exactly-once network delivery.

Creation hooks must not run after every restart, subscription arrival or renderer spawn. Suspension/unsubscription must not delete persisted inventory. Destroyed objects cannot be resurrected by a stale queued event. Bounded cold-state advancement uses the stored authority tick and resource budgets; it cannot manufacture fuel, crafting output or growth from arbitrary browser elapsed time.

## Capability and execution budget

A script revision declares requested capabilities. Binding installation grants only a subset allowed for that object and publisher. `door.request`, `inventory.request`, `control.request` and other commands call the same domain validators as player/NPC actions, with the original actor context and an explicit object scope. No raw table handles, broad inventory access or unrestricted spawn API are exposed to live behaviors. Owner script authorship is not an automatic override of another player's private cargo or a seat's control lease.

Budget instructions, emitted actions, signal chain depth, timer count, state bytes, query result rows and total script work per tick. Reject recursion/cycles beyond the bound. An error returns a sanitized author-visible trace; quarantine repeatedly failing optional behavior while preserving core physics/security and transaction consistency. Scheduled retries must be bounded with backoff. Do not put every ship part into a 60 Hz script callback.

## Script Studio and rollout

M1 establishes lifecycle envelopes, capability resolution, action registry and persistent binding/state/timer schemas with authority tests. M2 ports real components through those hooks: door interaction, supply loss, engine activation, damage and installation. M3 adds a code/behavior editor with syntax diagnostics, hook browser, action/schema completion, source diff, test fixtures, draft history, live-object binding inspector, execution traces and revision preview/publish. Support create/duplicate/rename/delete scripts with referential checks, not just editing existing files.

A publish presents affected blueprints and live bindings, expected revisions, validation results, state migration and rollback impact. Publishing a definition, applying to live objects and capturing live state into authored baseline remain distinct. Stage new revisions against cloned fixtures/two-client tests, atomically activate permitted targets, and report durable receipts. Script rollback changes code/bindings through a new validated operation; it does not silently undo consumed resources, damage, trades or other players' actions.

Acceptance requires: no duplicate on-create loot after restart; reentrant event bounds; failed hook rollback; forbidden capability rejection; private-state redaction; stale timer rejection after destruction/upgrades; exactly-once craft outputs under retry; two-editor conflict; bad script quarantine; predictable old/new revision activation; and independent frontend/dashboard/backend build outputs.
