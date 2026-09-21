# ADR: Viewport-bounded planar map over live celestial instances

Date: 2026-09-21. Status: Accepted owner direction; authority details under review.

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
