import { expect, test } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  prefabConstructionDocument,
  prefabToShipMetres,
} from "@sidereal/sim/prefab-construction";
import { prefabCargoSockets } from "@sidereal/sim/prefab-cargo-sockets";
import { prefabShipObjects } from "@sidereal/sim/prefab-deck-objects";
import { containerSelection } from "./container-selection";

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
