import { CURRENT_WAYFARER_STARTER } from "../packages/content/src/wayfarer-current-starter";
import assert from "node:assert/strict";
import type { DbConnection } from "../packages/net/src/generated";
export async function interactionSmoke(
  a: DbConnection,
  b: DbConnection,
  wait: (fn: () => boolean, message: string) => Promise<void>,
) {
  await assert.rejects(
    a.reducers.interactObject({
      objectId: "missing",
      action: "sit",
      expectedRevision: 1n,
      operationId: "no-actor",
    }),
  );
  await a.reducers.enterLab({ name: "Interaction Smoke" });
  await wait(
    () => a.db.ownInteractions.count() === 4n,
    "interaction fixtures seeded",
  );
  const rows = () => [...a.db.ownInteractions.iter()];
  const actor = () => [...a.db.ownCharacters.iter()][0];
  const couch = () => rows().find((row) => row.kind === "seat")!;
  const light = () =>
    rows().find((row) => row.kind === "light" && row.localY === -1.5)!;
  const ids = rows()
    .map((row) => row.id)
    .sort();
  await a.reducers.enterLab({ name: "Interaction Smoke" });
  assert.deepEqual(
    rows()
      .map((row) => row.id)
      .sort(),
    ids,
  );
  assert(
    rows().every(
      (row) =>
        !("shipId" in row) && !("characterId" in row) && !("occupantId" in row),
    ),
  );
  await assert.rejects(
    b.reducers.interactObject({
      objectId: couch().id,
      action: "sit",
      expectedRevision: 1n,
      operationId: "foreign-couch",
    }),
  );
  await assert.rejects(
    a.reducers.interactObject({
      objectId: couch().id,
      action: "sit",
      expectedRevision: 1n,
      operationId: "far-couch",
    }),
  );
  let privateRejected = false;
  a.subscriptionBuilder()
    .onError(() => {
      privateRejected = true;
    })
    .subscribe("SELECT * FROM interaction_object");
  await wait(() => privateRejected, "private interaction base rejected");
  await a.reducers.claimInputControl({});
  let sequence = 0n;
  const intent = async (dx: number, dy: number) =>
    a.reducers.setIntent({
      sequence: ++sequence,
      dx,
      dy,
      throttle: 0,
      turn: 0,
      sprint: false,
    });
  const move = async (x: number, y: number) => {
    const deadline = Date.now() + 6000;
    while (Math.hypot(actor().localX - x, actor().localY - y) > 0.14) {
      if (Date.now() > deadline)
        throw Error(
          `Interaction walk blocked at ${actor().localX},${actor().localY} toward ${x},${y}`,
        );
      const dx = x - actor().localX,
        dy = y - actor().localY,
        scale = Math.max(1, Math.hypot(dx, dy));
      await intent(dx / scale, dy / scale);
      await new Promise((resolve) => setTimeout(resolve, 70));
    }
    await intent(0, 0);
  };
  const rebuilt =
    [...a.db.ownGameShipAccess.iter()][0]?.templateSha256 ===
    CURRENT_WAYFARER_STARTER.sha256;
  if (!rebuilt) await move(-2, -1.5);
  await move(0, -1.5);
  await move(0, 3);
  await move(2.25, 3);
  const sit = {
    objectId: couch().id,
    action: "sit",
    expectedRevision: couch().revision,
    operationId: "sit-1",
  };
  await a.reducers.setCombatAim({ active: true, angle: 0 });
  await a.reducers.interactObject(sit);
  assert.equal([...a.db.ownCombat.iter()][0].aimActive, false);
  await assert.rejects(a.reducers.setCombatAim({ active: true, angle: 0 }));
  await wait(() => couch().seatedByYou, "couch seated");
  const revision = couch().revision;
  await a.reducers.interactObject(sit);
  assert.equal(couch().revision, revision);
  await assert.rejects(a.reducers.interactObject({ ...sit, action: "stand" }));
  await assert.rejects(
    a.reducers.interactObject({
      ...sit,
      action: "stand",
      operationId: "stale-stand",
    }),
  );
  assert.equal(
    [...a.db.ownStations.iter()][0].occupantId,
    undefined,
    "couch grants no helm authority",
  );
  const seated = { x: actor().localX, y: actor().localY };
  await intent(1, 1);
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.deepEqual(
    { x: actor().localX, y: actor().localY },
    seated,
    "couch blocks walking",
  );
  await assert.rejects(a.reducers.useStation({}));
  await a.reducers.interactObject({
    objectId: couch().id,
    action: "stand",
    expectedRevision: couch().revision,
    operationId: "stand-1",
  });
  await wait(() => !couch().seatedByYou, "stand clears seat");
  await move(0, 3);
  await move(0, -1.5);
  if (rebuilt) {
    await move(0, -1);
    await move(-2.4, -1);
  }
  await move(-2.4, -1.5);
  await assert.rejects(
    a.reducers.interactObject({
      objectId: light().id,
      action: "open-door",
      expectedRevision: light().revision,
      operationId: "bad-action",
    }),
  );
  const toggle = {
    objectId: light().id,
    action: "set-light-off",
    expectedRevision: light().revision,
    operationId: "grow-off",
  };
  await a.reducers.interactObject(toggle);
  await wait(() => !light().enabled, "authoritative grow light off");
  await a.reducers.interactObject(toggle);
  if (rebuilt) {
    await move(-2.4, -1);
    await move(0, -1);
  }
  await move(0, -1.5);
  await move(0, 3);
  await assert.rejects(
    a.reducers.interactObject({
      ...toggle,
      expectedRevision: light().revision,
      operationId: "reach-lost",
    }),
  );
  await move(2.25, 3);
  await a.reducers.interactObject({
    objectId: couch().id,
    action: "sit",
    expectedRevision: couch().revision,
    operationId: "sit-disconnect",
  });
  await wait(() => couch().seatedByYou, "couch before disconnect");
  return { lightId: light().id };
}
