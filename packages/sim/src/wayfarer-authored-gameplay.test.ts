import { expect, test } from "vitest";
import {
  registerComponentCatalogSnapshot,
  snapshotPin,
} from "./component-catalogs";
import { prefabComponentCatalogFor } from "./prefab-catalog";
import { buildShipComponentCatalog } from "@sidereal/content/ship-components-source";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  readShipPrefab,
  prefabOrigin,
  deriveInterior,
  placeMount,
  volumeGeometry,
} from "@sidereal/content/ship-prefab";
import {
  applyWayfarerAuthoredPlacementEdits,
  WAYFARER_GAMEPLAY_OBJECTS,
  WAYFARER_MAIN_NOZZLE,
  wayfarerNativeFloorUnitPlacement,
} from "@sidereal/content/wayfarer-authored-gameplay";
import {
  prefabConstructionDocument,
  prefabWalkFrame,
  prefabWalkRoute,
} from "./prefab-construction";
import { readConstructionDraft } from "./construction-transactions";
import { prefabCargoSockets } from "./prefab-cargo-sockets";
import { canOccupyDeck, sweepDeckCircle } from "./construction-collision";
import { prefabBedSeats, qualifyPrefabBed } from "./prefab-seats";
import { prefabFlightInput, prefabFlightModel } from "./prefab-flight";
import { prefabActuatorSupply } from "./prefab-flight-supply";
import { prefabDeckObstacles } from "./prefab-deck-objects";
import {
  compileFlightDefinition,
  flightDefinitionInputHash,
  type ActuatorDefinition,
} from "./flight-definition";
import { allocateThrust } from "./ifcs";
const doc = PREFAB_SHIPS.find((p) => p.id === "fed.m.wayfarer")!;
const catalog = defaultPrefabComponentCatalog();
const spawn: [number, number] = [0, 6.875];

