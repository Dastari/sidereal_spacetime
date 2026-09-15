# Yellow main-sequence star and authored solar system

Status: Accepted implementation direction, 2026-09-15. Owner scale clarified: existing Pelagic visual radius is the baseline.

Owner requests a native yellow main-sequence star matching S39 `reference/art/stars.png`, animated flares and environmental illumination, followed by replacement of the live celestial layout with a complete system using the reviewed planet and moon library. This authorizes celestial content/authority changes for this task; it does not authorize deleting characters, ships, inventories, stations or historical records. Delivery is through a new PR; merge requires owner instruction.

## Star contract

Preserve exact crop [35,64,462,364] from source SHA256 e2234801d565d7a790edb021a39da5e230258cfac739a545881e010ffa099ba2, with immutable Blender source, validated GLB, captures and per-revision review. Native editable angular golden surface relief, localized dark pits, hot seams and a short irregular corona define the target. Large orbiting rings and long flare-star tentacles are outside the target. Use authored PBR materials and emissive surfaces; bloom must retain readable dark complexes and relief. Animate independently phased anchored authored flare geometry without rebuilding topology. A nearby neutral surface must visibly receive warm illumination.

An independent Astra reviewer compares the exact crop and actual runtime images at matched apparent size, another viewpoint, bloom on/off, and playback frames. Iterate until both reviewers agree the gap is meaningfully closed; record that agreement separately from owner artistic sign-off. Owner explicitly delegated working acceptance to the two agents for this task.

## System contract

Use explicit stable body UUIDs, appearance-to-reviewed-revision mapping, metre-valued f64 positions/radii and explicit parent relationships. All nine reviewed planet families and appropriate reviewed moon variants are available; do not restart approved planet art. Inner volcanic/rocky/desert bodies, temperate/ocean habitable region, gas giants beyond it and outer ice/toxic bodies; crystal placement is authored rather than a claim about real astronomical composition. A surface-to-surface star/innermost-planet gap of 5,400,000 m gives 180 seconds at a constant 30,000 m/s, excluding acceleration. Owner clarifies bodies sit below the ship/galactic plane and their visual sizes suggest greater distance. Preserve Pelagic radius 36 m; yellow star radius 72 m, gas giants radius 54 m. Keep the star and planets below ship cameras with top surfaces below the playable plane; validate top-down and 3D near-plane clearance. These are presentation dimensions, not astronomical physical radii. Preserve the agreed 5,400 km travel gap despite compressed visual sizes. Owner also specifies moon surface gaps of 300–450 km (10–15 seconds at30km/s). No claim of astrophysical realism for compressed distances or invented thermal chemistry. Do not introduce N-body orbital simulation incidentally.

Place the system relative to existing ships safely; never relocate player state as an incidental seed change. Preserve unrelated asteroids and stations. Audit live celestial rows before a guarded transaction replaces only the expected old celestial set. Validate seed revision/hash, operation identity, replacement descriptors and spatial bounds before mutation. Update canonical seed and migration consistently, with idempotent receipts; unexpected or partially migrated state fails closed. Snapshot celestial rows for recovery; recovery is a separately validated operation rather than database reset.

## Runtime and failure handling

Use existing reviewed worker registration, verified asset hashes, shared per-body materials and retained LOD cache. Projected size follows the camera, including Map -> Observe. Build ahead, keep old node visible until replacement textures/meshes/material variants are ready, then publish in one frame. Bound registrations and concurrent build/upload work; dispose out-of-range bodies through ownership-aware cancellation. Stage exact reviewed assets for the real client through managed publication. Far stars must remain visible at system travel distances without uploading every planet on startup. Preserve body metadata roles and placement mappings.

Failed asset/hash/worker builds retain the previous visible node and expose retryable failure. Superseded selection cancels and releases owned work without touching the new selection. Unexpected database seed/hash or collision with existing body IDs aborts migration without partial writes. Failed deployment leaves the previous release available. Lighting and shadows respect F3 switches, including zero actual sun-map work with Lighting Off.

## Validation and delivery

