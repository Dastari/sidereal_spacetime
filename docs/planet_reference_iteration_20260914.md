# Planet reference iteration — 2026-09-14

Status: active owner-authorized visual iteration; no new candidate accepted yet.

The owner explicitly reopened planetary reference alignment on2026-09-14 and requested repeated independent Astra visual review until both author and reviewer judge the gap meaningfully closed for every remaining family. This supersedes the earlier planet-art pause for this task. It does not authorize unrelated rendering features or authority changes. Preserve native Blender sources, original reference crops, prior revisions, existing materials and body identity. Final owner art approval remains separate from the requested two-agent working gate.

Reference: original `reference/art/planets.png` and the exact per-family main-world/moon crops in the art library. The detailed family briefs remain in `planet_next_passes.md`. All candidates must meet `planet_lod_authoring.md`: worker preparation, build-ahead, retained ready levels, compatible shared/precompiled materials, no threshold-driven rebuild of fixed-detail geometry, and Flight/Map Observe transition tests. Visual comparison is not performance acceptance.

## Review queue

| Family | Starting point | Current gate |
| --- | --- | --- |
| Desert | Existing layered renderer; art design r000 | Initial author/reviewer assessment: first candidate should establish broad sand plains, a few monumental mesa groups and a deep canyon |
| Rocky and moon variants | Existing layered renderer; rocky design r000 | Baseline/reference audit pending new captures |
| Ocean | Existing layered renderer; ocean design r000 | Baseline/reference audit pending new captures |
| Toxic | Existing layered renderer; toxic design r000 | Baseline/reference audit pending new captures |
| Crystal | Existing layered renderer; crystal design r000 | Baseline/reference audit pending new captures |
| Gas giant | Existing fixed-detail renderer; design r000 | Baseline/reference audit pending new captures |
| Ice | Native r015 | Reassess card-like snow shelves, blue wall/cavity hierarchy |
| Volcanic | Native r018 | Reassess tiled surface, plateau/vent hierarchy and fissures |
| Temperate | Previously accepted interim renderer | Preserve baseline; compare broader roadmap separately, including existing mixed effects |

Every meaningful candidate needs immutable source/export/render artifacts, reference/previous/current comparison, both agent assessments and recorded unresolved gaps. At least three seeds and all retained LOD levels must preserve the intended macro features. Hardware timing and normal game Observe evidence remain required; software renders prove appearance/counts only. Do not mark families complete merely because a shader compiles or a screenshot exists.

Review reports and repeatable captures: `output/playwright/planet-reference-20260914/`. Candidate provenance and revision history remain in the existing art-library design ledgers.

## Iteration log

### Desert r001 — rejected by both agents

Fresh current-renderer seed38 baseline captured at900×900 with the shared environment, HDR, sun and shadows in an isolated Babylon viewer. The browser uses SwiftShader; still captures are appearance/count evidence, not hardware timing. Both author and independent Astra found excessive full-surface tiling and absent macro hierarchy.

A new Blender native kit introduced sand ground, capped mesa groups, cliffs and three separately authored ground levels. Seeded worker composition preserved exact native triangles and placement ranges. The completed r001 render reduced fine tiling but failed: dark isolated towers appeared attached to a faceted globe; broad integrated aprons and regional terraces were missing. Both agents rejected it. Full source, validation, failed startup capture and final actual render are preserved under `output/playwright/planet-reference-20260914/desert-r001/`, with review reports under `reviews/` and evidence copied into the desert ledger r001. No runtime publication occurred.

r002 is in progress: broad basal shelves and intermediate ledges, a dominant cluster with smaller secondary formations, wider shallower canyon transitions, and reduced tiny scattered fragments. Main-world coverage only; independent review found desert/ocean/gas moons require distinct crater-based composition rather than automatic copies of their main-world morphology.

### Desert r002/r003 — technical defect isolated, visual gate still fails

Both agents rejected r002. A single-kit diagnostic then demonstrated that the isolated new importer used the wrong face-winding setting: outward Blender caps were culled, exposing interior faces. Setting explicit native CCW orientation restored solid roofs, pale caps and aprons without retinting materials. Astra independently inspected both diagnostic images and confirmed the correction. This defect was in the new isolated candidate importer; no existing public renderer was changed.

r003 preserved the exact r002 Blender kit, fixed winding, removed quantized radial contour bands, and exposed connecting feet. Actual whole-planet review still failed: excessive smooth empty ground and repeated isolated plinths. r004 now targets an authored irregular cliff/basin module assembled into connected regional escarpments, with two-angle and gameplay-scale review required. Historical failures and their source scripts remain preserved; no family has passed the requested two-agent gate yet.

### Desert r004–r006; Rocky r001–r002 — rejected, no publication

