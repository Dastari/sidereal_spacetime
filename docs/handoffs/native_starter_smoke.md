# Native starter authority smoke

2026-09-10. Generic smoke now exercises the normal, standing, game-owned authored Wayfarer starter. It does not seed private lab storage, grant authoring access, teleport a character, or install a parallel legacy ship.

## Scope

- Walk the qualified native corridor and threshold to the pilot approach, then acquire the native station using its accepted revision and the current connection's input lease. One monotonic sequence is shared by walking and flight commands on each socket.
- Preserve the two-account canonical rock collision/impulse proof, actual IFCS acceleration, reverse thrust, braking, timeout/coasting, unseated denial and private-table rejection. Telemetry joins fresh fitting UUIDs to the approved source actuator IDs.
- Exercise native swept canopy, jamb, clear central doorway and room partition collision. Closed-loop alignment removes dependence on assuming a fixed number of network-delayed walking ticks. Native pilot exit is at Y=9.375m; the legacy seat-based canopy trajectory is no longer the fixture.
- Preserve sprint activation/displacement, timeout, stale-sequence no-op, seated movement rejection and direct sprint-to-station acquisition reset.
- Verify seven original personal item UUIDs and three personal containers survive kit replay. All four native cargo roots begin empty and have independent container and placement identities. Scoped transfers check reach, item and both container revisions; old personal reducers cannot withdraw shared cargo. Store/take/replay, range loss, equipment displacement, serial bulk and ground-item recovery remain real reducer operations.
- Resolve sofa/light identity through native projections, retain proximity/LOS checks, seating movement blocks, grow-light persistence, combat energy/aim/replay and reconnect assertions.
- Zero authoring grants/drafts/blueprints do not imply zero game-owned interiors. The denial probe admits only the exact durable owned instance/deck/location and continues to reject self-grants, draft publication and unauthorized blueprint spawning.
- Two accounts retain cosmetic, inventory, equipped-item and hotbar snapshots through repeated reconnects. Closing one standing account tab keeps the other connected without inventing a pilot-seat occupancy.

## Explicit coverage boundary

The historical 90-component armory test remains in `scripts/character-components-smoke.ts` for an explicitly prepared legacy fixture. Native game-owned cargo has no corresponding authoritative armory issuance path. Native smoke verifies denial with no writes and both body appearances across reconnect; its result explicitly reports `nativeArmoryIssued: false`, `components: 0`, and the limitation. This is not a claim that all component combinations were exercised on a native starter.

Old long-rifle/heavy-handgun/uniform fixtures and legacy atomic store-all are not silently recreated. The native inventory journey instead exercises actual seven-item inventory and the supported serial scoped transfer path. Existing unit and legacy fixture coverage remains separate.

## Validation

Full TypeScript check and formatting of changed formatted smoke helpers passed. ESLint does not currently match these script files; its ignored-file warnings are not lint coverage.

Fresh run `sidereal-spacetime-dev-native-starter-r0005-smoke` passed the entire generic journey. Its separate reconnect invocation exposed a test evidence mismatch: the rewritten inventory journey recorded the scanner ID while leaving the carbine equipped. The endpoint now explicitly equips the scanner before recording evidence, preserving the existing reconnect contract. No inventory loss was observed.

Final combined native smoke **passed** on `sidereal-spacetime-dev-native-starter-r0006-smoke`; `python3 scripts/dev.py smoke-restart --smoke-name native-starter-r0006` also **passed** against the same fixture. The compiled world SHA at its publication is `a962f39a07aeff0d3baae7fe80f13862b64fe22572428b71abe566a63046c2f0`.

Private evidence resides under `.runtime/smoke-runs/<database>/`. `smoke-identity.json` contains development reconnect tokens and must never be committed or publicly served. The command named `smoke-restart` verifies retained rows through new connections; it does not itself restart the database process. This task makes no process-restart durability claim and does not publish the normal database.