Native asset validation; NullEngine tests for flare updates, illumination switch behavior, identity, pending-node swap/LOD retention and cancellation; layout travel-time/radius/parent separation tests; isolated authority migration tests proving unchanged player/ship rows and idempotence. Run npm run check, npm run build and isolated npm run smoke for authority changes. Record pre-existing unrelated failures explicitly. Review actual game Flight and Map Observe, distant star and nearby illuminated geometry, LOD approach and flame playback. Preserve screenshot/JSON evidence under output/playwright/render-plan/yellow-star-system/. Hardware timings state GPU/resolution; SwiftShader proves functionality/counts only. One heavy Blender/browser/test process at a time to avoid prior OOMs.

## ADR: Native fixed-topology star, existing reviewed planet runtime

Accepted 2026-09-15. Export authored PBR star geometry and animate bounded authored flare nodes, sharing materials where state permits. Reuse reviewed planet workers/caches rather than a second generator or synchronous body creation. This preserves source surfaces and existing LOD lifetime guarantees, at the cost of maintaining explicit asset descriptors and a small animation controller. A shader replacing the star's native surface and rebuilding geometry per frame were rejected because they discard the authored relief or reintroduce stalls.

## ADR: Explicit migration rather than changing seed on login

Accepted 2026-09-15. Replace celestial state through a trusted guarded migration, then use the matching seed for new systems. Existing ensureCanonicalSystem deliberately rejects changed hashes; weakening it or resetting the database would risk unrelated live state. This requires an isolated migration smoke test and deliberate managed world publication.

## Native-star working acceptance — 2026-09-15

Root and independent gpt-6-astra reviewer agree r007 is a good reference match; stop art iteration. Actual browser front/alternate views, bloom off, timed flare frames, six-second WebM and matching warm-light on/off probe captures are retained. The optically thin corona is one fixed additive quad outside the native PBR disk, supplementing instanced authored flares. No native surface shader replacement. Software review counted63 draws,358 flare primitive instances,180 independently phased flare nodes. No hardware timing claim. Whole-project checks hit existing missing debug-collision-geometry/scene-material-registration modules; isolated star NullEngine tests3/3 pass. Real-game system integration remains pending.

Art ledger generation also attempted: upstream `scripts/art_library/profiles.py` is missing. Canonical new reference/design JSON and immutable revision evidence are preserved; generated global index refresh awaits that existing helper.

## Genesis star integration — 2026-09-15

Genesis `/planets` now selects the same r007 Yellow Main Sequence Star runtime used by the system integration. Its native PBR surface, 180 independently animated flares and bounded corona preserve the accepted appearance; an independent Astra review passed the actual Genesis capture. Star selection hides composition controls and explains fixed authored detail; planet selection restores composition controls and planetary illumination. Selection keeps the previous body until the next is ready. Asset loading verifies the pinned SHA256 and supports cancellation, including late container cleanup.

The managed public Genesis source preview has the changes staged with a private per-file hash manifest at `.runtime/releases/yellow-star-genesis/source-stage.json`. This staging changes no world rows. Focused NullEngine tests for star runtime, selection publication and illumination restoration: 7/7 pass. `npm run check` was rerun and remains blocked by upstream missing `debug-collision-geometry` and `scene-material-registration`; `npm run build` passes world TypeScript checking, then cannot find this isolated checkout's managed Spacetime CLI. Browser evidence is under `output/playwright/render-plan/yellow-star-system/genesis/`; local Chromium uses SwiftShader and provides no hardware timing acceptance. The shared GPU preview reports hidden.

The authored 29-celestial-body system and guarded authority migration are implemented locally and have 39 focused passing tests, but are not yet published. The live read-only audit found the expected original sixteen bodies, two ships and no legacy private-world bodies. Live authority includes changes from the open IFCS branch; deployment must preserve that source/schema baseline. Shared asset packaging, runtime integration review and isolated database smoke remain required before world publication.

Browser round-trip passed: star → Rocky Moon → star, both ready with no pending builds; moon composition control restored, star composition control hidden, r007 asset hash verified and 180 flare nodes active. Final screenshot and JSON saved in the Genesis evidence directory.

## ADR: Shared reviewed celestial asset source — 2026-09-15

Store the exact reviewed public payloads under `assets/reviewed-celestials/`, separate from private source/reference artwork and generic runtime assets. Each application's preparation command independently stages its own `/reviewed-planets/` and `/reviewed-stars/` directories from this shared versioned source. Preserve payload bytes, public URL contracts and catalog hashes. Neither app imports, builds or reads the other's source/public directory. Packaging tests verify stale output removal, exact bytes and sibling-app isolation.
