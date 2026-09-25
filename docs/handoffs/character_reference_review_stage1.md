# Character reference calibration — independent review, stage 1

Date: 2026-09-09. Reviewer: Astra subagent `/root/character_art_review`.
Status: diagnostic and acceptance criteria; **r002 fails the owner's requested
reference-fidelity target**. Its functional equipment/rig validation remains
useful, but does not establish visual fidelity. This document grants no owner
sign-off and makes no claim about a later revision.

## Sources actually inspected

- Full 1448 × 1086 [male/general sheet](../../reference/art/characters-weapons-items.png),
  including all ten crew silhouettes, base, exploded armor tiers and accessories.
- Full 1448 × 1086 [female sheet](../../reference/art/characters-weapons-items-female.png),
  including all ten crew silhouettes, base, exploded armor tiers and accessories.
- The owner's current paper-doll screenshot, supplied in this conversation at
  `/root/.t3/userdata/attachments/d9942c29-66a3-40a7-8bb4-8c70682775a9-912a6e4d-ce74-4cbb-920f-622b1b0e8c20.png`.
- r002 Blender renders: male/female medic, female modesty base, ponytail fitting,
  separate medic backpack and belt, under
  `assets/art-library/designs/crew.base-and-outfits/revisions/r002/components/`.
- [Current authoring guide](../character_component_authoring.md) and
  [living workflow](../../assets/art-library/WORKFLOW.md).

For close inspection I made temporary, nearest-neighbor 3× crops of the actual
source pixels under `.runtime/character-reference-review/`. These are inspection
aids, not new canonical reference crops, authored concepts or model evidence.
Coordinates in the original sheets: medic `(286,270)-(429,511)`, base
`(18,741)-(151,976)`, armor tiers `(472,735)-(864,1000)`, security/marine hair
`(578,270)-(865,511)`. Native full sources were examined before these crops.

## Focused test scope

Use **both modesty bases, a genuinely stepped swept hairstyle and ponytail, and
the medic equipment set** as the first calibration deliverable. Medic is a strong
choice: white/red surfaces expose construction clearly; dark flexible joints,
small pouches, optical helmet parts and independently visible equipment all need
to work together. It also exposes an important difference between the sheets:
the male medic wears a sealed helmet, whereas the female medic has a visible
face, long stepped ponytail, white/red ear communications and a small medical
crest. A single sealed helmet on both bases cannot demonstrate the female target.

Keep scope bounded. This test establishes a reusable modeling standard before
propagating it through the other nine sets. Do not represent every set as visually
revised merely because it inherits an improved head or material. Preserve all
existing inventory UUIDs, equipment IDs, mass/storage rules, skeleton/rest matrices,
and modesty coverage. Body selection must not change stats or item eligibility.

The main agent's proposed focused implementation—two bases, stepped swept/crest/
ponytail hair, nine rebuilt medic components and a separate unisex open medical
comms option—is suitable for this test. Including crest is useful because it is
the selected hairstyle in the owner's screenshot. Preserve r002/current runtime
as the baseline until the appearance review passes; this consultation accepts the
scope, not any unexamined model.

## What differs, and what to change first

### 1. Face and silhouette

Both references use stylized, large heads and short bodies. The goal is still a
studless, stepped construction aesthetic, not realistic anatomy. The current
base reads as a simple articulated mannequin: one almost perfect rectangular head,
prominent projecting nose, isolated raised eyebrow bars, short dark eye rectangles,
and a black mouth stroke. The screenshot's tall, single-block crest exaggerates
the head height further. Neither reference has this face/hair combination.

The reference eyes are large, near-black vertical shapes occupying approximately
one third of the visible face height, sometimes approaching two fifths. Their
upper edge sits under the fringe or a restrained brow. There is little visible
white sclera. The nose is absent or a very shallow skin-colored indication; the
mouth is a tiny muted warm stroke. These are observations from a small stylized
image, not a license to invent iris detail. Current short eyes, thick raised brows
and projecting button nose should be replaced together so the face has one
coherent language.

Model the head with a few intentional cheek/jaw steps or chamfers and a controlled
forehead/temple shape. The female references have a subtly softer lower-face
outline, but remain block-styled; do not narrow the jaw into a realistic pointed
face. Hair and eye placement account for much of the perceived difference.
Reduce the ear block projection, particularly where side locks frame the face.
Keep skin tones configurable; the female security reference demonstrates a darker
skin palette and is not a reason to fix one skin color for an entire body type.

The base references are clothed. Their sleeve cuffs, belts, boots and trouser
shapes cannot all be copied onto permanently bare skin. Translate their proportions
and joint rhythm to the modesty base, then obtain the dressed silhouette with real
equipped garments. The female base needs a deliberate waist-to-hip transition
inside the existing equipment envelope, rather than only an added rectangular
chest band. Maintain opaque, continuous modesty coverings; no anatomical detail
is needed beneath them.

### 2. Hair is a sculpted mass of stepped locks

