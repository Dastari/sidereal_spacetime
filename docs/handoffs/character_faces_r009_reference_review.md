# Character faces r009 — independent reference review

2026-09-10. Stage 1: reference and current-source audit by Astra reviewer `/root/combat_pose_review`. This task has not authored a model, changed a runtime file, opened a GPU browser or approved r009. The owner approved the delivered r008 character bundle and r003 pose pair previously; this new request starts a distinct visual revision and preserves those exact sources and approval records.

## Reference and inspected evidence

The new primary source is [characters-facial-assets.png](../../reference/art/characters-facial-assets.png), 1536 × 1024 pixels, SHA256 `ca3213a6cd9e5a4c0215c787c370f488c90bbaf23bfdfe514cc639dece89b891`. The complete sheet was opened and inspected. It is a stylized illustration with small front/three-quarter heads, not orthographic geometry or a material color chart. Exact unseen backs, scalp construction and metric proportions remain authored interpretations. Its Orion Crest branding is reference context, not a requested game rename.

Current comparisons opened: r008 [male front](../../assets/art-library/designs/crew.base-and-outfits/revisions/r008/candidate/base-male-front.png), [female front](../../assets/art-library/designs/crew.base-and-outfits/revisions/r008/candidate/base-female-front.png), [swept hair](../../assets/art-library/designs/crew.base-and-outfits/revisions/r008/candidate/hair-swept.png), [ponytail rear](../../assets/art-library/designs/crew.base-and-outfits/revisions/r008/candidate/hair-ponytail-rear.png), [crest clay diagnostic](../../assets/art-library/designs/crew.base-and-outfits/revisions/r008/candidate/diagnostics/crest-upper-rear-clay.png), and the [normal public character window](../../output/playwright/combat-r003-public/normal-public-character.jpg). These are the existing approved baseline, not new r009 evidence.

The editable r008 source, SHA256 `6b17eab686f9c82c67f7dd87a6b460e9c0311f29d954e43728cf93d875157f61`, was opened read-only in background Blender 4.3.2 to inspect native bounds, objects, materials and weight groups. No scene was saved. The installed bundle remains `ae4a7e12096bd9aaac0bdfb178354d899b89af15cbc20293815c301871694150`. Relevant contracts: [art workflow](../../assets/art-library/WORKFLOW.md), [component authoring](../character_component_authoring.md), [reference fidelity](../character_reference_fidelity.md), and the [current bundle approval](../../assets/art-library/character-components/publications/r008/owner-approval-20260910.json). Earlier guide paragraphs saying r008 approval is pending are historical; the dated approval event governs the existing bundle.

## What the new source asks us to preserve

The face remains a compact, nearly square block with small chamfered corners, a shallow nose, a restrained mouth and tall dark eyes. Its richness comes from directional stepped hair, controlled color variation, tiny facial marks and independent accessories. It does not call for a spherical/anatomically realistic head, large white eyeballs, smooth strand simulation or uniformly scattered small cubes.

Male examples emphasize swept quiffs, cropped sides, ridges, curls and asymmetrical parting. Female examples often show a subtly narrower lower face framed by bobs, diagonal fringes, longer side locks or a gathered bun; the underlying eye/face language remains shared. The source's male/female row labels describe the illustrated examples. Existing hairstyle choices should remain available to either body without gameplay restrictions.

The eleven illustrated groups form separate coverage queues: clean base faces; age variations; skin tones; eye colors; male-row hairstyles; female-row hairstyles; facial hair; facial details; accessories; specialty/background looks; optional expressions. Similar heads repeat to demonstrate independent options. Preserve every appearance crop while keeping a canonical feature/variant mapping. Repeated portraits do not establish separate item geometry or an automatically implemented appearance system.

## Measured r008 baseline and proposed first pass

The following dimensions are native Blender measurements or source-script values checked against the actual file. Proposed targets are authoring hypotheses, not measurements extracted from the illustration.

