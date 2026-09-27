# Ice26 read-only native shadow diagnosis

No native art or runtime files changed. Source kit SHA256 and exact results are in report.json; curvature.json is a small numerical reproduction of composer25's spherical placement at its largest scale0.38. This is geometry evidence, not a reproduction of the complete GPU shadow pass.

## Ruled out in source

All five native variants have zero exact duplicate triangles, zero degenerate triangles, zero positional boundary edges and zero inward corner normals. Snow corner normals match their original geometric face normals with minimum dot0.99999991. Source caps are closed, not open sheets. Source sourceComponentsManifold validation agrees. A Crystal-style winding repair is unjustified.

The gorge has38 exact-position edges with more than two faces: independent authored solids meet/overlap. Other variants have zero such shared edges. This is not proof of coincident visible snow roofs. Overlap is intentional in thick shoulders, embedded flakes and attached glacial columns; twelve runtime regions also overlap spatially. Duplicate-triangle absence does not rule out partially coplanar overlaps. A picked residual stripe must be resolved to its body placement before changing anything.

## Actionable shadow-offset concern

scripts/art_library/ice_reference_composition_r025.ts transports native normals through a nonlinear spherical placement with deformedNormalAt. These are analytic curved-surface normals; the actual uploaded triangles stay planar. Across snow caps atscale0.38, the geometric normal versus transported corner normal angle reaches3.3303degrees for cut regions and2.9339degrees for gorges. Maximum analytic midpoint sagitta versus the rendered plane is0.001786 /0.001133 body units. These are expected consequences of retaining the art while bending it, not incorrect native normals.

Installed Babylon shadowMapVertexNormalBias offsets shadow vertices inward along those shading normals by normalBias*sin(N,L). At normalBias0.006, this is comparable to the source's thinnest snow flakes (minimum authored height0.018*regionScale gives0.00576–0.00684 body units) and a substantial fraction of snow lip depth0.025*regionScale (0.008–0.0095). This can distort thin caster footprints and expose discontinuities at hard-normal/material boundaries. Normal depth bias0.0005 is in shadow depth space; it cannot be compared directly with the reported world-space distances.

Given the observed shadow-off cure and partial RHS shadow-culling cure, preserve accepted source art. Next diagnostic should isolate shadow caster normal-offset versus raster depth/slope on the picked residual cap: zero normalBias with controlled depth/slope adjustment, or a shadow-only geometric-normal offset comparison using the exact visible triangles. Keep visible PBR normals unchanged. If stripes instead survive only when a second picked region casts, isolate that overlapping placement's caster contribution. Native repair, opacity/culling workarounds or remeshing are not supported by this audit.

The residual central stripes are not conclusively assigned to one cause by read-only native inspection. Full GPU shadow depth, camera bounds and picked triangle/placement evidence remain necessary before choosing an implementation.
