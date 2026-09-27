# Remaining seed / LOD validation map

Read-only source/evidence inventory, 2026-09-14. No captures, tests, source edits or art changes were performed for this map. Scope is the nine main and19 moon exact working candidates pinned below. Root is repairing shadow rendering; this map does not reopen their accepted art.

## Existing visual seed evidence

A recursive filename audit of the full reference output finds **zero seed117 or seed904 PNGs**. The only explicitly seed-named non38 images are `desert-r014/planet-seed17-shadows.png` and `planet-seed99-shadows.png`. Existing seed38 triplets support all19 moon working passes, and main-family working reports cite seed38/representative captures. Unlabelled images are not silently promoted to seed evidence. Crystal main's `coverage.json` covers numerical emitter visibility at seeds1/38/91; it is not a117/904 visual pass. Crystal10 tests evaluate38/117/904 retained geometry; this is not imagery. Ice moon optimization/projection reports cover multiple numeric seeds and LODs, again not a broader visual review.

Thus every one of28 candidates still needs the requested visual117/904 evidence, with a justified exception for the seed-independent gas main geometry noted below.

## Exact pins and seed semantics

| Family / exact current candidate(s) | Seed changes | Geometry LOD contract |
|---|---|---|
| Desert `desert-r014` | Global anchor phase, individual region rotation, secondary rock locations/scales | Different authored ground;12/6/0 secondary rocks |
| Rocky `rocky-r010` | Anchor phase plus each crater-region rotation; overlap/clearance changes | Composer always same highest ground, ignores lod |
| Ocean `ocean-r007` | Anchor phase, island rotations, scattered islet position/scale; weather separately seeded | Different authored water sphere; persistent islands/groves/islets |
| Temperate `temperate-r003` | Anchor phase, continent rotations, grove angle/vertical size; seeded weather | Different authored water sphere; persistent continents/groves |
| Toxic `toxic-r007` + fogr005 | Anchor phase, individual basin rotations; final terrain-dependent fog clearance | Solid geometry ignores lod; verify weather identity too |
| Crystal `crystal-r013` source9 | Regional rotation plus coverage-driven extra emitter/crystal placements | Solid geometry ignores lod; verify lights/optics separately |
| Ice `ice-r026` | Anchor phase plus individual region rotation; overlapping floor/substrate envelope changes | Fixed detail qualified; all authored geometry retained |
| Volcanic `volcanic-r023` + restored smoke | Anchor phase plus regional rotation; recipe-driven smoke | Different authored ground; smoke LOD contract also relevant |
| Gas `gas-r005` | **Composer does not accept/use seed**; recipe/environment may still vary | Fixed single native bands/rings assembly |
| Rocky1 `rocky-moon-r002`; Rocky2 `rocky-moon-2-r001` | Regional impact/crust rotation, not whole-body rotation alone | Rocky/Solid composers ignore lod |
| Desert1/2 `desert-moon-{1,2}-r001` | Regional rotations under stable layoutSeed/scales | Solid composer ignores lod |
| Gas1/3 `gas-giant-moon-{1,3}-r005`; Gas2 `gas-giant-moon-2-r001` | Regional rotations; luminous role visibility may shift through overlaps | Solid composer ignores lod;1/3 explicitly fixed-qualified |
| Ocean1 `ocean-moon-1-r001`; Ocean2 `ocean-moon-2-r002` | Regional rotations, overlap/coastal cap visibility | Hybrid composer ignores lod |
| Temperate1/2 `temperate-moon-{1,2}-r002` | Regional rotations, overlap/green-cap visibility | Hybrid composer ignores lod |
| Toxic1/2 `toxic-moon-{1,2}-r001` | Regional rotations, crater/liquid visibility | Toxic moon composer ignores lod |
| Ice1 `ice-moon-1-r002`; Ice2 `ice-moon-2-r003` | Individual region rotations; Ice2's additional blue-cut placement stays explicitly fixed while other regions move | Fixed qualified; full highest native ground retained |
| Volcanic1 `volcanic-moon-1-r003`; Volcanic2 `volcanic-moon-2-r006` | Regional rotations; warm exposure/occlusion changes | Geometry fixed qualified; confirm recipe effects in full scene |
| Crystal1/2 `crystal-moon-{1,2}-r010` | **Only rigid rotation of one authored assembly** | Fixed qualified, same geometry/UV/material IDs at all levels |

