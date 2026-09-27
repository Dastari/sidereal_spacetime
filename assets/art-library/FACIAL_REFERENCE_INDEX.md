# Facial reference index

**155 exact crops: 138 portrait appearances, 17 source graphics, eleven shared facial study queues.** Inspected 2026-09-10. All current crops and their retained history reproduce exact source pixels. There are 69 framing corrections at r001; their r000 crops remain preserved.

[Living art library](INDEX.md) · [Machine-readable feature/variant coverage](facial-reference-coverage.json) · [r009 reference and iteration review](../../docs/handoffs/character_faces_r009_reference_review.md)

Source: `reference/art/characters-facial-assets.png`, 1536 × 1024 px, SHA-256 `ca3213a6cd9e5a4c0215c787c370f488c90bbaf23bfdfe514cc639dece89b891`. Header/footer/section graphics are source context. Cosmetics carry no independent health, mass or combat bonus.

These queues remain **r000 / reference-only / unsigned**. Their exact-crop revision is separate from a future native model revision. The r009 native bundle and any supported appearance controls need their own explicit evidence and source coverage; this page does not claim all sheet options are implemented.

| Shared feature study | Appearances | Interpretation |
| --- | --- | --- |
| [crew.faces.base-faces](designs/crew.faces.base-faces/DESIGN.md) | 24 | Clean head assembly examples with independent hair, skin and eyes; preserve bounded male/female lower-face variants. |
| [crew.faces.age-variations](designs/crew.faces.age-variations/DESIGN.md) | 8 | Shared adult head with visible age treatment and hair/facial-hair variants. Do not infer child rig or a female counterpart for a bearded older portrait. |
| [crew.faces.skin-tones](designs/crew.faces.skin-tones/DESIGN.md) | 8 | Eight material examples on a shared head; no skeleton, inventory or gameplay effect. |
| [crew.faces.eye-colors](designs/crew.faces.eye-colors/DESIGN.md) | 8 | Eight eye-material/state examples on shared face topology; cyber glow is optional and separately validated. |
| [crew.faces.hairstyles-male](designs/crew.faces.hairstyles-male/DESIGN.md) | 13 | Thirteen row-specific visible silhouette variants; labels do not restrict supported body type. Reuse genuine palette repeats only. |
| [crew.faces.hairstyles-female](designs/crew.faces.hairstyles-female/DESIGN.md) | 13 | Thirteen row-specific visible silhouette variants; labels do not restrict supported body type. Reuse genuine palette repeats only. |
| [crew.faces.facial-hair](designs/crew.faces.facial-hair/DESIGN.md) | 12 | Twelve face-following cosmetic layers/assemblies; gray variants may share geometry where silhouette matches. |
| [crew.faces.details](designs/crew.faces.details/DESIGN.md) | 12 | Twelve markings or worn-detail examples; distinguish atlas markings from real accessory geometry. |
| [crew.faces.accessories](designs/crew.faces.accessories/DESIGN.md) | 19 | Nineteen head/neck accessory appearances, including two goggle positions and two scarf variants. Existing equipment authority is separate. |
| [crew.faces.specialty-looks](designs/crew.faces.specialty-looks/DESIGN.md) | 13 | Thirteen composed portraits assembled from features. No faction, profession or capability is granted by the appearance. |
| [crew.faces.expressions](designs/crew.faces.expressions/DESIGN.md) | 8 | Eight face states on a shared head; expression networking/playback is separate from static authoring. |

## Related native implementation

The [r009 native delivery](designs/crew.base-and-outfits/revisions/r009/final-delivery/) is now installed in the local runtime, with eight existing hair styles, 32 hair-color presets, eight eye colors, eight expressions, ten detail choices, eight flat beard choices and four adult age treatments. See the [component ledger](character-components/ledger.json), [local publication receipt](character-components/publications/r009/publication.json) and [integration handoff](../../docs/handoffs/character_faces_r009_live_release.md) for exact delivery and validation state. Final owner approval is pending. This related implementation does not establish exact per-reference coverage of all 26 hairstyle-row silhouettes or source accessories. These eleven study queues remain reference-only; no claim of 155 exact reconstructions is made.

## Repeated appearances and variants

Each shared candidate below preserves every linked portrait. Similar visible features justify investigating reuse; they do not prove identical unseen geometry. Whole portraits remain compositional examples. Distinct silhouettes require explicit native variants.

