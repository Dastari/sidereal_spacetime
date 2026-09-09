import { expect, it } from "vitest";
import {
  planLegacyInventoryMetadata,
  type LegacyInventorySnapshot,
} from "./scoped-inventory-migration";
function fixture(): LegacyInventorySnapshot {
  const c = {
    characterId: "a",
    parentItemId: "",
    kind: "grid",
    width: 4,
    height: 4,
    maxMassKg: 20,
    capacityLitres: 0,
    amountLitres: 0,
    liquidType: "",
    carried: false,
    shipId: "ship",
    localX: 0,
    localY: 0,
    name: "grid",
  };
  return {
    containers: [
      { ...c, id: "p", carried: true },
      { ...c, id: "crate" },
      { ...c, id: "bag-grid", parentItemId: "bag" },
    ],
    items: [
      {
        id: "bag",
        characterId: "a",
        definitionId: "bag",
        containerId: "",
        equipmentSlot: "back",
        x: 0,
        y: 0,
        rotated: false,
      },
      {
        id: "gun",
        characterId: "a",
        definitionId: "gun",
        containerId: "bag-grid",
        equipmentSlot: "",
        x: 0,
        y: 0,
        rotated: false,
      },
    ],
  };
}
it("backfills existing IDs with private roots distinct from carried scope", () => {
  const s = fixture(),
    p = planLegacyInventoryMetadata("a", { items: [], containers: [] }, s);
  expect(p.containerMembership).toContainEqual({
    containerId: "crate",
    rootContainerId: "crate",
    rootCharacterId: "a",
    rootKind: "legacy-private",
  });
  expect(p.containerMembership).toContainEqual({
    containerId: "bag-grid",
    rootContainerId: "p",
    rootCharacterId: "a",
    rootKind: "character",
  });
  expect(p.itemMembership.map((i) => i.itemId).sort()).toEqual(["bag", "gun"]);
});
it("idle synchronization changes no existing revisions", () => {
  const s = fixture(),
    p = planLegacyInventoryMetadata("a", s, s);
  expect(p.changedContainerIds).toEqual([]);
  expect(p.changedItemIds).toEqual([]);
});
it("equip and movement changes bump source ancestors and current carried root", () => {
  const s = fixture(),
    next = structuredClone(s);
  next.items = next.items.map((i) =>
    i.id === "gun" ? { ...i, containerId: "", equipmentSlot: "hand" } : i,
  );
  const p = planLegacyInventoryMetadata("a", s, next);
  expect(p.changedItemIds).toEqual(["gun"]);
  expect(p.changedContainerIds.sort()).toEqual(["bag-grid", "p"]);
});
it("bag stow changes descendant root membership and nested container CAS", () => {
  const s = fixture(),
    next = structuredClone(s);
  next.items = next.items.map((i) =>
    i.id === "bag" ? { ...i, containerId: "crate", equipmentSlot: "" } : i,
  );
  const p = planLegacyInventoryMetadata("a", s, next);
  expect(p.changedContainerIds.sort()).toEqual(["bag-grid", "crate", "p"]);
  expect(p.changedItemIds.sort()).toEqual(["bag", "gun"]);
  expect(
    p.itemMembership.every(
      (i) => i.rootKind === "legacy-private" && i.rootContainerId === "crate",
    ),
  ).toBe(true);
});
it("tracks removed ground wrapper metadata and inserted payload capacity", () => {
  const s = fixture(),
    next = structuredClone(s);
  next.containers = next.containers
    .filter((c) => c.id !== "crate")
    .map((c) => (c.id === "bag-grid" ? { ...c, width: 8 } : c));
  const p = planLegacyInventoryMetadata("a", s, next);
  expect(p.removedContainerIds).toEqual(["crate"]);
  expect(p.changedContainerIds).toEqual(["bag-grid"]);
});
it("fails closed on foreign payloads, cycles and incomplete snapshots", () => {
  const s = fixture(),
    foreign = structuredClone(s);
  foreign.items[0].characterId = "b";
  expect(() => planLegacyInventoryMetadata("a", s, foreign)).toThrow(
    "scope mismatch",
  );
  const cycle = structuredClone(s);
  cycle.items[0].equipmentSlot = "";
  cycle.items[0].containerId = "bag-grid";
  expect(() => planLegacyInventoryMetadata("a", s, cycle)).toThrow("cycle");
  const missing = structuredClone(s);
  missing.items = missing.items.filter((i) => i.id !== "bag");
  expect(() => planLegacyInventoryMetadata("a", s, missing)).toThrow(
    "parent missing",
  );
});
