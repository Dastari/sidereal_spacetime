# crew.base-and-outfits

**Replacement model direction:** author Blender meshes and materials; TypeScript voxel-solid art is being phased out. Preserve authored visual surfaces and keep required gameplay proxies separate. Read [the migration contract](../../../../docs/blender_asset_migration.md) and [workflow](../../WORKFLOW.md).

Stable asset UUID: `7f873c10-6098-5b4f-9175-57ac366d0248`

Current design revision: **r009**. State: **awaiting-owner**. Owner final sign-off for current revision: **NO**.

Modular r009 heads/hair/face layers live in normal game; exact G native/export and actual public menu/portrait/save/reload evidence recorded. Remaining facial-sheet silhouettes/accessories remain explicit study queues. Final owner approval pending.

[Canonical machine-readable ledger](design.json) · [Agent workflow](../../WORKFLOW.md)

## Revision history

### r000 — reference-only

Reference inventory and provisional scale/gameplay brief

Hypothesis: No reconstruction yet.

Review: No completed review.

No reconstruction, Blender or runtime evidence saved for this revision.

### r001 — changes-requested

Separate all ten archetypes into real equipment components; add modesty-covered male and female bodies and interchangeable hair.

Hypothesis: An unchanged shared rig, explicit coverage regions and per-item palettes allow all armor slots to mix without losing source details or animation compatibility.

Review: {"outcome": "fail", "notes": "Runtime visor visibility failed; fix export collisions and repeat live renderer checks.", "recorded_at": "2026-09-09T03:23:39.772424+00:00"}

- [blender-source](revisions/r001/blender-source.blend) — ea3bc902920acfc940a257842102b6268369b11985fd1cc5b1917ed3a37a0a77; Initial component split; runtime visor naming defect found, superseded by next revision.
- [glb](revisions/r001/glb.glb) — 03b7e3cbb7497c652bf96737f61514f63d8106e5c5a1169d5e63ef147325be4e; Initial component split; runtime visor naming defect found, superseded by next revision.
- [blender-close](revisions/r001/blender-close.png) — 0c31d3fb4e0dd6a3f711bdaa69183b91f35e334acdc846ae97ef658baab8b526; Initial component split; runtime visor naming defect found, superseded by next revision.
- [cutout](revisions/r001/cutout.png) — 731335166d9ca9c2240e30989a1316c8ee1622fb1d05a927bc302c9eb142dd94; Initial component split; runtime visor naming defect found, superseded by next revision.
- [validation](revisions/r001/validation.json) — 78726fd36cd3067dc6ee2d923643052293b88c2e0f302f6100d3850bc803dfaa; Initial component split; runtime visor naming defect found, superseded by next revision.

### r002 — changes-requested

Preserve component IDs during GLB batching; complete actual inventory integration and shared-rig runtime review.

Hypothesis: Explicit component metadata and collision-free export names make every visor independently equipable on both bodies.

Review: {"outcome": "pass", "notes": "r002 resolves the archived r001 visor export identity defect. Original 550 objects are accounted for; 90 separately owned components, two modesty bases and eight hair styles share exact bind matrices and clips. 1,320 animation frames, 450 tests, full build/art checks and isolated authority smoke pass. Both-direction pointer drags use real subscribed inventory. Native/Blender images, 120 fitting views plus rear hair view, source recipe and captures retained. Four existing crate identities and contents survive; normal distribution 26/26/18/20. The delivery is idempotent and defers insufficient capacity without blocking entry. Every possible cross-set clip fit is not exhaustively proven. Owner final art review remains pending.", "recorded_at": "2026-09-09T04:14:59.062345+00:00"}