- **brown-flat-top**: [Base male head 08 brown flat top](assets/characters-facial-assets--base-male-head-08-brown-flat-top/revisions/r000/reference.png), [Hair male 12 brown flat top](assets/characters-facial-assets--hair-male-12-brown-flat-top/revisions/r001/reference.png).
- **blonde-long-fringe**: [Base female head 04 blonde long hair](assets/characters-facial-assets--base-female-head-04-blonde-long-hair/revisions/r000/reference.png), [Hair female 04 blonde long side fringe](assets/characters-facial-assets--hair-female-04-blonde-long-side-fringe/revisions/r001/reference.png).
- **pink-long-bob**: [Base female head 07 pink bob](assets/characters-facial-assets--base-female-head-07-pink-bob/revisions/r000/reference.png), [Hair female 08 pink long bob](assets/characters-facial-assets--hair-female-08-pink-long-bob/revisions/r001/reference.png).
- **black-gathered-hair**: [Base female head 08 black gathered hair](assets/characters-facial-assets--base-female-head-08-black-gathered-hair/revisions/r000/reference.png), [Hair female 05 black gathered bun](assets/characters-facial-assets--hair-female-05-black-gathered-bun/revisions/r001/reference.png).
- **auburn-gathered-hair**: [Base female head 09 auburn gathered hair](assets/characters-facial-assets--base-female-head-09-auburn-gathered-hair/revisions/r000/reference.png), [Hair female 09 auburn gathered bun](assets/characters-facial-assets--hair-female-09-auburn-gathered-bun/revisions/r001/reference.png).
- **silver-long-bob**: [Base female head 10 silver bob](assets/characters-facial-assets--base-female-head-10-silver-bob/revisions/r000/reference.png), [Hair female 12 white long bob](assets/characters-facial-assets--hair-female-12-white-long-bob/revisions/r001/reference.png).
- **plum-long-hair**: [Base female head 12 plum long hair](assets/characters-facial-assets--base-female-head-12-plum-long-hair/revisions/r000/reference.png), [Hair female 11 plum long hair](assets/characters-facial-assets--hair-female-11-plum-long-hair/revisions/r001/reference.png).
- **violet-gathered-hair**: [Base female head 06 purple gathered hair](assets/characters-facial-assets--base-female-head-06-purple-gathered-hair/revisions/r000/reference.png), [Hair female 07 violet long gathered fringe](assets/characters-facial-assets--hair-female-07-violet-long-gathered-fringe/revisions/r001/reference.png).
- **pirate-hat**: [Head accessory Pirate hat](assets/characters-facial-assets--head-accessory-pirate-hat/revisions/r001/reference.png), [Head specialty Pirate](assets/characters-facial-assets--head-specialty-pirate/revisions/r000/reference.png).
- **military-cap**: [Head accessory Cap](assets/characters-facial-assets--head-accessory-cap/revisions/r001/reference.png), [Head specialty Military](assets/characters-facial-assets--head-specialty-military/revisions/r000/reference.png).
- **glasses**: [Head accessory Glasses](assets/characters-facial-assets--head-accessory-glasses/revisions/r001/reference.png), [Head specialty Corporate](assets/characters-facial-assets--head-specialty-corporate/revisions/r000/reference.png), [Head specialty Outlaw](assets/characters-facial-assets--head-specialty-outlaw/revisions/r000/reference.png).
- **hood**: [Head accessory Hood](assets/characters-facial-assets--head-accessory-hood/revisions/r001/reference.png), [Head specialty Scavenger](assets/characters-facial-assets--head-specialty-scavenger/revisions/r000/reference.png).
- **goggles-position**: [Head accessory Goggles up](assets/characters-facial-assets--head-accessory-goggles-up/revisions/r001/reference.png), [Head accessory Goggles down](assets/characters-facial-assets--head-accessory-goggles-down/revisions/r001/reference.png).
- **scarf-variants**: [Head accessory Scarf dark](assets/characters-facial-assets--head-accessory-scarf-dark/revisions/r001/reference.png), [Head accessory Scarf red](assets/characters-facial-assets--head-accessory-scarf-red/revisions/r001/reference.png).

The skin, eye and expression rows are independently enumerated material/state variants on shared heads. Age examples combine bounded facial treatments and hair/facial hair. Specialty portraits reuse accessories and facial options without granting class/faction/stat semantics. Facial details may need separate atlas layers or real geometry; an eyepatch, monocle and visor are not interchangeable with painted markings.

