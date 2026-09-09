# Native airlock client integration — 2026-09-10

Source integration is complete against world checkpoint `f9731b30`. This is the exact isolated external-airlock fixture, not yet a normal Wayfarer installation or a powered pump. Public release remains the matched native starter `a962f39a` / `2f5c1bd4` until the next coordinated publication.

## Applied behavior

The normal private subscriptions include keyed `ownNativeAirlocks`. Authored instance loading selects the exact fixed-room compiler, validates instance/deck and GLB hashes, and loads all70 native placements including two physical door leaves and four gasket pieces. Accepted door fractions and separately accepted gasket travel drive the native renderer. TAB changes roof/cutaway presentation only.

Manual service controls use server-projected approach eligibility. Each operation supplies the current visit and the selected **door** revision, not the independent airlock status revision. A stopped partial operation can resume; reaching zero hinge angle does not claim a seated seal until gasket travel also reaches zero. Pressure/interlock/lease/reach checks remain server-owned. The UI reports the actual initial vacuum and absence of a powered pump.

A permanent native starter retains a construction location. In query-gated review mode it offers other permitted review targets; only a temporary target visit offers Return. Returning restores the server-saved native home visit without showing a false return action there. Normal gameplay airlock controls do not require a review query.

## Actual browser acceptance

Named session `airlock-browser-review`, HTTPS development client on8444, isolated database `sidereal-spacetime-dev-native-airlock-r0001-smoke`, ordinary Dastari provider actor `283b70b4-4ef2-4f29-8493-8f54ca405c4d`. Read-only observation hooks exposed accepted rows and Babylon state; movement used keyboard events and operations used the actual UI. No client transforms, inventories, pressure or door fractions were written.

Evidence under `output/playwright/airlock-browser-review/`:

- `state.json` / `initial.png`: interrupted inner leaf at5%, gasket retracted; exact66 ordinary placement nodes plus four gasket placements and two physical hinges loaded without errors.
- `resume.json`: actual Resume closing button completed the previously interrupted operation and seated its seal.
- `cycle.json`, `exterior-landing.png`, `returned-interior.png`: open outer door, ordinary WASD to the supported exterior landing nearX7, close/reopen, walk back through chamber, close outer, open inner, walk to interior nearX1, close inner. Both final fractions/gaskets zero; walking datum0.1875m; no gas created.
- `return.json`: original native starter membership restored and all seven item UUID/container/slot/rotation records unchanged. Permitted review targets remain available; false Return button absent at home.
- `open-roof.json`, `open-hinge.png`, `roof-view.png`: reentry through the real review button, accepted full-open inner leaf equals−π/2 physical hinge rotation,12 roof placements hidden in interior and enabled after TAB. Door was closed again before return.
- `finish.json`: returned home, signed out, blanked and closed the named browser. Temporary administrator role and specialist sessions were separately revoked; ordinary workspace grants retained only until their bounded expiry.

The parent opened and inspected the actual PNGs. Exterior-landing camera occludes the character behind the closed door; accepted position/support and the complete keyboard journey provide the traversal evidence. Swiftshader with manually stepped RAF is visual evidence, not a hardware FPS benchmark. Console warnings were screenshot ReadPixels stalls; no application errors.

The prior specialist's overlapping-socket close timeout is retained as an inconclusive concurrency observation. Browser explicit resume passed; do not attribute the prior timeout conclusively without a controlled reproduction. Independent provider two-instance/interlock, disconnect/grant-loss and no-write-idle evidence remains in the authority handoff.

## Validation and remaining work

- Focused native-render and construction-presentation tests:9passed across3files.
- Full `npm run check`:1,159tests across193files plus76document/provenance checks passed.
- Combined `npm run build` and `npm run art:check` passed through the authority owner against these working client changes.
- Exact standalone airlock authority/provider journeys passed in the isolated database. No public update or database reset performed by this client checkpoint.

Next: complete the Wayfarer inlet and actual roof/sealing qualification, then attach through a validated template/refit. Implement powered pumping from conserved resources through the systems layer. This fixture does not establish a breathable whole ship, generic arbitrary airlocks, physical boarding of another moving ship, or final art approval.