| Feature | Current r008 | Proposed r009 target / reason |
| --- | --- | --- |
| Head bounds, both bodies | Width 0.515 m, depth 0.424 m, height 0.431 m; Z 1.315–1.746 m | Keep height, depth and head joint fixed. Retain the male envelope. Make the female upper cranium at most 0–2% narrower and lower cheeks/jaw about 4–6% narrower to produce a subtle visible difference. |
| Jaw rings | Lowest ring male width 0.458 m, female 0.438 m; next ring is 0.490 m for both | Female lowest width about 0.415–0.425 m, lower-cheek ring about 0.465–0.475 m. Blend the change through the authored loft; avoid uniformly shrinking every face part or neck. |
| Eyes | Width 0.066 m; height 0.113 m male / 0.124 m female; centers X ±0.116/0.118 m, Z 1.535 m | Preserve dark vertical shapes and overall eye height. Bring female centers inward only about 0.004–0.008 m per side if needed for the narrowed face. Keep eye height and elevation compatible with existing optic/head poses. |
| Eye detail | Separate 0.013 × 0.018 m white upper-corner glint; no iris material role | Keep the tiny glint. A future eye-color insert should occupy a narrow strip/patch within the dark eye, leaving a dark pupil/frame. No large white sclera or circular protruding eyes. |
| Brows and mouth | Brows 0.075 × 0.011 m; mouth 0.038 × 0.009 m; shallow nose 0.027 × 0.016 × 0.021 m | Thin brows, subtle brow angle and shallow nose/mouth remain appropriate. Facial expression changes should come from a few bounded pieces or optional shape keys, not replacement of the head rig. |
| Hair primary pieces | Fringes roughly 0.068–0.143 m wide; crown masses roughly 0.137–0.172 m | Preserve 3–5 main flow regions. Subdivide selected broad surfaces into directional 0.040–0.070 m locks, with 0.018–0.035 m secondary steps and about 0.004–0.012 m relief. These are starting dimensions for review. |
| Hair edge treatment | Native lofts and narrow bevels; some long uniform nape panels remain | Keep 1–3 mm local bevels on small steps. Stagger tips and vary widths/depths so a lock reads as hair flow, not a row of identical teeth or roof tiles. |

The actual r008 head meshes have identical overall width despite the small female lower-jaw change. Current female separation is mostly eye height/lashes and body shape. A gentle lower-face taper is the useful correction; enlarging eyes or shrinking the full skeleton would attack the wrong feature.

The swept style already has a recognizable asymmetrical fringe and a sound joined surface. Its crown steps are large and sparse relative to the new sheet. The crest clay view exposes a broad, nearly horizontal cap with a small number of wide ridge steps and fairly regular nape strips. The ponytail is continuous and tapered, but its long side ribbons read as broad flat panels. Add finer stepped transitions along the established flow and silhouette, including tips and crown-to-side joins, while retaining the closed scalp and continuous tail. Do not reintroduce disconnected stud-like clumps, slits, coplanar overlaps or a rectangular bare patch at the rear.

## Palette and face option targets

The sheet visibly includes black/blue-black, brown/copper, gold/blonde, white/grey, saturated violet, pink and red hair. Darker roots/recesses and lighter top-facing steps preserve depth. The owner's requested neon colors extend this treatment. The following are proposed sRGB swatches for neutral-light review; they are not exact pixel samples from the color-graded source.

| Proposed family | Shadow | Main | Highlight |
| --- | --- | --- | --- |
| Violet | `#38225B` | `#8B3DDB` | `#C76BFF` |
| Pink | `#732A66` | `#E9469B` | `#FF91C5` |
| Electric blue | `#1A285E` | `#335DDE` | `#7593FF` |
| Cyan / owner neon extension | `#174E77` | `#21BBD3` | `#83EEFF` |
| Red / rose | `#6C1938` | `#DE2E53` | `#FF668B` |
| Platinum | `#858399` | `#D9D5E4` | `#F1ECF4` |

Use vivid albedo and controlled light response first. The reference's pink/purple hair reads as colored material; it does not require a glowing lamp around the entire head. Keep hair nonmetallic and predominantly matte, with bounded highlights. Reserve emissive material for explicitly cybernetic eye/accessory details and test bloom separately. Skin stays matte and readable across the existing light-to-dark palette, including warm and cool undertones; neither skin tone nor body type implies a stat change.

