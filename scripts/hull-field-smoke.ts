/** Normal SDK probe on a separate -smoke database; no fixture-only reducers. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { DbConnection, tables } from "../packages/net/src/generated";
import { HULL_ACCESS_SOURCE as source } from "../packages/content/src/hull-access-profile";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { prefabWalkRoute } from "../packages/sim/src/prefab-construction";
import { shipLogicModel } from "../packages/sim/src/ship-logic-model";
import { walkNative, nextSequence } from "./native-starter-smoke";
import { operatorCall } from "./smoke-operator";

const host = process.env.SIDEREAL_SMOKE_URL!;
const database = process.env.SIDEREAL_SMOKE_DATABASE!;
assert(
  host && database?.endsWith("-smoke") && new URL(host).port !== "3100",
  "Isolated test server/database required",
);
operatorCall(
  host,
  database,
  "operator_set_starter_prefab",
  JSON.stringify(`field-starter-${Date.now()}`),
  JSON.stringify(source.id),
  JSON.stringify(defaultPrefabComponentCatalog().revision),
  "false",
);
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function wait(fn: () => boolean, label: string) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (fn()) return;
    await pause(25);
  }
  throw Error(`Field smoke timeout: ${label}`);
}
const c = await new Promise<DbConnection>((resolve, reject) => {
  const connection = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .onConnect(() => resolve(connection))
    .onConnectError((_ctx, e) => reject(e))
    .build();
});
try {
  let applied = false;
  c.subscriptionBuilder()
    .onApplied(() => {
      applied = true;
    })
    .subscribe([
      tables.ownCharacters,
      tables.ownShips,
      tables.ownConstructionLocation,
      tables.ownGameShipAccess,
      tables.visibleShipLogic,
      tables.ownEvaBody,
      tables.ownInventoryItems,
    ]);
  await wait(() => applied, "private subscriptions");
  await c.reducers.enterLab({ name: "Hull field probe" });
  await c.reducers.claimInputControl({});
  await wait(
    () =>
      c.db.ownCharacters.count() === 1n &&
      c.db.ownConstructionLocation.count() === 1n,
    "registered hull ship",
  );
  const actor = () => [...c.db.ownCharacters.iter()][0]!;
  const shipId = actor().shipId;
  const model = shipLogicModel(source, defaultPrefabComponentCatalog())!;
  await wait(
    () =>
      [...c.db.visibleShipLogic.iter()].filter((r) => r.shipId === shipId)
        .length === 6,
    "two actuators and four buttons",
  );
  assert(
    ![...c.db.visibleShipLogic.iter()].some(
      (r) => r.shipId === shipId && r.kind === "airlock-controller",
    ),
  );
  const receipts: unknown[] = [];
  for (const id of ["personnel", "cargo"]) {
    const panel = model.panels.find(
      (p) => p.deviceId === `${id}-inside-button`,
    )!;
    for (const point of prefabWalkRoute(
      source,
      defaultPrefabComponentCatalog(),
      [actor().localX, actor().localY],
      panel.front,
    ))
      await walkNative(c, ...point);
    const door = () =>
      [...c.db.visibleShipLogic.iter()].find(
        (r) => r.shipId === shipId && r.deviceId === `${id}-outer-actuator`,
      )!;
    assert.equal(door().open, false);
    const started = Date.now();
    await c.reducers.pressShipButton({ shipId, deviceId: panel.deviceId });
    await wait(() => door().open, "immediate open command");
    assert.equal(
      c.db.ownEvaBody.count(),
      0n,
      "Unsuited crew remains aboard behind the field",
    );
    receipts.push({
      door: id,
      opened: true,
      elapsedMs: Date.now() - started,
      standing: [actor().localX, actor().localY],
      pressureControllers: 0,
    });
    await assert.rejects(
      c.reducers.pressShipButton({ shipId, deviceId: `${id}-outside-button` }),
      /outside/,
    );
    const intent = (dx: number) =>
      c.reducers.setIntent({
        sequence: nextSequence(c),
        throttle: 0,
        turn: 0,
        dx,
        dy: 0,
        sprint: false,
      });
    const exitDeadline = Date.now() + 8000;
    while (c.db.ownEvaBody.count() === 0n && Date.now() < exitDeadline) {
      await intent(-1);
      await pause(50);
    }
    assert.equal(
      c.db.ownEvaBody.count(),
      1n,
      "Unsuited ordinary movement crosses the open physical door",
    );
    const body = [...c.db.ownEvaBody.iter()][0]!;
    assert.equal(body.exitShipId, shipId);
    receipts.push({ door: id, unsuitedExit: [body.localX, body.localY] });
    const entryDeadline = Date.now() + 10000;
    while (c.db.ownEvaBody.count() > 0n && Date.now() < entryDeadline) {
      await intent(0.6);
      await pause(50);
    }
    await intent(0);
    assert.equal(
      c.db.ownEvaBody.count(),
      0n,
      "Return is ordinary movement through the same aperture",
    );
    assert.equal(actor().shipId, shipId);
    await walkNative(c, ...panel.front);
    await c.reducers.pressShipButton({ shipId, deviceId: panel.deviceId });
    await wait(() => !door().open, "close command");
  }
  const receipt = {
    status: "PASS",
    profile: 3,
    ordinaryDoors: 2,
    buttons: 4,
    pressureControllers: 0,
    unsuitedInsideOpen: true,
    unsuitedMovementExitAndReturn: true,
    receipts,
  };
  if (process.env.SIDEREAL_HULL_FIELD_RECEIPT)
    writeFileSync(
      process.env.SIDEREAL_HULL_FIELD_RECEIPT,
      JSON.stringify(receipt, null, 2) + "\n",
    );
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  c.disconnect();
}
