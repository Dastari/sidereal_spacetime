# Character component authoring

Status: inventory/shared rig implemented at r002; owner-authorized r008 visual
calibration installed for both bases, three hairstyles and nine medic pieces.
Other components retain r002; open comms remains a staged, unissued design.
Final owner art approval is pending. See the [exact publication and rollback](../assets/art-library/character-components/publications/r008/README.md).
Follow the [reference fidelity contract](character_reference_fidelity.md) for
faces, directional hair, layered armor and the independent visual review gates.
Start at [the individual component index](../assets/art-library/character-components/INDEX.md)
and [the family revision ledger](../assets/art-library/designs/crew.base-and-outfits/DESIGN.md).
The machine-readable component catalog and per-item evidence index live alongside
its revision. The previous `assets/source/crew-astra.blend` remains preserved.

## Authoring and fit contract

All ten archetypes—captain, engineer, medic, pilot, security, marine, salvage,
recon, scientist and mechanic—are assemblies of independently equipped items.
An archetype is a convenient design grouping, never an indivisible character mesh
or a role/permission grant. Keep original molded edges, insignia, curved optical
surfaces, layered armor and material roles. Author replacements in Blender, in
meters, with editable mesh objects, materials and named vertex groups. Do not
rebuild visual art as TypeScript voxel solids.

The adult stylized male and female bases have the same height, joint centers,
16-bone skeleton, rest matrices, animations and attachment envelope. Female torso
and hip shaping stays within that envelope. Both bases permanently include opaque
modesty shorts; the female base also includes an opaque chest covering and straps.
These are part of the base, never inventory, and cannot be unequipped. Hair is an
independent saved appearance choice for either body. Sex/body type has no gameplay
stat or equipment restriction.

The existing approximately two-meter dressed scale remains authoritative for
visual placement only. Exact component bounds in the manifest are Blender XYZ
meters. Blender -Y is forward, Z is up; standard GLB Y-up export is retained and
the game applies its existing model-forward rotation. Never move joint centers
or rescale the skeleton to fit an individual armor piece.

| Equipment slot | Boundary and deformation |
| --- | --- |
| helmet | Shell, cap, comms, lamps; head bone. Excludes optical visor and hair. |
| visor | Visor/rim or optic assembly; head bone; independently wearable with any helmet. |
| chest | Torso garment, sleeves, elbow seams, collar, chest plates/insignia; spine/arm bones. Coat tails retain thigh weights. |
| shoulders | Pair of pauldrons/epaulettes; left/right upper-arm bones. |
| gloves | Paired gloves, forearm guards, wrist seals, finger details; forearm/hand bones. |
| belt | Belt, buckle, attached pouches and tools; pelvis. |
| legs | Trousers, knee joints/pads and greaves; pelvis/thigh/shin bones. |
| boots | Paired boots, toes, soles and fasteners; foot bones. |
| back | Complete backpack/tanks/rolls; spine. Owned storage is attached to the item UUID. |
| hand | Existing authoritative handheld item and hand socket; unchanged item instances. |

A pair of gloves, boots or shoulder guards is one equip item containing separate
left/right deforming meshes. No asymmetric left/right inventory is implied.
Optional masks and optical housings belong to the visor assembly; build an
additional slot only after defining authority, compatibility and UI behavior.
Scientists have no helmet/visor in their current reference set. Do not invent a
missing reference item just to fill every slot.

## Skeleton, clipping and materials

Use `crew-shared-16-v1`: root, pelvis, spine, head; upper_arm, forearm, hand,
thigh, shin and foot on L/R. Original rest matrices are recorded in the component
manifest. Every vertex must have normalized weights to declared bones; rigid
armor parts use weight 1 on their matching bone, preserving the studless form.
Soft seams can blend adjacent bones when designed and checked in all poses.
The existing handR/handL, spine/back and pelvis/hip socket transforms are retained.
The staged combat controller may add nondeforming control bones without changing
this deform rig contract. Its separate draft animation source is not silently
promoted by this change.

The base is partitioned into torso, upper arms, forearms, hands, legs and feet.
A full covering item hides only its declared underlying skin region; removing it
restores that region. Core face/neck and mandatory modesty layers always remain.
Never hide an entire body to solve one clipping issue. Hair selection is retained
under helmets. Closed shells suppress exposed hair; open caps use a separate
fitted hair liner with the chosen hair color. A future helmet-fit hair variant
must be an explicit authored variant, never accidental cap geometry.

Each item owns a palette derived from its archetype. Equipping an engineer part
with a medic chest preserves orange and white/red respectively; choosing another
body does not recolor armor. Base skin/hair can use saved color choices. Preserve
visor alpha blending, transmission, IOR and roughness, and light emissive roles.
Invisible geometry, collision proxies and damage volumes are separate concerns.

## Deliverables for every revision

