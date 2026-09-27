# ADR: Per-placement paint with preserved native materials

Date: 2026-09-15
Status: Accepted for implementation under the owner's paint-control request

The native library contains both shared textured atlases and named paint materials, and meshes/materials are shared across placements. A global material tint would recolour other objects and markings. Colour-specific GLBs would recreate the duplicate catalog problem.

Store optional primary/secondary sRGB paint on each placement. Use a presentation-only material binding with explicit surface/material roles to replace only albedo in paintable areas; retain normal, roughness, optics and emission. Painted nodes share immutable geometry/textures and own their material variants, while unpainted nodes retain ordinary instancing. This adds draw calls for independently painted instances but avoids per-colour assets, per-edit image rebakes and destructive native changes. Scene/placement disposal must free only owned variants. More advanced per-instance shader buffers can optimize large fleets after measured demand.

See [the paint specification](../handoffs/shipyard_paint_20260915.md). Texture/finish selection beyond the two requested paint colours is a separate extension.
