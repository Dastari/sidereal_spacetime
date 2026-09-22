# ADR: Viewport-bounded planar map over live celestial instances

Date: 2026-09-21. Status: Accepted owner direction; implemented candidate, authenticated browser acceptance pending.

Use the live server celestial UUID as the Genesis instance identity. Reuse its
existing authoritative state and map edit transaction where possible, rather
than a second client-local planet catalog pretending to be world state. Separate
reusable visual asset IDs from mutable instance values, and require grants,
expected revision and source fingerprint before committing changes.

Keep runtime spatial/elevation storage compatible; this change exposes planar
XY authoring only. Editor feather is computed from XY geometry at 10% of size
and has no authoring property. Retain existing gameplay transition fields for
compatibility rather than conflating preview cosmetics with authority.

Cull and clip projected geometry before producing SVG. Giant offscreen dashed
circles are unbounded raster work even with few DOM nodes. Prefer visible arc
segments, viewport culling and frame-coalesced camera updates over reducing
planet detail or adding arbitrary camera limits. Consequence: analytic viewport
helpers need numeric edge-case tests, and preview frames can lag by a bounded
render interval while camera/selection interaction remains responsive.

The existing `system_body` row is the live Genesis instance. No parallel instance
store, schema migration or authentication exception is introduced. `sidereal-shipyard`
uses its already approved game resource audience and existing session proof. Native
asset, seed and radius edits use the same map transaction, with an approved asset
allowlist, type/seed validation and ship safety checks when bodies grow or move.
Body UUIDs and unrelated motion/state survive the edit. Authority tick materializes
grant expiry for private views; reducers check exact expiry at command consumption.

A successful reducer response alone does not complete a save: wait for a newer map
projection, then load its canonical document/revision/fingerprint. Preserve retry
operation identity during delayed subscription delivery. The supported native
instance properties are name, XY position, radius, native asset, composition seed
and orbital parent; Blender mesh/material authoring remains its existing pipeline.

Owner confirmation (2026-09-21): keep authored Blender visuals and edit live
instance properties: asset, seed, radius, name, planar position and parent. Older
procedural terrain/material controls are outside this live-editing scope. This
confirms the implemented candidate direction; it is not approval of new art.