- [blender-source](revisions/r002/blender-source.blend) — b88d9663436c8bf203332efd59f69d7e427e3d8c02f85f683fb482104f76e110;
- [glb](revisions/r002/glb.glb) — 4ba601aeec697b80ffa468d6f8be0f74f0666ab6715937ef7e6775a58b2b1555;
- [cutout](revisions/r002/cutout.png) — d5cb67a268006ff1aa4558acd504983aeebf0338a9b90fecef6603088342a372;
- [blender-close](revisions/r002/blender-close.png) — c85fe4380784476c1fe34caff1a27325a0625c119d90a22ba6f0ab578ccffb4b;
- [blender-top](revisions/r002/blender-top.png) — 340c65d491514758807e2fac010789aa1e2b03daa769a87af6ed35ec605a6678;
- [runtime-close](revisions/r002/runtime-close.png) — 5025b4e9a727723ee820d8f1b3c1b8ea73a90d811569a7b99b2a2a996ca4b7fc;
- [runtime-top](revisions/r002/runtime-top.png) — a4692efd1a99df4e528d6acf8090328584d7cc4be97d3029309f3dacef9145f5;
- [runtime-back](revisions/r002/runtime-back.png) — 48b08ad98edabcf94ab6e3a6a0babc438d7e8fcfb0daec3d9816af5c927268ed;
- [ui-desktop](revisions/r002/ui-desktop.png) — b3ab97355ee189ccdcdfc8d61429a6b27f382aa9873865976998d5802a7ad0a2;
- [ui-small](revisions/r002/ui-small.png) — ae9b7fef2ffc7da3db880e5ab58276e450cb4b68d243d34d080cfc6dce774218;
- [validation](revisions/r002/validation.json) — f50b82df588ff3430f6b319f83aedaa1ac93cfb149d4878bfc6de40c70e8be07;
- [capture-record](revisions/r002/capture-record.json) — bb521e670011d26fcb640b3ff93586630c7013df70465cf0791dc0333189a77b;
- [recipe](revisions/r002/recipe.zip) — eabf741837251a93fd7b26588efacbfa21f25c55ae9e28a8d9e55433b8a12592;
- [specification](revisions/r002/specification.md) — 93ae4decdd877517ae084ef5e0498c9aabd0d77ce7643ce6c88c141e361d41cf;

### r003 — changes-requested

Focused reference calibration of male/female bases, swept/crest/ponytail hair and medic armor, plus a distinct open-comms draft.

Hypothesis: Taller dark eyes, restrained facial features, directional stepped hair, a tailored layered white/red medic suit and distinct open comms will close the visual gaps identified by the independent Astra stage-1 review while preserving the shared rig and existing item IDs.

Review: {"outcome": "fail", "notes": "Independent Astra stage2: face and static unisex variants improve, but hair has a tiled crown, segmented curtain, bald rear scalp and straight tail. Shoulder/sleeve/gauntlet envelope is too broad. Correct helmet red forehead field/white cross and skin gaps at optical edges. Preserve head/rig scale. Clear progress, not a stalled iteration. See archived stage2-review.md.", "recorded_at": "2026-09-09T05:00:33.812701+00:00"}

- [blender-source](revisions/r003/blender-source.blend) — 1f581eb62dc2c181b95e92c007c52e203e1e3671e1fdc5c55f8394193caf5398;
- [glb](revisions/r003/glb.glb) — 9f8ac9c0591345172f576b4ea83b7e117abe9fd856547c98e77098e10c3e1a0e;
- [cutout](revisions/r003/cutout.png) — 335572bb77c383f89b89187d810b575e226f8b49469ba00394c7384af3980695;
- [blender-close](revisions/r003/blender-close.png) — 51a5f6a9ec263eb2d8444de7bc30e186228e5790ea73a50ce3b488bffcd060db;
- [blender-top](revisions/r003/blender-top.png) — df6d52e1fba4cf29ad460f3f71652d8357c7bd23def900b208755df7e8d1311e;
- [validation](revisions/r003/validation.json) — 3574679b70ed124e4551bccbe32fa849e0aa52b1e3b24df616fcc81e42a08e55;

### r004 — changes-requested

Correct r003 hair direction/nape/tail, slim armor limbs and fix sealed helmet badge/optical gaskets.

Hypothesis: Tapered asymmetric locks with a visible near-side arcing tail, complete nape cap, slimmer separate limb shells and closed dark optical borders address the independent reviewer failures without changing accepted face or rig scale.

Review: {"outcome": "fail", "notes": "Independent Astra: silhouette, face, armor and variants pass for authored advancement; hair gaps and isolated ponytail studs still fail. Runtime gates reserved. No owner approval.", "recorded_at": "2026-09-09T05:11:00.674527+00:00"}

- [blender-source](revisions/r004/blender-source.blend) — 8553fedc09c3328396a5573e847f98d17da99dc61d5af23de3d2b85df9fc69dd;
- [glb](revisions/r004/glb.glb) — 29b9e560b909d8e709a1e87ae374613f6c9ce3b8ecb7671f0cfafb85c6fb8737;
- [cutout](revisions/r004/cutout.png) — b6e410959b45f37e1fcdb39dbbe539dd3391bd38d78bfa1d87c32f27d162ad24;
- [blender-close](revisions/r004/blender-close.png) — 32c46ad067459f041e77e043432b811fb3d27886a3299544a61b9f6656457cc0;
- [blender-top](revisions/r004/blender-top.png) — 3af143bca5fd3942cf942948290b62bda6201ac4e34b05d9f6731fda72bdb4cc;
- [validation](revisions/r004/validation.json) — c4b0cc6f53c12122a69946a436dd0e782dfe97ebafa8711753334adbc3ecac54;