The current UI has eight hair swatches, with teal as its only saturated non-natural option. The runtime already accepts arbitrary six-digit hex colors through `crew.hair.modular` and `crew.skin.modular`; material suffixes such as `.001` are recognized. **Brows use the same hair material**, so a neon hair choice currently also makes neon brows. That should be an intentional decision: preserve a darker brow value derived from the selected color, or separate a brow role with an explicit runtime mapping. Do not silently author several new hair highlight material names and assume they will inherit saved hair colors—the current renderer only replaces a recognized appearance role's single albedo value and skips `component.*` materials.

Face option scope should stay explicit:

| Source group | Practical authoring interpretation |
| --- | --- |
| Base faces | Shared clean face construction with bounded male/female lower-face variation; independently selectable hair and color. |
| Ages | Young/adult/middle-aged/older examples primarily use brow, mouth, greying hair, light crease and facial-hair cues. No child body or new skeleton is requested by this adult crew pass. |
| Eye colors | Brown, blue, green, hazel, grey, amber, red and cyber examples. Preserve dark eye readability; treat cyber emission as a distinct optional visual style. |
| Facial hair | Clean, stubble, short/full beard, goatee, moustache, handlebar, sideburns, soul patch, older/grey and braided examples. These are head-following cosmetic layers with beard-to-mask clearance, not armor grants. |
| Facial details | Freckles, scars/scratch, tattoo, bandage, dirt, warpaint, cyber, eyepatch, monocle, visor-scar and birthmark. Separate markings from actual worn accessory geometry. Keep readable asymmetry rather than many tiny noisy marks. |
| Accessories | Hats/caps/hood, goggles/glasses, headset, jewelry, cigar, mask and scarf are visible options. Existing helmet/visor item semantics remain authoritative; this source does not automatically issue those items or create equipment slots. |
| Specialty looks | Pirate/military/corporate/scientist/engineer/medic/mechanic/scavenger/civilian/outlaw/explorer/cybernetic/alien-hybrid portraits are example combinations. They do not confer faction, profession, permissions or bonuses. |
| Optional expressions | Neutral, happy, sad, angry, surprised, determined, wink and grin. Static optional face variants may be authored; actual expression playback, networking and UI are separate implementation scope. |

The first r009 checkpoint should focus on the clean heads, current hair silhouettes and new colors. Other face options may be queued with exact crops; do not claim the full sheet is implemented merely because its options are indexed.

## Compatibility constraints and next independent gate

Preserve the shared sixteen deform bones, rest matrices, head joint, overall body height, twelve original clips, all hand/back/hip sockets and the exact approved r003 handheld pair. Current face and hair geometry is rigidly weighted to `head`; maintain normalized weights and per-component visibility. The neck remains attached to its current bone and location. Female head narrowing must not move helmet/visor attachment transforms, widen the scalp or change the body's reach. Hair choices must fit both bases and restore after removing headgear; open-cap liner color and closed-shell suppression remain separate from the visible hairstyle. Keep mandatory modesty layers, all component IDs, item UUIDs and authority contracts untouched by a visual-only export.

Before propagating a candidate, provide matching native front, both three-quarter, side and rear views of both clean heads; swept, crest and ponytail under the same neutral material/light; violet/pink/cyan/black/platinum color samples; and diffuse clay views of crown/temple/nape joins. Compare at equal head scale. Check at 256- and 128-pixel actual game captures so small steps do not turn into shimmer or disappear. Inspect bare, open-cap, closed helmet/visor and a large-backpack fit, then retain the existing r003 rifle/pistol pose clearance checks. A pleasant new head portrait alone does not validate helmet fit, color role preservation or shared-rig compatibility.

Stage 1 outcome: concrete r009 targets established. No r009 model, material/export validation, runtime review or final artistic approval is implied. The next independent review will compare the parent's actual candidate renders against this source and name any remaining visual mismatch.


## Exact source coverage completed — 2026-09-10

The [facial reference index](../../assets/art-library/FACIAL_REFERENCE_INDEX.md) and [machine-readable repeated-feature coverage](../../assets/art-library/facial-reference-coverage.json) now enumerate **155 exact crops: 138 portrait appearances and 17 source graphics**. Eleven new `crew.faces.*` study queues separate clean heads, age, skin, eye colors, the two hairstyle rows, facial hair, details, accessories, specialty assemblies and expressions. All remain r000/reference-only/unsigned. This is reference discovery, not a claim that every face, accessory or hairstyle is modeled.

