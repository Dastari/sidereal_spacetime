# Normal shared-world activation proposal — 2026-09-10

Status: staged implementation proposal for integration-owner review. The durable explicit-join helper and tests exist; App, canvas HUD and the new-character server branch below are not changed by this proposal. Existing query review remains the installed development path. The owner's blanket deployment authorization is recorded; combined browser acceptance and artifact pinning are coordination gates, not a request for new user permission.

## Existing characters: explicit relocation only

Normal login reconnects the existing character and ship in their current context. It must never automatically call `joinSharedSystem` for an existing character, including one currently occupying the pilot seat. Native construction visitors remain in their accepted visit/deck and must leave that context before joining. Existing ship, character, station, item, container, appearance and fitting UUIDs remain stable.

Add a compact **Join shared system** action to the existing navigation card in `packages/canvas-ui/src/index.ts`, using its native panel/button atlas, Barlow typography and cyan/navy theme. It replaces neither the top navigation nor the inventory. Proposed content:

> Private space
>
> Move this ship to a safe berth in the shared system. Your ship and belongings stay with you.
>
> **Join shared system**

Clicking this explicitly authorizes that one migration. The button is disabled while the original-token admission handshake or shared baseline subscription is pending, the actor is disconnected, a native visit exists or a request is running. Existing shared admission shows **Shared system** with a concise contact count and the ordinary navigation list; the debug UUID/socket panel remains query-only. Retain local control/pilot authority checks; membership is not a control grant.

Use `createSharedWorldJoinAction` from `apps/client/src/shared-world-join-action.ts`. Mount one action controller for the active verified account identity/database and dispose it on replacement. Its `readContext` callback reads the current active connection, its explicit baseline-readiness observable, `ownWorldAdmission`, `ownCharacters`, `ownShips` and native visit rows. It never trusts a stale React copy or an empty cache before subscription apply.

The journal adapter uses localStorage `getItem`/`setItem`/`removeItem`. The helper derives the key from configured database plus verified connection identity; no access token, refresh token, password, character name, inventory document or transform is stored. It serializes only operation UUID, character/ship UUIDs and exact expected u64 revisions. Journal write happens before reducer submission. Storage failure prevents submission rather than silently losing retry identity.

`join()` reuses the exact saved operation after an uncertain response, socket renewal or reload. It rereads accepted admission first: a matching actor/ship admission skips submission and clears the journal. A changed actor/ship/revision requires the explicit secondary **Review current ship / start a new request** action (`discardPending`); there is no automatic rebasing with a new UUID. A malformed saved request is blocked until explicitly cleared. Clicks while a request is in flight share its promise. Neither constructor, subscription notification nor login calls `join()` automatically.

## New characters: create directly in the canonical system

Current `enterLab` creates per-ship body fixtures in its new-character branch. Do not label a client-side follow-up join as direct shared creation: a crash between two reducers would leave a private character.

Concrete server integration in `packages/world/src/index.ts`:

1. Preserve the entire `if (existing)` reconnect/native-visit branch, including its existing UUIDs, content reconciliation and early return. It does not join.
2. In the new-character branch only, retain character/ship/station/input creation and pilot-layout alignment. Remove its `seedBodies(shipId)` call. Leave the local helper for existing private-character fixtures.
3. After the new input row has been inserted, call the existing authoritative shared adapter in the same reducer transaction:

```ts
const createdShip = ctx.db.ship.id.find(shipId)!;
sharedWorld.joinSharedSystem(ctx, {
  characterId,
  shipId,
  expectedShipRevision: createdShip.revision,
  expectedAdmissionRevision: 0n,
  operationId: ctx.newUuidV4().toString(),
});
```

`enterLab` already invokes `auth.requireGame`; do not bypass it. The adapter rechecks owned connected actor/ship, disallows native visits, creates/verifies the canonical seed, reserves a server-derived safe berth, inserts one lean ship-motion/admission row, clears fresh input and writes a join receipt. With zero private body fixtures it produces zero legacy aliases. Its UUID comes from the deterministic reducer context. If the island is full or seeding/pinning fails, the whole create transaction must fail: no partially inserted actor, ship, station, inventory or private fallback universe. A retry of a successfully completed create finds the existing admitted character and preserves its berth/IDs.