Desert r004 exposed a native topology integration hazard: long planar cap triangles became visible chord wedges under spherical mapping. r005 adaptively tessellated the authored surfaces in Blender without changing their material areas (maximum reported relative difference1.9e-8). Wedges were resolved, but both reviewers rejected thin belts on bare ground. r006 widened and rotated regions; both rejected shallow beige plates and absent frontal monumental relief. A shadow-off diagnostic removed fine hatching, isolating it as shadow-dependent rather than establishing geometry coplanarity. r007 now uses newly authored broad irregular landmasses with attached heads and branching canyon cuts.

Rocky r001 was rejected for raised cone-like craters on a bare sphere. r002 lowered bowls and deformed the native substrate but its actual render lost the main cavities beneath surrounding geometry; both reviewers rejected it. r003 is testing a single bowl's clearance before recomposing the hemisphere, with explicit exclusion of shelves across crater openings.

Ocean r001 native island/coast/atoll/grove source and wholeplanet capture exist; the first composition remains under review. Its tiny scattered islands do not yet establish the reference's archipelago scale. None of these candidates has passed the two-agent gate or hardware LOD acceptance. All captures in this entry use SwiftShader for appearance only. Runtime production files, authority and public deployment remain unchanged by these candidate iterations.

### Regional terrain and material iteration — continuing, no family accepted

Desert r008 improved column bundles but failed in two views: disproportionate repeated heads and empty midgrounds. r009 introduced connected low/mid fields and removed the synthetic radial canyon deformation. Both reviewers still rejected flat tabletop/cross topology and pinched geometry. A .006 normal-bias diagnostic removed the fine shadow hatching; this is isolated evidence, not a production shadow-setting change. r010 replaces broad plates with an explicitly authored twenty-two-terrace relief layout and is being checked as one mapped region before complete-body review.

Rocky r003 single-bowl renders at two angles established visible floor/sidewall clearance. r004 was a targeted camera-facing distribution diagnostic, explicitly excluded from final all-angle acceptance. r005 uses twelve globally distributed major craters and a revised native rim. Two-angle review still failed: blank substrate and repeated rims need integrated battered-crust regions. The next source revision targets that missing middle scale.

Ocean r002 failed in two views for pillar islands, nearly absent shelves and bead-like clouds. Authoring validation found a cumulative coast-width mutation that collapsed intended shelves. r003 corrects that source bug, lowers and widens five-part archipelagos, and uses Blender-tessellated native geometry for radial coast placement. Actual wholeplanet review remains pending. Toxic r001 also failed: recolored tabletop islands on uniformly lime liquid do not reproduce connected chemical basins, olive crust and irregular gas banks. Crystal r001 native source and a shared native cloud kit exist but have not passed complete-body review.

The isolated importer now preserves optional authored emission strength/color and IOR in addition to linear albedo/roughness/metallic. A NullEngine test checks those values. Native composition tests compare retained macro vertex positions across LODs, not just IDs. Full `npm run check` passed334 test files/1,993 tests and88 documentation checks; `npm run build` passed, with the existing bundle-size advisory. These checks do not establish visual or hardware transition acceptance. No candidate has been published.

### 2026-09-14 — material fidelity and continued native review

The read-only native attribute audit covers 63 variants. Supplied positions, normals and UVs match GLB data within explicit export tolerances. Crystal r002 alone omitted its JSON IOR 1.48 in 20 GLB material occurrences; preserved successor r003 adds that metadata without changing GLB BIN bytes, kit geometry or Blender source. Several older JSON kits omit authored normals/UVs entirely, so their runtime paths still require attribute-preserving successors. Gas and Ice have complete channels. Audit evidence: `output/playwright/planet-reference-20260914/attribute-audit/tolerance-verified/`.

Desert r012 establishes sufficient low/mid terrain coverage for selective finishing, according to the independent Astra review; compact summit masses and material detail remain open. R013 is being authored with native UVs/normals and generated sandstone albedo, preserving both the first generated cap and the corrected flat-pigment successor. These are ordinary PBR inputs, not a replacement shader.

Gas r002 actual browser views meaningfully close the body pattern/color gap according to both root and Astra. This is a body-only working subgate, not final family approval: the rings remain too regular and luminous. The next bounded iteration preserves the body texture and changes ring dust density, band hierarchy and debris grouping. Ice r016 actual diagnostic views confirm shaft depth survives an angle change; whole-planet views fail because isolated washer-shaped snow regions sit on a bare sphere. R017 must connect a shaft, open glacial cut and substantial unequal columns in one authored region before population.

Ocean r005 broadens native asymmetric shores and groves; its compositor expands horizontal footprints by 1.4 while preserving radial heights. Five tests, including NullEngine plateau picking at every LOD, pass. Cloud r002 fixes flattened banks and seed-correlated placement. Crystal r003 and Volcanic r019 await actual whole-planet review. No new family has passed the complete gate, and none of these candidates is published. Current captures use SwiftShader: appearance evidence only, not hardware transition timing. Hardware Flight and Map→Observe acceptance remains required after runtime integration.

### 2026-09-14 — first working visual pass: Desert r014

