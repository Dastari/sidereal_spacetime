# Ice26 selected transmissive shards — 2026-09-14

Owner feedback on the actual Ice25 GPU image: “The ice planet looks good” and some tall shards should look transparent like glass/ice. Preserve this as positive feedback on25, not final sign-off. This isolated26 source responds only to the requested selected-shard optics. No publication is authorized by this source work.

Six named native tall objects are selected: GEO-hero-blue-column, GEO-blue-column-mid-a, GEO-bank-attached-blue-cluster-1-1, GEO-gorge-unequal-column-0, GEO-gorge-unequal-column-2, GEO-gorge-unequal-column-5. Only their vertical blue side faces move to material roles5/6. All snow cap faces, surrounding terrain/ground, cavities and other blue shafts keep their original opaque roles. `kit.opticalPolicy` and native object opticalRole extras preserve the exact mapping. New definitions carry opticalRole `transmissive-ice-shard`.

| Native role | Transmission | Roughness | IOR | Thickness |
| --- | --- | --- | --- | --- |
| clear-glacial-shard (5) | .82 | .075 | 1.31 | .16 |
| blue-glacial-shard (6) | .68 | .11 | 1.31 | .20 |

Both use attenuationColor [.42,.72,.96], attenuationDistance1.8, clearcoatFactor.18/roughness.08, metallic0 and alpha1. Actual Blender Principled Transmission Weight, a glTF Material Output Thickness socket and connected Volume Absorption author the real KHR_materials_transmission and KHR_materials_volume extensions. Both raw Blender and final GLBs also carry correct IOR1.31. No alpha-only substitute or new shader. Values use exactly `transmissionFactor`, `ior`, `thicknessFactor`, `attenuationColor`, `attenuationDistance` JSON keys. Physical thickness remains local native kit units for runtime handling.

All source positions, indices, corner normals and UVs match25 exactly; original5 material definitions and texture files remain unchanged. Shaft variant has120 optical triangles; gorge has1152; ground has0. All185544 composed triangles remain retained across LODs, including7632 optical triangles in the12-region body. Geometry bounds and source silhouettes are unchanged.

Five tests and dedicated TypeScript check pass: retainedLOD/attributes, NullEngine shaft/gorge floor clearance, original-surface and opaque-cap identity, plus exact raw/final glTF transmission/IOR/volume/alpha assertions. The standalone `audit-optical-source.py` validates all10 raw/final GLBs and records `optical-source-validation.json`. Standard full attribute/material audit has zero position/UV/material differences or missing channels. Three ground normal ambiguities from greedy duplicate matching resolve through read-only maximum bipartite matching at unchanged normal1e-4, position/UV1e-5; no unmatched corners and unchanged kit bytes. Per-ground scripts/results are preserved.

Editable kit.blend,5 GLBs, raw exports, JSON, original maps, source snapshots, kit-preview.png and a separately preserved256-sample optical-preview.png are present. Both actual native previews were inspected: selected shard sides transmit/refract while snow caps remain opaque. Root owns Babylon optical transport/shared refraction resources, real game capture, independent review and hardware LOD validation. This source is frozen, implemented and runtime-unmeasured; no production change or owner final approval claimed.