The current ponytail render has a nearly level lid, broad side slab and a few
thin top strips. The user's crest is essentially two stacked boxes. Reference
hair has a large recognizable silhouette, several offset height courses, an
asymmetric fringe, overlapping side locks, recesses and small selected projecting
tips. Fine detail follows the direction of the main locks; it is not a grid of
uniform cubes or random surface tiles.

For the calibration ponytail, build a raised gathered root, a stepped arc flowing
back/down, an irregular taper and enough side volume to remain recognizable in a
three-quarter view. In the female medic source it extends down toward the upper
back and is an important part of the silhouette. The fringe diagonally reveals
one side of the forehead and frames both eyes. Keep the ponytail clear of the
backpack and shoulders in the documented head-turn/arm poses, or explicitly author
a shorter fitted version. Swept short hair needs its own offset crown, parted
fringe and sideburn language. One pattern scaled longer is insufficient.

Use small bevels and related dark base/mid/highlight material values so steps
remain visible without neon illumination. The purple/blue edge response in the
reference is partly light; do not bake every edge as a bright blue stripe.

### 3. Medic armor has nested, functional layers

The existing set has the correct broad white/red family but is largely one
uniform block per region. The helmet is a wide staircase dome around a dark
window, chest is a centered plaque, belt is almost empty, legs have two identical
red horizontal knee bands, and the backpack is a plain white box. Adding a
stronger bevel or gloss would not resolve these differences.

The source medic construction is more specific:

- **Helmet:** a compact crown with an offset red medical panel, shaped cheek/chin
  frame, dark recessed optical opening, thin blue optical edge response, and
  layered ear modules with a small red/orange inset. The male reference medical
  symbol sits inside a red panel; the current loose cross on the white brow is a
  different hierarchy. Avoid filling the visible upper window with the base skin.
- **Chest:** a dark underlayer and neck opening, separate raised white chest
  shell, inset red collar accent, independent dark shoulder straps, small buckles
  and lower abdominal segmentation. The female reference has the cross directly
  on its white chest; the male chest includes a smaller secondary patch. Preserve
  those deliberate variants rather than imposing one symbol placement everywhere.
- **Shoulders/arms:** compact overlapping white/red plates, dark separation at
  the arm joint, a restrained medical patch, forearm bracer and wrist seal. Current
  thick red rectangular caps need a shaped stepped outline and stronger value
  separation from the upper-arm sleeve.
- **Belt:** a narrow dark belt with a real inset buckle and visibly attached
  white/red medical pouches. The female reference has an asymmetric red hanging
  pouch with a white framed clasp. Current bare belt is missing this major feature.
- **Legs:** light trouser/thigh panels, dark knee flex zones, selected kneecap
  pieces, shin panel and lower red accent. Their boundary is not two identical red
  stripes stacked on each knee. Keep the leg item distinct from its boot.
- **Boots:** dark chunky toe/heel/sole layers with a small upper cuff and subtle
  chamfers. The reference does not have the current large white toe blocks with
  paired red dots. The sole/contact silhouette matters more than extra fasteners.
- **Backpack:** dark frame, segmented body, protected corner/edge rails, visible
  side equipment and a few red identity panels. The medic's rear face is occluded
  in the main portrait; design any unseen rear details from the sheet's exploded
  backpack language and label them as inferred. Do not claim an exact rear match.

The carried med-kit and holographic scanner are separate hand props. They explain
part of the source's outline and lighting, but must not be welded to an armor
component merely to improve a comparison. A matching reference-like pose may use
separate documented preview props if available; neutral armor checks must remain.

### 4. Female reference variants and shared equipment

The female sheet is an authored set of alternatives: visible faces, different
hair, open goggles/comms/caps, fitted garments and in some cases changed shoulder
or pouch treatment. It is not evidence that every female character must have
restricted armor, a ponytail, or exposed skin.

Keep one shared rig and every existing owned item ID. A component may have an
explicit fitted mesh variant for a body while preserving its attachment, slot,
authority and item identity. **Helmet silhouette and visor state deserve explicit
style semantics**, because a medical ear-comms/headband is not automatically a
sealed helmet with identical fictional protection. For a bounded visual test,
author the open medical headgear as a documented visual variant under the existing
helmet family, let either body preview it, and capture it with the existing visor
unequipped. The sealed helmet remains wearable by either body. Before claiming
production integration, make selection deterministic and visible in the content
contract; never silently hide a separately equipped visor based solely on gender.

Existing armor has no implemented environmental/stat bonuses, so visual fitting
does not currently alter those mechanics. Preserve that separation in the guide.
An additional inventory definition or a persistent style selector is a separate
integration choice; this review does not authorize duplicate inventory grants or
invent a new seal mechanic.

### 5. Material and camera contribution

The sheets show directional key light, soft contact shadow, cool blue/purple rim
light and localized cyan emission. Pale armor retains shaded lavender/gray side
planes; black rubber remains readable; hair has depth and small highlighted steps.
The current paper doll is frontal, dim/flat and low-contrast, which magnifies the
plain shapes. The r002 Blender renders add broad circular specular highlights to
the visor but do not reproduce the layered optical rim.

