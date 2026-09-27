# Modular characters and uniform delivery — r002

**Current visual installation: r008 (2026-09-09).** The owner authorized the
reviewed two-base, three-hairstyle and nine-piece medic visual swap. Matching item
images are installed, including the outward pack image. The 90 existing inventory
IDs, slots, masses, grids, owned storage and delivery rules are unchanged. Other
86 existing component designs retain r002; open comms remains unissued. Final art
sign-off remains pending. See [publication and rollback](../../assets/art-library/character-components/publications/r008/README.md).

The r002 notes below preserve the original equipment/authority integration history.

The ten existing archetype looks now assemble from 90 independent inventory items.
The character has nine armor slots plus the existing hand slot. Male and female
modesty-covered bases and eight hair styles share the original 16-bone rig and
all twelve shipped clips. New visuals are editable Blender meshes/materials,
with independently skinned GLBs and transparent item renders. Original imported
`assets/source/crew-astra.blend` and the separate staged combat poses remain intact.

Start future art work at [the individual component index](../../assets/art-library/character-components/INDEX.md)
and follow [the authoring contract](../character_component_authoring.md). Every
entry records revision, evidence, proposed/implemented properties and feedback.
All current final owner sign-offs remain pending. Runtime activation does not
approve an art revision. r001's runtime visor naming failure remains in history;
r002 preserves component IDs through GLB export and runtime visibility selection.

## Equipment and the four existing containers

The one-time delivery fills the original four container UUIDs, expanding their
grids to 14 × 14 while preserving existing cargo positions, contents and nested
storage. The normal initial distribution is:

| Existing container | Complete sets | New pieces |
| --- | --- | --- |
| Storage supply crate | Captain, engineer, medic | 26 |
| Upper storage crate A | Pilot, security, marine | 26 |
| Storage crate B | Salvage, recon | 18 |
| Upper storage crate B | Scientist, mechanic, legacy accessories | 20 |

Occupied cells can shift packing into another existing crate. No extra freestanding
container is created. A private permanent delivery receipt prevents duplication
on reconnect, operation replay or eviction of old command receipts. New characters
receive uniforms with the starter kit; existing characters receive them when
`enterLab` runs again. A character exceeding available capacity or inventory
budgets retains its old inventory and defers delivery. After making room, entering
again or the validated `claimCharacterArmory` reducer retries the fixed delivery.

Drag from carried/reachable inventory onto the corresponding paper-doll slot to
equip or swap. Drag from the paper doll into an available grid cell to unequip.
The server validates ownership, reach, slot, capacity and expected revision.
The UI opens storage and paper doll side by side on suitable desktop widths.
Body/hair selections persist separately and cannot grant equipment. Actual
subscribed equipment IDs control the world character and paper-doll preview.

Armor mass, footprints and backpack storage are implemented lab balance values.
No new defense, profession, oxygen/seal or resistance bonus is implied. Character
sheet sample combat/health numbers from the earlier UI pass remain mock data.
Pairs of boots, gloves and shoulders are one item containing separately weighted
left/right geometry. Not every archetype has every slot in its original design.

## Verification and evidence

- Full typecheck, 450 tests across 100 files, documentation checks and full build.
- Asset publication hashes, all 550 original source objects accounted for,
  normalized weights, exact original bind matrices and animation samples.
- Babylon runtime animation audit: 264 body/look/clip states, 1,320 sampled frames,
  correct component/modesty visibility and finite deformed vertices/sockets.
- Isolated SpacetimeDB smoke: all ten sets on both bodies, mixed equipment,
  private ownership, reach, swaps, replay and reconnect preservation.
- Real Chromium pointer drags in both directions using production Canvas UI,
  the actual character renderer and real private projections/reducers in the
  isolated `sidereal-character-components-review-20260909` database.
- Desktop and 900 × 700 captures, an actual overhead Babylon render, and
  individual runtime fitting images for all 100 components plus twenty complete
  body/outfit combinations. The fitting gallery sets renderer appearance directly;
  ownership is exercised separately by the connected UI and server tests.

The browser review uses an empty background scene to isolate the character/UI
from expensive whole-ship rendering. It runs the managed HTTPS client through a
review route, with local-network access granted to that origin. It is not a
whole-ship performance benchmark. Evidence and exact hashes are archived in
[family r002](../../assets/art-library/designs/crew.base-and-outfits/revisions/r002/).
The development database is updated only with `scripts/dev.py publish`, using
`--delete-data=never`. Refresh/re-enter the ship to execute existing-character
uniform delivery; no owner's account token is used by the review fixture.

A separate whole-library integrity check currently reports pre-existing
`shipyard.structure.roof-kit` non-contiguous history (r001 without r000).
This work does not invent or rewrite that other design's history. Character
source/runtime validation and the required project checks pass independently.

## Next authoring iteration

Choose an unsigned component from its index, inspect its original source links,
current standalone render/GLB and fitting evidence, then start a new per-component
revision. Preserve old evidence. Author against both bodies and the shared joint
centers; check relevant helmets/hair, optical layers, sleeves, paired limbs and
mixed outfits. Integrate the current components into a new combined bundle and
record its source/runtime hashes and actual captures. Append owner feedback with
its real message reference. Only explicit approval of the exact revision and
deliverables can set final sign-off.

## Subsequent reference fidelity calibration

The focused body/hair/medic calibration is tracked separately in
[the living comparison index](../../assets/art-library/character-components/calibration/README.md)
and [the fidelity guide](../character_reference_fidelity.md). Its later candidate
revision was staged during that review. The subsequent owner-authorized r008
visual publication is recorded above. Other archetype sets remain a later design
queue; final owner approvals remain per exact revision.