### r005 — changes-requested

Close crown/nape/side joins and turn ponytail studs into uninterrupted offset lock ribbons.

Hypothesis: Continuous underlying cap and tapered lock ribbons retain directional hair while removing detached-shell gaps and stud-like blocks.

Review: {"outcome": "fail", "notes": "Independent Astra: rear seam and ponytail studs resolved, but upper corner/root voids remain. Other authored gates retained. Correct locally; runtime still pending.", "recorded_at": "2026-09-09T05:14:14.470780+00:00"}

- [blender-source](revisions/r005/blender-source.blend) — dc6d1717cdec349e3dc5d578c1fcfce0e6337185f9526c7aab09905e26867ece;
- [glb](revisions/r005/glb.glb) — c0637b8325e04200d2b54ef563042cfc67bc107d7118c1cb9c7d5091492ab378;
- [cutout](revisions/r005/cutout.png) — 34c0363a6c937027f729c27fdddd448e57cde8925cff822924405d9c117c7a5c;
- [blender-close](revisions/r005/blender-close.png) — d15397a80cc73030c5d84718d9bc237a16490b5b5280aac5463968a11471a274;
- [blender-top](revisions/r005/blender-top.png) — 085d3e7a991ac305c43da5e3bcd9903d6a8cbf45045fea401b0c000c461180b6;
- [validation](revisions/r005/validation.json) — 1c69f4a1ea7b27486e86d3a28cdbc2174ee2b4e10ee923852974d842506fe033;

### r006 — changes-requested

Close remaining hair corner openings and inset ponytail ribbon root caps.

Hypothesis: A wider closed support cap under decorative locks and recessed overlapping root caps remove actual openings while retaining the reviewed silhouette.

Review: {"outcome": "fail", "notes": "Independent Astra runtime checkpoint: face, armor and small-size readability pass; closed hair support creates a projecting hat-like rim. Correct locally. Browser Reference pose was ineffective Idle diagnostic; real named clips work. Production paper-doll pending.", "recorded_at": "2026-09-09T05:21:41.598102+00:00"}

- [blender-source](revisions/r006/blender-source.blend) — acca8d18774cebd961b47748975622215aec0f5df9c4617e2cf893cb5e3bdf5a;
- [glb](revisions/r006/glb.glb) — c3a9206dffed3de58f8d1eb7e2fa9ade31648a8bfe3a701e606cad66bd342420;
- [cutout](revisions/r006/cutout.png) — 76270d0ece49ead888443d9cfb4c752154f977b447e649a8733ce27342450a89;
- [blender-close](revisions/r006/blender-close.png) — 570bed15e83fc787838fd85a84973199d7bc06668ebe9dc3f718a20b2219c914;
- [blender-top](revisions/r006/blender-top.png) — c85fb3bc9a3b4a9421e950f5c16462d9506be68486ec6a8963557f6dafa6b456;
- [validation](revisions/r006/validation.json) — fe8caa8eb97eae68554a6f7ec734788ee0a5797d91cd835940114364495a99f3;

### r007 — changes-requested

Inset supporting hair cap and extend overlapping nape/temple roots.

Hypothesis: Coverage from the visible lock roots should close joins while leaving the hidden supporting cap inside the hair envelope.

Review: {"outcome": "fail", "notes": "Local visual diagnostic: inset support removes projecting brim but leaves speckled/dark intersection rectangles. Independent Astra recommends evaluating an exact native surface union, preserving inputs; no acceptance yet.", "recorded_at": "2026-09-09T05:23:42.812737+00:00"}

- [blender-source](revisions/r007/blender-source.blend) — afdf198c5d7227aff877034ba5bbe49ed6a3fd8d8c42810d2f4f9e9ff1afd631;
- [glb](revisions/r007/glb.glb) — b4bd1560317f748196d179fa127cc69b1aeb386e058be4450d7ed80eb5660932;
- [cutout](revisions/r007/cutout.png) — b04d4161044f8afedd9995f0d78cc6626baf866fc975df0994195aee7df21be1;
- [blender-close](revisions/r007/blender-close.png) — f7e10e71c36bcbc1427b0d808eead118b177f3ac8311892228b40d56e556af9c;
- [blender-top](revisions/r007/blender-top.png) — 1d5ce1e3fec64cea109458fedf8c43c88da999026dc59b3fabf624f39b3e08f8;
- [validation](revisions/r007/validation.json) — 5a87352af0f9fdc5a8d1ef591cd821b1ca679319104f29f406ae1612e9beff61;

### r008 — awaiting-owner

Resolve hair/support intersections using exact native Boolean union; preserve all editable lock inputs.

Hypothesis: Union removes internal coplanar faces while retaining authored silhouette and material surfaces; actual normal/clay and runtime review must decide success.