The first full contact review found unequal illustrated portrait spacing in five rows. Sixty-nine crops now use manually corrected r001 framing; every initial r000 remains preserved. The revised contact sheets retain complete visible heads and source labels where included. Fourteen explicit repeated-feature candidate groups connect base/hair variants, hats, glasses, hood, goggles positions and scarves without asserting identical unseen geometry or merging entire portraits. Skin, eye and expression rows remain individually enumerated states on shared features.

All 155 new briefs replace generic equipment guesses with their actual cosmetic/source-context role. They grant no HP, armor bonus, inventory footprint, mass, faction or class capability. Current r008 metric bounds are a fit baseline, not an illustration measurement. A head accessory that later becomes inventory equipment must obtain its actual authority/content definition independently.

Validation: guarded append, guarded crop revisions and regenerated index completed; `art_catalog.py check --deep` passed **41 sources, 2,618 crops/briefs, 400 design ledgers and every current/historical crop's exact pixels**. The 2,463 prior catalog reference records retain SHA-256 `3cb0764e8258b79e50b243703da8356f76f295c8beaaf644b9d0caaeab697ad4`; all 42 nonempty prior approval histories retain SHA-256 `70af99fc4fefe56957f661526a9655dea93813ac501ec8165cab1337e75839e9`. The concurrent root task may advance unrelated design state; this extraction did not overwrite it. `scripts/check_docs.py` passed its 77-document/provenance check.

## Stage 2 — attempts A and B, changes requested

Attempt A's face appeared black in the native render, while brows and eye details were gray. The author traced this to Cycles transparency ray limits through several face-atlas planes and missing material factors; those diagnoses were reported by the author rather than independently proven by the reviewer. Visually, that output could not demonstrate the intended face. Hair used regular, equally spaced tiled crown rows and repeated full-height horizontal courses. Swept and bob were nearly the same fringe/crown with longer side panels. Pink was vivid but uniformly saturated. The reviewer requested continuous primary flow planes, fewer unequal secondary steps, a distinct bob silhouette, controlled face factors and closure of dark crown joins. **A did not meet the reference direction.**

Attempt B visibly restored flesh color, dark eyes, small glints and readable brows/mouth. Its crown had fewer broad blocks, but side/fringe locks still read as horizontal laminated plates rather than directional hair. The left eye/glint was partially hidden; the nose was a conspicuous pointed wedge; bob was still too close to swept. The reviewer requested two end steps on continuous main locks, a lifted fringe, shallower nose, an opposite bob part and verification of crown gaps. **B's face rendering improved; hair and face silhouette still needed correction.**

## Stage 3 — attempts C and D, bounded silhouette match

The reviewer directly opened C swept hair and the actual Babylon C comparison capture. Continuous fringe/side planes resolved the dominant laminated/masonry failure. The real renderer comparison at matching body, hair, color and camera visibly showed more directional hair detail, colored eyes with small glints and subtle lower-face narrowing than approved r008. This is an actual `createCrewVisual` comparison harness with local candidate assets supplied to the page, not a normal live-game or public-release capture.

D's native swept/bob, front faces, rear hair, crest, ponytail, bun, braids, cropped, scientist and sealed medic views were opened. The lifted fringe exposes both eye/glint areas, the smaller nose is less distracting, and bob's opposite fringe/lower crown distinguishes it from swept. The reviewer considered those silhouettes a **suitable directional match for refining the existing supported styles** and did not require another subjective restyling pass. This does not claim all 26 illustrated hairstyle silhouettes are reproduced.

D retained conspicuous black slots at crown and fringe joins in the native renders. The Babylon C still looked more like dark recesses, but that single image could not prove a closed surface. The reviewer kept junction verification open rather than treating absence of obvious background in one GPU view as topology proof. Broad continuous nape panels and coarse tail/braid segmentation remained polish limits.

D's actual pink-bob browser capture shows the distinct bob, blue eye tint, dark brows despite pink hair, and a happy mouth. Its selected freckles were not visible enough in that full comparison to establish a pass. A second actual GPU capture shows warpaint cheek bands; the later closer freckle probe visibly shows small brown cheek marks. These establish that selected detail layers can render. They do not by themselves establish every atlas option, all camera scales, saved appearance/networking, or the final frozen asset/runtime pairing.

## Stage 4 — attempt E, native junction correction

