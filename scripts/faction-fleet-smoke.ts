/** Isolated fleet rehearsal: fixtures seed ships/suits only; every handoff uses real intent. */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { writeFileSync } from "node:fs";
import {
  FEDERATION_FLEET,
  FLEET_WAYFARER,
  FEDERATION_FLEET_ACCESS,
} from "../packages/content/src/prefabs/federation-fleet";
import { prefabCargoSockets } from "../packages/sim/src/prefab-cargo-sockets";
import {
  WAYFARER_ACCESS_SOURCE,
  isWayfarerAccessProfile,
} from "../packages/content/src/wayfarer-access-profile";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import type { ShipPrefabDocumentV1 } from "../packages/content/src/ship-prefab";
import {
  prefabWalkRoute,
  prefabWalkFrame,
} from "../packages/sim/src/prefab-construction";
import { canOccupyDeck } from "../packages/sim/src/construction-collision";
import { prefabFlightModel } from "../packages/sim/src/prefab-flight";
import { prefabPilotPose } from "../packages/sim/src/construction-pilot";
import {
  shipLogicModel,
  reachablePanel,
} from "../packages/sim/src/ship-logic-model";
import {
  EVA,
  prefabEvaModel,
  shipToWorld,
  worldToShip,
} from "../packages/sim/src/eva";
import { FEDERATION_FLEET_PIN_SET } from "../packages/world/src/faction-fleet-pins";
import {
  nextSequence,
  walkNative,
  STARTER_PREFAB,
  acquireNativePilot,
} from "./native-starter-smoke";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Point = [number, number];
type Ship = { id: string; document: ShipPrefabDocumentV1 };
type AccessRole = "personnel" | "cargo";
const print = console.log.bind(console);
// SDK/helpers/CLI failures may contain private rows or identities. Emit only enum/count evidence.
console.log = console.warn = console.error = () => {};
const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
let phase = "GUARD";
const passed: string[] = [];
let changedPrivateTables: string[] = [];
let step = "INITIAL";
let diagnosticFile: string | undefined;
const recordPhase = () => {
  passed.push(phase);
  print(JSON.stringify({ status: "RUNNING", completedPhase: phase }));
};
function check(ok: unknown) {
  if (!ok) throw Error("ASSERTION");
}
async function wait(ok: () => boolean, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (ok()) return;
    await pause(25);
  }
  throw Error("TIMEOUT");
}
async function denied(action: () => Promise<unknown>) {
  let rejected = false;
  try {
    await action();
  } catch {
    rejected = true;
  }
  check(rejected);
}
const encode = (value: unknown) =>
  JSON.stringify(value, (_key, v) =>
    typeof v === "bigint"
      ? v.toString()
      : v?.toHexString instanceof Function
        ? v.toHexString()
        : v,
  );
const catalog = defaultPrefabComponentCatalog();

