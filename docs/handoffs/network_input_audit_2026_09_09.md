# Network / input audit integration

Status: helpers implemented in shared tree; parent owns App.tsx and world reducer wiring. No publication or browser acceptance by this specialist.

## Verified against installed SpacetimeDB 2.10.0

- `node_modules/spacetimedb/src/sdk/ws.ts:82` exchanges the original token for a temporary token at WebSocket creation. It contains no periodic socket lifetime/rotation policy. The previous application comment claiming a 60-second established-socket deadline was not justified. Healthy sockets now stay connected; a refreshed OIDC token still replaces the connection only after its replacement subscriptions apply. OIDC's existing `automaticSilentRenew` remains responsible for refreshing the credential. A new socket with an unchanged expired JWT cannot extend server admission.
- `node_modules/spacetimedb/src/sdk/db_connection_impl.ts:1001` constructs subscription `errorContext.event = Error` and invokes the error callback with it. Thus the audit's assertion that `event` is the wrong field is **not true for this installed version**. Added a useful missing-event fallback instead of switching to an unsupported field.
- `packages/world/src/index.ts` treats movement intent as fresh for **300ms**. Sending unchanged moving intent once per second would produce intermittent movement. The transmitter keeps 100ms moving heartbeats and reduces idle traffic to 1000ms. Changed controls are immediate at the next offer.

## Implemented files

- `packages/net/src/connection-session.ts`: remove 30-second churn; retry initial/lost development sockets as well as OIDC sockets; preserve bounded retry, token-change replacement, make-before-break and teardown.
- `packages/net/src/connection-resources.ts`: retain named subscription handles; explicit replacement/removal; release pending queries when applied; detach cache listeners and active queries on disconnect. Error fallback never formats `undefined`.
- `packages/net/src/index.ts`: narrow lifecycle wiring only; existing table lists and authority subscriptions preserved. No public tables, sector disclosure or compression-mode change.
- `apps/client/src/intent-transmitter.ts`: coalescing, per-socket reset, 100ms movement/1000ms idle heartbeat, one in-flight call and 1s rejection backoff.
- `apps/client/src/movement-control.ts`: serialize explicit claim/release around focus and connection changes; pending claims cannot reactivate hidden/disposed input; per-connection monotonic sequence, retained on blur/refocus. Claims rejected by authority back off for 1s.
- Four focused test files: 22 tests passing. This is unit evidence, not multiplayer browser acceptance.

## Parent App integration

Root registers authority reducers `claimInputControl` and `releaseInputControl` using the stair_rules agent's private server lease adapter. Nonholder input must be a no-op. No client sequence hack is a substitute for that authority contract.

1. Remove `sequence = useRef(BigInt(Date.now()) * 1000n)`.
2. Create **one movement controller per mounted App**, retaining its WeakMap across camera/input-effect restarts. Supply claim/release calling the matching reducers and onError to the existing error display. Dispose on App unmount.
3. In the keyboard effect create a transmitter. Its send adapter must check `control.canSend(connection)` again before invoking `setIntent`, then allocate `control.nextSequence(connection)` and pass the offered intent unchanged.
4. Each send offer obtains the current socket and computes eligibility: socket active, actor connected, network ready, document visible **and document.hasFocus()**. Call `control.activate(eligible ? socket : null)` and offer only once `control.canSend(socket)` is true. Keep keys cleared when GUI blocks input, when hidden or when sitting on a couch. A GUI-blocked foreground tab may retain its lease but sends zero motion.
5. Send on meaningful keydown/keyup and focus, and keep the existing 50ms sampler; the helper suppresses redundant calls. Blur/hidden clears keys and `activate(null)`; do not send a nonholder zero command. Best-effort release is ordered after any pending claim.
6. Camera/effect cleanup disposes the transmitter and clears keys; do not destroy the App-level controller/sequence map on every camera change. Explicitly stop/release when leaving gameplay. On a socket change the new connection gets a fresh sequence domain; same-connection reclaim retains its sequence floor.
7. Test two same-account tabs, old/new socket overlap, held key on blur, reconnect, token renewal while seated, inventory modal stops, development identity reconnect and live movement freshness. Verify normal private views remain private.

## Limits / unimplemented architecture

No shared-universe presence tables, anonymous views, spatial cells, subscriptions based on player discovery, remote actor rendering or interpolation buffer were implemented here. Current named game subscription stays a single group; retained handles are infrastructure for later scoped subscriptions, not a claim that spatial scoping exists. Compression/light-mode changes require separate compatibility and cache behavior measurements.

## Integrated authority smoke

Parent applied the App controller/transmitter adapter and registered explicit input-control reducers. Generated zero-argument reducers require an empty object at the call site: `claimInputControl({})`, `releaseInputControl({})`.

The specialist narrowly updated `scripts/smoke.ts`, `scripts/character-components-smoke.ts` and `scripts/traversal-smoke.ts` to claim once before legitimate motion, retaining connection-local monotonic sequences. Root added the equivalent inventory/interaction smoke hooks in their owned files. Main smoke now submits a stale movement packet after a newer accepted stop and checks that XY/sprinting remain unchanged; no stale-input rejection is expected. Existing unauthorized piloting and invalid-number rejection checks remain intact.

`npm run smoke -- --smoke-name audit-network` passed (exit0) on isolated database `sidereal-spacetime-dev-audit-network-smoke`, identity `c200a92a40d967bac39bc5191f6ca8587b070ebfbf93fa04f3405b6fbc03762a`. Log: `.runtime/audit-network-authority-smoke.log`. The run passed authoritative flight, asteroid collision, walking/sprinting, native bow/room collisions, inventory/equipment/container privacy, interaction reach/seating/lights, combat balances/replays, construction denials,90 character components across2 bodies and account appearance/equipment reconnect preservation. It does not establish shared-space multiplayer or actual browser focus/renewal behavior.

The Spacetime CLI printed a nested `tsc not found in node_modules` warning while building, after the explicit world TypeScript check had passed; the module build and upload then succeeded. No reset of existing databases, public publication or shared server restart was performed.
