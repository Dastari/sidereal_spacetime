# Dastari's existing ship: completed authoritative refit

Completed on 2026-09-10 using the already deployed game authority. The owner requested **“my players ship swapped over to the new ship authoring method”** and identified the target as **“Dastari”**. This authorization applies to this exact existing account and ship; it is not a general account impersonation or automatic migration policy.

## Exact target and execution

- Dastari character: `eb9eeb1d-adac-4c78-aff7-7a176f13d650`.
- Existing ship, now also its authored instance: `a2300549-da8d-45c8-b8f4-aa832718c2cc`.
- Existing control station: `0d57f8d3-f5ae-4888-9270-01e88bf0f9db`.
- Refit operation: `d9bb0b25-30fc-4bb6-855f-51db619b6a34`.
- Qualified template: `362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340`.

A read-only provider lookup found the unique enabled `dastari` account. The pinned SpacetimeDB issuer/subject identity derivation exactly matched the live character's owner. The existing Keycloak administrator impersonation feature created one separate, provider-audited temporary SSO session. Genuine public-origin authorization-code/PKCE then supplied a normal game token. The host verified it through the existing session-proof binding. No passwords, credentials, roles, realm policies, module permissions or authentication rules were changed.

The private SDK client verified the exact sender, character, ship and unoccupied station. A fresh authoritative snapshot confirmed idle intent and no couch/review visit. The existing `joinSharedSystem` reducer admitted this previously private ship; the current `ownWayfarerRefitOffer` supplied revisions and fingerprint. The normal `refitExistingWayfarer` reducer committed once with those exact CAS values and the recorded operation ID. There was no module-owner impersonation, direct SQL mutation, replacement ship, database reset or new public release.

Keycloak's implementation records an IMPERSONATE event and the administrator on the new session; this event was verified for the exact temporary session. See the [pinned provider implementation](https://github.com/keycloak/keycloak/blob/26.7.3/services/src/main/java/org/keycloak/services/resources/admin/UserResource.java#L346). The private client disconnected after acceptance. Only the new provider session was deleted; a before/after session-ID comparison proves the owner's pre-existing SSO session remained. Local and CT temporary token files were removed. Private session and operator evidence remain mode0600 under `.runtime/owner-refit-20260910/`.

## Conservation and expected changes

All **99 original item UUIDs** remain, with every inventory/content/equipment field preserved. All **18 container UUIDs** remain with capacities, nested contents and liquid balances preserved. The three weapon-energy rows, appearance, five hotbar rows, original control station and four interaction-object identities/state are unchanged. The character's complete row and current local position `(0.1748550568, 5.5807934059)` were retained.

Stored contents now use authored-instance access: 89 item rows and 16 container rows have their old character scope replaced by private instance membership. This is an access migration, not deletion. Two container approach positions change to their qualified authored placements; all old item/container IDs remain present in the complete authoritative table snapshot. Global item/container counts remain 709/190. Inventory revision91→92 records the transaction.

Explicit shared admission relocates the formerly private ship into its accepted shared-system berth. Ship revision1→2 records that join, and2→3 records the refit. Normal moving-world ticks can advance between snapshots. New durable rows include the authored instance/deck/location, ownership access, flight fittings/binding, inventory scopes/memberships, refit receipt and fuel attachment. Replaceable legacy actuator telemetry is reconciled to nine native fitting outputs. These are expected changes; no equality claim includes those newly created projections or the authorized world relocation.

The mounted fuel attachment `f332777d-18c7-4a1b-bc30-337efda06d0e` binds original tank `0f7fa49d-dd10-49c4-a6ff-2e38c223ba7b`, retaining **20L fuel** and its original100L/80kg limits. Its exact approved native GLB SHA is `a2f9fca902c7df08f3e8bad348d09034df8f26d9c248d0d912558886aa2eecf6`, at ship-local `(-3, 7, 0.1875)` with no rescaling.

## Evidence and limits

Private full snapshots, CAS requests, accepted views and the exact provider session audit/cleanup are in `.runtime/owner-refit-20260910/`. `conservation-complete.json` and `verify.ts` assert original UUID/content conservation, unchanged actor/appearance/hotbar/energy/station, canonical native-source reconstruction, qualified fuel mounting, and supported actor occupancy against the100-obstacle accepted collision frame. These are actual live authority results plus read-only qualification of the installed instance; no new destructive collision or flight experiment was performed on the owner's ship.

The normal client already renders accepted game-owned instances, so the current authenticated session should receive the conversion through its subscriptions; a reload uses the same account and instance. A fresh visual capture of this particular owner's ship is not claimed here. Existing template/model fit and enclosure limitations remain in the construction ledgers; this specific conversion does not mark all Shipyard construction work complete.