E swept and bob native images visibly remove D's black crown/fringe slots without discarding the accepted silhouette. E crest, cropped and both front faces, plus braid/bun/ponytail/scientist rear views were also opened. The visible joins are continuous and the nape remains closed. The author reports a native exact union and identifies E as the basis of the frozen delivery; this review confirms the visible correction, while manifold/weights/export checks belong to the accompanying technical validation.

| Deliverable family | Independent visual assessment | Scope still to validate |
| --- | --- | --- |
| Male/female clean heads | Suitable match in E front views: shared compact head language, dark vertical eyes, restrained nose/mouth, subtle female lower-face taper. | Both bodies under final runtime materials and all relevant headgear/poses; numerical rig preservation is separate. |
| Swept and bob | Suitable silhouette and visible surface match after E closure. Bob now has its own opposite part and lower crown. | Actual GPU capture of frozen E delivery, ordinary game scale and both body fits. |
| Crest | Suitable refinement of the supported ridge silhouette; main crest remains legible. | Not a reconstruction of every spiked/mohawk hairstyle in the source. |
| Ponytail, bun and braids | Distinct supported styles remain readable; inspected rear joins are continuous. | Broad tails/segmented braid rhythm can receive later polish; all backpack/helmet motion combinations are not proven by these stills. |
| Cropped and scientist | Cropped remains a compact flat-top style; scientist has a separate tousled stepped silhouette. E views resolve visible join slots. | Do not identify these as every short/curl option in the sheet. |
| Vivid pink/blue options | Native D plus actual pink D GPU evidence clearly demonstrate vivid albedo and darker facial brows. | Reference has a richer root/shadow/highlight hierarchy. Additional colors and final shader response need their own actual evidence. |
| Expression/detail examples | Actual D GPU evidence visibly shows happy mouth, warpaint and close freckles. | All remaining eyes, ages, facial hair, details, expressions and saved-state behavior are not accepted by inference. |
| Sealed medic example | Native D female still has a closed helmet/visor silhouette with no obvious selected hair protrusion. | This is one static fit; all equipment combinations, hair restoration and runtime visibility remain technical checks. |

**Stage 4 outcome:** the inspected current head and existing-hair refinements meet a suitable bounded reference/style match. No further speculative geometry changes are requested from this review. The remaining surface/rig/export/runtime checks must be recorded honestly, and this agent assessment is not owner final artistic sign-off. Prior r008/r003 approval remains intact; new r009 evidence requires its own exact scope. No public publication, normal-game acceptance, sustained animation/performance pass or all-source-option completion is asserted here.

## Evidence hashes for this review

These hashes identify files actually opened for the dated judgments above; the source and failure attempts remain retained. Native PNGs are Blender source renders, not in-game screenshots. Browser comparisons are actual renderer harness evidence with the limits stated above.

