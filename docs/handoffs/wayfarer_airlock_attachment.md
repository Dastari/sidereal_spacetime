# Wayfarer external-airlock attachment qualification

2026-09-10: **attachment study, not an installed or spawnable ship revision**. Exact candidate transforms and source hashes are in `wayfarer_airlock_attachment_candidate.json`. No original placement, material, floor, cargo, cockpit, account or instance was changed. The existing independent airlock qualification remains valid for its original 70-part fixture only.

The best aligned bay found for further work is starboard, centered at ship-local **Y=-4 m**, spanning Y=-5..-3, at nominal floor edge **X=5 m**. This is a real 2m floor/side-panel interface away from the R006 cockpit, port cargo and thruster centerlines. The floor is `floor-2--2`, whose actual authored GLB top is 0.1875m, matching the airlock kit exactly. Its nominal edge is2m long.

There is **no existing usable aperture** through that bay. Tests against actual transformed native triangles, rather than catalog bounds or sampled occupancy, found all20 aperture rays blocked by each of:

| Existing placement | Source | Required change |
| --- | --- | --- |
| `wall-2--2` | Retained native `parts.glb`, asset `part-0bf0c79e5a52a9cee388` | Interior structural opening; retain/split old under-deck backing explicitly |
| `wall-3--2` | Retained native `parts.glb`, asset `part-386f7415c520e22bd6b6` | Side bulkhead opening through its real thickness |
| `superstructure-3--2` | Side armor r003, selector `GEO-part-0558bcda4ab0cb8c9f70--surface` | Matching faction armor collar with an actual through-opening |

The two legacy assets use SHA `e45b79a8d40ca46124a51e4d5e24f89d0b00a0361989766e54b64deb8ad6999f`; the native side armor kit uses `eeef5b0cd37893c28b88fd54111b9cb58f086fba23b56a62fb6d7d44052c5ff7`. The report pins selectors, all transforms, full bounds and ray intersections. A convex-cover collision override must not pretend these surfaces are absent.

The roof also needs an actual adapter. `roof-2--2` has a measured native underside at **2.6875m**, while the qualified airlock roof underside is **3m**: a **312.5mm** mismatch. The old roof edge `roof-3--2` is separately retained. Both use roof r004 SHA `8f2af39abadfff8a944e59840ccfa8190959778b1b914adfc0293005363c546f`. Do not scale either model to hide this difference; author a stepped header/roof collar with measurable contact surfaces.

## Exact candidate placements

The report contains70 source-indexed, independently named native placements for each option, including the original a007 per-source hashes. These are inspectable candidate placements only; both explicitly deny activation.

- **Compact:** translate the original fixture by `(3,-5,0)`, no rotation. Its inner door would be at `(5,-5,0)`, quarter-turn1; outer door at `(9,-3,0)`, quarter-turn3. Exterior landing spans X9..11. Copying the full fixture would duplicate **4m² of existing floor** and intersect the conservative cover of the existing crew bed. The viable design must omit the *new* interior test-room floor/roof/walls and reuse the existing ship interior. That changes the composition and demands fresh interface/free-volume/seal qualification. Original crew/floor objects stay unchanged.
- **Extended vestibule:** translate by `(5,-5,0)`, no rotation. Inner door `(7,-5,0)`, outer door `(11,-3,0)`; landing X11..13. It adds16m² of floor without overlapping existing floor area and shares an exact2m nominal edge. It avoids all tested protected equipment/cockpit/cargo covers. However, the three existing side barriers still obstruct the inlet, and source part26 is the airlock fixture's own closed back wall at the join. A real open inlet must replace that *new* back-wall piece. The old70-part closed-room proof cannot certify this change. This option makes the ship considerably wider.

The compact route is the more economical eventual layout. Its required native adaptations are now explicit, so it should be authored as a new composite revision rather than assembled by hiding colliding objects. The extended version is a valid comparison for footprint/interface review, not an automatic fallback to publish.

## Minimum modeling and authority follow-up

Author native Blender components for the selected2m bay: structural aperture, separate exterior armor collar, floor/threshold contact adapter, and stepped roof/header collar. Target at least1.25m clear width and a continuously supported radius0.3m/height1.8m actor. Match the floor top0.1875m, old roof underside2.6875m, and new roof underside3m. Preserve the old floor tile and its independent structural backing; if a legacy wall asset combines backing and wall geometry, split that explicitly instead of deleting the entire asset. Keep R006 cockpit, the four cargo placements and all functional item UUID mappings intact.

Retain source meshes, mapped materials and independent stable placed identities. Native wall/hull damage proxies remain separate from visuals; no empty collider or armor/pressure rating is inferred from an opening's appearance. A future live refit is an authoritative transaction preserving inventories, seats, audit and UUIDs, distinct from publishing a new template.

The actual combined native solids must establish a continuous closed chamber, gasket/frame/threshold/header contacts, real free volumes and open-door body sweeps. Opening into Wayfarer requires an accepted neighboring pressure compartment and its existing gas accounting. The current ship is **not** globally certified airtight; it must never inherit the airlock fixture's seal claim. The controller's present vacuum/manual-service fixture grants no pump, power, free air, EVA or docking capability.

Reproduce with the pinned geometry environment:

```sh
.runtime/construction-enclosure-python/bin/python scripts/qualify_wayfarer_airlock_attachment.py
.runtime/construction-enclosure-python/bin/python -m unittest discover -s scripts -p test_wayfarer_airlock_attachment.py
```

Two tests pass: native face rays distinguish a real clear path from a bounding cover, and the exact candidate/source/interface checks retain all262 original placements while refusing false passability, roof compatibility and seal/activation claims. This study makes no art or runtime publication changes.
