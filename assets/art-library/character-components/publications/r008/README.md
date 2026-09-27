# r008 character visual publication

**2026-09-10 owner update:** the owner explicitly approved the currently delivered character and armor art with “I'm happy to confirm all art, you can push all changes to the live game please.” The [bundle approval](owner-approval-20260910.json) pins the exact installed r008 bundle, native source, manifests and all 223 runtime visual files. It includes the 90 delivered inventory component definitions as bundle scope; it does not blanket-approve unrelated canonical reference designs. Technical playback remains separate. The earlier null approval statements below and in immutable receipts describe their original recording date. No backup or publication was performed by the approval-recording task.

Installed in `assets/runtime/crew/components` on 2026-09-09 after the owner viewed
the r008 comparison gallery and said: “Confrimed that looks a lot bette.r Happy to
initiate the swap over.” This authorizes the visual swap; final art sign-off stays
null. [Exact receipt](publication.json) records the conversation context, every
changed file, source hash and previous hash.

The installation replaces two modesty bases, swept/crest/ponytail hair, and all
nine existing medic components, plus their standalone item images. The pack image
uses the reviewed outward view. There are 29 changed runtime files: 14 GLB/PNG
pairs and the combined bundle. The other 86 existing component designs retain
r002. Current revision and installed revision remain separate in the
[component ledger](../../ledger.json).

| Deliverable | SHA-256 |
| --- | --- |
| Native `r008/candidate/blender-source.blend` | `6b17eab686f9c82c67f7dd87a6b460e9c0311f29d954e43728cf93d875157f61` |
| Installed `modular-crew.glb` | `ae4a7e12096bd9aaac0bdfb178354d899b89af15cbc20293815c301871694150` |

All 90 inventory definitions preserve IDs, slots, names, masses, storage grids,
body support, coverage and set membership. The source retains the shared 16-bone
binds and 12 original clips. Only the nine medic visual bounds and visual revision
metadata change in the catalog. New open comms has no inventory definition and is
not issued; its hidden mesh remains in the exact reviewed combined bundle.
Combat pose r002 was separately authorized for normal-game integration after this
visual publication. Its [paired equipment/data publication](../../../designs/crew.animation.aim/publications/r002/README.md)
preserves the installed r008 crew and the canonical equipment files.

The model URL uses `?revision=r008`; changed medic inventory images use the same
visual revision, while unchanged inventory images retain `?revision=r002`.
Normal world and paper-doll loaders share that URL. No authority publication,
item grants or inventory migration is required for this visual swap.

Validation: `python3 scripts/character_components/check_installed.py` checks every
runtime hash, exact native source, publication inputs, rollback hashes, 90 stable
contracts, component visibility nodes, both modesty bases, 16 bones and 12 clips.
Its latest result is [installed-validation.json](installed-validation.json). The
existing component/crew suite passes all 13 tests across two files
([test log](component-tests.log)); focused TypeScript compilation also passes
([compiler log](focused-typecheck.log), empty output with exit code 0).
The archived r008 focused audit validates 16 GLBs and 288 configurations / 1,440
skinned frames. This is sampled fit evidence, not proof of every mixed pose.
Current integrated browser and aggregate release evidence is recorded by the
parent integration task; existing gallery screenshots remain pre-publication
review evidence and are not relabeled as live captures.

Finer hair/helmet contours, knuckle contrast and lighting remain design refinements.
The open-comms inventory definition and the other archetype art passes are still
pending. Nothing in this receipt marks an art revision final.

## Reproduce or roll back

`python3 scripts/character_components/publish_calibration.py` is bounded to these
reviewed hashes and the recorded owner authorization. Repeating it preserves the
existing receipt. It refuses to overwrite a different installation or a previous
publication attempt. Future revisions require their own reviewed publication.

[rollback-r002](rollback-r002/) preserves all 29 overwritten runtime files, the
complete old runtime manifest and content catalog. Unchanged runtime files remain
byte-for-byte present and are listed in the receipt. To perform a deliberate
rollback, validate those hashes, restore the saved files/catalog/manifest, and
record a new rollback event in the living ledger. Do not delete publication
history or reuse r008 to describe different bytes. Update cache revision URLs and
prepare the app's public assets as part of that separate action.