## Every source appearance

### crew.faces.base-faces

| Exact appearance | Crop revision | Native implementation |
| --- | --- | --- |
| [Base male head 01 violet swept](assets/characters-facial-assets--base-male-head-01-violet-swept/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-male-head-01-violet-swept/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base male head 02 copper side part](assets/characters-facial-assets--base-male-head-02-copper-side-part/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-male-head-02-copper-side-part/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base male head 03 dark close crop](assets/characters-facial-assets--base-male-head-03-dark-close-crop/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-male-head-03-dark-close-crop/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base male head 04 red sweep](assets/characters-facial-assets--base-male-head-04-red-sweep/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-male-head-04-red-sweep/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base male head 05 golden curls](assets/characters-facial-assets--base-male-head-05-golden-curls/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-male-head-05-golden-curls/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base male head 06 brown short](assets/characters-facial-assets--base-male-head-06-brown-short/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-male-head-06-brown-short/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base male head 07 charcoal tousled](assets/characters-facial-assets--base-male-head-07-charcoal-tousled/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-male-head-07-charcoal-tousled/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base male head 08 brown flat top](assets/characters-facial-assets--base-male-head-08-brown-flat-top/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-male-head-08-brown-flat-top/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base male head 09 silver sweep](assets/characters-facial-assets--base-male-head-09-silver-sweep/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-male-head-09-silver-sweep/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base male head 10 plum fringe](assets/characters-facial-assets--base-male-head-10-plum-fringe/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-male-head-10-plum-fringe/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base male head 11 orange curls](assets/characters-facial-assets--base-male-head-11-orange-curls/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-male-head-11-orange-curls/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base male head 12 grey textured](assets/characters-facial-assets--base-male-head-12-grey-textured/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-male-head-12-grey-textured/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base female head 01 charcoal side fringe](assets/characters-facial-assets--base-female-head-01-charcoal-side-fringe/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-female-head-01-charcoal-side-fringe/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base female head 02 navy long fringe](assets/characters-facial-assets--base-female-head-02-navy-long-fringe/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-female-head-02-navy-long-fringe/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base female head 03 red bob](assets/characters-facial-assets--base-female-head-03-red-bob/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-female-head-03-red-bob/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base female head 04 blonde long hair](assets/characters-facial-assets--base-female-head-04-blonde-long-hair/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-female-head-04-blonde-long-hair/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base female head 05 dark violet fringe](assets/characters-facial-assets--base-female-head-05-dark-violet-fringe/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-female-head-05-dark-violet-fringe/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base female head 06 purple gathered hair](assets/characters-facial-assets--base-female-head-06-purple-gathered-hair/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-female-head-06-purple-gathered-hair/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base female head 07 pink bob](assets/characters-facial-assets--base-female-head-07-pink-bob/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-female-head-07-pink-bob/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base female head 08 black gathered hair](assets/characters-facial-assets--base-female-head-08-black-gathered-hair/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-female-head-08-black-gathered-hair/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base female head 09 auburn gathered hair](assets/characters-facial-assets--base-female-head-09-auburn-gathered-hair/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-female-head-09-auburn-gathered-hair/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base female head 10 silver bob](assets/characters-facial-assets--base-female-head-10-silver-bob/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-female-head-10-silver-bob/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base female head 11 crimson fringe](assets/characters-facial-assets--base-female-head-11-crimson-fringe/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-female-head-11-crimson-fringe/BRIEF.md) | r000 | Pending explicit production coverage |
| [Base female head 12 plum long hair](assets/characters-facial-assets--base-female-head-12-plum-long-hair/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--base-female-head-12-plum-long-hair/BRIEF.md) | r000 | Pending explicit production coverage |

### crew.faces.age-variations

| Exact appearance | Crop revision | Native implementation |
| --- | --- | --- |
| [Head age young upper row](assets/characters-facial-assets--head-age-young-upper-row/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-age-young-upper-row/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head age adult upper row](assets/characters-facial-assets--head-age-adult-upper-row/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-age-adult-upper-row/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head age middle aged upper row](assets/characters-facial-assets--head-age-middle-aged-upper-row/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-age-middle-aged-upper-row/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head age older upper row](assets/characters-facial-assets--head-age-older-upper-row/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-age-older-upper-row/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head age young lower row](assets/characters-facial-assets--head-age-young-lower-row/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-age-young-lower-row/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head age adult lower row](assets/characters-facial-assets--head-age-adult-lower-row/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-age-adult-lower-row/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head age middle aged lower row](assets/characters-facial-assets--head-age-middle-aged-lower-row/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-age-middle-aged-lower-row/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head age older lower row](assets/characters-facial-assets--head-age-older-lower-row/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-age-older-lower-row/BRIEF.md) | r000 | Pending explicit production coverage |

