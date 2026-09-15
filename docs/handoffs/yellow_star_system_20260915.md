# Yellow star and solar-system continuation — 2026-09-15

Branch: `feat/yellow-star-solar-system`; checkout `.runtime/worktrees/yellow-star-system`; PR https://github.com/Dastari/sidereal_spacetime/pull/7. Genesis star commit `34faf63b` is pushed and staged in the canonical public source preview. Owner's newest dashboard request is implemented and browser verified. Native r007 working acceptance from root and independent Astra is complete; do not restart art iteration.

## Verified

- Genesis star → Rocky Moon → star round trip ready, no pending builds; planet seed control restored, star seed control hidden. 180 flare nodes, pinned GLB hash matches. Evidence `output/playwright/render-plan/yellow-star-system/genesis/`.
- Seven focused Genesis/star NullEngine tests pass. Shared asset packaging has four Python tests; exact source payloads moved from dashboard public into `assets/reviewed-celestials/`, with app-independent staging and unchanged URLs/hashes.
- Layout/migration/shared-world/view/physics/net focused tests: 39 pass. New migration and star tests continue to pass after packaging.
- Whole-project check/build run again: upstream missing `debug-collision-geometry.ts` and `scene-material-registration.ts`; worktree lacks managed Spacetime CLI. The two helper files exist on canonical `ifcs-update`, not upstream main. Do not sweep unrelated construction changes into this PR.

## Local work still to finish

Uncommitted solar-system content, server migration, reviewed real-game runtime integration, Lighting Off shadow fix and floating-origin engine settings remain in this worktree. Their presence is not a deployment claim. Review git diff before continuing; do not reset them.

1. Add NullEngine integration tests for `reviewed-system-bodies.ts` pending publication, cancellation, bounded three-body retention and failure retry. Atmosphere compilation now uses cancellable upload lifetime but needs tests. Verify distant-star visibility: ordinary projected-radius admission currently applies even to stars, contrary to the spec's distant-star requirement.
2. Verify far-coordinate Map Observe and normal Flight/Deck with large-world rendering. Preserve camera/selection semantics and F3 switches. Existing legacy ice/volcanic kit loading is still eager; inspect memory before publication.
3. Stage shared exact assets for real client; canonical Genesis presently has prior six files plus preview-lighting helper with hashes in `.runtime/releases/yellow-star-genesis/source-stage.json`. Later asset move affects feature checkout only; canonical public assets remain intact. Verify this manifest before modifying staged source again.
4. Live private read-only audit in canonical `.runtime/releases/yellow-star-system-audit/`: original 16 bodies, canonical seed r001 hash `8a02fde759417e1cf78165dd394093ccb0fef87e34fd4556a8076681d7bb8136`, two ships, two admissions, zero legacy private-world bodies. No live authority mutation has occurred.
5. Live source baseline is canonical `ifcs-update` commit `9c58c07774d7d3c4a58a40c49e90f2a2c647249c`, with 93 world files differing from upstream main. Prepare a deployment integration checkout preserving that authority baseline plus these scoped commits. Compare the saved full live schema before publication; do not deploy an old main world module over IFCS work. No new PR merge authorization exists.
6. Run isolated actual Spacetime smoke using managed commands and a fresh named fixture, verify guarded r001→r002 transaction, receipts, idempotence and unaffected ship/player/inventory state. Publish only after validation, then audit exact replacement 29 celestial + 4 preserved asteroid rows and existing two ships.
7. Update versions for content/world/net/runtime changes, documentation, evidence, commit/push and PR description. Keep hardware timing unmeasured while shared GPU preview is hidden. Current local browser `genesis-star` is SwiftShader; shared public hardware tab reported hidden.

Owner dimensions: Pelagic radius36 m at (-120,210), star72 m, gas54 m, bodies below ship plane, inner surface gap5,400km (180s at30km/s), moon gaps300–450km (10–15s). New JSON has 9 planets,19 moons,1star, stable UUIDs and explicit parent IDs. Preserve all player/ship state. See `docs/specs/yellow-star-solar-system.md` for the accepted contract and current progress.