test("native floor backings reject shear, changed Z and non-affine placements", () => {
  const original = [
    [1, 0, 0, 2],
    [0, 1, 0, -5.5],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
  expect(wayfarerNativeFloorUnitPlacement(original)).toBe(true);
  for (const [r, c, value] of [
    [0, 1, 0.25],
    [1, 0, 0.25],
    [0, 2, 0.1],
    [2, 1, 0.1],
    [2, 2, 1.25],
    [3, 0, 0.1],
    [3, 3, 0],
    [0, 3, Infinity],
  ]) {
    const matrix = original.map((row) => [...row]);
    matrix[r][c] = value;
    expect(wayfarerNativeFloorUnitPlacement(matrix), `${r},${c}`).toBe(false);
  }
  expect(wayfarerNativeFloorUnitPlacement(original.slice(0, 3))).toBe(false);
});

test("authored gameplay admits one exact registered source and rejects physical edits", () => {
  expect(prefabOrigin(readShipPrefab(doc))).toEqual([0, 0]);
  for (const change of [
    (p: typeof doc) => {
      p.authoredGameplay!.revision = p.authoredGameplay!.revision === 1 ? 2 : 1;
    },
    (p: typeof doc) => {
      p.id = "fed.s.wren";
    },
    (p: typeof doc) => {
      p.mounts[0].at![0]++;
    },
    (p: typeof doc) => {
      p.rooms.pop();
    },
  ]) {
    const copy = structuredClone(doc);
    change(copy);
    expect(() => readShipPrefab(copy)).toThrow();
  }
  const bound = prefabConstructionDocument(doc, catalog);
  expect(readConstructionDraft(JSON.stringify(bound)).sha256).toMatch(
    /^[0-9a-f]{64}$/,
  );
  const bad = structuredClone(bound);
  bad.layout.tiles[0].vertices[0][0]++;
  expect(() => readConstructionDraft(JSON.stringify(bad))).toThrow();
  // Six half-metre fragments retain native support after retessellation,
  // without counting those fragments as whole1m floor cells.
  const floors = deriveInterior(doc, 0, catalog).floors;
  expect(floors.length).toBe(234);
  expect(
    floors.reduce(
      (sum, f) => sum + (f.extentM ? f.extentM[0] * f.extentM[1] : 1),
      0,
    ),
  ).toBe(231);
});

test("every live small crate and locker has a standing approach reachable from the cockpit", () => {
  const frame = prefabWalkFrame(doc, catalog);
  const sockets = prefabCargoSockets(doc, 0, catalog);
  expect(sockets).toHaveLength(8);
  expect(new Set(sockets.map((s) => s.key)).size).toBe(8);
  for (const socket of sockets) {
    const approach = socket.approachesM.find((position) =>
      canOccupyDeck(
        frame,
        { shipId: frame.shipId, deckId: frame.deckId, position },
        0.3,
      ),
    );
    expect(approach, socket.key).toBeDefined();
    const route = prefabWalkRoute(doc, catalog, spawn, approach!);
    expect(route.at(-1), socket.key).toEqual(approach);
  }
}, 120_000);

test("both authored beds retain their own solid collider and qualify seated entry", () => {
  const frame = prefabWalkFrame(doc, catalog);
  const beds = prefabBedSeats(doc, catalog);
  expect(beds).toHaveLength(2);
  for (const bed of beds) {
    expect(qualifyPrefabBed(frame, bed), bed.name).toBe(true);
    expect(
      prefabWalkRoute(doc, catalog, spawn, [bed.approachX, bed.approachY]).at(
        -1,
      ),
    ).toEqual([bed.approachX, bed.approachY]);
  }
}, 120_000);

test("doorway derivative is shared with collision and the helm U leaves the chair pocket clear", () => {
  const matrix = [
    [1, 0, 0, -9.75],
    [0, 1, 0, -1.5],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
  const left = applyWayfarerAuthoredPlacementEdits("POST_far_-9.75", matrix);
  expect(left[0][3]).toBe(-9.85);
  expect(matrix[0][3]).toBe(-9.75);
  const frame = prefabWalkFrame(doc, catalog);
  const station = {
    shipId: frame.shipId,
    deckId: frame.deckId,
    position: spawn,
  };
  const seated = sweepDeckCircle(frame, station, [0, 0.875], 0.3);
  expect(seated.position).toEqual([0, 7.75]);
  expect(
    prefabDeckObstacles(doc, catalog).filter((o) =>
      o.id.startsWith("prefab-mount:helm:"),
    ),
  ).toHaveLength(5);
  expect(
    WAYFARER_GAMEPLAY_OBJECTS.some((o) => o.object === "Hall_crew_chibi"),
  ).toBe(false);
});

test("authored main apertures and three-mouth RCS use real source frames and powered fittings", () => {
  const model = prefabFlightModel(doc, catalog);
  const main = model.parts.find((p) => p.sourceId === "mount-main-s")!;
  const definition = model.catalog.definitions.find(
    (d) => d.id === main.definitionId,
  ) as ActuatorDefinition;
  expect(main.position).toEqual([4.4, -11, 0.1875]);
  expect(definition.nozzleOffset).toEqual([0, -5.59]);
  expect(definition.nozzleHeight).toBe(WAYFARER_MAIN_NOZZLE.height);
  const reversed = model.catalog.definitions.find((d) =>
    d.id.endsWith("ion-drive.lg#reverser"),
  ) as ActuatorDefinition;
  expect(reversed.nozzleOffset).toEqual([0, 5.59]);
  expect(model.fittings.filter((f) => f.role === "actuator")).toHaveLength(18);
  const geoms = doc.volumes.map(volumeGeometry);
  const mount = doc.mounts.find((m) => m.id === "rcs-bow-s")!;
  const placed = placeMount(mount, catalog.get(mount.component), geoms, doc);
  expect(placed.anchor).toEqual([6.5, -6.5]);
  expect(placed.anchorZ / 16).toBe(0.6375);
  const supply = prefabActuatorSupply(
    doc,
    catalog.revision,
    model.fittings.filter((f) => f.role === "actuator").map((f) => f.sourceId),
    () => 1,
  );
  expect(Object.values(supply)).toEqual(Array(18).fill(1));
});

test("registered catalogue snapshots based on revision 4 retain exact authored source admission", () => {
  const reactor = structuredClone(
    buildShipComponentCatalog(4).components.find((c) => c.id === "reactor.lg")!,
  );
  reactor.massKg += 1;
  const snapshot = snapshotPin({ base: 4, components: [reactor], removed: [] });
  registerComponentCatalogSnapshot(snapshot.pin, snapshot.canonical);
  const composed = prefabComponentCatalogFor(snapshot.pin);
  const construction = prefabConstructionDocument(doc, composed);
  expect(readConstructionDraft(JSON.stringify(construction)).sha256).toMatch(
    /^[0-9a-f]{64}$/,
  );
  const mutated = structuredClone(doc);
  mutated.rooms.pop();
  expect(() => prefabConstructionDocument(mutated, composed)).toThrow(
    /registered/,
  );
  expect(() =>
    prefabConstructionDocument(
      doc,
      prefabComponentCatalogFor("ship-components-v1@3"),
    ),
  ).toThrow(/authored.catalog/);
});

test("fixed authored mains cannot reverse under full supply and retain all pinned hardware", () => {
  const model = prefabFlightModel(doc, catalog);
  const identity = (source: string) => `instance:${source}`;
  const fittings = model.fittings.map((f, i) => ({
    id: `fitting-uuid-${i}`,
    placedObjectId: identity(f.sourceId),
    definitionId: f.definitionId,
    definitionRevision: f.definitionRevision,
    installed: true,
    powered: true,
    availability: 1,
  }));
  const supply = Object.fromEntries(
    fittings
      .filter((_, i) => model.fittings[i].role === "actuator")
      .map((f) => [f.id, 1]),
  );
  const priorInput = prefabFlightInput(
    { ...model, disabledActuatorSources: undefined },
    identity,
    { fittings, supply },
  );
  const input = prefabFlightInput(model, identity, { fittings, supply });
  expect(Object.values(supply)).toEqual(Array(18).fill(1));
  expect(flightDefinitionInputHash(input)).not.toBe(
    flightDefinitionInputHash(priorInput),
  );
  const prior = compileFlightDefinition(priorInput);
  const current = compileFlightDefinition(input);
  if (current.status !== "ready") throw Error(current.reason);
  if (prior.status !== "ready") throw Error(prior.reason);
  expect(current.definitionHash).toBe(prior.definitionHash);
  expect(current.mass).toEqual(prior.mass);
  expect(current.hull).toEqual(prior.hull);
  expect(current.actuators.map((a) => a.id)).toEqual(
    prior.actuators.map((a) => a.id),
  );
  const reversers = current.actuators.filter((a) =>
    a.placedObjectId.endsWith("#reverser"),
  );
  expect(reversers).toHaveLength(3);
  expect(reversers.every((a) => a.availability === 0)).toBe(true);
  const mains = current.actuators.filter((a) =>
    /:mount-main-[scp]$/.test(a.placedObjectId),
  );
  expect(mains).toHaveLength(3);
  for (const main of mains) expect(main.rotation).toBeCloseTo(0, 12);
  for (const main of mains)
    expect(main).toMatchObject({
      maxThrustN: 50000,
      availability: 1,
    });
  expect(
    current.actuators.filter((a) => a.placedObjectId.includes("rcs")),
  ).toEqual(prior.actuators.filter((a) => a.placedObjectId.includes("rcs")));
  // Actual allocator commands, including combined braking/sideways/yaw requests.
  for (const request of [
    { fx: 0, fy: -18000, torque: 0 },
    { fx: 10000, fy: 0, torque: 0 },
    { fx: 10000, fy: -18000, torque: 40000 },
    { fx: 0, fy: 150000, torque: 40000 },
  ]) {
    const result = allocateThrust(current.actuators, current.mass, request);
    for (const reverser of reversers)
      expect(result.commands.find((c) => c.id === reverser.id)?.throttle).toBe(
        0,
      );
    expect(result.achieved.fy).toBeLessThanOrEqual(150000);
  }
  const braking = allocateThrust(current.actuators, current.mass, {
    fx: 0,
    fy: -18000,
    torque: 0,
  });
  expect(braking.achieved.fy).toBeLessThan(-10000);
  for (const main of mains)
    expect(braking.commands.find((c) => c.id === main.id)?.throttle).toBe(0);
  const wren = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
  expect(
    prefabFlightModel(wren, catalog).disabledActuatorSources,
  ).toBeUndefined();
});
