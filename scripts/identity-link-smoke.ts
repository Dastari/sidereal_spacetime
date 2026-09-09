import assert from "node:assert/strict";
import type { DbConnection } from "../packages/net/src/generated";
import { persistenceSnapshot } from "./persistence-smoke";
type Client = (
  token?: string,
) => Promise<{ connection: DbConnection; token: string }>;
type Wait = (fn: () => boolean, message: string) => Promise<void>;
/** Real provider integration gate. Caller supplies an actual short-lived OIDC
 * ID token privately; never forge claims or enable password grants for this test.
 * Use an isolated database and a dedicated target account with no character. */
export async function identityLinkSmoke(
  client: Client,
  targetToken: string,
  wait: Wait,
) {
  const source = await client(),
    target = await client(targetToken);
  let reconnected: Awaited<ReturnType<Client>> | undefined;
  try {
    const a = source.connection,
      b = target.connection;
    assert.equal(
      b.db.ownCharacters.count(),
      0n,
      "OIDC test target must be empty before migration",
    );
    await a.reducers.enterLab({ name: "OIDC Migration Review" });
    await a.reducers.claimStarterKit({});
    await a.reducers.setCharacterAppearance({
      appearanceJson: '{"outfit":"medic","skin":"#887766","helmet":"closed"}',
      expectedRevision: 0n,
      operationId: "link-appearance",
    });
    const gun = [...a.db.ownInventoryItems.iter()].find(
      (item) => item.definitionId === "carbine",
    )!;
    await a.reducers.equipInventoryItem({
      itemId: gun.id,
      expectedRevision: [...a.db.ownInventoryState.iter()][0].revision,
      operationId: "link-equip",
    });
    const ship = [...a.db.ownShips.iter()][0];
    await a.reducers.renameShip({
      shipId: ship.id,
      expectedRevision: ship.revision,
      operationId: "link-original-edit",
      name: "Preserved Ship",
    });
    const snapshot = persistenceSnapshot(a),
      receipt = [...a.db.ownEditReceipts.iter()][0];
    await assert.rejects(
      b.reducers.acceptIdentityLink({
        requestId: "unknown",
        operationId: "wrong-request",
      }),
    );
    const request = {
      targetIdentity: b.identity!.toHexString(),
      expectedCharacterId: snapshot.characterId,
      operationId: "link-request",
    };
    await a.reducers.requestIdentityLink(request);
    await a.reducers.requestIdentityLink(request);
    await wait(
      () => b.db.ownIdentityLinks.count() === 1n,
      "target sees only its pending migration",
    );
    const link = [...b.db.ownIdentityLinks.iter()][0];
    assert.equal(link.characterId, snapshot.characterId);
    assert.equal(link.side, "target");
    const accept = { requestId: link.id, operationId: "link-accept" };
    await b.reducers.acceptIdentityLink(accept);
    await b.reducers.acceptIdentityLink(accept);
    await wait(
      () =>
        b.db.ownCharacters.count() === 1n && a.db.ownCharacters.count() === 0n,
      "atomic new-owner projection and source revocation",
    );
    assert.deepEqual(
      persistenceSnapshot(b),
      snapshot,
      "all item UUIDs, packing, equipment, containers and appearance preserved",
    );
    assert.equal(
      [...b.db.ownEditReceipts.iter()][0].id,
      receipt.id,
      "existing audit ID retained",
    );
    await b.reducers.renameShip({
      shipId: ship.id,
      expectedRevision: ship.revision,
      operationId: "link-original-edit",
      name: "Preserved Ship",
    });
    await assert.rejects(
      a.reducers.enterLab({ name: "Cannot reseed retired owner" }),
    );
    await assert.rejects(a.reducers.claimStarterKit({}));
    await assert.rejects(
      a.reducers.setCharacterAppearance({
        appearanceJson: "{}",
        expectedRevision: 1n,
        operationId: "retired-edit",
      }),
    );
    b.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 150));
    reconnected = await client(targetToken);
    await reconnected.connection.reducers.enterLab({ name: snapshot.name });
    await wait(
      () => reconnected!.connection.db.ownInventoryState.count() === 1n,
      "OIDC reconnect projections",
    );
    assert.deepEqual(
      persistenceSnapshot(reconnected.connection),
      snapshot,
      "linked identity persists on real OIDC reconnect",
    );
    return {
      characterId: snapshot.characterId,
      itemCount: snapshot.items.length,
      appearanceRevision: snapshot.appearance.revision,
      retiredSourceDenied: true,
      oidcReconnect: true,
    };
  } finally {
    source.connection.disconnect();
    target.connection.disconnect();
    reconnected?.connection.disconnect();
  }
}
