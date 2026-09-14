# Native JSON / GLB attribute audit

Read-only artifact audit. No candidate was modified; this is not visual or hardware acceptance.

| Candidate | Material differences | JSON/GLB channel gaps | Position mismatch variants | Normal mismatch variants | UV mismatch variants | Errors |
|---|---:|---:|---:|---:|---:|---:|
| crystal-moon-1-r008 | 0 | 0 | 0 | 0 | 0 | 0 |
| crystal-moon-2-r008 | 0 | 0 | 0 | 0 | 0 | 0 |

## crystal-moon-1-r008

- `connected-crystalline-body` texture `material-3-albedo.png`: byte-identical.
- `connected-crystalline-body` texture `material-4-albedo.png`: byte-identical.
- `connected-crystalline-body` texture `material-5-albedo.png`: byte-identical.
- `connected-crystalline-body` texture `material-6-albedo.png`: byte-identical.
- `connected-crystalline-body` texture `material-7-albedo.png`: byte-identical.

## crystal-moon-2-r008

- `connected-crystalline-body` texture `material-3-albedo.png`: byte-identical.
- `connected-crystalline-body` texture `material-4-albedo.png`: byte-identical.
- `connected-crystalline-body` texture `material-5-albedo.png`: byte-identical.
- `connected-crystalline-body` texture `material-6-albedo.png`: byte-identical.
- `connected-crystalline-body` texture `material-7-albedo.png`: byte-identical.

## Limits

- Material/position-matched corner multisets check values at explicit tolerances independently of index ordering, not mesh topology equivalence.
- Only explicit JSON material fields are compared; source-side omissions remain unspecified.
- Normals compared only when carried in JSON. Reconstruction of omitted normals by a renderer is outside this artifact audit.
- Geometry converted from BlenderZ-up JSON to glTFY-up and accumulated node transforms; UVs follow recorded glTF convention.

Full per-variant hashes, corner counts and exact differences are in report.json.
