# ADR: authoritative geometric zones and shared editor commands

Date: 2026-09-21
Status: accepted for implementation under the owner's studio request

SpacetimeDB owns world state. Its [indexes](https://spacetimedb.com/docs/tables/indexes/) provide B-tree/direct access, not a native spatial zone service; floating-point columns cannot be indexed. Keep f64 world geometry and index private bounded zone sets by existing simulation scope and stable IDs. Compile curves deterministically in shared pure simulation code. [Reducers](https://spacetimedb.com/docs/functions/reducers/) atomically validate/publish definitions and derive membership from authoritative accepted motion. Filtered [views](https://spacetimedb.com/docs/functions/views/) expose the admitted actor's ship state; private base tables remain private.

Use separate geometric membership instead of repurposing systemId, which already partitions physics, discovery and control admission. Normalize each existing system sphere and asteroid field into the zone forest and add generic child volumes. Ancestors clip descendants; siblings may overlap. Background priority is presentation, not access permission. Native celestial parentage remains separate from zone containment.

Store bounded per-ship transition history with sequence bounds for reconnect. Ephemeral [event tables](https://spacetimedb.com/docs/tables/event-tables/) alone cannot supply reconnect history and a public stream could disclose hidden ships. Sweep accepted collision-solver drift segments; endpoint diffs cannot detect through-crossings. Positional corrections get endpoint reclassification. No DB writes occur inside the pure solver. Failed steps cannot leave transition side effects.

Shared command resolution is UI infrastructure; map and Shipyard retain their own document operations and validators. Curved map geometry never bypasses structural Shipyard rules. Undo remains a draft edit; publishing it is a new validated reducer transaction, not rollback of other players' work.
