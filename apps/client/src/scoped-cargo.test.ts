import { expect, test } from "vitest";
import { planCargoMove, usesScopedCargo, type CargoRead } from "./scoped-cargo";
const box = (id: string, carried = false) => ({
  id,
  name: id,
  parentItemId: "",
  kind: "grid" as const,
  width: 8,
  height: 8,
  maxMassKg: 500,
  capacityLitres: 0,
  amountLitres: 0,
  liquidType: "",
  carried,
});
const fixture = (): CargoRead => ({
  pocketsId: "pockets",
  inventory: {
    revision: "9",
    carryLimitKg: 32,
    carriedMassKg: 1,
    hotbar: [],
    containers: [box("pockets", true), box("cargo"), box("private")],
    items: [
      {
        id: "gun",
        definitionId: "compact-pistol",
        containerId: "pockets",
        equipmentSlot: "",
        x: 0,
        y: 0,
        rotated: false,
      },
    ],
  },
  items: [],
  containers: [{ id: "cargo", parentItemId: "", revision: 3n }],
  carried: [
    { id: "pockets", kind: "container", revision: 4n },
    { id: "gun", kind: "item", revision: 5n },
  ],
});
test("drag carries exact independent revisions and placement, no client actor/position fields", () => {
  const s = fixture(),
    p = planCargoMove(s, "gun", "cargo", {
      itemId: "gun",
      containerId: "cargo",
      x: 2,
      y: 3,
      rotated: true,
    });
  expect(p).toEqual({
    itemId: "gun",
    expectedItemRevision: 5n,
    sourceContainerId: "pockets",
    expectedSourceRevision: 4n,
    destinationContainerId: "cargo",
    expectedDestinationRevision: 3n,
    expectedCharacterRevision: 9n,
    x: 2,
    y: 3,
    rotated: true,
  });
  expect(usesScopedCargo(s, "gun", "cargo")).toBe(true);
  expect(usesScopedCargo(s, "gun", "private")).toBe(false);
});
test("auto retrieval proposes supported carried grid, excludes unrelated private roots", () => {
  const s = fixture();
  s.inventory.items[0].containerId = "cargo";
  s.items = [{ id: "gun", revision: 8n }];
  // Invalid/unrelated private content must not poison this carried+cargo move.
  s.inventory.items.push({
    id: "unrelated",
    definitionId: "unknown-private-item",
    containerId: "private",
    equipmentSlot: "",
    x: 0,
    y: 0,
    rotated: false,
  });
  expect(planCargoMove(s, "gun", "").destinationContainerId).toBe("pockets");
});
test("lost access and equipped items fail before calling authority, no stale UUID fallback", () => {
  const s = fixture();
  s.containers = [];
  expect(() => planCargoMove(s, "gun", "cargo")).toThrow(
    "Storage access changed",
  );
  const held = fixture();
  held.inventory.items[0].containerId = "";
  held.inventory.items[0].equipmentSlot = "hand";
  expect(() => planCargoMove(held, "gun", "cargo")).toThrow("Stow");
});
