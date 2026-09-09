import { enterNativePilot, leaveNativePilot } from "./native-starter-smoke";
import assert from "node:assert/strict";
import type { DbConnection } from "../packages/net/src/generated";
export async function combatSmoke(
  a: DbConnection,
  b: DbConnection,
  wait: (fn: () => boolean, message: string) => Promise<void>,
) {
  await assert.rejects(a.reducers.setCombatAim({ active: true, angle: 0 }));
  await a.reducers.enterLab({ name: "Combat Smoke" });
  await a.reducers.claimStarterKit({});
  await a.reducers.claimInputControl({});
  await enterNativePilot(a, true);
  const state = () => [...a.db.ownCombat.iter()][0];
  const inventory = () => [...a.db.ownInventoryState.iter()][0];
  const item = (definitionId: string) =>
    [...a.db.ownInventoryItems.iter()].find(
      (i) => i.definitionId === definitionId,
    )!;
  const equip = async (id: string) =>
    a.reducers.equipInventoryItem({
      itemId: id,
      expectedRevision: inventory().revision,
      operationId: crypto.randomUUID(),
    });
  await wait(() => a.db.ownCombat.count() === 1n, "combat owner projection");
  const pistol = item("compact-pistol");
  await equip(pistol.id);
  let hidden = false;
  a.subscriptionBuilder()
    .onError(() => {
      hidden = true;
    })
    .subscribe("SELECT * FROM weapon_energy");
  await wait(() => hidden, "private weapon energy rejected");
  await assert.rejects(a.reducers.setCombatAim({ active: true, angle: 0 }));
  await assert.rejects(
    a.reducers.fireWeapon({
      itemId: pistol.id,
      expectedRevision: 0n,
      operationId: crypto.randomUUID(),
    }),
  );
  await leaveNativePilot(a);
  await a.reducers.setCombatAim({ active: true, angle: 5 * Math.PI });
  await wait(() => state().aimActive, "aim active");
  assert(Math.abs(Math.abs(state().aimAngle) - Math.PI) < 1e-8);
  const shot = {
    itemId: pistol.id,
    expectedRevision: state().revision,
    operationId: crypto.randomUUID(),
  };
  await assert.rejects(b.reducers.fireWeapon(shot));
  await a.reducers.fireWeapon(shot);
  await a.reducers.fireWeapon(shot);
  assert.equal(state().shotSequence, 1n);
  assert.equal(state().energy, 92);
  assert.equal(state().revision, 1n);
  await assert.rejects(
    a.reducers.fireWeapon({ ...shot, expectedRevision: 1n }),
  );
  await assert.rejects(
    a.reducers.fireWeapon({
      ...shot,
      expectedRevision: 1n,
      operationId: crypto.randomUUID(),
    }),
  );
  await new Promise((r) => setTimeout(r, 400));
  await wait(() => !state().aimActive, "stale aim clears");
  await assert.rejects(
    a.reducers.fireWeapon({
      itemId: pistol.id,
      expectedRevision: 1n,
      operationId: crypto.randomUUID(),
    }),
  );
  await a.reducers.setCombatAim({ active: true, angle: 0.25 });
  await assert.rejects(
    a.reducers.fireWeapon({ ...shot, operationId: crypto.randomUUID() }),
  );
  await a.reducers.fireWeapon({
    itemId: pistol.id,
    expectedRevision: 1n,
    operationId: crypto.randomUUID(),
  });
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 270));
    await a.reducers.setCombatAim({ active: true, angle: 0.25 });
    await a.reducers.fireWeapon({
      itemId: pistol.id,
      expectedRevision: state().revision,
      operationId: crypto.randomUUID(),
    });
  }
  await new Promise((r) => setTimeout(r, 270));
  await a.reducers.setCombatAim({ active: true, angle: 0.25 });
  await assert.rejects(
    a.reducers.fireWeapon({
      itemId: pistol.id,
      expectedRevision: state().revision,
      operationId: crypto.randomUUID(),
    }),
  );
  assert.equal(
    state().energy,
    4,
    "twelve accepted pistol shots exhaust usable energy",
  );
  const spent = state().energy,
    revision = state().revision;
  await equip(item("carbine").id);
  await equip(pistol.id);
  assert.equal(state().revision, revision);
  assert.equal(state().energy, spent);
  assert.equal(state().weaponItemId, pistol.id);
  await new Promise((r) => setTimeout(r, 1900));
  await wait(
    () => state().energy > spent,
    "authoritative passive energy recovery",
  );
  assert.equal(
    state().revision,
    revision,
    "passive energy must not churn action CAS",
  );
  await a.reducers.setCombatAim({ active: true, angle: 0 });
  await enterNativePilot(a);
  assert.equal(state().aimActive, false, "helm clears aim");
  await leaveNativePilot(a);
  // Keep a fresh intent across disconnect so reconnect must prove authority clears it.
  await a.reducers.setCombatAim({ active: true, angle: 0.5 });
  return {
    itemId: pistol.id,
    revision: state().revision.toString(),
    shotSequence: state().shotSequence.toString(),
    energy: state().energy,
  };
}