Review geometry first in a neutral, evenly lit setup with emission/bloom off.
Then use a second reference-like three-quarter setup and the actual paper doll.
Calibrate a soft key/fill/rim, not a large collection of point lights. A better
light must not become the only reason facial features or armor seams are visible.
Do not compare a large bright Blender close-up to a tiny dark runtime figure and
attribute every difference to geometry. Keep displayed figure height, angle and
background documented. Reference camera is an elevated three-quarter view with
little perspective distortion; frontal current screenshot is not the same view.

## Acceptance rubric for the focused candidate

These are review gates, not an owner approval or a claimed numerical measurement
of every source pixel. Suggested proportion ranges are calibration aids. If a
range conflicts with the actual matching source crop, prefer the source and record
the reason. No aggregate score may hide a failed hard gate.

Approximate screen-space proportions from the source crops are useful for a first
matched-camera check: visible face height about **20–25%** of dressed full height;
main head plus short-hair envelope about **31–36%**; male medic sealed helmet about
**33–37%**; eyes about **32–42%** of visible face height. These are deliberately broad
visual estimates affected by fringe, pose and camera, not measurements of hidden
anatomy or approved mesh dimensions. Exclude the long ponytail from the main-head
envelope. The apparent r002 face/head is relatively tall and square while its eyes
are short. First adjust face features, hair silhouette and outer mesh proportions
within the attachment envelope; do not alter shared rig joint centers merely to
hit a screen-space ratio.

| Gate | Required evidence and pass condition |
| --- | --- |
| **A — silhouette** | Male/female base and dressed medic at matched full-figure height, front and reference-like three-quarter views. Head/body rhythm, compact armored torso, glove/boot masses and shoulder-to-hip widths are visibly closer than r002. Hair must not introduce the old isolated tower crest. Preserve the shared approximately 2 m placement scale and exact joint centers. |
| **B — face** | Bare-head close-up and 128/256 px figure-height comparisons. Tall dark eyes, restrained brows, shallow/absent nose projection, subtle mouth and intentional cheek/ear shape agree with the base crops. Both faces remain readable at actual paper-doll size without a giant white eye highlight or pasted-on eyebrow blocks. |
| **C — hair** | Swept and ponytail front/side/rear views. Several organized stepped locks change the silhouette; crown, fringe, temples and tail are distinct masses. Ponytail is visible from the reference angle, with tapered end and authored clearance. No broad flat lid, single slab tail or repeated cubes masquerading as strands. |
| **D — armor** | Medic full set and isolated chest/belt/boots/backpack. Readable underlayer → strap/frame → shell → inset accent hierarchy; source-like medical markings; asymmetric attached pouches; dark knee flex and correct dark toe/sole silhouette. Blank backpack cube, bare belt or repeated red knee bars fail. Back details are labeled inferred. |
| **E — variants** | Sealed medic on both bodies; open/comms medic on both bodies with visor explicitly absent; female reference look with stepped ponytail. Runtime selection is explicit and repeatable. No gender-based loss of an equipped item; mixed sets still fit and keep their own palettes. |
| **F — lighting/materials** | Neutral bloom-off + reference-like lighting + actual Babylon paper-doll captures. White/red/dark hierarchy survives all three. Molded edges are narrow, optical material distinct from armor, metal small and localized, skin/hair nonmetallic. Hair and panels stay legible without neon bloom. |
| **G — rig/delivery** | Exact rig/rest/clip/weight validation; idle, walk, run, seated, weapon-hold checks; front/side/rear views and meaningful bend samples on both bodies. Modesty stays opaque and visible, no persistent gaps/collisions, separate slots/UUIDs preserved. Actual source/GLB/render hashes, cameras, explicit reference coverage, failure notes and per-component current revisions retained. Automated tests support this gate but cannot pass A–F. |

At 128 px, prioritize the recognizable head/hair, white/red armor grouping and dark
boots. At 256 px, eyes, visor/headgear, chest cross, straps and belt pouches should
remain visible. Close-up evaluates bevel quality, overlaps, materials and attachment
fit. Do not multiply tiny details until all seven criteria can be assessed clearly.

## Required staged consultation

1. **Stage 1 (this record):** diagnostic and bounded hypothesis approved for work,
   not the appearance itself. Main agent should record the owner's new feedback
   and next revision in the living ledgers.
2. **Stage 2:** send neutral + reference-like Blender renders of both bases, both
   hair styles and sealed/open medic options to the independent Astra reviewer.
   Include matched r002/source comparisons. Reviewer records explicit pass/fail
   for A–F, specific unresolved differences, and the smallest next correction.
3. **Stage 3:** after corrections, send actual Babylon captures, angle/size
   comparisons and rig results. Reviewer repeats A–G against actual sources.
   A pass means ready for owner review of this bounded calibration set only.
4. Apply the workflow's two-consecutive-no-improvement checkpoint if reached.
   Preserve every rejected candidate and never advance owner sign-off on the
   basis of an agent opinion or the owner's earlier general “looks good.”

The guide should gain these explicit visual targets, female headgear semantics,
scale/lighting comparison protocol and pass/fail examples. Its current statement
that molded edges and layered armor should be kept is insufficiently specific:
the r002 renders technically meet that broad wording while remaining much coarser
than the supplied reference art.