### crew.faces.skin-tones

| Exact appearance | Crop revision | Native implementation |
| --- | --- | --- |
| [Head skin tone sample 01](assets/characters-facial-assets--head-skin-tone-sample-01/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-skin-tone-sample-01/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head skin tone sample 02](assets/characters-facial-assets--head-skin-tone-sample-02/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-skin-tone-sample-02/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head skin tone sample 03](assets/characters-facial-assets--head-skin-tone-sample-03/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-skin-tone-sample-03/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head skin tone sample 04](assets/characters-facial-assets--head-skin-tone-sample-04/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-skin-tone-sample-04/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head skin tone sample 05](assets/characters-facial-assets--head-skin-tone-sample-05/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-skin-tone-sample-05/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head skin tone sample 06](assets/characters-facial-assets--head-skin-tone-sample-06/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-skin-tone-sample-06/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head skin tone sample 07](assets/characters-facial-assets--head-skin-tone-sample-07/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-skin-tone-sample-07/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head skin tone sample 08](assets/characters-facial-assets--head-skin-tone-sample-08/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-skin-tone-sample-08/BRIEF.md) | r000 | Pending explicit production coverage |

### crew.faces.eye-colors

| Exact appearance | Crop revision | Native implementation |
| --- | --- | --- |
| [Head eye color Brown](assets/characters-facial-assets--head-eye-color-brown/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-eye-color-brown/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head eye color Blue](assets/characters-facial-assets--head-eye-color-blue/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-eye-color-blue/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head eye color Green](assets/characters-facial-assets--head-eye-color-green/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-eye-color-green/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head eye color Hazel](assets/characters-facial-assets--head-eye-color-hazel/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-eye-color-hazel/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head eye color Grey](assets/characters-facial-assets--head-eye-color-grey/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-eye-color-grey/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head eye color Amber](assets/characters-facial-assets--head-eye-color-amber/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-eye-color-amber/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head eye color Red](assets/characters-facial-assets--head-eye-color-red/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-eye-color-red/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head eye color Cyber](assets/characters-facial-assets--head-eye-color-cyber/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-eye-color-cyber/BRIEF.md) | r000 | Pending explicit production coverage |

### crew.faces.hairstyles-male

| Exact appearance | Crop revision | Native implementation |
| --- | --- | --- |
| [Hair male 01 dark spiked quiff](assets/characters-facial-assets--hair-male-01-dark-spiked-quiff/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-01-dark-spiked-quiff/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair male 02 blonde swept quiff](assets/characters-facial-assets--hair-male-02-blonde-swept-quiff/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-02-blonde-swept-quiff/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair male 03 brown pompadour](assets/characters-facial-assets--hair-male-03-brown-pompadour/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-03-brown-pompadour/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair male 04 charcoal short spikes](assets/characters-facial-assets--hair-male-04-charcoal-short-spikes/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-04-charcoal-short-spikes/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair male 05 auburn pointed quiff](assets/characters-facial-assets--hair-male-05-auburn-pointed-quiff/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-05-auburn-pointed-quiff/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair male 06 navy short waves](assets/characters-facial-assets--hair-male-06-navy-short-waves/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-06-navy-short-waves/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair male 07 dark close crop](assets/characters-facial-assets--hair-male-07-dark-close-crop/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-07-dark-close-crop/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair male 08 tall charcoal crest](assets/characters-facial-assets--hair-male-08-tall-charcoal-crest/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-08-tall-charcoal-crest/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair male 09 red mohawk shaved sides](assets/characters-facial-assets--hair-male-09-red-mohawk-shaved-sides/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-09-red-mohawk-shaved-sides/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair male 10 blonde side undercut](assets/characters-facial-assets--hair-male-10-blonde-side-undercut/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-10-blonde-side-undercut/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair male 11 dark hanging locks](assets/characters-facial-assets--hair-male-11-dark-hanging-locks/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-11-dark-hanging-locks/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair male 12 brown flat top](assets/characters-facial-assets--hair-male-12-brown-flat-top/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-12-brown-flat-top/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair male 13 dark broad spiked top](assets/characters-facial-assets--hair-male-13-dark-broad-spiked-top/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-male-13-dark-broad-spiked-top/BRIEF.md) | r001 | Pending explicit production coverage |

