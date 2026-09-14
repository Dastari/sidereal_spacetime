# Crystal r003 — explicit opaque IOR preservation

Preserved successor of Crystal r002. Geometry, native materials other than omitted IOR metadata, Blender source, kit JSON, and every GLB BIN chunk are byte-identical. Original r002 exports remain in place. The generator remains `scripts/art_library/build_crystal_native_kit_r002.py`; apply `preserve_native_kit_ior.py` to a new output directory after authoring.

Five explicit crystal material IOR values (1.48) were missing in four GLBs, where glTF otherwise falls back to 1.5. This successor carries those 20 values in KHR_materials_ior. It does not invent absent source material intent.

Validation: two correction tests passed; complete successor attribute audit reports no material or supplied attribute mismatches. Eleven GLB NORMAL channels and three UV channels remain absent from kit JSON as in r002; this correction does not claim authored channel parity for them. Full visual/LOD review remains with the parent; kit preview is unchanged source evidence, not a new rendered-planet capture.
