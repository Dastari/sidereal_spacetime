# Volcanic moon2 r005 — native heated shoulder

Preserved r004 geometry frozen. Only 139 of 14194 native B-edge triangles receive a new red/orange heated-shoulder material. Selection is restricted to cold upward/side faces immediately adjacent to the existing exposed core, with center distance <=0.095 and every vertex <=0.15 native units. The existing core and all six prior materials are unchanged. The unchanged r004 composer uses B-edge at exactly crust-2 and crust-9.

Native editable source was opened from r004, changed by material assignment only, and saved as a new .blend. No topology, normals, UVs, old textures, other variants, lights or placement changes. Other GLBs are copied byte-identically. Native preview uses the preserved r004 camera and rendering setup.

Validation: all12 variants passed the read-only JSON/GLB position, split-normal, UV, material and texture audit with zero differences/gaps/errors. Two focused tests passed: complete attribute/cold-source preservation and exact retained LOD/placement identity. Test heap bounded to4GiB and one worker; Blender ran one thread sequentially.

Native preview visibly adds a darker orange/red bank beside the unchanged pale hottest core; most rock remains cold. Browser reference-scale visual review, independent review and hardware transition acceptance remain pending. No production publication or owner artistic sign-off.