### crew.faces.hairstyles-female

| Exact appearance | Crop revision | Native implementation |
| --- | --- | --- |
| [Hair female 01 violet side bob](assets/characters-facial-assets--hair-female-01-violet-side-bob/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-01-violet-side-bob/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair female 02 auburn side bob](assets/characters-facial-assets--hair-female-02-auburn-side-bob/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-02-auburn-side-bob/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair female 03 charcoal side bob](assets/characters-facial-assets--hair-female-03-charcoal-side-bob/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-03-charcoal-side-bob/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair female 04 blonde long side fringe](assets/characters-facial-assets--hair-female-04-blonde-long-side-fringe/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-04-blonde-long-side-fringe/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair female 05 black gathered bun](assets/characters-facial-assets--hair-female-05-black-gathered-bun/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-05-black-gathered-bun/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair female 06 red long gathered fringe](assets/characters-facial-assets--hair-female-06-red-long-gathered-fringe/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-06-red-long-gathered-fringe/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair female 07 violet long gathered fringe](assets/characters-facial-assets--hair-female-07-violet-long-gathered-fringe/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-07-violet-long-gathered-fringe/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair female 08 pink long bob](assets/characters-facial-assets--hair-female-08-pink-long-bob/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-08-pink-long-bob/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair female 09 auburn gathered bun](assets/characters-facial-assets--hair-female-09-auburn-gathered-bun/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-09-auburn-gathered-bun/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair female 10 navy long bob](assets/characters-facial-assets--hair-female-10-navy-long-bob/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-10-navy-long-bob/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair female 11 plum long hair](assets/characters-facial-assets--hair-female-11-plum-long-hair/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-11-plum-long-hair/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair female 12 white long bob](assets/characters-facial-assets--hair-female-12-white-long-bob/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-12-white-long-bob/BRIEF.md) | r001 | Pending explicit production coverage |
| [Hair female 13 brown cropped side sweep](assets/characters-facial-assets--hair-female-13-brown-cropped-side-sweep/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--hair-female-13-brown-cropped-side-sweep/BRIEF.md) | r001 | Pending explicit production coverage |

### crew.faces.facial-hair

| Exact appearance | Crop revision | Native implementation |
| --- | --- | --- |
| [Facial hair Clean](assets/characters-facial-assets--facial-hair-clean/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--facial-hair-clean/BRIEF.md) | r001 | Pending explicit production coverage |
| [Facial hair Stubble](assets/characters-facial-assets--facial-hair-stubble/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--facial-hair-stubble/BRIEF.md) | r001 | Pending explicit production coverage |
| [Facial hair Short beard](assets/characters-facial-assets--facial-hair-short-beard/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--facial-hair-short-beard/BRIEF.md) | r001 | Pending explicit production coverage |
| [Facial hair Full beard](assets/characters-facial-assets--facial-hair-full-beard/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--facial-hair-full-beard/BRIEF.md) | r001 | Pending explicit production coverage |
| [Facial hair Goatee](assets/characters-facial-assets--facial-hair-goatee/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--facial-hair-goatee/BRIEF.md) | r001 | Pending explicit production coverage |
| [Facial hair Moustache](assets/characters-facial-assets--facial-hair-moustache/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--facial-hair-moustache/BRIEF.md) | r001 | Pending explicit production coverage |
| [Facial hair Handlebar](assets/characters-facial-assets--facial-hair-handlebar/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--facial-hair-handlebar/BRIEF.md) | r001 | Pending explicit production coverage |
| [Facial hair Side burns](assets/characters-facial-assets--facial-hair-side-burns/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--facial-hair-side-burns/BRIEF.md) | r001 | Pending explicit production coverage |
| [Facial hair Soul patch](assets/characters-facial-assets--facial-hair-soul-patch/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--facial-hair-soul-patch/BRIEF.md) | r001 | Pending explicit production coverage |
| [Facial hair Old beard](assets/characters-facial-assets--facial-hair-old-beard/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--facial-hair-old-beard/BRIEF.md) | r001 | Pending explicit production coverage |
| [Facial hair Grey](assets/characters-facial-assets--facial-hair-grey/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--facial-hair-grey/BRIEF.md) | r001 | Pending explicit production coverage |
| [Facial hair Braided](assets/characters-facial-assets--facial-hair-braided/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--facial-hair-braided/BRIEF.md) | r001 | Pending explicit production coverage |

