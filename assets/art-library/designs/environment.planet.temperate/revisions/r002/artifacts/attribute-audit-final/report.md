# Native JSON / GLB attribute audit

Read-only artifact audit. No candidate was modified; this is not visual or hardware acceptance.

| Candidate | Material differences | JSON/GLB channel gaps | Position mismatch variants | Normal mismatch variants | UV mismatch variants | Errors |
|---|---:|---:|---:|---:|---:|---:|
| temperate-r002 | 0 | 0 | 0 | 1 | 0 | 0 |

## temperate-r002

- `ground-sphere` texture `water-albedo.png`: byte-identical.
- `ground-sphere` texture `water-normal.png`: byte-identical.
- `ground-sphere` texture `water-orm.png`: byte-identical.
- `ground-sphere` texture `water-normal.png`: byte-identical.
- `ground-sphere-medium` texture `water-albedo.png`: byte-identical.
- `ground-sphere-medium` texture `water-normal.png`: byte-identical.
- `ground-sphere-medium` texture `water-orm.png`: byte-identical.
- `ground-sphere-medium` texture `water-normal.png`: byte-identical.
- `ground-sphere-low` texture `water-albedo.png`: byte-identical.
- `ground-sphere-low` texture `water-normal.png`: byte-identical.
- `ground-sphere-low` texture `water-orm.png`: byte-identical.
- `ground-sphere-low` texture `water-normal.png`: byte-identical.
- `continent-a` texture `water-albedo.png`: byte-identical.
- `continent-a` texture `water-normal.png`: byte-identical.
- `continent-a` texture `water-orm.png`: byte-identical.
- `continent-a` texture `water-normal.png`: byte-identical.
- `continent-a` texture `island-1-albedo.png`: byte-identical.
- `continent-a` texture `island-1-normal.png`: byte-identical.
- `continent-a` texture `island-1-orm.png`: byte-identical.
- `continent-a` texture `island-2-albedo.png`: byte-identical.
- `continent-a` texture `island-2-normal.png`: byte-identical.
- `continent-a` texture `island-2-orm.png`: byte-identical.
- `continent-a` texture `island-3-albedo.png`: byte-identical.
- `continent-a` texture `island-3-normal.png`: byte-identical.
- `continent-a` texture `island-3-orm.png`: byte-identical.
- `continent-a` texture `island-4-albedo.png`: byte-identical.
- `continent-a` texture `island-4-normal.png`: byte-identical.
- `continent-a` texture `island-4-orm.png`: byte-identical.
- `continent-a` texture `island-5-albedo.png`: byte-identical.
- `continent-a` texture `island-5-normal.png`: byte-identical.
- `continent-a` texture `island-5-orm.png`: byte-identical.
- `continent-a` texture `island-6-albedo.png`: byte-identical.
- `continent-a` texture `island-6-normal.png`: byte-identical.
- `continent-a` texture `island-6-orm.png`: byte-identical.
- `continent-b` texture `water-albedo.png`: byte-identical.
- `continent-b` texture `water-normal.png`: byte-identical.
- `continent-b` texture `water-orm.png`: byte-identical.
- `continent-b` texture `water-normal.png`: byte-identical.
- `continent-b` texture `island-1-albedo.png`: byte-identical.
- `continent-b` texture `island-1-normal.png`: byte-identical.
- `continent-b` texture `island-1-orm.png`: byte-identical.
- `continent-b` texture `island-2-albedo.png`: byte-identical.
- `continent-b` texture `island-2-normal.png`: byte-identical.
- `continent-b` texture `island-2-orm.png`: byte-identical.
- `continent-b` texture `island-3-albedo.png`: byte-identical.
- `continent-b` texture `island-3-normal.png`: byte-identical.
- `continent-b` texture `island-3-orm.png`: byte-identical.
- `continent-b` texture `island-4-albedo.png`: byte-identical.
- `continent-b` texture `island-4-normal.png`: byte-identical.
- `continent-b` texture `island-4-orm.png`: byte-identical.
- `continent-b` texture `island-5-albedo.png`: byte-identical.
- `continent-b` texture `island-5-normal.png`: byte-identical.
- `continent-b` texture `island-5-orm.png`: byte-identical.
- `continent-b` texture `island-6-albedo.png`: byte-identical.
- `continent-b` texture `island-6-normal.png`: byte-identical.
- `continent-b` texture `island-6-orm.png`: byte-identical.
- `continent-c` texture `water-albedo.png`: byte-identical.
- `continent-c` texture `water-normal.png`: byte-identical.
- `continent-c` texture `water-orm.png`: byte-identical.
- `continent-c` texture `water-normal.png`: byte-identical.
- `continent-c` texture `island-1-albedo.png`: byte-identical.
- `continent-c` texture `island-1-normal.png`: byte-identical.
- `continent-c` texture `island-1-orm.png`: byte-identical.
- `continent-c` texture `island-2-albedo.png`: byte-identical.
- `continent-c` texture `island-2-normal.png`: byte-identical.
- `continent-c` texture `island-2-orm.png`: byte-identical.
- `continent-c` texture `island-3-albedo.png`: byte-identical.
- `continent-c` texture `island-3-normal.png`: byte-identical.
- `continent-c` texture `island-3-orm.png`: byte-identical.
- `continent-c` texture `island-4-albedo.png`: byte-identical.
- `continent-c` texture `island-4-normal.png`: byte-identical.
- `continent-c` texture `island-4-orm.png`: byte-identical.
- `continent-c` texture `island-5-albedo.png`: byte-identical.
- `continent-c` texture `island-5-normal.png`: byte-identical.
- `continent-c` texture `island-5-orm.png`: byte-identical.
- `continent-c` texture `island-6-albedo.png`: byte-identical.
- `continent-c` texture `island-6-normal.png`: byte-identical.
- `continent-c` texture `island-6-orm.png`: byte-identical.

## Limits

- Material/position-matched corner multisets check values at explicit tolerances independently of index ordering, not mesh topology equivalence.
- Only explicit JSON material fields are compared; source-side omissions remain unspecified.
- Normals compared only when carried in JSON. Reconstruction of omitted normals by a renderer is outside this artifact audit.
- Geometry converted from BlenderZ-up JSON to glTFY-up and accumulated node transforms; UVs follow recorded glTF convention.

Full per-variant hashes, corner counts and exact differences are in report.json.
