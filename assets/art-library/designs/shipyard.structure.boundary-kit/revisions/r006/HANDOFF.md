# R006 additive native floor closure and pressure-room qualification

Current visual candidate: `final-a006/kit.glb` and editable `boundary-kit.blend`.
Current static qualification: `qualification-a007/native-room-validation.json`.
The earlier `final-a006/native-room-validation.json` is superseded audit history; see `qualification-a007/correction.json`. Native GLB did not change during the audit correction.

Three reusable native meshes repair four-quarter floor-body junctions and reserve the existing r005 under-wall contacts at the doorway strip. `interfaces.json` identifies exact parts and fixed-room placements. Existing r001/r002/r003/r004/r005 and floor sources are untouched. Do not install the old r003 strip together with the reserved r006 variant.

The complete test fixture is4m by2m with eight quarter floors, matching generic roof-kit r001 pieces at Z3m, r004 walls, a central r001 frame/leaf, r002 gasket/seat and r005/r006 contacts. The static closed seal qualifies at1µm coordinate tolerance. Actual accepted motion, obstruction, power, pressure ratings and final art approval remain separate. The pressure compiler requires both fully closed hinge and fully deployed seal before zero flow, and verifies actual server-owned native placements before producing its accepted model.

## Reproduction

Use the repository-configured Blender executable through the authoring workflow. Run `author_floor_junction.py -- <new-output-directory>` to reproduce editable source, GLB and CPU review PNGs from `native-derived-meshes.json`. It writes a fresh output directory and never installs anything.

Offline audit dependencies are pinned in `audit-requirements.txt`. They are tooling only, not game/runtime dependencies. Run from the repository root:

```
<isolated-python> assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r006/derive_native_junction.py
<isolated-python> assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r006/audit_native_room.py <new-report-path>
```

The retained a006 derivation uses its original float32 operand precision and reproduces `native-derived-meshes.json` byte-for-byte, SHA54454e4d7e9d497f54f85fd58d5d313672cadeff23e1287e7362dcf7a0d7aa04. Native-room qualification uses float64 CSG and exact native triangle correspondence.

`extract_native_door_solids.py -- <new-json-path>` evaluates individual native r001 door/frame and r004 wall/source objects from preserved Blender files. `native_csg.py` verifies every triangle against the actual GLB before Boolean union. This separation is necessary: welding touching source solids by material/position before CSG removed part of a rail and falsely changed the gas volume. No TypeScript voxel shape is used as visual art or substituted for a native mesh.

The final static-contact audit also measures full bottom-gasket floor/threshold coverage. A10nm contact perturbation addresses a residual zero-width coplanar topology degeneracy within the declared1µm tolerance; no mesh is inflated at runtime. Fixed native free volumes use the unperturbed actual solids above the0.1875m walk datum. Read `docs/handoffs/construction_native_pressure_room.md` for discretization limits and exact authority/installation work.

Failed authoring attempts a001–a005 and successful a006 CPU renders remain under `.runtime/construction-enclosure-audit/`; their paths are recorded in the revision ledger fragment. The preceding design ledger is preserved as `previous-design-checkpoint.json`. No final owner approval or normal game installation is recorded.