### crew.faces.details

| Exact appearance | Crop revision | Native implementation |
| --- | --- | --- |
| [Head facial detail Freckles](assets/characters-facial-assets--head-facial-detail-freckles/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-facial-detail-freckles/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head facial detail Scars](assets/characters-facial-assets--head-facial-detail-scars/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-facial-detail-scars/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head facial detail Scratch](assets/characters-facial-assets--head-facial-detail-scratch/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-facial-detail-scratch/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head facial detail Tattoo](assets/characters-facial-assets--head-facial-detail-tattoo/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-facial-detail-tattoo/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head facial detail Bandage](assets/characters-facial-assets--head-facial-detail-bandage/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-facial-detail-bandage/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head facial detail Dirt](assets/characters-facial-assets--head-facial-detail-dirt/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-facial-detail-dirt/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head facial detail Warpaint](assets/characters-facial-assets--head-facial-detail-warpaint/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-facial-detail-warpaint/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head facial detail Cyber](assets/characters-facial-assets--head-facial-detail-cyber/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-facial-detail-cyber/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head facial detail Eyepatch](assets/characters-facial-assets--head-facial-detail-eyepatch/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-facial-detail-eyepatch/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head facial detail Monocle](assets/characters-facial-assets--head-facial-detail-monocle/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-facial-detail-monocle/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head facial detail Visor scar](assets/characters-facial-assets--head-facial-detail-visor-scar/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-facial-detail-visor-scar/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head facial detail Birthmark](assets/characters-facial-assets--head-facial-detail-birthmark/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-facial-detail-birthmark/BRIEF.md) | r001 | Pending explicit production coverage |

### crew.faces.accessories

| Exact appearance | Crop revision | Native implementation |
| --- | --- | --- |
| [Head accessory Cap](assets/characters-facial-assets--head-accessory-cap/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-cap/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Beanie](assets/characters-facial-assets--head-accessory-beanie/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-beanie/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Headband](assets/characters-facial-assets--head-accessory-headband/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-headband/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Pilot hat](assets/characters-facial-assets--head-accessory-pilot-hat/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-pilot-hat/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Beret](assets/characters-facial-assets--head-accessory-beret/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-beret/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Cowboy hat](assets/characters-facial-assets--head-accessory-cowboy-hat/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-cowboy-hat/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Pirate hat](assets/characters-facial-assets--head-accessory-pirate-hat/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-pirate-hat/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Hood](assets/characters-facial-assets--head-accessory-hood/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-hood/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Goggles up](assets/characters-facial-assets--head-accessory-goggles-up/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-goggles-up/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Goggles down](assets/characters-facial-assets--head-accessory-goggles-down/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-goggles-down/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Glasses](assets/characters-facial-assets--head-accessory-glasses/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-glasses/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Sunglasses](assets/characters-facial-assets--head-accessory-sunglasses/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-sunglasses/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Headset](assets/characters-facial-assets--head-accessory-headset/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-headset/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Earring](assets/characters-facial-assets--head-accessory-earring/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-earring/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Nose ring](assets/characters-facial-assets--head-accessory-nose-ring/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-nose-ring/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Cigar](assets/characters-facial-assets--head-accessory-cigar/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-cigar/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Mask](assets/characters-facial-assets--head-accessory-mask/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-mask/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Scarf dark](assets/characters-facial-assets--head-accessory-scarf-dark/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-scarf-dark/BRIEF.md) | r001 | Pending explicit production coverage |
| [Head accessory Scarf red](assets/characters-facial-assets--head-accessory-scarf-red/revisions/r001/reference.png) · [brief](assets/characters-facial-assets--head-accessory-scarf-red/BRIEF.md) | r001 | Pending explicit production coverage |

### crew.faces.specialty-looks