Review: {"outcome": "pass", "notes": "Independent Astra stage4 passes A–G as a suitable focused calibration: two modesty bases, three hair styles, nine medic pieces and separate proposed unisex comms. Exact native union resolves hair defects. Actual both-body Blender/Babylon/128/256px/mixed/production-paper-doll evidence;16 GLBs,90 contracts,16 binds,12 clips and288 states/1440 frames verified. Final project489 tests/107 files, build/art/library/focused TS pass. See stage4-review.md. Sampling is not exhaustive; finer hair/helmet and light balance remain owner refinements. Other archetypes and inventory icons remain r002; comms has no inventory definition; no live publication or owner final approval.", "recorded_at": "2026-09-09T05:38:35.174982+00:00"}

- [blender-source](revisions/r008/blender-source.blend) — 6b17eab686f9c82c67f7dd87a6b460e9c0311f29d954e43728cf93d875157f61;
- [glb](revisions/r008/glb.glb) — ae4a7e12096bd9aaac0bdfb178354d899b89af15cbc20293815c301871694150;
- [cutout](revisions/r008/cutout.png) — a7a29efc6e656b7046228b674a02166d5dbf00e4851b0c0d1e2dd79dcadf73a2;
- [blender-close](revisions/r008/blender-close.png) — 0d05d4c422fc1c75f5ffc67afda6aa03d69ee61cf368d6fcb1963641bae03245;
- [blender-top](revisions/r008/blender-top.png) — a35cde4f2f1962ec1d79ffb9c225169ba6caea18a2fdf620fd5c77a746757425;
- [runtime-close](revisions/r008/runtime-close.png) — ad11d70f174a9663e4d087838e3119db7a78ad4f4214a6a59f5e04b745c63112;
- [runtime-top](revisions/r008/runtime-top.png) — 5cb43940d2ed6661d78ad6464a02f31908d9221d1a27705b103866d765d2d1fd;
- [runtime-back](revisions/r008/runtime-back.png) — 36a4d1e43ff2205c2f8323757a1850324ac10394f5fa124a4e6ae9bc56b697c3;
- [ui-desktop](revisions/r008/ui-desktop.png) — e6f2023738e2e54c93b9d0821bd867f1c9455ab2a4011351b0c0dad3e51e4bb0;
- [ui-small](revisions/r008/ui-small.png) — 0ba44ddebe41c76a711d4920897cf7e2363a040191ed764b84f6508ebc9d7fd5;
- [validation](revisions/r008/validation.json) — 9d3160604f51da3a7e0447355db92bced91e2937525647e4be2ac97ad462ea73;
- [capture-record](revisions/r008/capture-record.json) — b8dc3117829ae3e43cb280fcc3976ebbd5a0a3fb2d8ac347ccd645783d79106a;
- [recipe](revisions/r008/recipe.zip) — 83660879d9152e730b35b69396aa8b95852cb0bb1b44b6f5c5d329a770f84af8;
- [specification](revisions/r008/specification.md) — 9d7f9e66332443ec7af311c06a43a70edfba9b2d9d11d72a46c2273333b339a5;
- [build-log](revisions/r008/build-log.txt) — 72fb5a3bf4e41b750f7d19b224e5761590e64630134ca258c08131a5d5729b4e;
- [runtime-context](revisions/r008/runtime-context.png) — 6e99c5c79cfa903b0a4cfa0ecba1544ff226116a62686ca6b8bb50207095db63;

### r009 — awaiting-owner

Reference-led native head/hair and layered facial textures; neon hair palette and persisted face options.

Hypothesis: Directional stepped locks, narrower female cheek/jaw planes and independently selectable pixel face layers produce reference detail at shared-rig game scale.

Review: {"outcome": "pass", "notes": "Independent Astra final G and real Crew UI review pass the bounded delivered head/hair/facial scope. 169 native/export checks and eight closed/manifold hair surfaces pass; actual both-body/all-eight-hair/mixed-equipment/helmet-restoration/paused-clip browser evidence is retained. New neon palette and all face controls are reachable at four viewport sizes. Runtime installed r009 locally; public combined rollout pending. Additional reference hairstyles/accessories and nape/tail/value polish remain tracked; new r009 owner final approval is pending.", "recorded_at": "2026-09-10T03:36:28.463477+00:00"}

