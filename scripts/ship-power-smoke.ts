/** Isolated S4-2 restart/lifecycle/leak proof. Requires smoke-only bindings and -smoke DB.
 * Run prepare, dev.py restart-database, then verify using the same evidence directory. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const host = process.env.SIDEREAL_SMOKE_URL ?? "",
  database = process.env.SIDEREAL_SMOKE_DATABASE ?? "",
  bindings = process.env.SIDEREAL_IFCS_TEST_BINDINGS ?? "",
  evidence = process.env.SIDEREAL_SMOKE_EVIDENCE_DIR ?? "";
if (
  !host ||
  new URL(host).port === "3100" ||
  !database.endsWith("-smoke") ||
  !evidence ||
  !resolve(bindings).startsWith(resolve(".runtime/smoke-runs") + "/")
)
  throw Error("Isolated power smoke bindings/database required");
const { DbConnection, tables } = await import(pathToFileURL(bindings).href);
async function wait(fn: () => boolean, label: string) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("Timeout: " + label);
}
async function client(token?: string) {
  let ready = false,
    saved = "";
  const c = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .withToken(token)
    .onConnect((c: any, _i: any, t: string) => {
      saved = t;
      c.subscriptionBuilder()
        .onApplied(() => (ready = true))
        .subscribe([
          tables.ownCharacters,
          tables.ownShips,
          tables.ownShipPower,
          tables.ownShipPowerDevices,
        ]);
    })
    .build();
  await wait(() => ready, "connected");
  return { c, token: saved };
}
const file = join(evidence, "ship-power-restart.json");
if (process.argv.includes("--verify-restart")) {
  const prior = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(prior.database, database);
  const session = await client(prior.token);
  try {
    const device = [...session.c.db.ownShipPowerDevices.iter()].find(
      (r: any) => r.id === prior.device.id,
    ) as any;
    assert(device, "installed UUID survives server process restart");
    assert.equal(device.energyJ, 123456, "restart does not recharge");
    await session.c.reducers.exercisePrefabPowerSmoke({ action: "recompile" });
    assert.equal(
      (
        [...session.c.db.ownShipPowerDevices.iter()].find(
          (r: any) => r.id === prior.device.id,
        ) as any
      ).energyJ,
      123456,
    );
    await session.c.reducers.exercisePrefabPowerSmoke({ action: "replace" });
    await wait(
      () =>
        ![...session.c.db.ownShipPowerDevices.iter()].some(
          (r: any) => r.id === prior.device.id,
        ),
      "retired UUID absent",
    );
    const replacement = [...session.c.db.ownShipPowerDevices.iter()].find(
      (r: any) => r.shipId === prior.shipId && r.mountId === "mount:battery",
    ) as any;
    assert(replacement);
    assert.notEqual(replacement.id, prior.device.id);
    assert.equal(replacement.energyJ, 0, "same-socket replacement empty");
    console.log(
      JSON.stringify({
        s42: {
          restart: true,
          deviceUUID: prior.device.id,
          preservedJ: 123456,
          replacementUUID: replacement.id,
          replacementJ: 0,
        },
      }),
    );
  } finally {
    session.c.disconnect();
  }
} else {
  const session = await client();
  try {
    await session.c.reducers.enterLab({ name: "Power Persistence" });
    await wait(
      () => [...session.c.db.ownCharacters.iter()].length === 1,
      "actor",
    );
    await session.c.reducers.assignPrefabSmokeShip({ prefabId: "fed.s.wren" });
    await wait(
      () =>
        [...session.c.db.ownShipPowerDevices.iter()].some(
          (r: any) => r.mountId === "mount:battery",
        ),
      "assigned ship",
    );
    const actor = [...session.c.db.ownCharacters.iter()][0] as any;
    await wait(
      () =>
        [...session.c.db.ownShipPowerDevices.iter()].some(
          (r: any) =>
            r.shipId === actor.shipId && r.mountId === "mount:battery",
        ),
      "issued power devices",
    );
    await wait(
      () =>
        [...session.c.db.ownShipPower.iter()].some(
          (r: any) => r.shipId === actor.shipId,
        ),
      "owner summary exists before privacy proof and timer freeze",
    );
    await session.c.reducers.exercisePrefabPowerSmoke({ action: "checkpoint" });
    await wait(
      () =>
        [...session.c.db.ownShipPowerDevices.iter()].some(
          (r: any) =>
            r.shipId === actor.shipId &&
            r.mountId === "mount:battery" &&
            r.energyJ === 123456,
        ),
      "non-full checkpoint",
    );
    const device = [...session.c.db.ownShipPowerDevices.iter()].find(
      (r: any) => r.shipId === actor.shipId && r.mountId === "mount:battery",
    ) as any;
    assert(
      [...session.c.db.ownShipPower.iter()].some(
        (r: any) => r.shipId === actor.shipId,
      ),
      "foreign-summary denial is checked against an existing owner summary",
    );
    const stranger = await client();
    try {
      await stranger.c.reducers.enterLab({ name: "Power Leak Observer" });
      await new Promise((r) => setTimeout(r, 100));
      assert(
        ![...stranger.c.db.ownShipPowerDevices.iter()].some(
          (r: any) => r.shipId === actor.shipId,
        ),
        "foreign installed state never exposed",
      );
      assert(
        ![...stranger.c.db.ownShipPower.iter()].some(
          (r: any) => r.shipId === actor.shipId,
        ),
        "foreign runtime summary never exposed",
      );
      for (const table of [
        "ship_power_device",
        "ship_power_installation",
        "ship_power_clock",
        "ship_power_state",
      ]) {
        let rejected = false;
        stranger.c
          .subscriptionBuilder()
          .onError(() => (rejected = true))
          .subscribe(`SELECT * FROM ${table}`);
        await wait(() => rejected, `private ${table} rejected`);
      }
    } finally {
      stranger.c.disconnect();
    }
    await session.c.reducers.exercisePrefabPowerSmoke({ action: "recompile" });
    await session.c.reducers.exercisePrefabPowerSmoke({
      action: "refit-retain",
    });
    const retained = [...session.c.db.ownShipPowerDevices.iter()].find(
      (r: any) => r.id === device.id,
    ) as any;
    assert(retained);
    assert.equal(
      retained.energyJ,
      123456,
      "compile/refit never fill retained battery",
    );
    writeFileSync(
      file,
      JSON.stringify(
        {
          database,
          token: session.token,
          shipId: actor.shipId,
          device: { id: device.id, energyJ: 123456 },
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        s42: {
          compile: true,
          refit: true,
          leakDenied: true,
          restartPrepared: true,
          deviceUUID: device.id,
          energyJ: 123456,
        },
      }),
    );
  } finally {
    session.c.disconnect();
  }
}
