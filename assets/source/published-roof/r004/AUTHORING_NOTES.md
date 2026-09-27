# Frontier roof kit R004

This is an unsigned redesign draft. No live asset or database publication was performed.

The 26 named reusable Blender components cover all 73 currently installed roof placements while retaining their asset IDs, placed IDs, transforms and cutaway category. Eighteen unused historical roof palette assets are explicitly retired for new drafts in specification.json; existing unsupported saved drafts are not overwritten.

Native visual geometry is exported through identity-transform merged component nodes. Editable source masters remain separate. Each GLB preserves mapped PBR normals/roughness, pigment roles and emissive surfaces. Height and metallic source maps remain editable source artifacts; the runtime embeds normal, calm-normal and roughness maps. The sampled occupancy representation is separate and uses the actual closed source solids, excluding explicitly recorded subcell decorative details.

The ship-context Blender captures re-import the exact staged GLB and all current ship GLBs, rather than substituting source meshes. review-assembly.blend preserves that context; roof-kit.blend is the authored master source. Example wording/emblem planes use the exact runtime canvas textures and are not part of the reusable kit.

R004 geometry exactly matches the repaired R003 export by decoded position, normal, tangent, UV and index payload hashes. R004 changes the quiet dark normal map and fixes eight valid, bounded presentation spotlight descriptors. Actual Babylon API creation and all 73 full-ship placement checks pass. Final visual acceptance is recorded by the main agent and Astra, separately from owner approval.

Managed commands: npm run art:roof -- --revision N --stage build, then --stage prepare and --stage render. Never run prepare over a seeded review document without reapplying its separate decal seed. Build refuses an existing source revision. Generation starts from current published catalog/assembly, so record their hashes before reproducing.