- [blender-source](revisions/r009/final-delivery/blender-source.blend) — d48a56102afb03cbc9b7fb1990054f28f9b1bc808d3f26c98cb6a8d4f4d48334;
- [glb](revisions/r009/final-delivery/modular-crew.glb) — 7c7de06aec3e9482d786fb72723ff36675c170cf94b0fc38046fa806de64f89a;
- [cutout](revisions/r009/final-delivery/base-female.png) — c3891dcf30fbf4f7f379e2af0c48328ee9cf8d9f3b7137ace5e23defef1bc14f;
- [blender-close](revisions/r009/final-delivery/hair-bob.png) — 53d6716a3e0ca3f2986aa89b51d3869336588a2733054301997decb976b754cc;
- [runtime-close](revisions/r009/final-delivery/runtime/final-female-bob.png) — 57f525bc421ff0c0ce0a749a656393bbabd0ef3a0741811ed4222614e43109fd;
- [runtime-top](revisions/r009/final-delivery/runtime/final-female-bob-runtime-top.png) — 7523e901507165bec64e301ba278bfda4f96554a9ef4c8b51060565ca2cd9eaf;
- [runtime-back](revisions/r009/final-delivery/runtime/final-female-bob-runtime-rear.png) — 8640c4582d894533bfc16567738a25335927412f7a03d15fc8e3b1700ef05f49;
- [runtime-context](revisions/r009/final-delivery/runtime/final-female-mixed-fit.png) — c7823a96d0f607a0485b47641aa53330e636cae0cdaa419661556cc6b49cc8ce;
- [ui-desktop](revisions/r009/final-delivery/runtime/crew-ui-1280-bottom.png) — 4c523df9d6f6bf9aa3d1f9a9be0865f001326132d8597cedb0f83fe7d162400f;
- [ui-small](revisions/r009/final-delivery/runtime/crew-ui-390-bottom.png) — 5ead4d5f16a3429a18cbf075757179fba32382e6dfe1c0ce00a723acd770918f;
- [validation](revisions/r009/final-delivery/final-validation.json) — 7df79b9ebd4962ef271c75d9208185e420ff680e2aab7170decff77b71435a51;
- [validation](revisions/r009/final-delivery/hair-topology-validation.json) — d108d2034ebb86d36f44ba4e82e3741a089b366b401e3bd67833ed06501c20b0;
- [capture-record](revisions/r009/final-delivery/runtime/capture-record.json) — 7dba91a3ade2948748eef9fdf107e2bd4eac11fd598008d1794ef896cb8520e1;
- [capture-record](revisions/r009/final-delivery/runtime/supplemental-capture-record.json) — fc866ae377945330343497ff4be6a445ad559fc53dcad58851bdd6242f332b18;
- [recipe](revisions/r009/final-delivery/authoring/generator.py) — 3382be506523e56ecb99a4f697982ea6d3d8f634dc3ed675b5de671d48a20fdd;
- [recipe](revisions/r009/final-delivery/authoring/face_atlas.py) — 605d75d7e0ac4c1fd47705937fab49af711111032bdd2de8f4bf72f31cd267c5;
- [recipe](revisions/r009/final-delivery/repair-script-used.py) — 34bb2891e1dc85229b94acfbed60d71fb32a0aa1da52ccb33804864040ebb74b;
- [recipe](revisions/r009/final-delivery/pack_faces.py) — 91628e4a35eaa0f4a3ac3b541291bc8daaca4a4157a4bd6aa93d9f233ffc70c0;
- [runtime-close](revisions/r009/live-release-20260910/character-neon-female-ready.jpg) — 2331f0c7fad5837a618c3619efdb19b816f67c9950110caf868f4f251131b994; Actual public e1/fdd r009 cosmetic review; backpack native-drop follow-up separately tracked.
- [validation](revisions/r009/live-release-20260910/initial-public-browser-review.json) — 260b03b03f5e24dae9d3eda0841386b065aa357e692be56811c90e6c17c320f3; Actual public e1/fdd r009 cosmetic review; backpack native-drop follow-up separately tracked.
- [validation](revisions/r009/live-release-20260910/independent-live-review.json) — e0d8b2c6481851900a0f0bf3c7ee90b7e4d63bcc5c35d575a3685f532aff9867; Actual public e1/fdd r009 cosmetic review; backpack native-drop follow-up separately tracked.
- [capture-record](revisions/r009/live-release-20260910/native-public-browser-review.json) — 86df793bd9a0a26974e0c59ae0c135605850cdbf2aec1ab19ac10adcc18829c6; Final matched b3d/8afe normal publication preserves exact r009 models and paired r003 assets; recovered/fresh native backpack drop and pickup verified.

## Feedback and approvals