Keep a stable component ID, source-object provenance, named `COMP-<id>` Blender
collection, editable source, individually skinned GLB, transparent rendered item
image, physical bounds and storage footprint. The combined runtime bundle batches
only within one component/skin region, retaining independent visibility and
materials. It shares a single deform rig and all twelve original locomotion,
seated and pistol/rifle clips.

The source audit must account for all 550 original mesh objects, including legacy
accessories, facial parts, hair and pose fixtures. An item image is a render of
the authored geometry, not a reference reconstruction. Preserve exact reference
crops in the existing library and link comparisons explicitly.

Validate both bare bases, every full set on both bases, a mixed set, all hair
choices, every clip and handheld/back sockets. Check frontal, side and rear views,
modesty coverage, knee/arm bends, coat tails, optical visibility and foot contact.
Include real game-renderer/browser captures; Blender thumbnails alone do not prove
runtime integration. Run `npm run check`, `npm run build`, `npm run art:check` and
isolated authority smoke tests when equipment or appearance validation changes.

## Inventory, statistics and revision ownership

Equipping requires an owned accessible item UUID, an allowed slot, the current
inventory revision and an operation ID. Existing swap, storage, carry mass,
privacy, replay and container-cycle validators apply to armor too. Cosmetics
cannot grant equipment. Existing player inventory and appearance UUIDs remain.
New wardrobe/catalog IDs do not imply ownership or final art approval.

The one-time uniform delivery uses the four existing ship storage container UUIDs.
Their inventory grids expand to 14 × 14; existing item positions, nested storage,
contents and physical placements remain. Sets are grouped captain/engineer/medic,
pilot/security/marine, salvage/recon, and scientist/mechanic/legacy accessories.
A private permanent character delivery receipt prevents regrant on reconnect or
command-receipt eviction. New characters receive the delivery with their starter
kit; existing characters receive it on entering the lab again. If an old inventory
exceeds the delivery budget, retain it and defer delivery until room is available.
No additional freestanding cargo containers are created. See the [integration
handoff](handoffs/character_components.md) for the exact set distribution,
activation, browser evidence and validation limits.

Drag an item from a carried or reachable storage grid to its paper-doll slot to
equip or swap it. Drag an equipped item back to a free grid location to unequip.
The server validates the final operation; local drag previews never own state.

Initial masses and grid sizes are explicit lab balance values, not researched
physical properties. Heavier marine pieces carry greater mass. No armor, defense,
medical skill, profession, environmental seal, oxygen supply, shield or resistance
bonus is implied by appearance. Add approved gameplay effects through separate
content/rule/reducer changes and tests. The current mock character stats remain
mock presentation data until their authority is implemented.

Update the living revision, feedback, evidence and validation after each meaningful
iteration. Only the owner may approve an exact final revision and deliverables.
Agent review and runtime activation leave owner sign-off pending. Never overwrite
an old render/model to disguise a revision. Future agents should start with the
living index, choose an unsigned component, read its provenance and current
feedback, author the next revision, check it on both bases and mixed outfits,
then append evidence and feedback before requesting final owner design review.

## Live equipment posing — 2026-09-09 owner update

The owner subsequently authorized the normal game and paper doll to use the new pose controller without a development query. The installed r008 modular bundle remains the body/armor source; the published r002 handhelds, measured sockets and authored aim-space JSON are paired at `/assets/crew/poses/r002/`. The legacy pose crew GLB is not substituted for modular characters. Preserve the shared rest/deformation contract when authoring later component revisions and validate both bodies with real mixed equipment. See [the live integration record](handoffs/character_pose_live_release.md) for exact publication receipts, validation and open visual limitations. Publication permission is separate from final art sign-off.

## Inventory storage and cosmetic UI follow-up

Character skin and hair use separately saved color roles; author materials so both body types and all hair styles can accept those roles without recoloring equipment. The runtime supports eight skin/hair UI swatches in Escape → Crew. Equipment no longer duplicates cosmetic selectors. Future belt or trouser storage must have a real definition grid/payload and server-provisioned container tied to the equipped item UUID; do not imply capacity from a visual pouch. Storage stats in tooltips derive from the item definition. Existing equipped storage appears as inventory tabs; see `docs/handoffs/inventory_tetris_and_polish.md`.

## r009 heads, hair and facial options — 2026-09-10

This section supersedes the earlier limited cosmetic-palette description for the
new r009 candidate. The owner-approved r008 character bundle and r003 paired
handheld/pose deliverables remain immutable history; r009 final owner approval is
pending. Read the [independent reference and iteration review](handoffs/character_faces_r009_reference_review.md),
[facial source index](../assets/art-library/FACIAL_REFERENCE_INDEX.md), and the
current component publication ledger before choosing a native source. The index
preserves 138 portrait appearances and 17 source graphics. Its eleven new facial
study queues are reference-only, not implicitly reconstructed or approved.