Do not bulk-migrate existing characters in init, login, a global tick or a deployment script. Existing private legacy fixtures may remain as migration evidence and aliases; only authorized shared bodies are subscribed/rendered after admission.

## Client and renderer integration changes

- `packages/net/src/index.ts`: enable `bindSharedWorld` after original-token proof for normal gameplay as well as the query review, still suppress it during the separate native construction review. Keep one independent cache/readiness observable per socket and retain resources. Existing private views stay private.
- `apps/client/src/App.tsx`: select the active socket cache into its stable presentation bridge for normal play; retain epoch-safe replacement and explicit actor/ship lookup. New admitted characters render the shared body/ship scene without a debug query. Existing private characters continue rendering their authorized private body view until their explicit join succeeds.
- Add optional `sharedEntry` state/actions to the canvas HUD contract, backed by the helper's stable action state and admission/description-only subscriptions. The normal UI must not display raw operation IDs, database names or socket diagnostics. Remote movement remains imperative renderer/cache work, not a whole-tree React refresh.
- `packages/render/src/index.ts`: provide the stable accepted store in normal play; keep native construction context separate. The pinned public stock exterior remains a visual-only whitelist, never a private assembly fetch. Existing profile/graphics settings remain effective.
- Keep `SharedWorldReview` available only under its development query for diagnostics. Do not reuse that debug DOM panel as the normal product flow.

## Required acceptance before activation

1. Fresh real OIDC account creates exactly one actor/ship/station and admission directly in the canonical system, with no per-ship `spaceBody` rows and no legacy aliases. Failure at capacity or invalid seed pin rolls back the entire creation transaction.
2. Existing private character login/refresh, including pilot occupancy, does not relocate or change world admission. Record IDs, position, velocity, appearance, containers and items before and after login.
3. Explicit join moves only that selected owned ship to an available berth, retains all stable IDs/items and creates one admission/receipt. Drop the response after commit, reload, then retry: accepted admission skips; replayed exact operation is idempotent. Another principal's journal entry is never reused.
4. Two real accounts see the same canonical bodies and each other's public exterior; private inventory/crew/interior rows remain inaccessible. Browser review covers remote native materials, deletion/reconnect, Observe IDs, and camera-relative motion. Existing server/SDK proof is recorded in `.runtime/shared-world-provider-summary.json`; it is not a substitute for browser evidence.
5. Token renewal overlaps sockets without clearing the active presentation; admission/system changes remove stale bodies/exteriors. A native stair/egress visit and return preserves the correct context.
6. Run focused helper and authority tests, full `npm run check`, `npm run build`, `npm run art:check`, installer `--check`, required Python checks and isolated authority smoke. Pin the exact resulting module, independent client artifact and source commit before publication.

## Coordinated release order and recovery

Prepare the immutable client first using `python3 scripts/dev.py public-client-stage`. Record the exact staged digest/entry file, module bundle hash, exterior manifest hash and current live identities. Capture fresh authoritative stable-row snapshots and protect a current managed cold backup; inspect free disk before duplicating the existing large recovery archives. The earlier restored archive proves recoverability of the earlier checkpoint, not writes created since then.

After parent browser acceptance, publish the additive world through the managed lifecycle, then activate the matching immutable client with `public-client-activate`. Keep dashboard artifacts/services independent. No reset, historical-assembly overwrite, realm recreation or provider/account migration is part of this release. Verify existing users again and complete a fresh-account normal entry test after activation. Existing old browser tabs may need reload for the newly activated shared presentation.

Use a compatible forward fix if acceptance fails after users have joined. A client-only downgrade to the pre-shared presentation hides admitted bodies; dropping new authoritative tables or restoring the old archive over live data would lose later writes and is not a routine rollback. Any actual recovery outage needs its own current data preservation and coordination.

## Helper validation

Eight focused action tests plus five existing join-decision tests passed. Cases cover baseline readiness, explicit-only execution, write-before-send, lost-response/reload replay, accepted-admission skipping, account/database isolation, revision conflict/review, storage corruption/failure, click coalescing, exact u64 preservation and disposal. Full TypeScript check passed at this helper checkpoint. Normal HUD rendering and the new-character server branch remain unimplemented until the integration owner proceeds with this concrete proposal.
