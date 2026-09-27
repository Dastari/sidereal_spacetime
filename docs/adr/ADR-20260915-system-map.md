# System map authoring and static asteroid populations

Date: 2026-09-15. Status: Accepted implementation decision within owner scope.

Use revisioned system documents and deterministic, separately stored field populations. Existing system-body motion remains celestial authority; moving a body updates its indexed location in the same transaction. Ships are live read-only projections. Server authorization uses explicit universe-map workspace grants.

Direct edits on every pointer move were rejected because they broadcast unfinished geometry and make conflict/undo semantics unsafe. Adding all generated rocks to the dynamic contact island was rejected because the existing hard body budget would stop ship simulation. Instanced population storage costs additional storage/views and does not itself implement mining or collision activation. Those limitations must remain explicit.

Polygon prisms plus ellipsoids and boxes provide bounded arbitrary concave footprints and depth without accepting executable generators or arbitrary triangle soups. Density is volumetric; deterministic rejection sampling has an explicit work budget and fails instead of underpopulating.