| Evidence | SHA-256 |
| --- | --- |
| [attempt-a/hair-swept.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-a/hair-swept.png) | `380da56be7f3c371147b61cce1d3eebfda755a25c8a6f23c9d0de310f0b70dbe` |
| [attempt-a/male-face-front.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-a/male-face-front.png) | `37563ba53d767d1840a960a799983d3142345ddaa84b115b6a6a97026d2f7daa` |
| [attempt-b/hair-swept.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-b/hair-swept.png) | `3c038ffe737d46edf9a5891b18fbb6e239bd8a655538f635cb77b0886666d3ca` |
| [attempt-b/male-face-front.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-b/male-face-front.png) | `799db5babfca87252b17d0ae7a7306aff2da5a28330949bb52ddb5a0375a99fd` |
| [attempt-c/hair-swept.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-c/hair-swept.png) | `8dec24555a26945d5beba38dbf7b036ee2c2cab41c12cde2a67f6b22223b3716` |
| [attempt-d/hair-bob.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-d/hair-bob.png) | `3cdd6301d156d374f3bb36669e2dcea69ede51f2d31ff393a0136c9d961eb972` |
| [attempt-d/hair-swept-rear.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-d/hair-swept-rear.png) | `74f8c035216e196c194579f213dd9430141e069dbdc1334499e9df6015bc2ff4` |
| [attempt-e/hair-swept.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-e/hair-swept.png) | `fe57d04753f4a92d8928e1b292cc5d0c115c9aa8fc5610d6a955e941936c1fda` |
| [attempt-e/hair-bob.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-e/hair-bob.png) | `fb872690873ceceb6d614c3b8b1b638b3138de6de9867fb1b277ac78de85d544` |
| [attempt-e/male-face-front.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-e/male-face-front.png) | `0cfe05b12e5504ae1afe03f7e46de5ec7a16dfc81e9ad1578370fe99c4daf412` |
| [attempt-e/female-face-front.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-e/female-face-front.png) | `649ff4346a1b45202b66a7f0aa415f83672b479c2f56b59128c928ff3ddedd39` |
| [attempt-e/hair-crest.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-e/hair-crest.png) | `5876ad2fc549dba797638e1c850176796dcac34ce7535d8e55ea33017b3f3799` |
| [attempt-e/hair-braids-rear.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-e/hair-braids-rear.png) | `14534ec90905c40890a5ad927afd6ad6d537c61d6be7608cf1e0858bfcf1f83b` |
| [attempt-e/hair-ponytail-rear.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-e/hair-ponytail-rear.png) | `75f1edc2f7be1fe2dfe61d4f9315346fedbfb5f308948f5c49ef83d8d73aac6e` |
| [attempt-e/hair-bun-rear.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-e/hair-bun-rear.png) | `654456652b39c1cfb83ac52135f7baf53bbfedd113f739873327b49c50444d42` |
| [attempt-e/hair-cropped.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-e/hair-cropped.png) | `988e8eca6999b61fbae94c29f2825e0021a8f7cedb2d113b17f51be5ada697d6` |
| [attempt-e/hair-scientist-rear.png](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/attempt-e/hair-scientist-rear.png) | `fe9860c2969e08a499be17faa27cf9c2ade288c17870a512baa238a15cb1ede7` |
| [attempt-c-browser.png](../../output/playwright/character-faces-r009/attempt-c-browser.png) | `b64455ee18a37a6ea35f36e4f3957bb8f9da483f408018e3ca6d3a6584cf26f4` |
| [candidate-d-pink-freckles.png](../../output/playwright/character-faces-r009/candidate-d-pink-freckles.png) | `2bbdadb3485c9dd6c1ef79ad2df95d7f902a9d13f5596d26f338ff8a553d8f7b` |
| [candidate-d-warpaint.png](../../output/playwright/character-faces-r009/candidate-d-warpaint.png) | `6fe91c0cbe8d8751f0afa6bbf9859b1f5211c8e3a84fe1ad2050598b94b37489` |
| [freckles-close-probe.png](../../output/playwright/character-faces-r009/freckles-close-probe.png) | `80fc5ff0c2b0788b490362e2e94244e2cff5c4d74d7ad987d2218d1686f13a89` |

The frozen `delivery/modular-crew.glb` was independently hashed at this checkpoint: SHA-256 `88aa9a9787fbeff1478cb33414b9678d7ffff4bd440197303b57be900447307a`, matching the author's pairing identifier. A newer final delivery or runtime correction requires an append to this review, not silently relabeling earlier C/D screenshots. Local links in this review, both updated authoring guides and the facial index were checked and all resolved.


## Stage 5 — final G delivery and actual controls, 2026-09-10

The final packed G source supersedes E as the current technical delivery. Independently read hashes are `7c7de06aec3e9482d786fb72723ff36675c170cf94b0fc38046fa806de64f89a` for `final-delivery/modular-crew.glb` and `d48a56102afb03cbc9b7fb1990054f28f9b1bc808d3f26c98cb6a8d4f4d48334` for the native Blender source. The final validation reports identify those same sources and pass. The hair topology report checks all eight native/exported hair surfaces for edge closure, manifold incidence and winding; it expressly does not prove self-intersection freedom or visual acceptance. E's earlier style judgment is retained as a visual checkpoint rather than promoted into a technical pass.

