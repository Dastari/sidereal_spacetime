# Matching native roof integration

2026-09-09 working checkpoint. Full construction acceptance remains in `docs/ship_construction_rebuild.md`.

The exact12-shape Blender roof r001 is paired with floor r002. GLB SHA256 `fe5646a431fcaa21033ca235094188b450c33e55e15735b7834fc18623fb3711`; source interface SHA256 `ffa320a5edc5b99a45ff50a4d33f94c0346fe87972358a73a4fee8375de68a57`. The installer verifies source pins, copies only runtime artifacts to both independent applications, and generates formatted content metadata. It does not replace the existing Wayfarer or infer structural ratings.

An optional exact `roofKit` pin adds roofs only to authored decks whose `roof` flag is true. Each native roof uses its paired floor shape, quarter-turn and origin, with underside at deck elevation+96 units. Reflected or incompatible transforms fail publication. An overlapping upper floor must clear the actual roof envelope ending at102 units; no utility cavity is inferred. Historical documents without the pin retain their previous canonical content and behavior.

The renderer imports the native GLB once per scene and shares its geometry/materials between independently identified placements. It retains the actual underside, single-sided PBR surfaces, embedded normal maps and tangent frames. Roofs hide in interior view and reappear in top-down view; this never changes collision, pressure, inventory or authority. Construction camera framing now uses the selected deck bounds and allows useful zoom on small authored rooms. Legacy Wayfarer framing remains unchanged.

## Actual game proof

Named database `sidereal-spacetime-dev-review-boundaries-20260909` retains the two earlier door-test instances. Through actual Shipyard Load, roof checkbox, Save, Publish and Spawn controls, the roof-enabled revision produced blueprint `ad0f8a81-ee7f-4eed-a104-6d1d18527f42`, SHA256 `a3fbf686ae6b5163a5535f6d3809adf935e3702f8022f86d7075340762718e5e`, and a third instance `55bcd413-6659-441b-bfe2-9e1a36cb2f48`.

Actual Enter and camera controls showed four independently identified roof placements, seven material primitives each, at underside height3 m. All four were disabled in interior view and enabled in top-down view. Reload preserved their floor associations and server state. Actual Return left all seven items, containers, appearance and all three door rows byte-equal; no visit remained. The source document has two decks; actual browser inspection covered the lower deck. Upper-deck positioning is covered by native mesh tests, not by an unimplemented gameplay traversal claim.

Inspected images: `output/playwright/construction-roof-r001-interior.png` and `output/playwright/construction-roof-r001-flight.png`. Local logs: `.runtime/roof-ui-publish.log`, `roof-ui-spawn.log`, `roof-game-review2.log`, `roof-return.log`. Rendering was manually stepped under SwiftShader; no hardware FPS or real-time animation-quality claim. Temporary provider administration was revoked after scoped test grants. The named browser is closed and the GPU slot released.

## Validation and remaining work

Thirteen focused roof/compiler/native-GLB tests pass. The combined checkpoint passes474tests/103files, typecheck and73docs. Full isolated smoke, aggregate build and art:check pass. Eighteen Python checks pass using the installed art environment locally and the declared Pillow environment in CI. Lint and formatting ratchets report zero new violations without changing the debt baselines. The schema was published normally through the managed additive path without reset; no normal construction fixture was seeded. Exact artifacts are in `docs/releases/construction-roofs-2026-09-09.json`.

The roof ledger explicitly records that r001 was its first authored revision. No r000 existed and none was fabricated or renumbered. Art-library validation now accepts this explicit origin only for new native companions without owned source crops; reference extraction histories must still retain r000 and all later revisions. Approval lookup uses revision numbers rather than array offsets. Two tests guard those distinctions. The newly supplied female character source sheet was inspected and appended to the source inventory without inventing crop coverage. The complete library check passes40source hashes,2369crop hashes/briefs and382ledgers at that gate.

These remain working art candidates. Solid native geometry does not certify airtight contact, material strength or damage behavior. Boundary r002 gasket and r003 floor-contact work are separate uninstalled candidates. Pressure authority, operational airlocks, physical deck traversal, cargo/services, localized structural damage, the full semantic Wayfarer template and two complete independent gameplay instances remain required.
