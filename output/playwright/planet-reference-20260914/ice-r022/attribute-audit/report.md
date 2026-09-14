# Native JSON / GLB attribute audit

Read-only artifact audit. No candidate was modified; this is not visual or hardware acceptance.

| Candidate | Material differences | JSON/GLB channel gaps | Position mismatch variants | Normal mismatch variants | UV mismatch variants | Errors |
|---|---:|---:|---:|---:|---:|---:|
| ice-r022 | 0 | 0 | 0 | 0 | 0 | 0 |

## ice-r022

- `snow-cut-region` texture `ice-0-albedo.png`: byte-identical.
- `snow-cut-region` texture `ice-0-orm.png`: byte-identical.
- `snow-cut-region` texture `ice-1-albedo.png`: byte-identical.
- `snow-cut-region` texture `ice-1-orm.png`: byte-identical.
- `snow-cut-region` texture `ice-2-albedo.png`: byte-identical.
- `snow-cut-region` texture `ice-2-orm.png`: byte-identical.
- `snow-cut-region` texture `ice-3-albedo.png`: byte-identical.
- `snow-cut-region` texture `ice-3-orm.png`: byte-identical.
- `snow-cut-region` texture `ice-4-albedo.png`: byte-identical.
- `snow-cut-region` texture `ice-4-orm.png`: byte-identical.
- `snow-open-gorge` texture `ice-2-albedo.png`: byte-identical.
- `snow-open-gorge` texture `ice-2-orm.png`: byte-identical.
- `snow-open-gorge` texture `ice-3-albedo.png`: byte-identical.
- `snow-open-gorge` texture `ice-3-orm.png`: byte-identical.
- `snow-open-gorge` texture `ice-4-albedo.png`: byte-identical.
- `snow-open-gorge` texture `ice-4-orm.png`: byte-identical.
- `snow-open-gorge` texture `ice-0-albedo.png`: byte-identical.
- `snow-open-gorge` texture `ice-0-orm.png`: byte-identical.
- `snow-open-gorge` texture `ice-1-albedo.png`: byte-identical.
- `snow-open-gorge` texture `ice-1-orm.png`: byte-identical.
- `ground-sphere` texture `ice-0-albedo.png`: byte-identical.
- `ground-sphere` texture `ice-0-orm.png`: byte-identical.
- `ground-sphere-medium` texture `ice-0-albedo.png`: byte-identical.
- `ground-sphere-medium` texture `ice-0-orm.png`: byte-identical.
- `ground-sphere-low` texture `ice-0-albedo.png`: byte-identical.
- `ground-sphere-low` texture `ice-0-orm.png`: byte-identical.

## Limits

- Material/position-matched corner multisets check values at explicit tolerances independently of index ordering, not mesh topology equivalence.
- Only explicit JSON material fields are compared; source-side omissions remain unspecified.
- Normals compared only when carried in JSON. Reconstruction of omitted normals by a renderer is outside this artifact audit.
- Geometry converted from BlenderZ-up JSON to glTFY-up and accumulated node transforms; UVs follow recorded glTF convention.

Full per-variant hashes, corner counts and exact differences are in report.json.