The r009 scope is two head regions, eight existing native hair styles (`swept`,
`cropped`, `crest`, `scientist`, `bob`, `ponytail`, `bun`, `braids`) and seven
independent facial texture layers. These eight styles do not reproduce all 26
hairstyle-row references. The UI catalog offers 32 hair colors and eight eye
colors alongside the existing eight skin tones. Presets are conveniences over
the saved RGB color contract. Appearance options are available to either body:
eight expressions, ten detail choices including none, eight facial-hair choices
including none, and four adult age treatments. A choice named `full` is currently
a beard texture, not a projecting three-dimensional beard. New hats, glasses,
eyepatches, monocles, scarves and specialty assemblies remain separate source
queues; selecting facial cosmetics neither equips nor grants them.

The female head loft uses a 2% narrower upper envelope and up to 6% narrower jaw
relative to the corresponding male loft, with gradual intermediate rings. It
retains head height, joint placement, neck, below-head body geometry and equipment
attachment frames. Do not scale the skeleton or move eye/helmet sockets to achieve
this taper. Keep the shared sixteen-bone rig, inverse binds, twelve original
clips, existing component IDs, mandatory modesty layers and exact r003 handheld
meshes/socket/aim-space pairing. Both bodies must still use the same equipment
authority and attachment rules.

Each facial layer is a packed 1024 × 64 RGBA PNG containing sixteen horizontal
64 × 64 cells; unused cells remain reserved. The seven roles are `age`, `detail`,
`facialHair`, `eyes`, `brows`, `mouth` and `iris`. They sit on shallow contour-following
head-weighted surfaces with controlled 0.32 mm layer separation. Authored UVs span
one cell, and the per-character texture instance selects its variant. Preserve
the stable cell order in `scripts/character_components/face_atlas.py` and
`packages/content/src/character-face-options.ts`; do not reorder saved option IDs.
Keep nearest sampling, transparent pixels and alpha-test behavior intact. Do not
replace the entire face with a floating opaque rectangle or share mutable variant
offsets between characters. Facial source art is not sampled into these textures.

Hair uses continuous directional primary locks, unequal secondary crown steps
and short stepped tips. The exported visible surface is an exact native Blender
union; the hidden original editable lock inputs remain in the source. Retain
those inputs and the closed scalp fill when changing a style. Do not return to
uniform full-height horizontal courses, disconnected blocks or black open crown
slots. Small bevels preserve the stepped silhouette. The new material factors
keep brows and facial hair darker than selected hair and tint only the iris rather
than recoloring the dark eye/glint. `pack_faces.py` records a bounded glTF
`baseColorFactor` correction for Blender's omitted Multiply constants; it must
preserve pixels, geometry, UVs, skin, clips and unrelated materials. Native,
unpacked export and packed delivery hashes belong in the revision record.

Run the independent `scripts/character_components/validate_faces.py` against the
chosen immutable delivery, using `--native` and a fresh report filename when a
native preservation comparison is needed. It checks the two base/eight hair GLBs
and combined bundle, bone/clip/component preservation, actual atlas alpha and
nonempty cells, UV bounds, finite normals, normalized weights, standalone/combined
agreement and untouched equipment/below-head geometry. Its explicit export
roundoff allowance is at most 1 µm position and 0.0005 normal-vector drift; do not
describe that as byte-identical geometry. Native preservation is a separate
read-only object/material comparison. Keep a source pose/contact review as well:
numerical rig equivalence alone does not show hair, face layers or equipment
looking correct in walking, sprinting, seating, rifle, pistol and mixed armor.

Capture final assets through the actual renderer at matching scale and lighting,
both bodies, all eight hair silhouettes, front/three-quarter/rear, bare/open-cap/
closed-helmet states, and representative face options. Check close detail plus
256- and 128-pixel output, hair restoration, independent character colors and
atlas states, and r003 gun/helmet/backpack clearance. Record which combinations
were actually seen. Native attempt E received a bounded suitable-style assessment;
final runtime fit, playback and every option must not be inferred from it.
Broader nape planes, tail/braid segmentation and richer hair shadow/highlight
variation remain polish limits. Only explicit owner approval of the exact r009
deliverables can change its final sign-off state.


The final r009 G delivery now has a bounded independent review of all 35 archived
actual-renderer stills, including both bodies/all eight hair styles, sampled fits,
paused clips and 128-/256-pixel output. It also has an actual `createGameUI` Crew
controls review at four viewport sizes; the expanded palette height is measured
before scroll clamping so the last row remains reachable. See the dated final
section of the [r009 review](handoffs/character_faces_r009_reference_review.md)
for exact asset hashes, the fixed scroll defect and remaining acceptance limits.
These checks do not change owner approval state or assert continuous playback.
