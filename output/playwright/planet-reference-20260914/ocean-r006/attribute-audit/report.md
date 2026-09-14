# Native JSON / GLB attribute audit

Read-only artifact audit. No candidate was modified; this is not visual or hardware acceptance.

| Candidate | Material differences | JSON/GLB channel gaps | Position mismatch variants | Normal mismatch variants | UV mismatch variants | Errors |
|---|---:|---:|---:|---:|---:|---:|
| ocean-r006 | 0 | 0 | 0 | 0 | 0 | 0 |

## ocean-r006

- `steep-island` texture `water-albedo.png`: byte-identical.
- `steep-island` texture `water-normal.png`: byte-identical.
- `steep-island` texture `water-orm.png`: byte-identical.
- `steep-island` texture `water-normal.png`: byte-identical.
- `long-island` texture `water-albedo.png`: byte-identical.
- `long-island` texture `water-normal.png`: byte-identical.
- `long-island` texture `water-orm.png`: byte-identical.
- `long-island` texture `water-normal.png`: byte-identical.
- `archipelago` texture `water-albedo.png`: byte-identical.
- `archipelago` texture `water-normal.png`: byte-identical.
- `archipelago` texture `water-orm.png`: byte-identical.
- `archipelago` texture `water-normal.png`: byte-identical.
- `tiny-islet` texture `water-albedo.png`: byte-identical.
- `tiny-islet` texture `water-normal.png`: byte-identical.
- `tiny-islet` texture `water-orm.png`: byte-identical.
- `tiny-islet` texture `water-normal.png`: byte-identical.
- `lagoon-atoll` texture `water-albedo.png`: byte-identical.
- `lagoon-atoll` texture `water-normal.png`: byte-identical.
- `lagoon-atoll` texture `water-orm.png`: byte-identical.
- `lagoon-atoll` texture `water-normal.png`: byte-identical.
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

## Limits

- Material/position-matched corner multisets check values at explicit tolerances independently of index ordering, not mesh topology equivalence.
- Only explicit JSON material fields are compared; source-side omissions remain unspecified.
- Normals compared only when carried in JSON. Reconstruction of omitted normals by a renderer is outside this artifact audit.
- Geometry converted from BlenderZ-up JSON to glTFY-up and accumulated node transforms; UVs follow recorded glTF convention.

Full per-variant hashes, corner counts and exact differences are in report.json.
