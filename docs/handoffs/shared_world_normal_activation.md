# Normal shared-world activation — 2026-09-10

Status: installed in the public game after the normal-HUD isolated browser acceptance. Public existing-account join, fresh-account creation and two-account native exterior review passed; the final same-account reload evidence is being recorded. The server new-character branch, normal transport/presentation path, native canvas navigation action and durable account-scoped join controller are now connected. The exact installed world/client hashes and preserved state are recorded below. The owner's blanket deployment authorization is recorded; final browser acceptance and artifact pinning are coordination gates, not a request for new permission.

## Existing characters: explicit relocation only

Normal login reconnects the existing character and ship in their current context. It must never automatically call `joinSharedSystem` for an existing character, including one currently occupying the pilot seat. Native construction visitors remain in their accepted visit/deck and must leave that context before joining. Existing ship, character, station, item, container, appearance and fitting UUIDs remain stable.

The compact **Join shared system** action is installed in the existing navigation card in `packages/canvas-ui/src/index.ts`, using its native panel/button atlas, Barlow typography and cyan/navy theme. It replaces neither the top navigation nor the inventory. Installed content:

> Explore together
>
> Move this ship to a safe berth in the shared system. Your ship and belongings stay with you.
>
> **Join shared system**

Clicking this explicitly authorizes that one migration. The button is disabled while the original-token admission handshake or shared baseline subscription is pending, the actor is disconnected, a native visit exists or a request is running. Existing shared admission shows **Shared system** with a concise contact count and the ordinary navigation list; the debug UUID/socket panel remains query-only. Retain local control/pilot authority checks; membership is not a control grant.

Use `createSharedWorldJoinAction` from `apps/client/src/shared-world-join-action.ts`. `useSharedWorldEntry` activates one action controller for the verified account identity/database and disposes its action on replacement or effect cleanup; Fast Refresh can safely reactivate it. Its `readContext` callback reads the current active connection, its explicit baseline-readiness observable, `ownWorldAdmission`, `ownCharacters`, `ownShips` and native visit rows. It never trusts a stale React copy or an empty cache before subscription apply.

The journal adapter uses localStorage `getItem`/`setItem`/`removeItem`. The helper derives the key from configured database plus verified connection identity; no access token, refresh token, password, character name, inventory document or transform is stored. It serializes only operation UUID, character/ship UUIDs and exact expected u64 revisions. Journal write happens before reducer submission. Storage failure prevents submission rather than silently losing retry identity.

`join()` reuses the exact saved operation after an uncertain response, socket renewal or reload. It rereads accepted admission first: a matching actor/ship admission skips submission and clears the journal. A changed actor/ship/revision requires the explicit secondary **Review current ship / start a new request** action (`discardPending`); there is no automatic rebasing with a new UUID. A malformed saved request is blocked until explicitly cleared. Clicks while a request is in flight share its promise. Neither constructor, subscription notification nor login calls `join()` automatically.

## New characters: create directly in the canonical system

`enterLab` now creates fresh characters directly in the canonical shared system in one authoritative transaction. It no longer creates per-ship body fixtures in the new-character branch; existing-character reconnection retains its prior private or shared context.

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


## Implemented acceptance evidence

- Fresh real Dastari PKCE accounts against `sidereal-spacetime-dev-review-new-shared-entry-smoke`: both newly created actors had accepted admission immediately (`admittedAtCreation: [true, true]`), so neither client sent an explicit join. Both accounts observed the same bodies and remote movement, kept private views restricted, and preserved appearance/inventory/UUIDs on reconnect. Private evidence: `.runtime/new-shared-entry-provider-summary.json`. Operator reads confirmed zero private `space_body` rows and zero `legacy_body_alias` rows in this fresh database. Review token files were logged out and removed.
- The exact prior module artifact SHA-256 `fb46173302350372acbed5e4b5733ac4a8090460151b25705e61554cd6bec67e` was installed only into `sidereal-spacetime-dev-review-legacy-private-upgrade`. Ordinary reducers seeded a private actor/ship/starter inventory before an additive current-module publication with `--delete-data=never`. Reconnection retained the same character, ship, position/velocity, appearance, seven visible items, containers, hotbar and sixteen private body IDs, with zero shared admission. Disconnect releases the pilot station by design; the test reacquired it through the proximity reducer before comparing snapshots. It does not claim seat occupancy persists across disconnect.
- The same legacy fixture then explicitly joined and replayed the exact operation/revision request. Admission was unchanged by replay; character/ship UUIDs and all visible item rows were preserved. Evidence: `.runtime/legacy-private-upgrade-summary.json`. The reproducible two-phase harness is `scripts/legacy-shared-upgrade-smoke.ts`; seed on the pinned old module first, upgrade additively, then run `--verify` once (it deliberately performs the migration at the end).
- Generic isolated authority smoke now checks shared bodies rather than private universe copies, observes one rock impulse from both accounts, and retains permission, idempotency, input lease, walking/collision and IFCS checks. Its discovery scopes are actual accepted views. The `traversal-idle-final` named run passed. It caught and prompted repair of missing initial nine-row actuator telemetry in shared space; steady idle output suppression remains intact.
- The normal canvas card uses the existing toolkit/palette, leaves external inventory UI intact, and stacks ahead of destinations. On short displays the invitation gets priority; destination controls return after admission when enough height remains. The debug SharedWorldReview panel remains query-only. Root browser acceptance remains the final UI gate.