All **35 archived final model runtime PNGs** were individually opened: both bodies with all eight hair styles; the paired r008 comparison; both bare, sealed medic and mixed fits; six paused Walk/Sprint/Seated frames; and actual 256-/128-pixel renderer outputs. The supplemental top/rear bob views and corrected square-camera 128/256 captures were also opened; the earlier small captures are preserved as preliminary aspect-ratio evidence. The first nine images originally inspected under `output/playwright` were checked byte-for-byte against their archived runtime copies. Exact file hashes and scope are in [the independent final review receipt](../../output/playwright/character-faces-r009/independent-final-review.json); capture settings remain in [the author's actual runtime record](../../assets/art-library/designs/crew.base-and-outfits/revisions/r009/final-delivery/runtime/capture-record.json).

G preserves the accepted direction and closes the visible hair joins. Both bodies retain the small-nose/dark-eye face language. Every supported hair silhouette remains recognizable on both bodies. The sampled vivid colors, blue/brown eyes, darkened brows, freckles, scars/scratch, warpaint, cyber marking, age lines, flat beard types and expressions visibly respond. The sampled sealed helmets do not show exposed selected hair; mixed cap/visor/medic/engineer/recon combinations retain their material identities. Bare stills restore visible hair and mandatory modesty layers. Paused movement/seated frames keep the new face and hair aligned to the head. No new blocking static fit issue was observed in these views.

The corrected-aspect 256-pixel whole-character capture retains face/hair structure; at 128 pixels the main silhouette and bright hair remain clear while fine freckles and eye tint are largely subpixel. This is expected scale loss, not evidence that the atlas is absent. These stills do not establish shimmer, transitions, real combat-solver playback, backpack motion clearance or sustained performance. The broad nape planes, relatively coarse tail/braid segmentation and richer root/shadow/highlight hierarchy remain optional polish. Static texture beards, the eight supported hairstyles and a subset of facial options do not constitute reconstruction of every source accessory or hairstyle.

The private [Crew controls harness](../../scripts/character_components/faces_ui_review.ts) instantiates the real `createGameUI`, `CanvasUI` and Babylon scene. It does not redraw or mock the product controls. The final GLB was loaded through a local file input for the desktop click test. The harness reports local appearance callbacks only; it has no authentication, database, reducer or saved-state connection. Read-only instrumentation exposes actual hit bounds for Playwright pointer targeting.

This check found and fixed a real menu integration bug: Crew scroll was clamped against the old hardcoded 600-pixel content height before the expanded layout measured 632 pixels at eight palette columns (more when narrow). The last eight desktop hair swatches were partially drawn but excluded from actual hit targets, and the down arrow never reached its disabled end state. [Before evidence](../../output/playwright/character-faces-r009/crew-ui-before-scroll.png) is preserved. `appearanceControlsHeight(viewport.w)` now measures the responsive rows before clamping, sharing the same column rule and palette counts as the real controls. A stale loaded module reproduced the old result after source edit; it was retained separately, then a fresh page load verified the actual correction.

| Actual viewport | Default UI scale | Result |
| --- | --- | --- |
| 1280 × 760 | 135% | All 32 hair, eight eye and eight skin choices reachable. Forty-eight actual pointer callbacks exercised all hair/eyes, a skin swatch and all six selectors. Final Gold row fully clickable. |
| 1920 × 1080 | 135% | Every palette choice reachable by scrolling; last Gold swatch clicks and bottom arrow disables. |
| 768 × 900 | 100% | Every palette choice reachable; last row fully visible/clickable. |
| 390 × 844 | 100% | Palettes reflow to five columns and remain reachable; final row clicks. Body text truncates visually, while its actual hit label retains the complete value. |

All eight top/bottom UI screenshots were visually inspected. [Structured browser evidence](../../output/playwright/character-faces-r009/crew-ui-browser-validation.json) records hit ranges, values, callback counts and hashes. Ten focused appearance-control tests pass, including final-swatch visibility at five widths; the broader release checks remain the integration owner's responsibility. The only browser error was a private-harness favicon 404; SwiftShader ReadPixels warnings provide no performance acceptance. The reviewer disposed the scene/engine, navigated named session `character-faces-r009-ui` to `about:blank` and closed it.

**Final bounded agent decision:** G heads/hair and the sampled facial/static-fit variants meet a suitable reference/style match; the actual Crew palette/selector layout passes the inspected interaction and responsive checks after the scroll fix. No further subjective geometry iteration is requested for this delivery. This decision is not owner final approval, public-release acceptance, authoritative persistence acceptance or continuous animation/combat validation. Preserve all prior sources, crops, failures and approval records.
