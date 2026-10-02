/** Isolated targeted prefab replacement rehearsal; run after ship-wipe-seed.ts. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DbConnection, tables } from "../packages/net/src/generated";
import { nextSequence, walkNative } from "./native-starter-smoke";
import { prefabById } from "../packages/content/src/prefabs/index";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { prefabFlightModel } from "../packages/sim/src/prefab-flight";
import { prefabPilotPose } from "../packages/sim/src/construction-pilot";
import { prefabWalkRoute } from "../packages/sim/src/prefab-construction";
import { prefabCargoSockets } from "../packages/sim/src/prefab-cargo-sockets";
import { prefabBedSeats } from "../packages/sim/src/prefab-seats";

const host = process.env.SIDEREAL_SMOKE_URL ?? "",
  database = process.env.SIDEREAL_SMOKE_DATABASE ?? "",
  evidenceDirectory = process.env.SIDEREAL_SMOKE_EVIDENCE_DIR ?? "";
if (
  !host ||
  !evidenceDirectory ||
  !database.endsWith("-smoke") ||
  new URL(host).port === "3100"
)
  throw Error(
    "Targeted replacement requires an isolated smoke database and non-live server port",
  );
const seed = JSON.parse(
  readFileSync(join(evidenceDirectory, "ship-wipe-seed.json"), "utf8"),
) as {
  database: string;
  accounts: { token: string; characterId: string; shipId: string }[];
};
assert.equal(seed.database, database);
const owner = seed.accounts[0]!;
const resume = process.env.SIDEREAL_REPLACEMENT_RESUME === "1";
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function wait(fn: () => boolean, message: string) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (fn()) return;
    await pause(25);
  }
  throw Error("Timeout: " + message);
}
const python = (command: string, ...args: string[]) => {
  const out = execFileSync(
    "python3",
    [
      "scripts/ship_replace.py",
      command,
      "--server",
      host,
      "--database",
      database,
      ...args,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(out.slice(out.indexOf("{")));
};
async function client(token: string) {
  let ready = false;
  const c = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .withToken(token)
    .onConnect((c) => {
      c.subscriptionBuilder()
        .onApplied(() => {
          ready = true;
        })
        .subscribe([
          tables.ownCharacters,
          tables.ownShips,
          tables.ownGameShipAccess,
          tables.ownConstructionLocation,
          tables.ownWorldAdmission,
          tables.ownInventoryItems,
          tables.ownStations,
          tables.ownAuthoredFlights,
          tables.ownAuthoredFlightPhysics,
          tables.ownAuthoredFlightActuators,
          tables.ownReachableCargoContainers,
          tables.ownReachableCargoItems,
          tables.ownInteractions,
          tables.ownConstructionSeat,
          tables.ownInventoryState,
          tables.ownGroundItems,
        ]);
    })
    .build();
  await wait(() => ready, "subscription");
  return c;
}
// Exercise ordinary-account rejection and record its actual personal inventory before disconnect.
const before = await client(owner.token);
await before.reducers.enterLab({ name: "ignored" });
const plan = python(
  "plan",
  "--character-id",
  owner.characterId,
  "--target-prefab-id",
  "fed.m.wayfarer",
);
await assert.rejects(
  before.reducers.operatorReplacePrefabShip({
    operationId: "attacker-replace-0001",
    dryRun: true,
    ...plan,
    expectedInstanceRevision: BigInt(plan.expectedInstanceRevision),
  }),
);
before.disconnect();
await pause(500);
// A deployment-operator request with a stale source revision must fail before a ledger/apply.
assert.throws(() =>
  execFileSync(
    ".tools/spacetime/spacetime",
    [
      "--root-dir=.tools/spacetime",
      "call",
      "--server",
      host,
      "--yes",
      "--no-config",
      database,
      "operator_replace_prefab_ship",
      JSON.stringify("stale-replace-dry-0001"),
      "true",
      JSON.stringify(owner.characterId),
      JSON.stringify(owner.shipId),
      JSON.stringify(plan.expectedSourceBlueprintSha256),
      String(plan.expectedInstanceRevision + 1),
      JSON.stringify(plan.targetPrefabId),
      JSON.stringify(plan.expectedTargetCatalogRevision),
      JSON.stringify(plan.expectedTargetBlueprintSha256),
      "true",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ),
);
const backup = resume
  ? (() => {
      const files = readdirSync(join(evidenceDirectory, "backups")).filter(
        (p) => p.endsWith(".json"),
      );
      assert.equal(
        files.length,
        1,
        "resume requires the original unique pre-apply backup",
      );
      const path = join(evidenceDirectory, "backups", files[0]!);
      return {
        backup: path,
        sha256: createHash("sha256").update(readFileSync(path)).digest("hex"),
      };
    })()
  : python("export", "--out-dir", join(evidenceDirectory, "backups"));
// ownInventoryItems also includes nearby ship cargo. Pin personal membership
// from authoritative character roots, so discarded cargo is never mislabelled.
const backupRows = JSON.parse(readFileSync(backup.backup, "utf8")).tables;
const personalRoots = new Set<string>(
  backupRows.inventory_container_scope
    .filter(
      (r: any) =>
        r.root_kind === "character" &&
        r.root_character_id === owner.characterId,
    )
    .map((r: any) => r.root_container_id),
);
const personalIds: string[] = backupRows.inventory_item_membership
  .filter((r: any) => personalRoots.has(r.root_container_id))
  .map((r: any) => r.item_id)
  .sort();
const dry = resume
  ? python("ledger", "--operation-id", "rehearsal-replace-dry-0001")
  : python(
      "dry-run",
      "--operation-id",
      "rehearsal-replace-dry-0001",
      "--character-id",
      owner.characterId,
      "--target-prefab-id",
      "fed.m.wayfarer",
      "--discard-ship-storage",
    );
assert.equal(dry.summary.shipId, owner.shipId);
const applied = python(
  "apply",
  "--operation-id",
  "rehearsal-replace-apply-0001",
  "--from-dry-run",
  "rehearsal-replace-dry-0001",
  "--backup",
  backup.backup,
  "--confirm-database",
  database,
  "--discard-ship-storage",
);
const verified = python(
  "verify",
  "--operation-id",
  "rehearsal-replace-apply-0001",
  "--backup",
  backup.backup,
);
assert.equal(verified.verified, true);
const replay = python(
  "apply",
  "--operation-id",
  "rehearsal-replace-apply-0001",
  "--from-dry-run",
  "rehearsal-replace-dry-0001",
  "--backup",
  backup.backup,
  "--confirm-database",
  database,
  "--discard-ship-storage",
);
assert.deepEqual(replay, applied);
const c = await client(owner.token);
try {
  await c.reducers.enterLab({ name: "ignored" });
  await c.reducers.claimInputControl({});
  const actor = () => [...c.db.ownCharacters.iter()][0]!;
  await wait(() => actor()?.shipId === owner.shipId, "same ship boarding");
  assert.deepEqual(
    [...c.db.ownInventoryItems.iter()].map((r) => r.id).sort(),
    personalIds,
  );
  await wait(
    () =>
      [...c.db.ownAuthoredFlightPhysics.iter()].some(
        (r) => r.shipId === owner.shipId && r.status === "ready",
      ),
    "replacement flight ready",
  );
  const prefab = prefabById("fed.m.wayfarer")!,
    catalog = defaultPrefabComponentCatalog();
  const reached: Record<string, unknown> = {};
  // Reach every authored storage fixture through actual intent/reducer walking.
  for (const socket of prefabCargoSockets(prefab, 0, catalog)) {
    let selected:
      | {
          point: readonly number[];
          route: readonly (readonly [number, number])[];
        }
      | undefined;
    // Alternate approaches are evaluated purely; the first actual transport failure is fatal.
    for (const p of socket.approachesM) {
      try {
        const route = prefabWalkRoute(
          prefab,
          catalog,
          [actor().localX, actor().localY],
          p,
        );
        selected = { point: p, route };
        break;
      } catch {
        /* pure approach not connected */
      }
    }
    assert(selected, `storage ${socket.key} has a connected pure route`);
    for (const [x, y] of selected.route) await walkNative(c, x, y);
    await wait(
      () =>
        [...c.db.ownReachableCargoContainers.iter()].some((r) =>
          r.placedObjectId.endsWith(":" + socket.key),
        ),
      "actual scoped crate inventory: " + socket.key,
    );
    reached[socket.key] = { standingAt: [actor().localX, actor().localY] };
  }
  const seatedBeds: string[] = [];
  for (const bed of prefabBedSeats(prefab, catalog)) {
    for (const [x, y] of prefabWalkRoute(
      prefab,
      catalog,
      [actor().localX, actor().localY],
      [bed.approachX, bed.approachY],
    ))
      await walkNative(c, x, y);
    const objectId = `${owner.shipId}:seat:${bed.placementId}`;
    const interaction = () =>
      [...c.db.ownInteractions.iter()].find((r) => r.id === objectId);
    await wait(
      () => !!interaction()?.reachable,
      "bed approach " + bed.placementId,
    );
    const gear = [...c.db.ownInventoryItems.iter()].filter(
      (r) => r.equipmentSlot === "back" || r.equipmentSlot === "belt",
    );
    if (gear.length) {
      assert.equal(interaction()!.enabled, false, "bulky gear disables bed");
      await assert.rejects(
        c.reducers.interactObject({
          objectId,
          action: "sit",
          expectedRevision: interaction()!.revision,
          operationId: crypto.randomUUID(),
        }),
        /Stow back gear and equipment belt/i,
      );
      for (const item of gear) {
        await c.reducers.dropInventoryItem({
          itemId: item.id,
          expectedRevision: [...c.db.ownInventoryState.iter()][0]!.revision,
          operationId: crypto.randomUUID(),
        });
        await wait(
          () => [...c.db.ownGroundItems.iter()].some((r) => r.id === item.id),
          "stowed bed gear",
        );
      }
    }
    await wait(
      () => interaction()!.enabled,
      "bed enabled after normal gear stow",
    );
    await c.reducers.interactObject({
      objectId,
      action: "sit",
      expectedRevision: interaction()!.revision,
      operationId: crypto.randomUUID(),
    });
    await wait(
      () =>
        [...c.db.ownConstructionSeat.iter()].some(
          (r) => r.objectId === objectId,
        ),
      "bed seated",
    );
    await c.reducers.interactObject({
      objectId,
      action: "stand",
      expectedRevision: interaction()!.revision,
      operationId: crypto.randomUUID(),
    });
    await wait(
      () => [...c.db.ownConstructionSeat.iter()].length === 0,
      "bed stand recovery",
    );
    for (const item of gear) {
      await c.reducers.transferInventoryItem({
        itemId: item.id,
        containerId: "",
        expectedRevision: [...c.db.ownInventoryState.iter()][0]!.revision,
        operationId: crypto.randomUUID(),
      });
      await wait(
        () => [...c.db.ownInventoryItems.iter()].some((r) => r.id === item.id),
        "bed gear pickup",
      );
      if (
        ![...c.db.ownInventoryItems.iter()].find((r) => r.id === item.id)!
          .equipmentSlot
      )
        await c.reducers.equipInventoryItem({
          itemId: item.id,
          expectedRevision: [...c.db.ownInventoryState.iter()][0]!.revision,
          operationId: crypto.randomUUID(),
        });
      await wait(
        () =>
          [...c.db.ownInventoryItems.iter()].some(
            (r) => r.id === item.id && r.equipmentSlot === item.equipmentSlot,
          ),
        "bed gear restored",
      );
    }
    seatedBeds.push(bed.placementId);
  }
  assert.equal(seatedBeds.length, 2);
  const model = prefabFlightModel(prefab, catalog),
    pose = prefabPilotPose(model.station!);
  for (const [x, y] of prefabWalkRoute(
    prefab,
    catalog,
    [actor().localX, actor().localY],
    pose.approach,
  ))
    await walkNative(c, x, y);
  const flight = () =>
    [...c.db.ownAuthoredFlights.iter()].find((r) => r.shipId === owner.shipId)!;
  await c.reducers.enterAuthoredPilot({
    stationId: flight().stationId,
    expectedStationRevision: flight().stationRevision,
    operationId: crypto.randomUUID(),
  });
  await wait(() => flight().seatState === "seated", "seated");
  const shipOf = () => [...c.db.ownShips.iter()][0]!;
  const samples: {
    axis: string;
    vx: number;
    vy: number;
    heading: number;
    omega: number;
    activeActuators: string[];
  }[] = [];
  let lateralOutputs = 0;
  async function command(
    throttle: number,
    turn: number,
    frames: number,
    axis: string,
  ) {
    for (let n = 0; n < frames; n++) {
      await c.reducers.setIntent({
        sequence: nextSequence(c),
        throttle,
        turn,
        dx: 0,
        dy: 0,
        sprint: false,
      });
      await pause(60);
      lateralOutputs += [...c.db.ownAuthoredFlightActuators.iter()].filter(
        (r) =>
          r.shipId === owner.shipId &&
          Math.abs(r.exhaustX) > 0.5 &&
          r.throttle > 1e-5,
      ).length;
    }
    const ship = shipOf();
    samples.push({
      axis,
      vx: ship.vx,
      vy: ship.vy,
      heading: ship.heading,
      omega: ship.omega,
      activeActuators: [...c.db.ownAuthoredFlightActuators.iter()]
        .filter((r) => r.throttle > 1e-5)
        .map((r) => r.id),
    });
  }
  await command(1, 0, 25, "forward");
  const speed = Math.hypot(shipOf().vx, shipOf().vy);
  assert(speed > 0.3, `actual forward flight accelerates: ${speed}`);
  await command(-1, 0, 80, "reverse");
  const reverse =
    -Math.sin(shipOf().heading) * shipOf().vx +
    Math.cos(shipOf().heading) * shipOf().vy;
  assert(reverse < -0.1, `actual reverse thrust reverses velocity: ${reverse}`);
  const heading0 = shipOf().heading;
  await command(1, 1, 40, "moving-yaw");
  assert(
    Math.abs(shipOf().heading - heading0) > 1e-3,
    "actual yaw thrust turns ship",
  );
  assert(lateralOutputs > 0, "moving turn consumes real lateral RCS actuators");
  await command(0, 0, 1, "release");
  writeFileSync(
    join(evidenceDirectory, "ship-replacement-smoke.json"),
    JSON.stringify(
      {
        database,
        verified,
        backupSha256: backup.sha256,
        sourceStorageDiscarded: applied.summary.discardedItems,
        personalItemsPreserved: personalIds.length,
        reached,
        seatedBeds,
        flightSpeedMs: speed,
        reverseSpeedMs: reverse,
        lateralOutputSamples: lateralOutputs,
        samples,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
} finally {
  c.disconnect();
}
console.log("Targeted replacement smoke passed");
