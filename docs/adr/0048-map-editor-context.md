# ADR: Explicit map selection and typed context drawers

Date: 2026-09-21. Status: Accepted.

The former empty-string selection meant both “nothing” and “system”, making
true deselection impossible in the inspector. Use the stable system ID for
system selection; empty selection now has no editable context. Keep a single
Universe tree over the authorized documents and their existing relationships,
without introducing a second server hierarchy or new permissions. Other
systems can be loaded from the tree; only the active draft is editable.

Use shared numeric/coordinate controls and explicit typed property editors,
rather than editable JSON or automatic reflection: schema properties have
units, bounds and authority restrictions that generic reflection cannot infer.
This costs explicit field maintenance but keeps validation and immutable
catalog/live properties honest. Preserve local draft transactions and existing
server reducers. See the [map specification](../specs/system-map-editor.md).
