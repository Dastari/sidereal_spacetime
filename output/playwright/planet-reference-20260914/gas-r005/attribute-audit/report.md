# Native JSON / GLB attribute audit

Read-only artifact audit. No candidate was modified; this is not visual or hardware acceptance.

| Candidate | Material differences | JSON/GLB channel gaps | Position mismatch variants | Normal mismatch variants | UV mismatch variants | Errors |
|---|---:|---:|---:|---:|---:|---:|
| gas-r005 | 0 | 0 | 0 | 0 | 0 | 0 |

## gas-r005

- `gas-body` texture `gas-albedo-generated.png`: byte-identical.
- `ring-dust-0` texture `ring-dust-0.png`: byte-identical.
- `ring-dust-1` texture `ring-dust-1.png`: byte-identical.
- `ring-dust-2` texture `ring-dust-2.png`: byte-identical.

## Limits

- Material/position-matched corner multisets check values at explicit tolerances independently of index ordering, not mesh topology equivalence.
- Only explicit JSON material fields are compared; source-side omissions remain unspecified.
- Normals compared only when carried in JSON. Reconstruction of omitted normals by a renderer is outside this artifact audit.
- Geometry converted from BlenderZ-up JSON to glTFY-up and accumulated node transforms; UVs follow recorded glTF convention.

Full per-variant hashes, corner counts and exact differences are in report.json.
