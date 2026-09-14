# Wayfarer exterior armor geometry check-in — 2026-09-14

Status: corrected native r004 final-03 passes independent native and exact game-renderer review; ready for owner art review. This is the owner-requested Blender geometry pass, not completion of the larger Shipyard contracts or a new live release.

The owner rejected the previous exterior as the back of the walls rather than dedicated armor. The accepted target is `assets/art-library/hull-voxel-study/wayfarer-layout-concept-r001/proposal.png` (SHA-256 `b53b7e26e6ca1453e19d0a45b7f6291c8f1b33860e873f6648ce7edb0d7d5863`). The correction authors a separate armored shell with stepped navy shoulders and impact rails, pale wrapped ribs, recessed mapped cassettes, broad paired bays, and matching front panels. Small fasteners, seams, markings and shallow relief use color, normal and roughness maps. Large silhouette changes remain geometry.

## Boundaries and ownership

Side modules retain independent 2 m spans, standard 3 m height, existing sockets and outward X in [0, 0.5] m. Two independent members make each broad 4 m visual bay. Quarter-height examples are 0.75, 1.5 and 2.25 m; narrower examples are 1 m and 0.5 m. Features retain physical dimensions instead of stretching a finished mesh. Six bow profiles retain their inherited bounds in `scripts/art_library/armor_cassette_interfaces.json`. ARMOR and LINER are separately addressable export groups; mirrored port variants change UV orientation, not geometry.

Interior wall artwork, engines/thrusters, their placements, plume, collision, pressure, damage and authority are outside this correction. The visual envelope does not replace the gameplay proxy or alter the inward 250 mm structural wall contract. There is no live-state migration or native pin change in this pass.

## Candidate and review

Proof-05 passed independent prototype review after earlier cap/rail overlap was repaired. Complete family final-01 passed dimensional checks but failed independent visual review: cyan lens faces overlapped rail faces, diagonal top-course UVs crossed, the single identity panel omitted the planet emblem, and bumper/cheek terminal returns left the bow open. Its evidence is preserved. Final-02 corrected the four visual issues, but the unchanged triangle validator rejected a bevel sliver on a narrow bumper return. It is retained as a failed export. Final-03 keeps that mating return planar, with chamfered adjacent caps; no validation threshold or envelope is changed.

The real-browser harness imports the exact game construction loader from a frozen source candidate, replaces only private review bindings, and renders a qualified pure fixture. It records source hashes, binding overrides, model hashes, cameras and screenshot hashes. Whole ship, both sides, bow detail, a joined bay, gameplay camera, armor-only, retained structure and exploded views form the evidence set. This is game-renderer evidence; it does not exercise authenticated movement, pressure, damage, publish or refit authority.

## Git and baseline verification

Before code, root recorded HEAD `cd09510ca30705a49bbd38a010d775be30aef0c7`, git status/log -5, the full dirty-file list and native pins under `.runtime/shipyard-completion/armor-geometry-pass-20260914/`. After the memory interruption, another owner's IFCS commit moved shared HEAD to `146c44016dc8da170ba24bf7fa0a0566b2b94c28`; shared work was preserved. The art delivery worktree `/root/wayfarer-armor-pr`, branch `wayfarer-armor-geometry`, is based on upstream main `599d2c7a`. Existing LFS checkout differences are excluded from staging. No merge or direct main push is authorized.

On the untouched upstream baseline, `npm ci --ignore-scripts` and `npm run setup` passed. `npm run check` failed on missing renderer modules `debug-collision-geometry.ts` and `scene-material-registration.ts`, with cascading implicit-any errors. `npm run build` passed world and client compilation, then failed dashboard resolution of the same missing material-registration module. `npm run art:check` failed on missing historical `assets/source/voxel_wayfarer.blend`; a source inventory also found missing `modular_parts.blend`. These are inherited gaps, not new native-pass failures. Do not import unrelated shared code merely to hide them. No authority code changed, so no new authority smoke is claimed.

## Live locations and conservation

The memory incident stopped the browser and managed services. The prior public release and dashboard were restarted using `python3 scripts/dev.py public-client-up` and `up-dashboard`; both public client and Shipyard returned HTTP 200. The database was recovered externally; this art task did not republish it. Blender and browser work are now serialized with four-thread native jobs.

Public client: https://sidereal.dastari.net/ . Shipyard: https://sidereal.tail7a58a6.ts.net:8445/shipyard . Installed public release remains `048e6f35a49fffb161d1361dda21cf5f53e69c1e24f73c978525fe99299c7b88` (`20260914-141801-048e6f35a49f`). The new armor is held in the art library for review. All six entry catalog/interface/visual-binding hashes were rechecked unchanged; public client and Shipyard again returned HTTP 200. Exact receipt: `assets/art-library/framed-wayfarer/r004/delivery-validation/pins-and-live-state.json`.

No reducer, publish, spawn, refit, account deletion or inventory operation was invoked for this pass. This proves the task does not intentionally mutate live ship state; it is not a new transactional conservation test. Existing inventory, crew and other-owner work remain outside the change.

## Open decisions and unsupported work

No new dimensional decision is needed for this correction. Exact revision artistic sign-off remains the owner's decision; proposed default is to review the final native/game evidence before recording it. Current approval of the concept does not approve a later native revision automatically. The native art pass does not qualify arbitrary wall heights, a complete catalog of bespoke engine/thruster mounts, live damage or pressure behavior, authenticated publish/refit, or the remaining multi-deck construction contract. Those gates remain separately tracked in `shipyard_completion_progress.md`.


## Exact candidate acceptance and delivery

Native source `49d7fb868d9572b3886ed102cfce624579128b08bfae56c6a407f33a904346fb`; native manifest `8b03baaf8fabcd181225a8f91e35f85303cd07d458646d968bdd5a863b74e764`; lossless library `7e876ad6a313b918e9497a2dc8cdb36236aa576a14b91c115d4b181b399b80d3`. Files live under `assets/art-library/framed-wayfarer/r004/hull/final-03` and `library-03`. All46models/33640triangles pass strict checks, including39light pockets and two fitted bow contacts. No validator relaxation. Fourteen native images and eight exact game-loader images pass independent review; report `framed-wayfarer/armor-correction-review-20260914/final-03-review.md` (SHA25647f2bc676a286cdd3a606a2bbefdc9727248d77c68c58ce0c2fea66a0bd31971). The full105artifact inventory is adjacent.

The result retains slimmer ribs, sharper planar bow returns, sparser finish and pixelated lettering compared with the concept. These are explicitly exposed for owner review. Bare structure is byte-identical to final-01's same-camera image. Zero page errors,28new placements,0old-hull fallbacks. Image `gameplay.png` is an ordinary-zoom fixture view, not authenticated gameplay. Current artistic sign-off remains null.

All46export bytes are carried in a3.9MB solid archive instead of roughly167MB repeated atlas data. Archive extraction passes the strict validator in the isolated PR checkout. A fresh six-model recipe build there, without the r005runtime catalog, reproduces all six delivered GLB hashes exactly. Required check/build/art runs reproduce the same inherited upstream failures described above. Their receipts are in `r004/delivery-validation`. The native PR includes editable source, maps, exact exports, packer/parity, review helpers, evidence, scoped documentation and a revision receipt. Full canonical ledger/progress were updated in the shared library; prior native attempts remain preserved locally. PR link and final commit will be recorded at delivery.