## Managed pinned-module review

`scripts/dev.py publish-review --review-name NAME --module-artifact FILE --artifact-sha256 SHA256` stages verified JS/WASM bytes privately and publishes only to the project-prefixed named review database, never resets it, and rejects unpaired flags, invalid names, symlinks and hash mismatches. This is for upgrade tests, not a bypass for publishing an old module over the normal database. Source artifacts and credentials remain outside git; the checked-in helper/tests contain no tokens.

## Candidate checkpoint and fresh recovery boundary

Normal-entry source checkpoint: `c3e141bb71cae772ab8d5a8effc8cd40637d0243`; pinned isolated-module helper: `32ef482b`. The combined gate passed 932 tests in 159 files, 76 document checks, the full world/client/dashboard build, installed art validation, and 33 lifecycle plus nine art Python checks. Generic named smoke `traversal-idle-final` passed. This is validation of the combined candidate, not a claim that the public release has already switched.

- World SHA-256: `317c007a22ae5a5a2fe5c6fb8c041f567c022f48954d08085b5fd327cb41e1ec`; exact private copy `.runtime/releases/normal-shared-20260910/world-317c007a.js`.
- Staged public client SHA-256: `66b5a92b0b6d0c1db0dbbc3ceba0bbd7b0706e909de94d469de15a07a84fddf1`; release `.runtime/public-client/releases/20260910-030916-66b5a92b0b6d`, entry `/assets/index-Cenf-nBs.js`.
- Managed fresh cold archive `.runtime/recovery-20260910-031300.tar`, SHA-256 `81e5f0e3b3935da15b35ddf6c45ed0f0dc923b85513ef36517bfb86eefe5ae03`, 29,635,358,720 bytes, 7,893 members. The managed database writer was stopped for 26.042 seconds and restarted without publication/reset. Prior tested recovery evidence remains retained; this fresh archive has not itself been restored into another copy.
- Before/after backup authoritative comparisons retained every row unchanged for 25 characters, 25 stations, 603 inventory items, 165 containers, 17 inventory states, 85 hotbar rows, three appearance rows and six weapon-energy rows. All 25 ship UUIDs/static fields remained unchanged; eight moving ships advanced only x/y/heading/tick between the non-atomic read snapshots and restart. These dynamic differences are not represented as exact snapshot equality.
- Exact private candidate and continuity records: `.runtime/releases/normal-shared-20260910/candidate.json`, `backup-continuity.json`, `backup-ship-continuity.json`. Public client and dashboard processes remained on their previous releases during backup and staging. Root's actual normal navigation/explicit-join browser review is pending at this checkpoint. No hardware FPS improvement is claimed from software-GPU evidence.


## Public installation — 2026-09-10

After the normal Map → Join → reload browser flow passed on the isolated upgraded private account, the pinned world `317c007a…` was published through the managed lifecycle with `--delete-data=never`. Its resulting bundle hash matched the pinned artifact exactly before immutable client `66b5a92b…` was activated. The normal database retained identity `c2005c24147323197826efa22f24e30d2d99a93a5a5091949f2ad25fa2127572`. The HTTPS public entry `/assets/index-Cenf-nBs.js` was fetched through NPM and matched the installed artifact byte-for-byte; dedicated Dastari issuer discovery also passed. Dashboard and proxy routes were unchanged.

The isolated HUD action retained all 99 authoritative inventory items and 18 containers unchanged, with the same actor/ship/station IDs; only the connected flag and expected ship revision changed. Its appearance table was empty before/after, so this fixture does not prove custom-appearance preservation. Root's isolated browser captured `private-map-ready.png` and `accepted.png`, then an ordinary no-query reload retained the accepted admission and all seven visible item rows.

After public publication, all 25 characters, 25 stations, 603 inventory items, 165 containers, 17 inventory states, 85 hotbar rows, three actual appearance rows and six weapon-energy rows matched the post-backup authoritative baseline exactly. All 25 ship identities/static columns remained unchanged; only x/y/heading/tick changed for the previously moving ships across timed observations. This public publication has not automatically relocated existing private ships. Final parent public-browser acceptance is still a separate check, not inferred from HTTP or SQL success.


### Public browser acceptance

Root exercised the actual public Map → Join flow on the existing Pose Integration Review account, retaining the same actor/ship and all 81 visible inventory rows. A separate real Dastari Shared Beta account was created through the public onboarding UI and automatically admitted with zero private body fixtures. Both accounts observed two ship motion rows; the actual native two-ship image is `output/playwright/shared-public-browser-review/two-accounts-live.png`. This intentionally adds a new account's actor/ship after the 25-row pre-publication continuity checkpoint; it is not an inventory/identity loss.

A presentation defect was found in the fresh-character screen: release `66b5a92b…` still displays old development/private-laboratory wording even for a real Dastari login. Authority and fresh shared admission are correct. The narrow provider-aware copy correction is implemented in source and is held for the next matched world/client candidate because subsequent generated bindings add a support-elevation field absent from world `317c007a…`; do not deploy a schema-mismatched client-only rebuild. The correction does not change login, identity or world authority.
