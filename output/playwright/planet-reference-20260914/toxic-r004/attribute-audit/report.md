# Native JSON / GLB attribute audit

Read-only artifact audit. No candidate was modified; this is not visual or hardware acceptance.

| Candidate | Material differences | JSON/GLB channel gaps | Position mismatch variants | Normal mismatch variants | UV mismatch variants | Errors |
|---|---:|---:|---:|---:|---:|---:|
| toxic-r004 | 0 | 0 | 0 | 0 | 0 | 0 |

## toxic-r004

- `toxic-basin-group-a` texture `corrosion-0-albedo.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-0-normal.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-0-orm.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-2-albedo.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-2-normal.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-2-orm.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-3-albedo.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-3-normal.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-3-orm.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-4-albedo.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-4-normal.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-4-orm.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-1-albedo.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-1-normal.png`: byte-identical.
- `toxic-basin-group-a` texture `corrosion-1-orm.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-0-albedo.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-0-normal.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-0-orm.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-2-albedo.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-2-normal.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-2-orm.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-3-albedo.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-3-normal.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-3-orm.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-4-albedo.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-4-normal.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-4-orm.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-1-albedo.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-1-normal.png`: byte-identical.
- `toxic-basin-group-b` texture `corrosion-1-orm.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-0-albedo.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-0-normal.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-0-orm.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-2-albedo.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-2-normal.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-2-orm.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-3-albedo.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-3-normal.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-3-orm.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-4-albedo.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-4-normal.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-4-orm.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-1-albedo.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-1-normal.png`: byte-identical.
- `toxic-basin-group-c` texture `corrosion-1-orm.png`: byte-identical.
- `ground-sphere` texture `corrosion-0-albedo.png`: byte-identical.
- `ground-sphere` texture `corrosion-0-normal.png`: byte-identical.
- `ground-sphere` texture `corrosion-0-orm.png`: byte-identical.
- `ground-sphere-medium` texture `corrosion-0-albedo.png`: byte-identical.
- `ground-sphere-medium` texture `corrosion-0-normal.png`: byte-identical.
- `ground-sphere-medium` texture `corrosion-0-orm.png`: byte-identical.
- `ground-sphere-low` texture `corrosion-0-albedo.png`: byte-identical.
- `ground-sphere-low` texture `corrosion-0-normal.png`: byte-identical.
- `ground-sphere-low` texture `corrosion-0-orm.png`: byte-identical.

## Limits

- Material/position-matched corner multisets check values at explicit tolerances independently of index ordering, not mesh topology equivalence.
- Only explicit JSON material fields are compared; source-side omissions remain unspecified.
- Normals compared only when carried in JSON. Reconstruction of omitted normals by a renderer is outside this artifact audit.
- Geometry converted from BlenderZ-up JSON to glTFY-up and accumulated node transforms; UVs follow recorded glTF convention.

Full per-variant hashes, corner counts and exact differences are in report.json.