Only Crystal moons have a genuine rigid seed-rotation contract. A different seed there is a useful new hemisphere/lighting check, but not new geological composition. The other25 seed-dependent candidates change at least local component orientations: changing camera azimuth on seed38 does not reproduce117/904 overlap tests. Gas main is the remaining one seed-independent geometry case; prioritize alternate views and ring shadow/optics rather than redundant geometry builds labelled new seeds.

## Qualification gap to close before broad visual capture

Current `planet_reference_worker_lifetime.ts` explicitly recognizes Ice25/26, Ice moon1r002/2r002-r003, Crystal moons through10, Gas moons1/3r005, Volcanic moons1r003/2r004-r006, and every gas-bands-and-rings layout. It does **not** yet qualify the remaining fixed-geometry main/moon pins above. Without exact pinned full-output identity tests, this leaves potentially redundant retained uploads despite stable geometry. Do not infer fixed detail from family names. Include complete buffers/ranges and weather/smoke/resource behavior before extending a revision allowlist. Four main composers genuinely vary terrain acrossLOD: Desert, Ocean, Temperate andVolcanic.

## Concrete validation sequence

1. Finish the shared shadow rendering correction and baseline regression on Ice26 plus representative opaque, optical, ring and smoke bodies. Freeze that renderer revision and exact asset hashes before collecting broad-seed evidence, so captures do not have to be repeated for a known shared defect.
2. Reviewer coverage suite checks every pinned candidate at seeds38/117/904 and all three requestedLOD values: finite positions/normals/UVs; material/part ranges; repeatability; correct fixed versus changing detail; floor/crater clearance and optical-resource ownership. Qualify additional exact fixed-detail revisions only where full results prove it. Serialize one worker/test process and retain failures.
3. First visual cohort, highest overlap/occlusion sensitivity: Ice main+both moons, Toxic main+both moons, Volcanic main+both moons, Crystal main, Gas moons1/3. At117 and904 capture one close hero, second view and the exact reference scale; preserve candidate/build/shadow/material metadata. Inspect cap exposure, liquid/crater floor clearance, glass/refraction, hot/mineral accents, fog/smoke occlusion. This cohort targets confirmed historical failure mechanisms.
4. Second visual cohort: Desert/Rocky/Ocean/Temperate mains; Rocky1/2, Desert1/2, Gas2, Ocean1/2, Temperate1/2. Same two seeds and views; inspect regional overlap, continuous banks, green/coastal material visibility and silhouette identity. Desert17/99 remains useful prior evidence but does not substitute for the chosen117/904 matrix.
5. Crystal moons1/2: inspect117/904 as rotated hemisphere/lighting checks of the exact accepted assembly, concentrating on outward bright shoulders and retained silhouette. Gas main: two materially distinct viewing orientations, including ring cast shadow, with explicit note that native geometry is seed-independent; capture117/904 recipe scenarios only if their actual environment/effects differ.
6. For the four changing-detail main families, inspect every retainedLOD at the same seed/camera/lighting, including small and abrupt close Observe views. For fixed-detail candidates, validate one retained node and no threshold-triggered rebuild; do not manufacture three redundant visual sets. Capture approach/retreat and abrupt Map→Observe with F3 counters on real hardware, resource reuse/disposal, pending state and frame intervals. Existing Ice software records establish ordering, not20ms performance.
7. Normal-game integration/publication and final owner art sign-off remain separate gates. Run required branch checks/build, normal Flight/Map actual-path validation, record hardware limitations honestly, and deliver the PR. No art revision is needed unless this matrix reveals a concrete new visible regression tied to a native part or importer defect.

Sources inspected: `planet_reference_worker.ts`, current per-family composers, `planet_reference_worker_lifetime.ts`, current focused test sources; `reviews/visual-scope-consistency-20260914.md`; `docs/planet_lod_authoring.md`; full reference-output image filename inventory. This map is an audit of existing evidence, not a claim the proposed checks already passed.
