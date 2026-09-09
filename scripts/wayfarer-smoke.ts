/** Real-provider authority journey helpers; caller owns isolated database,
 * private credentials, temporary reviewer role and cleanup. No auto-connect. */
import assert from "node:assert/strict";
import type { DbConnection } from "../packages/net/src/generated";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "../packages/sim/src/wayfarer-conversion-candidate";
import { WAYFARER_CONVERSION_PIN as PIN } from "../packages/content/src/wayfarer-conversion-candidate";
import {
  traversalWait as wait,
  traversalIntentSender,
  walkTraversalActor,
  enterTraversalReview,
  leaveTraversalReview,
  traversalInventorySnapshot,
  requireTraversalInventoryUnchanged,
} from "./traversal-smoke";
const actor = (c: DbConnection) => [...c.db.ownCharacters.iter()][0]!;
export async function publishWayfarerFixture(
  c: DbConnection,
  workspaceId: string,
  inputs: WayfarerPinnedInputs,
) {
  const candidate = createWayfarerConversionCandidate(inputs);
  for (const capability of [
    "draft.read",
    "draft.write",
    "blueprint.publish",
    "instance.spawn",
  ])
    await c.reducers.setConstructionGrant({
      principal: c.identity!.toHexString(),
      workspaceId,
      capability,
      revoked: false,
      expiresMicros: BigInt(Date.now() + 3600000) * 1000n,
      expectedRevision: 0n,
      operationId: crypto.randomUUID(),
    });
  const draftId = workspaceId + ":draft";
  await c.reducers.saveConstructionDraft({
    workspaceId,
    draftId,
    documentJson: candidate.snapshot.canonical,
    expectedRevision: 0n,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () =>
      !![...c.db.ownConstructionDrafts.iter()].find((d) => d.id === draftId),
    "Wayfarer draft",
  );
  await c.reducers.publishConstructionBlueprint({
    workspaceId,
    draftId,
    expectedRevision: 1n,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () =>
      !![...c.db.ownConstructionBlueprints.iter()].find(
        (b) => b.draftId === draftId,
      ),
    "Wayfarer blueprint",
  );
  const blueprint = [...c.db.ownConstructionBlueprints.iter()].find(
    (b) => b.draftId === draftId,
  )!;
  assert.equal(blueprint.sha256, candidate.snapshot.sha256);
  for (let n = 1; n <= 2; n++) {
    const operationId = crypto.randomUUID(),
      args = {
        blueprintId: blueprint.id,
        expectedSha256: blueprint.sha256,
        sourceDeckId: PIN.deckId,
        operationId,
      };
    await c.reducers.spawnConstructionBlueprint(args);
    await c.reducers.spawnConstructionBlueprint(args);
    await wait(
      () =>
        [...c.db.ownConstructionInstances.iter()].filter(
          (i) => i.workspaceId === workspaceId,
        ).length === n,
      "Independent replay-safe Wayfarer spawn",
    );
  }
  const instances = [...c.db.ownConstructionInstances.iter()].filter(
    (i) => i.workspaceId === workspaceId,
  );
  const ids = instances.flatMap((i) => {
    const d = JSON.parse(i.documentJson);
    return [
      i.id,
      ...d.layout.decks.map((x: { id: string }) => x.id),
      ...d.layout.tiles.map((x: { id: string }) => x.id),
      ...d.layout.assembly.parts.map((x: { id: string }) => x.id),
    ];
  });
  assert.equal(ids.length, 528);
  assert.equal(new Set(ids).size, 528);
  return instances;
}
export async function wayfarerAuthorityJourney(
  c: DbConnection,
  instanceIds: string[],
) {
  const inventory = traversalInventorySnapshot(c),
    original = {
      id: actor(c).id,
      shipId: actor(c).shipId,
      x: actor(c).localX,
      y: actor(c).localY,
    };
  const send = traversalIntentSender(c);
  const journeys = [];
  for (const instanceId of instanceIds) {
    await enterTraversalReview(c, instanceId);
    for (const [x, y] of [
      [-2, -1.5],
      [0, -1.5],
      [0, 0],
      [0, 7],
      [0, 8],
      [-1.8, 8],
    ])
      await walkTraversalActor(c, x, y, send);
    const start = Date.now();
    while (Date.now() - start < 1300) {
      await send(0, 1);
      await new Promise((r) => setTimeout(r, 55));
    }
    await send(0, 0);
    assert(
      actor(c).localY < 8.4,
      "Qualified rear partition did not block authoritative movement",
    );
    assert(actor(c).localY > 8.2, "Actor did not approach native partition");
    journeys.push({
      instanceId,
      wallStop: { x: actor(c).localX, y: actor(c).localY },
      mainAndForwardCorridorWalked: true,
    });
    await leaveTraversalReview(c);
    await wait(
      () => actor(c).shipId === original.shipId,
      "Return to original ship",
    );
    assert.equal(actor(c).id, original.id);
    assert.equal(actor(c).localX, original.x);
    assert.equal(actor(c).localY, original.y);
    requireTraversalInventoryUnchanged(c, inventory);
  }
  return {
    original,
    journeys,
    independentPlacementIds: 528,
    inventoryUnchanged: true,
    existingFittingContainerEntitiesCopied: false,
    newContainerEntitiesImplemented: false,
    nativeVisualPlacementsPerInstance: 262,
  };
}