```json
{
  "feedback": [
    {
      "revision": 1,
      "author": "agent",
      "text": "Native split and bind/clip validation passed. Runtime review found Blender numeric name collisions on medic, pilot and salvage visor exports, hiding them. Preserve this attempt; fix exported names and resolve explicit component metadata before acceptance.",
      "message_reference": null,
      "recorded_at": "2026-09-09T03:23:39.575623+00:00",
      "resolved_by_revision": 2
    },
    {
      "revision": 2,
      "author": "owner",
      "text": "Add all the uniform sets across the 4 storage containers that are in the ship already. And fix it so we can drag and drop from inventory onto paper doll etc..",
      "message_reference": "Owner message in the 2026-09-09 character-component conversation, beginning: Add all the uniform sets across the 4 storage containers",
      "recorded_at": "2026-09-09T04:14:58.763548+00:00",
      "resolved_by_revision": 2
    },
    {
      "revision": 2,
      "author": "owner",
      "text": "Everything looks good, but develop the characters and armor to closely match characters-weapons-items.png and characters-weapons-items-female.png. Perform detailed comparison, a focused model/armor test, authoring guide updates and independent Astra comparison at each stage.",
      "message_reference": "Owner follow-up in this character art task on 2026-09-09, accompanied by screenshot ending 622b1b0e8c20.png; this is a scoped paraphrase, not final sign-off.",
      "recorded_at": "2026-09-09T04:35:15.617445+00:00",
      "resolved_by_revision": null
    },
    {
      "revision": 9,
      "author": "owner",
      "text": "Add more hair colors including neon; more facial updates, higher head detail and slightly thinner female head. Compare characters-facial-assets.png and improve voxelated hair fidelity.",
      "message_reference": "Owner facial-reference request in this conversation, 2026-09-10; paraphrase, exact request retained in conversation.",
      "recorded_at": "2026-09-10T02:58:43.588277+00:00",
      "resolved_by_revision": null
    }
  ],
  "approvals": [
    {
      "revision": 8,
      "scope": "Runtime publication of 14 reviewed existing components and their images; not final art sign-off.",
      "owner_quote": "Confrimed that looks a lot bette.r Happy to initiate the swap over.",
      "message_reference": "Owner message in this character reference calibration conversation, following the r008 comparison gallery viewing instructions and before the combat pose integration request, 2026-09-09.",
      "evidence_sha256": {
        "blender-source": "6b17eab686f9c82c67f7dd87a6b460e9c0311f29d954e43728cf93d875157f61",
        "glb": "ae4a7e12096bd9aaac0bdfb178354d899b89af15cbc20293815c301871694150"
      },
      "recorded_at": "2026-09-09T05:56:16.112110+00:00"
    }
  ],
  "owner_final_signoff": null
}
```

## Source appearances and candidate variants

Keep every crop. Similar function does not prove identical geometry; split this family into separate designs when needed. Each approval must state exactly which reference IDs/variants it covers. Historical/baseline appearances can remain comparison-only and do not need reproduction as current target art.