async function main() {
  const host = process.env.SIDEREAL_SMOKE_URL ?? "";
  const database = process.env.SIDEREAL_SMOKE_DATABASE ?? "";
  const bindings = process.env.SIDEREAL_IFCS_TEST_BINDINGS ?? "";
  const endpoint = new URL(host);
  check(
    ["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) &&
      endpoint.port === "3184",
  );
  check(
    database.endsWith("-smoke") &&
      bindings &&
      resolve(bindings).startsWith(resolve(".runtime/smoke-runs") + "/"),
  );
  diagnosticFile = resolve(
    dirname(dirname(dirname(resolve(bindings)))),
    "fleet-driver-private-error.json",
  );
  const { DbConnection, tables } = await import(
    pathToFileURL(resolve(bindings)).href
  );
  const connections: any[] = [];
  const cli = (...args: string[]) => {
    try {
      return execFileSync(
        ".tools/spacetime/spacetime",
        ["--root-dir=.tools/spacetime", ...args],
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 30000,
          maxBuffer: 32 * 1024 * 1024,
        },
      );
    } catch {
      throw Error("OPERATOR_FAILED");
    }
  };
  const operator = (reducer: string, ...args: string[]) =>
    cli(
      "call",
      "--server",
      host,
      "--yes",
      "--no-config",
      database,
      reducer,
      ...args,
    );
  const sql = (query: string) => {
    const out = cli(
      "sql",
      "--server",
      host,
      "--yes",
      "--no-config",
      "--format",
      "json",
      database,
      query,
    );
    return JSON.parse(out.slice(out.indexOf("["))) as { rows: unknown[][] }[];
  };
  const uuid = (id: string) => {
    check(/^[a-f0-9-]{36}$/i.test(id));
    return `'${id}'`;
  };
  const snapshotPrivate = (characterId: string, shipId: string) =>
    encode([
      ...[
        "character",
        "construction_location",
        "world_admission",
        "input",
        "input_control",
        "inventory_item",
        "inventory_container",
        "inventory_hotbar",
      ].map((table) =>
        sql(
          `SELECT * FROM ${table} WHERE ${table === "character" ? "id" : "character_id"} = ${uuid(characterId)}`,
        ).map((result) => result.rows),
      ),
      sql(`SELECT * FROM station WHERE ship_id = ${uuid(shipId)}`).map(
        (result) => result.rows,
      ),
    ]);
  const privatePreserved = (before: string, after: string) => {
    const names = [
      "character",
      "construction_location",
      "world_admission",
      "input",
      "input_control",
      "inventory_item",
      "inventory_container",
      "inventory_hotbar",
      "station",
    ];
    const a = JSON.parse(before),
      b = JSON.parse(after);
    changedPrivateTables = names.filter(
      (_name, i) => encode(a[i]) !== encode(b[i]),
    );
    return changedPrivateTables.length === 0;
  };
  const subscriptions = [
    "ownCharacters",
    "ownShips",
    "ownStations",
    "ownConstructionInstances",
    "ownConstructionDecks",
    "ownConstructionLocation",
    "ownGameShipAccess",
    "ownWorldAdmission",
    "ownAuthoredFlights",
    "ownAuthoredFlightPhysics",
    "ownShipPower",
    "ownInventoryItems",
    "ownInventoryContainers",
    "ownInventoryHotbar",
    "ownEvaBody",
    "ownEvaSuit",
    "ownCharacterVitals",
    "visibleShipLogic",
    "currentInteriorCrew",
    "visibleCrewPresentation",
    "ownReachableCargoContainers",
    "ownReachableCargoItems",
  ];
  const client = async () => {
    let ready = false;
    const c = DbConnection.builder()
      .withUri(host)
      .withDatabaseName(database)
      .onConnect((connected: any) =>
        connected
          .subscriptionBuilder()
          .onApplied(() => {
            ready = true;
          })
          .subscribe(subscriptions.map((name) => tables[name])),
      )
      .onConnectError(() => {})
      .build();
    connections.push(c);
    await wait(() => ready);
    return c;
  };
  const first = (c: any, table: string) => [...c.db[table].iter()][0];
  const actor = (c: any) => first(c, "ownCharacters");
  const body = (c: any) => first(c, "ownEvaBody");
  const location = (c: any) => first(c, "ownConstructionLocation");
  const shipRow = (c: any, id: string) =>
    [...c.db.ownShips.iter()].find((s: any) => s.id === id);
  const intent = (c: any, dx = 0, dy = 0, throttle = 0) =>
    c.reducers.setIntent({
      sequence: nextSequence(c),
      throttle,
      turn: 0,
      dx,
      dy,
      sprint: false,
    });
  const docs = new Map<string, ShipPrefabDocumentV1>();
  const deviceId = (shipId: string, id: string) => {
    const doc = docs.get(shipId);
    if (doc && isWayfarerAccessProfile(doc)) {
      const button = /^(personnel|cargo)-(inside|outside|hall)$/.exec(id);
      return button
        ? `${button[1]}-${button[2] === "inside" ? "chamber-outer" : button[2]}-button`
        : id;
    }
    if (doc?.id !== STARTER_PREFAB.id) return id;
    return (
      (
        {
          "personnel-inside": "btn-lock-in",
          "personnel-outside": "btn-lock-out",
          "personnel-outer-actuator": "door-outer",
          "personnel-controller": "lock",
        } as Record<string, string>
      )[id] ?? id
    );
  };
  const ownSnapshot = (c: any) =>
    encode(
      [...c.db.ownInventoryItems.iter()]
        .map((i: any) => [
          i.id,
          i.definitionId,
          i.containerId,
          i.equipmentSlot,
          i.x,
          i.y,
          i.rotated,
        ])
        .sort(),
    );
  const logic = (c: any, id: string, deviceId: string) =>
    [...c.db.visibleShipLogic.iter()].find(
      (r: any) => r.shipId === id && r.deviceId === resolveDevice(id, deviceId),
    );
  const resolveDevice = deviceId;
  const interior = async (c: any, id?: string) => {
    await wait(() => {
      const rows = [...c.db.ownConstructionInstances.iter()];
      return id ? rows.length === 1 && rows[0].id === id : rows.length === 0;
    });
    const decks = [...c.db.ownConstructionDecks.iter()];
    const crew = [...c.db.currentInteriorCrew.iter()];
    check(decks.every((r: any) => id && r.instanceId === id));
    check(crew.every((r: any) => id && r.shipId === id));
    if (!id) {
      check(
        decks.length === 0 &&
          crew.length === 0 &&
          c.db.visibleCrewPresentation.count() === 0n,
      );
      check(c.db.ownGameShipAccess.count() === 0n && !location(c));
      check(
        c.db.ownReachableCargoContainers.count() === 0n &&
          c.db.ownReachableCargoItems.count() === 0n,
      );
      for (const row of c.db.visibleShipLogic.iter()) {
        const doc = docs.get(row.shipId);
        check(doc);
        const model = shipLogicModel(doc!, catalog)!;
        const slots = [
          ...model.doors.filter((door) => door.exterior),
          ...model.panels.filter((panel) => panel.side === "exterior"),
        ];
        check(slots.some((slot) => slot.deviceId === row.deviceId));
        check(row.endsMicros === 0n && row.pressedMicros === 0n);
      }
    }
  };
  const descriptor = (ship: Ship, role: AccessRole = "personnel") => {
    const model = prefabEvaModel(ship.document, catalog);
    const lock =
      model.entries.find((entry) => entry.id === `${role}-outer`) ??
      (role === "personnel" && ship.document.id === STARTER_PREFAB.id
        ? model.entries[0]
        : undefined);
    check(lock);
    const controls = shipLogicModel(ship.document, catalog)!;
    const panel = (deviceId: string) => {
      const result = controls.panels.find(
        (p) => p.deviceId === resolveDevice(ship.id, deviceId),
      );
      check(result);
      return result!;
    };
    return { model, lock: lock!, panel };
  };
  const walk = async (
    c: any,
    ship: Ship,
    target: readonly [number, number],
  ) => {
    for (const [x, y] of prefabWalkRoute(
      ship.document,
      catalog,
      [actor(c).localX, actor(c).localY],
      target,
    ))
      await walkNative(c, x, y);
  };
  const press = (c: any, ship: Ship, deviceId: string) =>
    c.reducers.pressShipButton({
      shipId: ship.id,
      deviceId: resolveDevice(ship.id, deviceId),
    });
  const walkToPanel = async (c: any, ship: Ship, deviceId: string) => {
    deviceId = resolveDevice(ship.id, deviceId);
    const model = shipLogicModel(ship.document, catalog)!;
    const panel = model.panels.find((p) => p.deviceId === deviceId)!;
    const frame = prefabWalkFrame(ship.document, catalog);
    const candidates: Point[] = [panel.front];
    for (let x = -12; x <= 12; x++)
      for (let y = -12; y <= 12; y++)
        candidates.push([panel.front[0] + x / 10, panel.front[1] + y / 10]);
    candidates.sort(
      (a, b) =>
        Math.hypot(a[0] - panel.front[0], a[1] - panel.front[1]) -
        Math.hypot(b[0] - panel.front[0], b[1] - panel.front[1]),
    );
    for (const point of candidates) {
      if (
        reachablePanel(model, point, "interior")?.deviceId !== deviceId ||
        !canOccupyDeck(
          frame,
          { shipId: frame.shipId, deckId: frame.deckId, position: point },
          0.3,
        )
      )
        continue;
      let route: Point[];
      try {
        route = prefabWalkRoute(
          ship.document,
          catalog,
          [actor(c).localX, actor(c).localY],
          point,
        );
      } catch {
        continue;
      }
      for (const [x, y] of route) await walkNative(c, x, y);
      return;
    }
    throw Error("PANEL_ROUTE");
  };
  const exit = async (c: any, ship: Ship, role: AccessRole = "personnel") => {
    const { lock } = descriptor(ship, role);
    await walkToPanel(c, ship, `${role}-inside`);
    if (!logic(c, ship.id, `${role}-outer-actuator`)?.open) {
      await press(c, ship, `${role}-inside`);
      await wait(() => !!logic(c, ship.id, `${role}-outer-actuator`)?.open);
    }
    if (role === "cargo")
      check(logic(c, ship.id, "cargo-inner-actuator")?.open === false);
    const inside: Point = [
      lock.hatch[0] - lock.normal[0] * (EVA.entryDepthM + 0.05),
      lock.hatch[1] - lock.normal[1] * (EVA.entryDepthM + 0.05),
    ];
    await walk(c, ship, inside);
    const end = Date.now() + 8000;
    while (!body(c) && Date.now() < end) {
      await intent(c, lock.normal[0], lock.normal[1]);
      await pause(50);
    }
    await intent(c);
    check(body(c));
    await interior(c);
  };
  const poses = new Map<string, any>();
  const pose = (c: any, id: string) => shipRow(c, id) ?? poses.get(id);
  const fly = async (c: any, ship: Ship, local: Point, timeout = 90000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      check(body(c));
      const target = shipToWorld(pose(c, ship.id), local);
      const dx = target[0] - body(c).x,
        dy = target[1] - body(c).y,
        distance = Math.hypot(dx, dy);
      const speed = Math.hypot(body(c).vx, body(c).vy);
      if (distance < 0.12 && speed < 0.3) {
        await intent(c);
        return;
      }
      const gain = Math.min(1, distance * 0.65),
        scale = gain / (distance || 1);
      const direction: Point = [dx * scale, dy * scale];
      const anchor =
        body(c).phase === "free" ? undefined : pose(c, body(c).anchorShipId);
      const [ix, iy] = anchor
        ? worldToShip({ ...anchor, x: 0, y: 0 }, direction)
        : direction;
      await intent(c, ix, iy);
      await pause(50);
    }
    await intent(c);
    throw Error("FLIGHT_TIMEOUT");
  };
  // Axis-aligned conservative boxes of actual immutable hulls; visibility graph routes around them.
  const boxes = () =>
    [...docs].flatMap(([id, doc]) => {
      const p = poses.get(id);
      if (!p) return [];
      const points = prefabEvaModel(doc, catalog).hull.flatMap((h) =>
        h.outline.outer.map((v) => shipToWorld(p, v)),
      );
      return [
        {
          id,
          minX: Math.min(...points.map((v) => v[0])) - 1,
          maxX: Math.max(...points.map((v) => v[0])) + 1,
          minY: Math.min(...points.map((v) => v[1])) - 1,
          maxY: Math.max(...points.map((v) => v[1])) + 1,
        },
      ];
    });
  const safeLocal = (ship: Ship): Point => {
    const { lock, model } = descriptor(ship);
    const projections = model.hull
      .flatMap((h) => h.outline.outer)
      .map(
        (p) =>
          (p[0] - lock.hatch[0]) * lock.normal[0] +
          (p[1] - lock.hatch[1]) * lock.normal[1],
      );
    const distance = Math.max(4, Math.max(...projections) + 3);
    return [
      lock.hatch[0] + lock.normal[0] * distance,
      lock.hatch[1] + lock.normal[1] * distance,
    ];
  };
  const transit = async (c: any, source: Ship, target: Ship) => {
    await fly(c, source, safeLocal(source));
    const start: Point = [body(c).x, body(c).y],
      end = shipToWorld(pose(c, target.id), safeLocal(target));
    const blockers = boxes();
    const points: Point[] = [
      start,
      end,
      ...blockers.flatMap(
        (b) =>
          [
            [b.minX - 0.1, b.minY - 0.1],
            [b.minX - 0.1, b.maxY + 0.1],
            [b.maxX + 0.1, b.minY - 0.1],
            [b.maxX + 0.1, b.maxY + 0.1],
          ] as Point[],
      ),
    ];
    const clear = (a: Point, b: Point) =>
      blockers.every((box) => {
        let lo = 0,
          hi = 1;
        for (const [origin, delta, min, max] of [
          [a[0], b[0] - a[0], box.minX, box.maxX],
          [a[1], b[1] - a[1], box.minY, box.maxY],
        ]) {
          if (Math.abs(delta) < 1e-9) {
            if (origin <= min || origin >= max) return true;
          } else {
            const t0 = (min - origin) / delta,
              t1 = (max - origin) / delta;
            lo = Math.max(lo, Math.min(t0, t1));
            hi = Math.min(hi, Math.max(t0, t1));
          }
        }
        return hi <= lo || hi <= 0 || lo >= 1;
      });
    const distance = points.map(() => Infinity),
      previous = points.map(() => -1),
      visited = new Set<number>();
    distance[0] = 0;
    while (!visited.has(1)) {
      let at = -1;
      for (let i = 0; i < points.length; i++)
        if (!visited.has(i) && (at < 0 || distance[i] < distance[at])) at = i;
      check(at >= 0 && Number.isFinite(distance[at]));
      visited.add(at);
      for (let i = 0; i < points.length; i++)
        if (!visited.has(i) && clear(points[at], points[i])) {
          const next =
            distance[at] +
            Math.hypot(
              points[i][0] - points[at][0],
              points[i][1] - points[at][1],
            );
          if (next < distance[i]) {
            distance[i] = next;
            previous[i] = at;
          }
        }
    }
    const route: number[] = [];
    for (let i = 1; i > 0; i = previous[i]) route.unshift(i);
    for (const i of route)
      await fly(c, target, worldToShip(pose(c, target.id), points[i]));
    await fly(c, target, descriptor(target).panel("personnel-outside").front);
    await wait(
      () => body(c)?.phase === "local" && body(c)?.anchorShipId === target.id,
    );
    await interior(c);
  };
  const board = async (c: any, ship: Ship, role: AccessRole = "personnel") => {
    const { lock } = descriptor(ship, role);
    await wait(() => !!logic(c, ship.id, `${role}-outer-actuator`));
    if (!logic(c, ship.id, `${role}-outer-actuator`).open)
      await press(c, ship, `${role}-outside`);
    await wait(() => !!logic(c, ship.id, `${role}-outer-actuator`)?.open);
    await fly(c, ship, [
      lock.hatch[0] + lock.normal[0] * 0.8,
      lock.hatch[1] + lock.normal[1] * 0.8,
    ]);
    const end = Date.now() + 10000;
    while (body(c) && Date.now() < end) {
      const worldDirection = shipToWorld({ ...pose(c, ship.id), x: 0, y: 0 }, [
        -lock.normal[0] * 0.6,
        -lock.normal[1] * 0.6,
      ]);
      const anchor =
        body(c).phase === "free" ? undefined : pose(c, body(c).anchorShipId);
      const [dx, dy] = anchor
        ? worldToShip({ ...anchor, x: 0, y: 0 }, worldDirection)
        : worldDirection;
      await intent(c, dx, dy);
      await pause(50);
    }
    await intent(c);
    await wait(
      () =>
        !body(c) &&
        location(c)?.instanceId === ship.id &&
        actor(c)?.shipId === ship.id,
    );
    await interior(c, ship.id);
    // Authored access r2 has distinct inward/outward chamber commands; the
    // generic fleet and legacy Wren use one chamber cycle button for both.
    const inwardButton = isWayfarerAccessProfile(ship.document)
      ? `${role}-chamber-inner-button`
      : `${role}-inside`;
    await walkToPanel(c, ship, inwardButton);
    await press(c, ship, inwardButton);
    await wait(
      () => logic(c, ship.id, `${role}-controller`)?.state === "pressurised",
    );
    if (role === "cargo")
      check(
        logic(c, ship.id, "cargo-outer-actuator")?.open === false &&
          logic(c, ship.id, "cargo-inner-actuator")?.open === true,
      );
  };
  const cargoQualifications: { prefabId: string; storageSockets: number }[] =
    [];
  const qualifyCargoStorage = async (c: any, ship: Ship) => {
    const port = FEDERATION_FLEET_ACCESS[ship.document.id]?.find(
      (p) => p.id === "cargo",
    );
    check(port && descriptor(ship, "cargo").lock.clearHalfM === 3.75 / 2);
    const sockets = prefabCargoSockets(ship.document, 0, catalog).filter(
      (s) => s.room === port!.chamber,
    );
    check(sockets.length > 0);
    const bindings = sql(
      `SELECT placed_object_id, container_id, deck_id FROM instance_inventory_binding WHERE instance_id = ${uuid(ship.id)}`,
    )[0].rows;
    const scopes = sql(
      `SELECT container_id, root_kind, deck_id, placed_object_id, access_x, access_y, lifecycle FROM inventory_container_scope WHERE instance_id = ${uuid(ship.id)}`,
    )[0].rows;
    const frame = prefabWalkFrame(ship.document, catalog);
    for (const [index, socket] of sockets.entries()) {
      step = "CARGO_STORAGE_ALLOCATED_" + ship.document.id;
      const binding = bindings.find(
        (b) => b[0] === `${ship.id}:${b[2]}:${socket.key}`,
      );
      check(binding);
      const containerId = String(binding![1]);
      const scope = scopes.find((s) => s[0] === containerId);
      check(
        scope &&
          scope[1] === "instance" &&
          scope[2] === binding![2] &&
          scope[3] === binding![0] &&
          scope[6] === "active" &&
          scope[2] === location(c)?.deckId,
      );
      const container = sql(
        `SELECT ship_id, width, height, max_mass_kg FROM inventory_container WHERE id = ${uuid(containerId)}`,
      )[0].rows;
      check(
        container.length === 1 &&
          container[0][0] === ship.id &&
          container[0].slice(1).every((n) => Number(n) > 0),
      );
      const approach: Point = [Number(scope![4]), Number(scope![5])];
      check(
        socket.approachesM.some(
          (p) => Math.hypot(p[0] - approach[0], p[1] - approach[1]) < 1e-6,
        ) &&
          canOccupyDeck(
            frame,
            { shipId: frame.shipId, deckId: frame.deckId, position: approach },
            EVA.bodyRadiusM,
          ),
      );
      step = `CARGO_STORAGE_REACH_${ship.document.id}_${index + 1}`;
      const reachable = () =>
        [...c.db.ownReachableCargoContainers.iter()].some(
          (row: any) => row.id === containerId,
        );
      const route = prefabWalkRoute(
        ship.document,
        catalog,
        [actor(c).localX, actor(c).localY],
        approach,
      );
      for (const [x, y] of route.slice(0, -1)) await walkNative(c, x, y);
      // Cargo qualification measures accepted server reach at the allocated source approach.
      // A 70mm generic walk convergence can stall even when that real interaction is accepted.
      const end = Date.now() + 15000;
      try {
        while (Date.now() < end) {
          const dx = approach[0] - actor(c).localX,
            dy = approach[1] - actor(c).localY;
          if (Math.hypot(dx, dy) <= 0.25 && reachable()) break;
          const norm = Math.max(1, Math.hypot(dx, dy));
          await intent(c, dx / norm, dy / norm);
          await pause(60);
        }
      } finally {
        await intent(c);
      }
      check(
        reachable() &&
          Math.hypot(
            approach[0] - actor(c).localX,
            approach[1] - actor(c).localY,
          ) <= 0.25,
      );
    }
    return sockets.length;
  };
  const blockedEntry = async (c: any, ship: Ship) => {
    const { lock } = descriptor(ship);
    check(logic(c, ship.id, "personnel-outer-actuator")?.open);
    await fly(c, ship, [
      lock.hatch[0] + lock.normal[0] * 0.8,
      lock.hatch[1] + lock.normal[1] * 0.8,
    ]);
    const end = Date.now() + 2000;
    while (Date.now() < end) {
      check(body(c));
      const worldDirection = shipToWorld({ ...pose(c, ship.id), x: 0, y: 0 }, [
        -lock.normal[0] * 0.6,
        -lock.normal[1] * 0.6,
      ]);
      const anchor =
        body(c).phase === "free" ? undefined : pose(c, body(c).anchorShipId);
      const [dx, dy] = anchor
        ? worldToShip({ ...anchor, x: 0, y: 0 }, worldDirection)
        : worldDirection;
      await intent(c, dx, dy);
      await pause(50);
    }
    await intent(c);
    check(body(c) && !location(c) && actor(c).shipId !== ship.id);
    await interior(c);
  };
  try {
    phase = "SETUP";
    check(sql("SELECT id FROM character")[0].rows.length === 0);
    const c = await client();
    await c.reducers.enterLab({ name: "Fleet Fixture" });
    await wait(() => !!actor(c));
    const starterId = actor(c).shipId;
    docs.set(starterId, STARTER_PREFAB);
    await c.reducers.claimInputControl({});
    const originalKind =
      process.env.SIDEREAL_FLEET_ORIGINAL ?? "fleet-wayfarer";
    check(
      ["fleet-wayfarer", "legacy-wren", "authored-wayfarer-access"].includes(
        originalKind,
      ),
    );
    // Seed the selected original through its real trusted installer so the
    // rehearsal starts at that template's valid standing spawn, then preserve it.
    await c.reducers.assignPrefabSmokeShip({
      prefabId:
        originalKind === "legacy-wren"
          ? STARTER_PREFAB.id
          : originalKind === "authored-wayfarer-access"
            ? WAYFARER_ACCESS_SOURCE.id
            : FLEET_WAYFARER.id,
    });
    await wait(() => actor(c).shipId !== starterId);
    const original: Ship = {
      id: actor(c).shipId,
      document:
        originalKind === "legacy-wren"
          ? STARTER_PREFAB
          : originalKind === "authored-wayfarer-access"
            ? WAYFARER_ACCESS_SOURCE
            : FLEET_WAYFARER,
    };
    docs.set(original.id, original.document);
    await interior(c, original.id);
    await walk(
      c,
      original,
      prefabPilotPose(prefabFlightModel(original.document, catalog).station!)
        .approach,
    );
    await acquireNativePilot(c);
    await intent(c);
    const revision = [...c.db.ownConstructionInstances.iter()].find(
      (row: any) => row.id === original.id,
    ).revision;
    const beforeIds = new Set([...c.db.ownShips.iter()].map((s: any) => s.id));
    const inventoryBefore = ownSnapshot(c),
      privateBefore = snapshotPrivate(actor(c).id, original.id);
    const operatorArgs = {
      operationId: crypto.randomUUID(),
      characterId: actor(c).id,
      expectedShipId: original.id,
      expectedInstanceRevision: revision,
      expectedFleetPinSet: FEDERATION_FLEET_PIN_SET,
    };
    const callFleet = (args = operatorArgs) =>
      operator(
        "operator_install_faction_fleet",
        JSON.stringify(args.operationId),
        JSON.stringify(args.characterId),
        JSON.stringify(args.expectedShipId),
        String(args.expectedInstanceRevision),
        JSON.stringify(args.expectedFleetPinSet),
      );
    phase = "INSTALL_PRESERVES_CURRENT";
    callFleet();
    await wait(() => c.db.ownShips.count() === BigInt(beforeIds.size + 6));
    check(
      privatePreserved(
        privateBefore,
        snapshotPrivate(actor(c).id, original.id),
      ) && ownSnapshot(c) === inventoryBefore,
    );
    const payload = sql(
      `SELECT summary_json FROM ship_operator_operation WHERE operation_id = ${uuid(operatorArgs.operationId)}`,
    );
    const receipt = JSON.parse(String(payload[0].rows[0][0]));
    const fleet: Ship[] = receipt.installed.map((entry: any) => {
      const document = FEDERATION_FLEET.find(
        (doc) => doc.id === entry.prefabId,
      );
      check(document);
      docs.set(entry.shipId, document!);
      return { id: entry.shipId, document };
    });
    check(
      fleet.length === 6 &&
        new Set(fleet.map((ship) => ship.document.id)).size === 6,
    );
    for (const ship of fleet)
      check(
        !beforeIds.has(ship.id) &&
          shipRow(c, ship.id).owner.isEqual(actor(c).owner),
      );
    for (const row of c.db.ownShips.iter()) poses.set(row.id, row);
    recordPhase();
    phase = "REPLAY_AND_PINS";
    callFleet();
    check(
      c.db.ownShips.count() === BigInt(beforeIds.size + 6) &&
        privatePreserved(
          privateBefore,
          snapshotPrivate(actor(c).id, original.id),
        ),
    );
    let rejected = false;
    try {
      callFleet({ ...operatorArgs, expectedFleetPinSet: "0".repeat(64) });
    } catch {
      rejected = true;
    }
    check(rejected);
    rejected = false;
    try {
      callFleet({
        ...operatorArgs,
        operationId: crypto.randomUUID(),
        expectedFleetPinSet: "0".repeat(64),
      });
    } catch {
      rejected = true;
    }
    check(rejected);
    check(c.db.ownShips.count() === BigInt(beforeIds.size + 6));
    recordPhase();
    phase = "OWNERSHIP_NOT_PILOTING";
    step = "FOREIGN_STATIONS";
    for (const ship of fleet) {
      const station = [...c.db.ownStations.iter()].find(
        (row: any) => row.shipId === ship.id,
      );
      check(station && !station.occupantId);
      const stationRevision = BigInt(
        String(
          sql(
            `SELECT revision FROM construction_flight_station WHERE station_id = ${uuid(station.id)}`,
          )[0].rows[0][0],
        ),
      );
      await denied(() =>
        c.reducers.enterAuthoredPilot({
          stationId: station.id,
          expectedStationRevision: stationRevision,
          operationId: crypto.randomUUID(),
        }),
      );
    }
    step = "LEAVE_ORIGINAL_STATION";
    await c.reducers.leaveAuthoredPilot({});
    await wait(
      () =>
        [...c.db.ownAuthoredFlights.iter()].find(
          (row: any) => row.shipId === original.id,
        )?.seatState === "none",
    );
    step = "ON_FOOT_INTENT";
    await denied(() => intent(c, 0, 0, 1));
    await pause(200);
    await intent(c);
    for (const ship of fleet)
      check(Math.hypot(shipRow(c, ship.id).vx, shipRow(c, ship.id).vy) < 0.01);
    recordPhase();
    phase = "SUIT_AND_AIRLOCK";
    step = "UNSUITED_CHAMBER_APPROACH";
    await walkToPanel(c, original, "personnel-inside");
    step = "UNSUITED_CYCLE_DENIED";
    await denied(() => press(c, original, "personnel-inside"));
    step = "UNSUITED_OUTER_CLOSED";
    check(!logic(c, original.id, "personnel-outer-actuator").open);
    step = "SUIT_FIXTURE";
    await c.reducers.wearPrefabSmokeEvaSuit({});
    await wait(
      () =>
        [...c.db.ownInventoryItems.iter()].filter(
          (item: any) =>
            /^wardrobe-suit-/.test(item.definitionId) && item.equipmentSlot,
        ).length === 4,
    );
    const suitedInventory = ownSnapshot(c);
    step = "REAL_ORIGINAL_EXIT";
    await exit(c, original);
    recordPhase();
    phase = "SUSPENSION_DENIED";
    await transit(c, original, fleet[0]);
    await press(c, fleet[0], "personnel-outside");
    await wait(() => !!logic(c, fleet[0].id, "personnel-outer-actuator")?.open);
    await c.reducers.setFactionFleetSmokeLifecycle({
      shipId: fleet[0].id,
      lifecycle: "suspended",
    });
    await denied(() => press(c, fleet[0], "personnel-outside"));
    await blockedEntry(c, fleet[0]);
    await c.reducers.setFactionFleetSmokeLifecycle({
      shipId: fleet[0].id,
      lifecycle: "active",
    });
    recordPhase();
    phase = "SIX_REAL_BOARD_RETURN";
    let current = original;
    for (const [index, ship] of fleet.entries()) {
      step = "TRANSIT_" + ship.document.id;
      if (index > 0) await transit(c, current, ship);
      step = "BOARD_" + ship.document.id;
      await board(c, ship);
      check(ownSnapshot(c) === suitedInventory);
      if (ship.document.sizeClass !== "S") {
        const storageSockets = await qualifyCargoStorage(c, ship);
        step = "CARGO_CYCLE_EXIT_" + ship.document.id;
        await exit(c, ship, "cargo");
        step = "CARGO_EXTERIOR_PANEL_" + ship.document.id;
        await fly(
          c,
          ship,
          descriptor(ship, "cargo").panel("cargo-outside").front,
        );
        await press(c, ship, "cargo-outside");
        await wait(
          () =>
            logic(c, ship.id, "cargo-outer-actuator")?.open === false &&
            logic(c, ship.id, "cargo-outside")?.light === "green",
        );
        await interior(c);
        step = "CARGO_BOARD_PRESSURISE_" + ship.document.id;
        await board(c, ship, "cargo");
        check(ownSnapshot(c) === suitedInventory);
        cargoQualifications.push({
          prefabId: ship.document.id,
          storageSockets,
        });
        print(
          JSON.stringify({
            status: "RUNNING",
            qualifiedCargo: ship.document.id,
            storageSockets,
          }),
        );
      }
      step = "EXIT_" + ship.document.id;
      await exit(c, ship);
      current = ship;
    }
    step = "RETURN_TO_ORIGINAL";
    await transit(c, current, original);
    await board(c, original);
    check(ownSnapshot(c) === suitedInventory);
    check(cargoQualifications.length === 4);
    recordPhase();
    phase = "OUTSIDER_DENIED";
    const outsider = await client();
    check(
      outsider.db.ownConstructionInstances.count() === 0n &&
        outsider.db.currentInteriorCrew.count() === 0n,
    );
    await outsider.reducers.enterLab({ name: "Fleet Outsider" });
    await wait(() => !!actor(outsider));
    await outsider.reducers.claimInputControl({});
    const outsiderStarter = actor(outsider).shipId;
    docs.set(outsiderStarter, STARTER_PREFAB);
    await outsider.reducers.assignPrefabSmokeShip({
      prefabId: FLEET_WAYFARER.id,
    });
    await wait(() => actor(outsider).shipId !== outsiderStarter);
    const outsiderShip: Ship = {
      id: actor(outsider).shipId,
      document: FLEET_WAYFARER,
    };
    docs.set(outsiderShip.id, outsiderShip.document);
    for (const row of outsider.db.ownShips.iter()) poses.set(row.id, row);
    await denied(() =>
      outsider.reducers.setFactionFleetSmokeLifecycle({
        shipId: fleet[0].id,
        lifecycle: "suspended",
      }),
    );
    await denied(() =>
      outsider.reducers.operatorInstallFactionFleet(operatorArgs),
    );
    await outsider.reducers.wearPrefabSmokeEvaSuit({});
    await exit(outsider, outsiderShip);
    await transit(outsider, outsiderShip, fleet[0]);
    await denied(() => press(outsider, fleet[0], "personnel-outside"));
    await blockedEntry(outsider, fleet[0]);
    recordPhase();
    print(
      JSON.stringify({
        status: "PASS",
        checks: passed,
        additionalShips: 6,
        boardedShips: 6,
        returnedToOriginal: true,
        outsiderDenied: true,
        cargoBoardedShips: cargoQualifications.length,
        cargoStorageSocketsReached: cargoQualifications.reduce(
          (n, q) => n + q.storageSockets,
          0,
        ),
        cargoQualifications,
        qualifiedFleetPinSet: FEDERATION_FLEET_PIN_SET,
        originalKind,
      }),
    );
  } finally {
    for (const c of connections) c.disconnect();
  }
}
try {
  await main();
} catch (error) {
  if (diagnosticFile)
    writeFileSync(
      diagnosticFile,
      JSON.stringify(
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : {},
      ),
      { mode: 0o600 },
    );
  const known = new Set([
    "ASSERTION",
    "TIMEOUT",
    "OPERATOR_FAILED",
    "PANEL_ROUTE",
    "FLIGHT_TIMEOUT",
  ]);
  const reason =
    error instanceof Error && known.has(error.message)
      ? error.message
      : "UNCLASSIFIED";
  print(
    JSON.stringify({
      status: "FAIL",
      failedPhase: phase,
      step,
      reason,
      changedPrivateTables,
      checks: passed,
    }),
  );
  process.exitCode = 1;
}
