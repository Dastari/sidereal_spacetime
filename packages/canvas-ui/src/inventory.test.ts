import { expect, it } from "vitest";
import {
  inventoryPlacement,
  type InventoryState,
  type InventoryItem,
  type InventoryContainer,
} from "./inventory";
const container: InventoryContainer = {
  id: "bag",
  parentItemId: "pack",
  kind: "grid",
  name: "Backpack",
  width: 8,
  height: 6,
  maxMassKg: 24,
  capacityLitres: 0,
  amountLitres: 0,
  liquidType: "",
};
const item: InventoryItem = {
  id: "rifle",
  definitionId: "carbine",
  containerId: "bag",
  equipmentSlot: "",
  x: 0,
  y: 0,
  rotated: false,
};
const state: InventoryState = {
  revision: "1",
  items: [item],
  containers: [container],
  hotbar: [],
  carriedMassKg: 3.2,
  carryLimitKg: 32,
};
it("allows touching footprints and rejects rotated overlap or edge overflow", () => {
  const other = { ...item, id: "other", x: 2 };
  const s = { ...state, items: [item, other] };
  expect(inventoryPlacement(s, item, container, 0, 0, false)).toBeUndefined();
  expect(inventoryPlacement(s, item, container, 0, 0, true)).toContain(
    "occupied",
  );
  expect(
    inventoryPlacement(state, item, container, 6, 2, false),
  ).toBeUndefined();
  expect(inventoryPlacement(state, item, container, 6, 2, true)).toContain(
    "outside",
  );
});
it("keeps liquid capacity distinct from cells and prevents nested storage cycles", () => {
  expect(
    inventoryPlacement(
      state,
      item,
      { ...container, kind: "liquid" },
      0,
      0,
      false,
    ),
  ).toContain("volume");
  const pack = { ...item, id: "pack", definitionId: "field-pack" };
  expect(
    inventoryPlacement(
      { ...state, items: [pack] },
      pack,
      container,
      0,
      0,
      false,
    ),
  ).toContain("itself");
});