| Exact appearance | Crop revision | Native implementation |
| --- | --- | --- |
| [Head specialty Pirate](assets/characters-facial-assets--head-specialty-pirate/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-pirate/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head specialty Military](assets/characters-facial-assets--head-specialty-military/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-military/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head specialty Corporate](assets/characters-facial-assets--head-specialty-corporate/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-corporate/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head specialty Scientist](assets/characters-facial-assets--head-specialty-scientist/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-scientist/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head specialty Engineer](assets/characters-facial-assets--head-specialty-engineer/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-engineer/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head specialty Medic](assets/characters-facial-assets--head-specialty-medic/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-medic/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head specialty Mechanic](assets/characters-facial-assets--head-specialty-mechanic/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-mechanic/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head specialty Scavenger](assets/characters-facial-assets--head-specialty-scavenger/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-scavenger/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head specialty Civilian](assets/characters-facial-assets--head-specialty-civilian/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-civilian/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head specialty Outlaw](assets/characters-facial-assets--head-specialty-outlaw/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-outlaw/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head specialty Explorer](assets/characters-facial-assets--head-specialty-explorer/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-explorer/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head specialty Cybernetic](assets/characters-facial-assets--head-specialty-cybernetic/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-cybernetic/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head specialty Alien hybrid](assets/characters-facial-assets--head-specialty-alien-hybrid/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-specialty-alien-hybrid/BRIEF.md) | r000 | Pending explicit production coverage |

### crew.faces.expressions

| Exact appearance | Crop revision | Native implementation |
| --- | --- | --- |
| [Head expression Neutral](assets/characters-facial-assets--head-expression-neutral/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-expression-neutral/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head expression Happy](assets/characters-facial-assets--head-expression-happy/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-expression-happy/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head expression Sad](assets/characters-facial-assets--head-expression-sad/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-expression-sad/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head expression Angry](assets/characters-facial-assets--head-expression-angry/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-expression-angry/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head expression Surprised](assets/characters-facial-assets--head-expression-surprised/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-expression-surprised/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head expression Determined](assets/characters-facial-assets--head-expression-determined/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-expression-determined/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head expression Wink](assets/characters-facial-assets--head-expression-wink/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-expression-wink/BRIEF.md) | r000 | Pending explicit production coverage |
| [Head expression Grin](assets/characters-facial-assets--head-expression-grin/revisions/r000/reference.png) · [brief](assets/characters-facial-assets--head-expression-grin/BRIEF.md) | r000 | Pending explicit production coverage |

### Source composition graphics

- [Face sheet identity wordmark](assets/characters-facial-assets--face-sheet-identity-wordmark/revisions/r000/reference.png)
- [Face sheet header slogan](assets/characters-facial-assets--face-sheet-header-slogan/revisions/r000/reference.png)
- [Face Assets header panel](assets/characters-facial-assets--face-assets-header-panel/revisions/r000/reference.png)
- [Face sheet footer wordmark](assets/characters-facial-assets--face-sheet-footer-wordmark/revisions/r000/reference.png)
- [Face sheet footer slogan](assets/characters-facial-assets--face-sheet-footer-slogan/revisions/r000/reference.png)
- [Face sheet header ship context](assets/characters-facial-assets--face-sheet-header-ship-context/revisions/r000/reference.png)
- [Base faces header panel](assets/characters-facial-assets--base-faces-header-panel/revisions/r000/reference.png)
- [Age variations header panel](assets/characters-facial-assets--age-variations-header-panel/revisions/r000/reference.png)
- [Skin tones header panel](assets/characters-facial-assets--skin-tones-header-panel/revisions/r000/reference.png)
- [Eye colours header panel](assets/characters-facial-assets--eye-colours-header-panel/revisions/r000/reference.png)
- [Male hairstyles header panel](assets/characters-facial-assets--male-hairstyles-header-panel/revisions/r000/reference.png)
- [Female hairstyles header panel](assets/characters-facial-assets--female-hairstyles-header-panel/revisions/r000/reference.png)
- [Facial hair header panel](assets/characters-facial-assets--facial-hair-header-panel/revisions/r000/reference.png)
- [Facial details header panel](assets/characters-facial-assets--facial-details-header-panel/revisions/r000/reference.png)
- [Accessories header panel](assets/characters-facial-assets--accessories-header-panel/revisions/r000/reference.png)
- [Specialty styles header panel](assets/characters-facial-assets--specialty-styles-header-panel/revisions/r000/reference.png)
- [Expressions header panel](assets/characters-facial-assets--expressions-header-panel/revisions/r000/reference.png)
