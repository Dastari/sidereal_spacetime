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
import { prefabFlightModel } from "./prefab-flight";
import { prefabActuatorSupply } from "./prefab-flight-supply";
import { prefabDeckObstacles } from "./prefab-deck-objects";
import type { ActuatorDefinition } from "./flight-definition";
const doc = PREFAB_SHIPS.find((p) => p.id === "fed.m.wayfarer")!;
const catalog = defaultPrefabComponentCatalog();
const spawn: [number, number] = [0, 6.875];

test("authored gameplay admits one exact registered source and rejects physical edits", () => {
  expect(prefabOrigin(readShipPrefab(doc))).toEqual([0, 0]);
  for (const change of [
    (p: typeof doc) => {
      p.authoredGameplay!.revision = 2 as 1;
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
  expect(deriveInterior(doc, 0, catalog).floors.length).toBe(222);
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
