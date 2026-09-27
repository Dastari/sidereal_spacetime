# Hull markings

Implemented as local Shipyard draft authoring and shared presentation support. This does not publish a ship, refit inventory or grant server authority.

Each `PartPlacement` may carry up to four `decals`; an assembly permits at most 128. Markings stay independent of the reusable asset and occupancy proxy. The assembly editor and Shipyard Hull inspector offer wording and a built-in Frontier planet emblem. Save/load, export, history and component duplication retain the data. Default-hull refresh treats custom markings as an edited draft.

Example:

```json
{"id":"ship-name","kind":"text","text":"WAYFARER","face":"top","position":[0,0,2.2],"size":[3.2,0.7],"rotation":0,"color":"#d8d3c5"}
```

`position` is part-local east/north/up in metres; `size` is the full rectangular paint canvas width/height in metres. Position limits are ±64 m, size is 0.05–16 m, rotation is ±2π radians. Wording accepts 1–32 ASCII letters, digits, spaces and `. _ / -`. Color is an RGB hex value. No URLs or external images are accepted. An emblem uses `kind: "frontier-planet"` and omits `text`.

The surface basis is `top` (default), `front` (local north-facing) or `right` (local east-facing). A flat receiving surface is required. Default placement uses the asset's top bound; adjust height for a recessed panel. The renderer adds a 3 mm surface separation and polygon offset. Markings are not projected across curved geometry. Moving, rotating and flipping the component carries their local positions; reflected components compensate text UVs to keep lettering readable.

Each marking uses four vertices, two triangles and one alpha-blended PBR draw. Matte pigmented paint receives scene lighting with roughness 0.62 and metallic 0. It adds no lights and does not modify the underlying normal map. Identical wording/color shares a 512×256 canvas texture and material within a scene; removing the final user disposes both. The placement's layer/cutaway controls hide its paint. The shared native-placement path includes the paint in published hull/equipment mesh lists when an explicitly published manifest contains these fields.

Contract tests cover malformed data, budgets, independent duplication, transforms, layout round-trip and preservation during default refresh. Renderer tests cover geometry cost, cutaway inheritance, mirror UVs, shared materials and disposal. Live publication and arbitrary curved-surface decals remain outside this implementation.

Side-armor review adds a left/west-facing paint plane with outward normals and readable UV orientation. This supports mirrored-side wording without reversing the text string or changing placed-object identity.
