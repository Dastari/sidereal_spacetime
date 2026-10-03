/** Real reducer qualification against one explicitly named additive review database. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DbConnection, tables } from "../packages/net/src/generated";
import { prefabById } from "../packages/content/src/prefabs/index";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { readFurnishingOverrides } from "../packages/content/src/wayfarer-furnishings";
import { prefabShipObjects } from "../packages/sim/src/prefab-deck-objects";
import { prefabCargoSockets } from "../packages/sim/src/prefab-cargo-sockets";
import {
  prefabWalkFrame,
  prefabWalkRoute,
} from "../packages/sim/src/prefab-construction";
import { canOccupyDeck } from "../packages/sim/src/construction-collision";
import {
  planFurnishingEdit,
  furnishingDoorwayAnchors,
  validateFurnishingPlacement,
  deckRouteGroups,
} from "../packages/sim/src/ship-furnishings";
import { prefabFlightModel } from "../packages/sim/src/prefab-flight";
import { prefabPilotPose } from "../packages/sim/src/construction-pilot";
import { nextSequence, walkNative } from "./native-starter-smoke";
const host = process.env.SIDEREAL_SMOKE_URL ?? "",
  database = process.env.SIDEREAL_SMOKE_DATABASE ?? "";
if (
  host !== "http://127.0.0.1:3100" ||
  database !== "sidereal-spacetime-dev-review-wayfarer-furnish-r001"
)
  throw Error("Exact isolated furnishing review target required");
const evidence =
  process.env.SIDEREAL_SMOKE_EVIDENCE_DIR ?? ".runtime/furnishing-review";
mkdirSync(evidence, { recursive: true, mode: 0o700 });
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function wait(fn: () => boolean, label: string) {
  const end = Date.now() + 20000;
  while (Date.now() < end) {
    if (fn()) return;
    await pause(30);
  }
  throw Error("Timeout: " + label);
}
function operator(reducer: string, ...args: unknown[]) {
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
      reducer,
      ...args.map((a) => JSON.stringify(a)),
    ],
    { stdio: "pipe" },
  );
}
function sql(query: string): unknown[][] {
  const out = execFileSync(
    ".tools/spacetime/spacetime",
    [
      "--root-dir=.tools/spacetime",
      "sql",
      "--server",
      host,
      "--format=json",
      "--no-config",
      database,
      query,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(out)[0].rows;
}
const quote = (v: string) => "'" + v.replaceAll("'", "''") + "'";
const liveSchema = async () =>
  createHash("sha256")
    .update(
      Buffer.from(
        await (
          await fetch(
            host + "/v1/database/sidereal-spacetime-dev/schema?version=9",
          )
        ).arrayBuffer(),
      ),
    )
    .digest("hex");
assert.equal(
  await liveSchema(),
  "99630b29806b5f36a898691d3983c6d1892b5fc2d94b11e559522fe44c83528c",
);
const prefab = prefabById("fed.m.wayfarer")!,
  catalog = defaultPrefabComponentCatalog();
const savedFile = join(evidence, "fixture.json");
const resume = process.env.SIDEREAL_FURNISHING_RESUME === "1";
const saved = resume ? JSON.parse(readFileSync(savedFile, "utf8")) : undefined;
if (!resume)
  operator(
    "operator_set_starter_prefab",
    crypto.randomUUID(),
    prefab.id,
    catalog.revision,
    false,
  );
let ready = false,
  token = "";
const c = DbConnection.builder()
  .withUri(host)
  .withDatabaseName(database)
  .withToken(saved?.token)
  .onConnect((conn, _id, t) => {
    token = t;
    conn
      .subscriptionBuilder()
      .onApplied(() => (ready = true))
      .subscribe([
        tables.ownCharacters,
        tables.ownShips,
        tables.ownConstructionInstances,
        tables.ownConstructionLocation,
        tables.ownGameShipAccess,
        tables.ownWorldAdmission,
        tables.ownAuthoredFlights,
        tables.ownAuthoredFlightPhysics,
        tables.ownInteractions,
        tables.ownConstructionSeat,
        tables.ownReachableCargoContainers,
        tables.ownReachableCargoItems,
      ]);
  })
  .build();
await wait(() => ready, "subscription");
const actor = () => [...c.db.ownCharacters.iter()][0]!,
  instance = () => [...c.db.ownConstructionInstances.iter()][0]!,
  physics = () => [...c.db.ownAuthoredFlightPhysics.iter()][0]!;
const overlays = () => readFurnishingOverrides(instance().furnishingsJson);
const request = (
  sourceObjectId: string,
  action: string,
  proposal = { dx: 0, dy: 0, yaw: 0, snap: false },
) => ({
  instanceId: instance().id,
  sourceObjectId,
  action,
  ...proposal,
  expectedRevision: instance().furnishingRevision,
  operationId: crypto.randomUUID(),
});
async function walk(point: readonly [number, number]) {
  for (const p of prefabWalkRoute(
    prefab,
    catalog,
    [actor().localX, actor().localY],
    point,
    0.3,
    overlays(),
  ))
    await walkNative(c, ...p);
}
function approach(id: string, proposal = overlays()) {
  const o = prefabShipObjects(prefab, catalog, overlays()).find(
      (r) => r.sourceId === id,
    )!,
    before = prefabWalkFrame(prefab, catalog, overlays()),
    after = prefabWalkFrame(prefab, catalog, proposal);
  for (let x = -6.25; x <= 6.25; x += 0.25)
    for (let y = -10.75; y <= 12.75; y += 0.25) {
      const p: [number, number] = [x, y];
      if (
        Math.hypot(
          Math.max(o.min[0] - y, 0, y - o.max[0]),
          Math.max(o.min[1] + x, 0, -x - o.max[1]),
        ) > 2.8
      )
        continue;
      if (
        !canOccupyDeck(
          before,
          { shipId: before.shipId, deckId: before.deckId, position: p },
          0.3,
        ) ||
        !canOccupyDeck(
          after,
          { shipId: after.shipId, deckId: after.deckId, position: p },
          0.3,
        )
      )
        continue;
      try {
        prefabWalkRoute(
          prefab,
          catalog,
          [actor().localX, actor().localY],
          p,
          0.3,
          overlays(),
        );
        return p;
      } catch {
        /* Pure disconnected candidate. */
      }
    }
  throw Error("No connected standing approach for " + id);
}
try {
  await c.reducers.enterLab({ name: "Furnishing authority fixture" });
  await c.reducers.claimInputControl({});
  await wait(
    () => !!instance() && physics()?.status === "ready",
    "authored Wayfarer ready",
  );
  const source = {
    id: instance().id,
    revision: String(instance().revision),
    blueprintSha256: instance().blueprintSha256,
    documentJson: instance().documentJson,
  };
  if (resume) {
    assert.equal(instance().furnishingsJson, saved.furnishingsJson);
    assert.deepEqual(source, saved.source);
    await c.reducers.editShipFurnishing({
      ...saved.tombstone,
      expectedRevision: BigInt(saved.tombstone.expectedRevision),
    });
    assert.equal(instance().furnishingsJson, saved.furnishingsJson);
    await c.reducers.editShipFurnishing({
      ...saved.emptyDelete,
      expectedRevision: BigInt(saved.emptyDelete.expectedRevision),
    });
    assert.equal(
      sql(
        "SELECT lifecycle FROM inventory_container_scope WHERE container_id = " +
          quote(saved.emptyRootId),
      )[0][0],
      "retired",
    );
    console.log("Furnishing reload and exact tombstone replay passed");
  } else {
    const lounge = "Lounge_coffee_table",
      pose = { dx: 0.05, dy: 1.123, yaw: 0.21, snap: false },
      planned = planFurnishingEdit(prefab, overlays(), {
        sourceObjectId: lounge,
        action: "move",
        ...pose,
      });
    await walk(approach(lounge, planned));
    const move = request(lounge, "move", pose);
    await c.reducers.editShipFurnishing(move);
    await wait(
      () => instance().furnishingRevision === move.expectedRevision + 1n,
      "accepted movement",
    );
    assert.deepEqual(overlays()[lounge], { ...pose, deleted: false });
    const afterMove = instance().furnishingsJson;
    await assert.rejects(
      c.reducers.editShipFurnishing({
        ...move,
        dx: 31,
        operationId: crypto.randomUUID(),
        expectedRevision: instance().furnishingRevision,
      }),
    );
    assert.equal(instance().furnishingsJson, afterMove);
    await assert.rejects(
      c.reducers.editShipFurnishing(
        request("Cockpit_command_station", "delete"),
      ),
    );
    const cargo = "Cargo_crate_small_white";
    await walk(approach(cargo));
    const beforeStockRevision = physics().revision;
    operator(
      "operator_stock_ship_cargo",
      crypto.randomUUID(),
      false,
      actor().id,
      actor().shipId,
      cargo,
      "Smoke preserved cargo",
      JSON.stringify(["compact-pistol"]),
    );
    await wait(
      () =>
        [...c.db.ownReachableCargoItems.iter()].some(
          (i) => i.definitionId === "compact-pistol",
        ),
      "stocked cargo view",
    );
    await wait(
      () =>
        physics().revision > beforeStockRevision &&
        physics().status === "ready",
      "stocked cargo flight compiler",
    );
    const container = [...c.db.ownReachableCargoContainers.iter()].find((r) =>
        r.placedObjectId.endsWith(":" + cargo),
      )!,
      items = [...c.db.ownReachableCargoItems.iter()]
        .filter((i) => i.containerId === container.id)
        .map((i) => i.id)
        .sort();
    await assert.rejects(
      c.reducers.editShipFurnishing(request(cargo, "delete")),
    );
    assert.deepEqual(
      [...c.db.ownReachableCargoItems.iter()]
        .filter((i) => i.containerId === container.id)
        .map((i) => i.id)
        .sort(),
      items,
    );
    const beforePhysics = { ...physics() },
      beforeFrame = prefabWalkFrame(prefab, catalog, overlays());
    let acceptedPose: typeof pose | undefined;
    for (const dx of [0.05, -0.05, 0.25, -0.25, 0.5, -0.5])
      for (const dy of [0.05, -0.05, 0.25, -0.25]) {
        if (acceptedPose) continue;
        const candidate = { dx, dy, yaw: 0, snap: false },
          next = planFurnishingEdit(prefab, overlays(), {
            sourceObjectId: cargo,
            action: "move",
            ...candidate,
          });
        try {
          const after = prefabWalkFrame(prefab, catalog, next);
          validateFurnishingPlacement(
            cargo,
            next,
            beforeFrame,
            after,
            [[actor().localX, actor().localY]],
            furnishingDoorwayAnchors(prefab, beforeFrame),
          );
          const socket = prefabCargoSockets(prefab, 0, catalog, next).find(
            (s) => s.key === cargo,
          )!;
          assert(
            socket.approachesM.some((p) =>
              canOccupyDeck(
                after,
                { shipId: after.shipId, deckId: after.deckId, position: p },
                0.3,
              ),
            ),
          );
          const routes = deckRouteGroups(after, [
            [actor().localX, actor().localY],
            ...socket.approachesM,
          ]);
          assert(
            routes.slice(1).some((g) => g > 0 && g === routes[0]),
            "reachable moved cargo approach",
          );
          acceptedPose = candidate;
        } catch {
          /* Bounded pure proposal search, no reducer retries. */
        }
      }
    assert(acceptedPose, "qualified cargo movement exists");
    const cargoMove = request(cargo, "move", acceptedPose);
    await c.reducers.editShipFurnishing(cargoMove);
    await wait(
      () =>
        instance().furnishingRevision === cargoMove.expectedRevision + 1n &&
        physics().revision > beforePhysics.revision,
      "cargo flight recompile",
    );
    assert.equal(physics().status, "ready");
    assert.equal(physics().massKg, beforePhysics.massKg);
    assert(
      Math.hypot(
        physics().centerX - beforePhysics.centerX,
        physics().centerY - beforePhysics.centerY,
      ) > 1e-9,
      "moved loaded root changes flight COM",
    );
    assert(
      [...c.db.ownReachableCargoContainers.iter()].some(
        (r) => r.id === container.id,
      ),
    );
    assert.deepEqual(
      [...c.db.ownReachableCargoItems.iter()]
        .filter((i) => i.containerId === container.id)
        .map((i) => i.id)
        .sort(),
      items,
    );
    await walk(approach(lounge));
    const tombstone = request(lounge, "delete");
    await c.reducers.editShipFurnishing(tombstone);
    await wait(() => overlays()[lounge]?.deleted, "tombstone");
    const bytes = instance().furnishingsJson;
    await c.reducers.editShipFurnishing(tombstone);
    assert.equal(instance().furnishingsJson, bytes);
    await assert.rejects(
      c.reducers.editShipFurnishing({
        ...tombstone,
        action: "move",
        operationId: crypto.randomUUID(),
        expectedRevision: instance().furnishingRevision,
      }),
    );
    const empty = "Cargo_crate_yellow",
      visit = [...c.db.ownConstructionLocation.iter()][0]!;
    const emptyScope = sql(
      "SELECT container_id,access_x,access_y FROM inventory_container_scope WHERE placed_object_id = " +
        quote(`${actor().shipId}:${visit.deckId}:${empty}`),
    )[0];
    assert(emptyScope);
    await walk([Number(emptyScope[1]), Number(emptyScope[2])]);
    await wait(
      () =>
        [...c.db.ownReachableCargoContainers.iter()].some(
          (r) => r.id === emptyScope[0],
        ),
      "empty storage admitted view",
    );
    const emptyRoot = [...c.db.ownReachableCargoContainers.iter()].find(
      (r) => r.id === emptyScope[0],
    )!;
    const rootBefore = sql(
      "SELECT id, ship_id, parent_item_id, amount_litres FROM inventory_container WHERE id = " +
        quote(emptyRoot.id),
    );
    const bindingBefore = sql(
      "SELECT instance_id, deck_id, placed_object_id, container_id FROM instance_inventory_binding WHERE container_id = " +
        quote(emptyRoot.id),
    );
    const emptyDelete = request(empty, "delete"),
      beforeDeletePhysics = physics().revision;
    await c.reducers.editShipFurnishing(emptyDelete);
    await wait(
      () =>
        overlays()[empty]?.deleted &&
        physics().revision > beforeDeletePhysics &&
        physics().status === "ready",
      "empty tombstone flight qualification",
    );
    await c.reducers.editShipFurnishing(emptyDelete);
    assert.deepEqual(
      sql(
        "SELECT id, ship_id, parent_item_id, amount_litres FROM inventory_container WHERE id = " +
          quote(emptyRoot.id),
      ),
      rootBefore,
    );
    assert.deepEqual(
      sql(
        "SELECT instance_id, deck_id, placed_object_id, container_id FROM instance_inventory_binding WHERE container_id = " +
          quote(emptyRoot.id),
      ),
      bindingBefore,
    );
    assert.equal(
      sql(
        "SELECT lifecycle FROM inventory_container_scope WHERE container_id = " +
          quote(emptyRoot.id),
      )[0][0],
      "retired",
    );
    const pilot = prefabPilotPose(prefabFlightModel(prefab, catalog).station!);
    await walk(pilot.approach);
    const flight = [...c.db.ownAuthoredFlights.iter()][0]!;
    await c.reducers.enterAuthoredPilot({
      stationId: flight.stationId,
      expectedStationRevision: flight.stationRevision,
      operationId: crypto.randomUUID(),
    });
    await wait(
      () => [...c.db.ownAuthoredFlights.iter()][0]?.seatState === "seated",
      "pilot with relocated cargo",
    );
    await c.reducers.setIntent({
      sequence: nextSequence(c),
      throttle: 0.1,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
    await pause(100);
    await c.reducers.setIntent({
      sequence: nextSequence(c),
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
    await c.reducers.leaveAuthoredPilot({});
    assert.deepEqual(
      {
        id: instance().id,
        revision: String(instance().revision),
        blueprintSha256: instance().blueprintSha256,
        documentJson: instance().documentJson,
      },
      source,
    );
    writeFileSync(
      savedFile,
      JSON.stringify(
        {
          database,
          token,
          source,
          furnishingsJson: instance().furnishingsJson,
          emptyDelete: {
            ...emptyDelete,
            expectedRevision: String(emptyDelete.expectedRevision),
          },
          emptyRootId: emptyRoot.id,
          tombstone: {
            ...tombstone,
            expectedRevision: String(tombstone.expectedRevision),
          },
          containerId: container.id,
          items,
          physics: {
            massKg: physics().massKg,
            centerX: physics().centerX,
            centerY: physics().centerY,
          },
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    console.log(
      "Furnishing save, move, collision rollback, fixed refusal, cargo contents/UUID, COM recompile, pilot and tombstone replay passed",
    );
  }
  assert.equal(
    await liveSchema(),
    "99630b29806b5f36a898691d3983c6d1892b5fc2d94b11e559522fe44c83528c",
  );
} finally {
  c.disconnect();
}
