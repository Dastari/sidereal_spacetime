# Volcanic moon2 r004 — two bounded peripheral junction regions

Status: native candidate ready for actual47px intended-glow review; no artistic, owner or hardware acceptance claimed.

A new native `battered-region-b-edge` preserves the original B crater/crust, widening its existing outer fracture junction into one longer coherent patch with narrow tips. All11 original variants remain byte-equivalent JSON geometry/normals/UVs/material assignments. All six material definitions and12 texture files remain exact. No emission strength, global glow or new warm material is introduced.

The explicit recipe `warmEdgeRegions:[2,9]` selects the new native variant at just two existing B region identities. These are separated seeded-region slots, not camera-selected directions. Region centers, angles/scales and all other placement geometry are unchanged. The two existing part IDs remain resolvable through triangle ranges. Seven tests independently compare final output range geometry: changes are limited to crust-2 and crust-9; all other ranges are exact. AllLOD0/1/2 buffers and ranges remain equal. Original crater clearance and final surface exposure rays pass.

Final seed38 radial hot samples:42/50 exposed, estimated visible hot area.22508 versus r003.19607. This sampled geometric estimate is not pixel coverage, and only an actual47px capture can judge whether the bounded accent survives at the intended scale. Full body177152tri (+96), same six material batches. JSON↔GLB audit is clean for all12 variants, including authored normals/UV/PBR. Blender validates closed manifold topology.

Kit preview and isolated native-hot-edge-preview are supplied. native-cold-edge-context preserves an initial preview selection that showed only the copied cold foundation; it is a context comparison, not a claimed hot-patch render. No imported viewer/worker files, PR worktree, authority or production assets changed. Root owns integration/captures/Astra gate, full checks/build, ledger and PR.