Root and the independent Astra reviewer agree Desert r014 meaningfully closes the main-world reference gap in seed38, two angles and an actual approximately 300-pixel body view. The source defect behind persistent summit rods was variable shadowing: regional terrace authoring overwrote the outline consumed by summit generation. R014 isolates the correct centered profile and adds selective erosion mouths while preserving r013 material/texture bytes. Residual coarse cap rhythm and subdued rim are refinements, not blockers for this bounded working gate. This is not owner approval or acceptance of the two desert moons. Native sources and browser evidence are preserved under `desert-r014/`; independent findings are in `reviews/desert-r014-volcanic-r019-review.md`.

High detail is 188,432 triangles, including the 81,920-triangle authored ground. The retained-geometry test now uses this actual revision, bounds it below 190,000 (previous generic bound 220,000), and compares regional positions, normals and UVs across LODs. An initial 120,000 estimate failed and was corrected from measured topology; no source decimation was applied. Hardware timing remains unmeasured.

Further findings: Gas ring darkness partly came from missing `twoSidedLighting` when reproducing glTF `doubleSided`; visibility alone is insufficient. The review importer now matches Babylon's glTF behavior with a NullEngine regression test. Generated dust RGB remains unchanged, with native material alpha exported separately from black density. Ocean r006 water/reefs pass working subreviews; r007 addresses only shoreline and land finish. Ice r018 earns a local morphology pass after source side-view comparison confirms the apparent ribbons were foreshortened solid prisms. Whole-planet composition follows. Toxic r002 has a real substrate/basin intersection; that is being fixed before material acceptance. Volcanic r019 and Crystal r004 remain open for regional continuity/finish and local illumination respectively.

### 2026-09-14 — Ocean and Gas working passes; shadow evidence correction

Ocean r007 and Gas r005 receive bounded main-world visual passes from both root and Astra at the inspected seed/views. Ocean retains r006 water, reef, groves and composition while adding island-only finish. Gas r005 preserves r004 geometry/materials/texture bytes and broadens granular density through authored radial UV support. These passes exclude owner approval, moon variants, hardware transitions and broader seed/optical verification.

The isolated viewer's old disabled-LOD shadow-list filter was defective: it removed staged meshes before activation and did not restore them when the existing node became visible. Numeric inspection confirmed an empty shadow render list. It has been removed; candidate captures made with that filter establish shape/material evidence only, not cast-shadow acceptance. Prior shadow-on/off captures were inconclusive, as the reviewer correctly recorded. New captures use the actual retained render list and preserve the old evidence. The low-sun Gas diagnostic now produces a non-identical shadow result but also exposes self-shadow artifacts; targeted planet/ring shadow acceptance remains open. No production shadow code was changed.

The planet authoring contract now explicitly covers curved normal transport, UV/material parity, glTF double-sided illumination, linear versus sRGB texture channels, recessed-floor rays and multi-seed/reference-scale checks. These supplement—not replace—the required worker/build-ahead/retention/disposal and real Flight/Map→Observe hardware validation.

### 2026-09-14 — corrected color export and remaining macro work

The independent Astra comparison of corrected Rocky8, Volcanic20, Ice20, Crystal6 and Temperate1 leaves all five gates open. Large smooth regions, missing intermediate geology and feature placement remain more important than further fine detail. New actual screenshots now include a populated shadow list; diagnostic normal bias0.006 is recorded separately from production settings. Captures remain SwiftShader appearance evidence, never hardware transition timing.

Several procedural source scripts wrote linear palette values directly into sRGB PNGs. Preserved successors encode those colors correctly without increasing the authored palette: Rocky9, Crystal6, Volcanic21 and Ice21. Toxic3 already encoded correctly; its saved PNG was checked rather than modified blindly. The isolated material adapter is also tested against Babylon's installed glTF adapter for alpha, clearcoat, normal-map handedness and double-sided lighting.

Rocky9 earns a bounded macro-composition subpass: coherent pitted terrain and readable mineral exposures replace blank surfaces. Rocky10 retains its placement while irregularizing selected pit mouths and the mineral fault. Volcanic21 and Ice21 improve finish but fail the main morphology gate; their successors target an integrated lava flow and clustered ice cliffs between stepped banks. Temperate2 addresses smaller unequal continents and forest clusters. Crystal7 reuses the denser native Rocky9 crust, lowers excessive bare outcrop walls and changes crystal distribution. These successors are still undergoing actual two-angle/reference-size review.

Toxic4 retains the corrected recessed floors and adds irregular basin edges; main-world review remains open. Fog3 closed shells and Fog4 nested shells fail the local appearance gate as visible membranes. Fog5 native alpha cards are a preserved diagnostic with card-junction/fringe limitations, not an accepted volumetric effect. No candidate has been published, and canonical records are being brought forward without implying owner sign-off. The separate19-moon coverage matrix is in `output/playwright/planet-reference-20260914/moon-coverage-plan.md`; first rocky-moon source exists but has not passed actual comparison.
