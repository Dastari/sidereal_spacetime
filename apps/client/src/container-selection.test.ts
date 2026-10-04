import { expect, test } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  prefabConstructionDocument,
  prefabToShipMetres,
} from "@sidereal/sim/prefab-construction";
import { prefabCargoSockets } from "@sidereal/sim/prefab-cargo-sockets";
import { prefabShipObjects } from "@sidereal/sim/prefab-deck-objects";
import {
  containerSelection,
  storageObjectDetails,
} from "./container-selection";
import { prefabObjectDetails } from "./prefab-objects";

test("every Wren storage click resolves current geometry identity to its disclosed root", () => {
  const doc = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
  const catalog = defaultPrefabComponentCatalog();
  const visit = {
    instanceId: "my-ship",
    deckId: "my-deck",
    documentJson: JSON.stringify(prefabConstructionDocument(doc, catalog)),
  };
  const toShip = prefabToShipMetres(doc);
  const objects = prefabShipObjects(doc, catalog);
  for (const [i, socket] of prefabCargoSockets(doc, 0, catalog).entries()) {
    const object = objects.find(
      (o) =>
        o.designId === socket.designId &&
        Math.hypot(
          ...toShip([(o.min[0] + o.max[0]) / 2, (o.min[1] + o.max[1]) / 2]).map(
            (n, axis) => n - socket.centreM[axis],
          ),
        ) < 1e-6,
    )!;
    expect(object).toBeDefined();
    const id = `prefab:${object.id}`;
    const root = {
      id: `root-${i}`,
      kind: "grid",
      placementId: `my-ship:my-deck:${socket.key}`,
    };
    expect(containerSelection(id, [root], visit)).toEqual({
      storage: true,
      containerId: root.id,
    });
    expect(
      containerSelection(
        id,
        [{ ...root, placementId: `foreign:my-deck:${socket.key}` }],
        visit,
      ),
    ).toEqual({ storage: true, containerId: undefined });
    expect(containerSelection(id, [], visit)).toEqual({
      storage: true,
      containerId: undefined,
    });
  }
  expect(containerSelection("prefab:mount:reactor", [], visit)).toEqual({
    storage: false,
  });
  expect(containerSelection("prefab:socket:forged:0", [], visit)).toEqual({
    storage: false,
  });
});
test("legacy reachable containers retain their exact disclosed identity", () => {
  expect(
    containerSelection("known-crate", [
      { id: "root", placementId: "known-crate", kind: "grid" },
    ]),
  ).toEqual({ storage: true, containerId: "root" });
  expect(containerSelection(undefined, [])).toEqual({ storage: false });
});

test("Wayfarer storage inspection retains furnishing tools independently of inventory disclosure", () => {
  const doc = PREFAB_SHIPS.find((p) => p.id === "fed.m.wayfarer")!;
  const catalog = defaultPrefabComponentCatalog();
  const visit = {
    instanceId: "owned-ship",
    deckId: "deck",
    documentJson: JSON.stringify(prefabConstructionDocument(doc, catalog)),
  };
  for (const socket of prefabCargoSockets(doc, 0, catalog)) {
    const id = `prefab:socket:${socket.key}`;
    const details = prefabObjectDetails(
      id,
      doc,
      catalog,
      "owner",
      {},
      {
        localX: socket.centreM[0],
        localY: socket.centreM[1],
      },
    )!;
    expect(details).toBeDefined();
    const unavailable = storageObjectDetails(
      details,
      containerSelection(id, [], visit),
    )!;
    expect(unavailable.actions[0]).toEqual({
      id: "open-storage",
      label: "Open inventory",
      enabled: false,
    });
    expect(unavailable.actions.slice(1)).toEqual(details.actions);
    expect(
      unavailable.actions.find((a) => a.id === "furnishing-move"),
    ).toMatchObject({ enabled: true });
    expect(unavailable.status).toContain("Move within reach");
    expect(unavailable.stats).toEqual(details.stats);
    const root = {
      id: "disclosed-root",
      kind: "grid",
      placementId: `owned-ship:deck:${socket.key}`,
    };
    const available = storageObjectDetails(
      details,
      containerSelection(id, [root], visit),
    )!;
    expect(available.actions[0].enabled).toBe(true);
    expect(available.actions.slice(1)).toEqual(details.actions);
    expect(available.status).toBe(details.status);
    const passenger = prefabObjectDetails(
      id,
      doc,
      catalog,
      "passenger",
      {},
      { localX: socket.centreM[0], localY: socket.centreM[1] },
    )!;
    expect(
      storageObjectDetails(passenger, {
        storage: true,
        containerId: root.id,
      })!.actions.map((a) => a.id),
    ).toEqual(["open-storage"]);
  }
});

test("moved storage retains its exact root and ordinary furniture has no inventory action", () => {
  const doc = PREFAB_SHIPS.find((p) => p.id === "fed.m.wayfarer")!;
  const catalog = defaultPrefabComponentCatalog();
  const overrides = {
    Quarters_A_locker_lit: {
      dx: 0.75,
      dy: -0.25,
      yaw: Math.PI / 2,
      snap: true,
      deleted: false,
    },
  };
  const visit = {
    instanceId: "ship",
    deckId: "deck",
    documentJson: JSON.stringify(prefabConstructionDocument(doc, catalog)),
    furnishingsJson: JSON.stringify(overrides),
  };
  const id = "prefab:socket:Quarters_A_locker_lit";
  const root = {
    id: "same-root",
    kind: "grid",
    placementId: "ship:deck:Quarters_A_locker_lit",
  };
  expect(containerSelection(id, [root], visit)).toEqual({
    storage: true,
    containerId: root.id,
  });
  expect(
    containerSelection(
      id,
      [{ ...root, placementId: "foreign:deck:Quarters_A_locker_lit" }],
      visit,
    ),
  ).toEqual({ storage: true, containerId: undefined });
  const table = prefabObjectDetails(
    "prefab:socket:Lounge_coffee_table",
    doc,
    catalog,
    "owner",
  )!;
  expect(
    storageObjectDetails(
      table,
      containerSelection(table.placementId, [], visit),
    ),
  ).toBe(table);
});
