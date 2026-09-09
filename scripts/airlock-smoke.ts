/** Real-provider isolated airlock proof helpers. Caller owns credentials, role cleanup and DB. */
import assert from "node:assert/strict";
import type { DbConnection } from "../packages/net/src/generated";
import { createNativeAirlockDocument } from "@sidereal/sim/construction-airlock-document";
import {
  traversalWait as wait,
  traversalIntentSender,
  walkTraversalActor,
  enterTraversalReview,
  leaveTraversalReview,
  traversalInventorySnapshot,
  requireTraversalInventoryUnchanged,
} from "./traversal-smoke";
export async function publishAirlockFixture(
  c: DbConnection,
  workspaceId: string,
) {
  assert(c.identity);
  const d = createNativeAirlockDocument();
  for (const capability of [
    "draft.read",
    "draft.write",
    "blueprint.publish",
    "instance.spawn",
  ]) {
    await c.reducers.setConstructionGrant({
      principal: c.identity.toHexString(),
      workspaceId,
      capability,
      revoked: false,
      expiresMicros: BigInt(Date.now() + 3600000) * 1000n,
      expectedRevision: 0n,
      operationId: crypto.randomUUID(),
    });
  }
  const draftId = workspaceId + ":draft";
  await c.reducers.saveConstructionDraft({
    workspaceId,
    draftId,
    documentJson: JSON.stringify(d),
    expectedRevision: 0n,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () =>
      !![...c.db.ownConstructionDrafts.iter()].find((p) => p.id === draftId),
    "airlock draft",
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
        (p) => p.draftId === draftId,
      ),
    "airlock blueprint",
  );
  const b = [...c.db.ownConstructionBlueprints.iter()].find(
    (p) => p.draftId === draftId,
  )!;
  for (let n = 1; n <= 2; n++) {
    await c.reducers.spawnConstructionBlueprint({
      blueprintId: b.id,
      expectedSha256: b.sha256,
      sourceDeckId: d.airlockRoom.deckId,
      operationId: crypto.randomUUID(),
    });
    await wait(
      () =>
        [...c.db.ownConstructionInstances.iter()].filter(
          (p) => p.workspaceId === workspaceId,
        ).length === n,
      "independent airlock spawn",
    );
  }
  const instances = [...c.db.ownConstructionInstances.iter()].filter(
    (p) => p.workspaceId === workspaceId,
  );
  const ids = instances.flatMap((i) => {
    const d = JSON.parse(i.documentJson) as ReturnType<
      typeof createNativeAirlockDocument
    >;
    return [
      i.id,
      ...d.layout.decks.map((p) => p.id),
      ...d.airlockRoom.parts.map((p) => p.id),
      d.airlockRoom.innerDoorId,
      d.airlockRoom.outerDoorId,
    ];
  });
  assert.equal(new Set(ids).size, ids.length);
  return instances;
}

export async function airlockAuthorityJourney(
  c: DbConnection,
  instanceIds: string[],
) {
  const actor = () => [...c.db.ownCharacters.iter()][0]!,
    status = () => [...c.db.ownNativeAirlocks.iter()][0]!,
    visit = () => [...c.db.ownConstructionLocation.iter()][0]!;
  const original = {
      id: actor().id,
      shipId: actor().shipId,
      x: actor().localX,
      y: actor().localY,
    },
    inventory = traversalInventorySnapshot(c),
    journeys = [];
  for (const instanceId of instanceIds) {
    await enterTraversalReview(c, instanceId);
    await wait(() => status()?.id === instanceId, "native airlock projection");
    const send = traversalIntentSender(c);
    await walkTraversalActor(c, 1, 1, send);
    const operate = async (side: "inner" | "outer", open: boolean) => {
      const id = side === "inner" ? status().innerDoorId : status().outerDoorId;
      const d = [...c.db.ownConstructionDoors.iter()].find((v) => v.id === id)!;
      const args = {
        openingId: id,
        expectedVisitId: visit().visitId,
        expectedRevision: d.revision,
        open,
        operationId: crypto.randomUUID(),
      };
      await c.reducers.setConstructionDoor(args);
      await c.reducers.setConstructionDoor(args);
      await wait(() => {
        const s = status();
        return (
          !!s &&
          (side === "inner" ? s.innerFraction : s.outerFraction) ===
            (open ? 1 : 0) &&
          (side === "inner" ? s.innerSealRetraction : s.outerSealRetraction) ===
            (open ? 1 : 0) &&
          !s.manualServiceActive
        );
      }, side + " manual service accepted endpoint");
    };
    assert.equal(status().innerCanService, true);
    assert.equal(status().outerCanService, false);
    await operate("inner", true);
    await walkTraversalActor(c, 4, 1, send);
    const outer = [...c.db.ownConstructionDoors.iter()].find(
      (v) => v.id === status().outerDoorId,
    )!;
    await assert.rejects(
      c.reducers.setConstructionDoor({
        openingId: outer.id,
        expectedVisitId: visit().visitId,
        expectedRevision: outer.revision,
        open: true,
        operationId: crypto.randomUUID(),
      }),
    );
    await operate("inner", false);
    await operate("outer", true);
    await walkTraversalActor(c, 7, 1, send);
    assert.equal(status().outerCanService, true);
    await operate("outer", false);
    const paused = status().revision;
    await new Promise((r) => setTimeout(r, 450));
    assert.equal(status().revision, paused, "idle airlock must not rewrite");
    await operate("outer", true);
    await walkTraversalActor(c, 4, 1, send);
    await operate("outer", false);
    await operate("inner", true);
    await walkTraversalActor(c, 1, 1, send);
    await operate("inner", false);
    assert.equal(status().interiorPressurePa, 0);
    assert.equal(status().chamberPressurePa, 0);
    journeys.push({
      instanceId,
      innerDoorId: status().innerDoorId,
      outerDoorId: status().outerDoorId,
      acceptedManualCycle: true,
      interlockDenied: true,
      supportedExteriorLanding: true,
      idleNoWrites: true,
      initialVacuumPreserved: true,
    });
    await leaveTraversalReview(c);
    assert.equal(actor().id, original.id);
    assert.equal(actor().shipId, original.shipId);
    requireTraversalInventoryUnchanged(c, inventory);
  }
  return { original, journeys, inventoryPreserved: true };
}