| Reference | Kind | Brief |
| --- | --- | --- |
| [Captain](../../assets/characters-weapons-items--captain/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items--captain/BRIEF.md) |
| [Engineer](../../assets/characters-weapons-items--engineer/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items--engineer/BRIEF.md) |
| [Medic](../../assets/characters-weapons-items--medic/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items--medic/BRIEF.md) |
| [Pilot](../../assets/characters-weapons-items--pilot/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items--pilot/BRIEF.md) |
| [Security officer](../../assets/characters-weapons-items--security-officer/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items--security-officer/BRIEF.md) |
| [Heavy marine](../../assets/characters-weapons-items--heavy-marine/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items--heavy-marine/BRIEF.md) |
| [Salvage tech](../../assets/characters-weapons-items--salvage-tech/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items--salvage-tech/BRIEF.md) |
| [Recon scout](../../assets/characters-weapons-items--recon-scout/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items--recon-scout/BRIEF.md) |
| [Scientist](../../assets/characters-weapons-items--scientist/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items--scientist/BRIEF.md) |
| [Mechanic](../../assets/characters-weapons-items--mechanic/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items--mechanic/BRIEF.md) |
| [Base crew body](../../assets/characters-weapons-items--base-crew-body/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items--base-crew-body/BRIEF.md) |
| [Rig front view](../../assets/characters-weapons-items--rig-front-view/revisions/r000/reference.png) | state | [Scale, stats, recreation](../../assets/characters-weapons-items--rig-front-view/BRIEF.md) |
| [Rig side view](../../assets/characters-weapons-items--rig-side-view/revisions/r000/reference.png) | state | [Scale, stats, recreation](../../assets/characters-weapons-items--rig-side-view/BRIEF.md) |
| [Rig back view](../../assets/characters-weapons-items--rig-back-view/revisions/r000/reference.png) | state | [Scale, stats, recreation](../../assets/characters-weapons-items--rig-back-view/BRIEF.md) |
| [Crew front](../../assets/more-character-customization--crew-front/revisions/r000/reference.png) | state | [Scale, stats, recreation](../../assets/more-character-customization--crew-front/BRIEF.md) |
| [Crew back](../../assets/more-character-customization--crew-back/revisions/r000/reference.png) | state | [Scale, stats, recreation](../../assets/more-character-customization--crew-back/BRIEF.md) |
| [Medic loadout](../../assets/more-character-customization--medic-loadout/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/more-character-customization--medic-loadout/BRIEF.md) |
| [Engineer loadout](../../assets/more-character-customization--engineer-loadout/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/more-character-customization--engineer-loadout/BRIEF.md) |
| [Security loadout](../../assets/more-character-customization--security-loadout/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/more-character-customization--security-loadout/BRIEF.md) |
| [Crew](../../assets/character-animations-2--crew/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/character-animations-2--crew/BRIEF.md) |
| [Engineer](../../assets/character-animations-2--engineer/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/character-animations-2--engineer/BRIEF.md) |
| [Medic](../../assets/character-animations-2--medic/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/character-animations-2--medic/BRIEF.md) |
| [Security](../../assets/character-animations-2--security/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/character-animations-2--security/BRIEF.md) |
| [Pilot](../../assets/character-animations-2--pilot/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/character-animations-2--pilot/BRIEF.md) |
| [Explorer](../../assets/character-animations-2--explorer/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/character-animations-2--explorer/BRIEF.md) |
| [Miner](../../assets/character-animations-2--miner/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/character-animations-2--miner/BRIEF.md) |
| [Scientist](../../assets/character-animations-2--scientist/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/character-animations-2--scientist/BRIEF.md) |
| [Scale astronaut](../../assets/character-animations-2--scale-astronaut/revisions/r000/reference.png) | context | [Scale, stats, recreation](../../assets/character-animations-2--scale-astronaut/BRIEF.md) |
| [Equipped explorer](../../assets/character-animations-2--equipped-explorer/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/character-animations-2--equipped-explorer/BRIEF.md) |
| [Equipped medic](../../assets/character-animations-2--equipped-medic/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/character-animations-2--equipped-medic/BRIEF.md) |
| [Equipped security](../../assets/character-animations-2--equipped-security/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/character-animations-2--equipped-security/BRIEF.md) |
| [Equipped miner](../../assets/character-animations-2--equipped-miner/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/character-animations-2--equipped-miner/BRIEF.md) |
| [Equipped scientist](../../assets/character-animations-2--equipped-scientist/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/character-animations-2--equipped-scientist/BRIEF.md) |
| [Team lineup member 1](../../assets/character-animations-2--team-lineup-member-1/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/character-animations-2--team-lineup-member-1/BRIEF.md) |
| [Team lineup member 2](../../assets/character-animations-2--team-lineup-member-2/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/character-animations-2--team-lineup-member-2/BRIEF.md) |
| [Team lineup member 3](../../assets/character-animations-2--team-lineup-member-3/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/character-animations-2--team-lineup-member-3/BRIEF.md) |
| [Team lineup member 4](../../assets/character-animations-2--team-lineup-member-4/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/character-animations-2--team-lineup-member-4/BRIEF.md) |
| [Team lineup member 5](../../assets/character-animations-2--team-lineup-member-5/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/character-animations-2--team-lineup-member-5/BRIEF.md) |
| [Team lineup member 6](../../assets/character-animations-2--team-lineup-member-6/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/character-animations-2--team-lineup-member-6/BRIEF.md) |
| [Team lineup member 7](../../assets/character-animations-2--team-lineup-member-7/revisions/r000/reference.png) | variant | [Scale, stats, recreation](../../assets/character-animations-2--team-lineup-member-7/BRIEF.md) |
| [Character HUD portrait](../../assets/ui-elements-3--character-hud-portrait/revisions/r000/reference.png) | context | [Scale, stats, recreation](../../assets/ui-elements-3--character-hud-portrait/BRIEF.md) |
| [Vendor H-7 portrait](../../assets/ui-elements-4--vendor-h-7-portrait/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/ui-elements-4--vendor-h-7-portrait/BRIEF.md) |
| [Crew portrait](../../assets/ui-elements-5--crew-portrait/revisions/r000/reference.png) | context | [Scale, stats, recreation](../../assets/ui-elements-5--crew-portrait/BRIEF.md) |
| [Character paper doll](../../assets/ui-elements-5--character-paper-doll/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/ui-elements-5--character-paper-doll/BRIEF.md) |
| [Scale captain](../../assets/exploded-spaceship-view--scale-captain/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/exploded-spaceship-view--scale-captain/BRIEF.md) |
| [Captain scale figure](../../assets/faction-ship-1--captain-scale-figure/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/faction-ship-1--captain-scale-figure/BRIEF.md) |
| [Raider scale crew](../../assets/alien-ship-2--raider-scale-crew/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/alien-ship-2--raider-scale-crew/BRIEF.md) |
| [Captain walking crew](../../assets/fully-complete-constructed-space-ship--captain-walking-crew/revisions/r000/reference.png) | context | [Scale, stats, recreation](../../assets/fully-complete-constructed-space-ship--captain-walking-crew/BRIEF.md) |
| [Airlock crew](../../assets/fully-complete-constructed-space-ship--airlock-crew/revisions/r000/reference.png) | context | [Scale, stats, recreation](../../assets/fully-complete-constructed-space-ship--airlock-crew/BRIEF.md) |
| [Razor pilot](../../assets/small-craft-example-3d--razor-pilot/revisions/r000/reference.png) | context | [Scale, stats, recreation](../../assets/small-craft-example-3d--razor-pilot/BRIEF.md) |
| [Razor overhead pilot](../../assets/small-craft-example-top--razor-overhead-pilot/revisions/r000/reference.png) | context | [Scale, stats, recreation](../../assets/small-craft-example-top--razor-overhead-pilot/BRIEF.md) |
| [Wayfarer standing character](../../assets/3d-rpg-after--wayfarer-standing-character/revisions/r000/reference.png) | context | [Scale, stats, recreation](../../assets/3d-rpg-after--wayfarer-standing-character/BRIEF.md) |
| [Prototype crew](../../assets/3d-rpg-before--prototype-crew/revisions/r000/reference.png) | baseline | [Scale, stats, recreation](../../assets/3d-rpg-before--prototype-crew/BRIEF.md) |
| [Captain](../../assets/characters-weapons-items-female--captain/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items-female--captain/BRIEF.md) |
| [Engineer](../../assets/characters-weapons-items-female--engineer/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items-female--engineer/BRIEF.md) |
| [Medic](../../assets/characters-weapons-items-female--medic/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items-female--medic/BRIEF.md) |
| [Pilot](../../assets/characters-weapons-items-female--pilot/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items-female--pilot/BRIEF.md) |
| [Security officer](../../assets/characters-weapons-items-female--security-officer/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items-female--security-officer/BRIEF.md) |
| [Heavy marine](../../assets/characters-weapons-items-female--heavy-marine/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items-female--heavy-marine/BRIEF.md) |
| [Salvage tech](../../assets/characters-weapons-items-female--salvage-tech/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items-female--salvage-tech/BRIEF.md) |
| [Recon scout](../../assets/characters-weapons-items-female--recon-scout/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items-female--recon-scout/BRIEF.md) |
| [Scientist](../../assets/characters-weapons-items-female--scientist/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items-female--scientist/BRIEF.md) |
| [Mechanic](../../assets/characters-weapons-items-female--mechanic/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items-female--mechanic/BRIEF.md) |
| [Base crew body](../../assets/characters-weapons-items-female--base-crew-body/revisions/r000/reference.png) | object | [Scale, stats, recreation](../../assets/characters-weapons-items-female--base-crew-body/BRIEF.md) |
| [Rig front view](../../assets/characters-weapons-items-female--rig-front-view/revisions/r000/reference.png) | state | [Scale, stats, recreation](../../assets/characters-weapons-items-female--rig-front-view/BRIEF.md) |
| [Rig side view](../../assets/characters-weapons-items-female--rig-side-view/revisions/r000/reference.png) | state | [Scale, stats, recreation](../../assets/characters-weapons-items-female--rig-side-view/BRIEF.md) |
| [Rig back view](../../assets/characters-weapons-items-female--rig-back-view/revisions/r000/reference.png) | state | [Scale, stats, recreation](../../assets/characters-weapons-items-female--rig-back-view/BRIEF.md) |
| [Medic open comms detail](../../assets/characters-weapons-items-female--medic-open-comms-detail/revisions/r000/reference.png) | subassembly | [Scale, stats, recreation](../../assets/characters-weapons-items-female--medic-open-comms-detail/BRIEF.md) |
| [Medic swept fringe and ponytail](../../assets/characters-weapons-items-female--medic-swept-fringe-and-ponytail/revisions/r000/reference.png) | subassembly | [Scale, stats, recreation](../../assets/characters-weapons-items-female--medic-swept-fringe-and-ponytail/BRIEF.md) |
| [Female medic armor detail](../../assets/characters-weapons-items-female--female-medic-armor-detail/revisions/r000/reference.png) | subassembly | [Scale, stats, recreation](../../assets/characters-weapons-items-female--female-medic-armor-detail/BRIEF.md) |
