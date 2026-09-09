import { expect, test } from "vitest";
import {
  auditWayfarerRefitStorage,
  qualifyRefitFuelLayout,
  type RefitContainer,
} from "./wayfarer-refit-audit";
const root: RefitContainer = {
  id: "supply",
  characterId: "actor",
  shipId: "ship",
  parentItemId: "",
  carried: false,
  kind: "grid",
  name: "Storage supply crate",
  width: 6,
  height: 6,
  maxMassKg: 500,
  capacityLitres: 0,
  amountLitres: 0,
  liquidType: "",
  localX: -3.1,
  localY: 3,
};
const fuel: RefitContainer = {
  ...root,
  id: "fuel",
  kind: "liquid",
  name: "Engineering fuel tank",
  width: 0,
  height: 0,
  maxMassKg: 80,
  capacityLitres: 100,
  amountLitres: 20,
  liquidType: "fuel",
  localY: -6,
};
const input = () => ({
  characterId: "actor",
  shipId: "ship",
  containers: [{ ...root }, { ...fuel }],
  items: [{ id: "item", containerId: "supply" }],
  bindings: [],
});
test("old single supply and liquid roots preserve identities and exact balances without free storage", () => {
  const i = input(),
    before = JSON.stringify(i),
    p = auditWayfarerRefitStorage(i);
  expect(JSON.stringify(i)).toBe(before);
  expect(p.preservedItemIds).toEqual(["item"]);
  expect(p.rootBindings[0]?.conserved).toEqual(root);
  expect(p.rootBindings[1]?.conserved).toEqual(fuel);
  expect(p.rootBindings[1]?.targetM).toEqual([-3, 7]);
  expect(p.unboundVisualPlacements).toHaveLength(3);
  expect(p.readyToApply).toBe(false);
  expect(p.allocatesContainers).toBe(false);
});
test("four bound roots retain mixed historical capacities and source placement aliases", () => {
  const ids = [
    "room-storage-container-2.15-0.25",
    "room-storage-container-2.15-1",
    "room-storage-container-3.5-0.25",
    "room-storage-container-3.5-1",
  ];
  const i = input();
  i.containers = ids.map((_, n) => ({
    ...root,
    id: `c${n}`,
    width: n % 2 ? 14 : 6,
    height: n % 2 ? 14 : 6,
  }));
  i.items = [];
  const p = auditWayfarerRefitStorage({
    ...i,
    bindings: ids.map((id, n) => ({
      containerId: `c${n}`,
      sourcePlacementId: id,
    })),
  });
  expect(p.rootBindings.map((r) => r.conserved.width)).toEqual([6, 14, 6, 14]);
  expect(p.unboundVisualPlacements).toEqual([]);
  expect(() =>
    auditWayfarerRefitStorage({
      ...i,
      bindings: ids.map((id) => ({ containerId: "c0", sourcePlacementId: id })),
    }),
  ).toThrow("non-bijective");
});
test("incomplete, foreign, duplicate and cyclic graphs fail before any application", () => {
  const i = input();
  expect(() =>
    auditWayfarerRefitStorage({
      ...i,
      items: [{ id: "x", containerId: "absent" }],
    }),
  ).toThrow("outside");
  expect(() =>
    auditWayfarerRefitStorage({
      ...i,
      containers: [{ ...root, shipId: "foreign" }],
    }),
  ).toThrow("foreign");
  expect(() =>
    auditWayfarerRefitStorage({ ...i, containers: [root, root] }),
  ).toThrow("duplicate");
  expect(() =>
    auditWayfarerRefitStorage({
      ...i,
      containers: [{ ...root, parentItemId: "item" }],
    }),
  ).toThrow("cycle");
  expect(() =>
    auditWayfarerRefitStorage({
      ...i,
      containers: [{ ...fuel, amountLitres: 101 }],
    }),
  ).toThrow("balance");
});
test("unknown surplus storage is never silently discarded", () => {
  const i = input();
  expect(() =>
    auditWayfarerRefitStorage({
      ...i,
      containers: [
        ...i.containers,
        { ...root, id: "other", name: "Custom root" },
      ],
    }),
  ).toThrow("additional placement");
});
test("proposed attachment clears conservative floor envelope while old engineering position is rejected", () => {
  const proof = qualifyRefitFuelLayout();
  expect(proof.footprintClear).toBe(true);
  expect(proof.approachClear).toBe(true);
  expect(qualifyRefitFuelLayout([-3.1, -6]).footprintClear).toBe(false);
  expect(proof.nativeVolumeRoofLoadAndAttachmentPending).toBe(true);
});
