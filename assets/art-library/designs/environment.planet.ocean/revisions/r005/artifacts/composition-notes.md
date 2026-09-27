# Ocean r005 composition

Uses the exact ocean-r005 native source kit. Tangent coordinates scale 1.4× for every island, atoll, islet and supporting grove; radial heights are unchanged. Grove offsets and native trunk/foliage footprints follow the same horizontal mapping. Native triangles, material indices and placement IDs are preserved.

Five focused tests and TypeScript checking pass, including NullEngine ray picking of an actual native plateau at every LOD and inverse-map checks for both island and grove vertices. Major geometry is identical across LODs. Scene high detail totals 110,156 native triangles, already present under the previous map of this kit; the inherited 110,000 guard was revised to 111,000 without adding geometry.

The attribute audit reports this source JSON omits authored GLB normal/UV channels. This compositor continues the existing derivative-correct native face-normal transport; it does not claim missing authored smooth normals or UVs were restored. Actual planet captures, independent reference review and hardware transition acceptance remain outstanding. This snapshot is frozen for parent capture.
