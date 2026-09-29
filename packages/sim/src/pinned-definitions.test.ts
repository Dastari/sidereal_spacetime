import { describe, expect, test } from "vitest";
import { inventoryDefinition } from "@sidereal/content/inventory";
import { LAB_WEAPONS } from "@sidereal/content/weapons";
import {
  implicitPin,
  newInstancePin,
  registryFromRows,
  resolveItemDefinition,
  resolveWeaponDefinition,
} from "./pinned-definitions";
import { validateInventory } from "./inventory";

const row = (
  kind: "item" | "weapon",
  definitionId: string,
  revision: bigint,
  payload: object,
  status = "published",
) => ({
  definitionRef: `${kind}:${definitionId}@${revision}`,
  kind,
  definitionId,
  revision,
  status,
  payloadJson: JSON.stringify(payload),
  sha256: JSON.stringify(payload) + status,
});
const pistol = inventoryDefinition("pistol");

describe("pinned definition rules", () => {
  test("implicit pins: item revision 1; weapon revision 1 only for code weapons", () => {
    expect(implicitPin("pistol")).toEqual({
      itemRevision: 1n,
      weaponRevision: 1n,
    });
    expect(implicitPin("medkit")).toEqual({
      itemRevision: 1n,
      weaponRevision: 0n,
    });
  });
  test("revision 1 falls back to the code catalogue; later revisions need a row", () => {
    const empty = registryFromRows([]);
    expect(resolveItemDefinition(empty, "pistol", 1n)).toBe(pistol);
    expect(resolveItemDefinition(empty, "pistol", 2n)).toBeUndefined();
    expect(resolveWeaponDefinition(empty, "pistol", 1n)).toBe(
      LAB_WEAPONS.pistol,
    );
    expect(resolveWeaponDefinition(empty, "pistol", 0n)).toBeUndefined();
  });
  test("registry rows win, retired rows stay resolvable, new instances take the current revision", () => {
    const reader = registryFromRows([
      row("item", "pistol", 1n, pistol),
      row("item", "pistol", 2n, { ...pistol, massKg: 2 }),
      row("item", "pistol", 3n, { ...pistol, massKg: 3 }, "retired"),
      row("weapon", "pistol", 1n, LAB_WEAPONS.pistol),
      row("weapon", "pistol", 2n, { ...LAB_WEAPONS.pistol, damage: 40 }),
    ]);
    expect(resolveItemDefinition(reader, "pistol", 3n)?.massKg).toBe(3);
    expect(newInstancePin(reader, "pistol")).toEqual({
      itemRevision: 2n,
      weaponRevision: 2n,
    });
    // Unknown to the registry: the seed.
    expect(newInstancePin(reader, "medkit")).toEqual({
      itemRevision: 1n,
      weaponRevision: 0n,
    });
    expect(() => newInstancePin(reader, "not-an-item")).toThrow(/Unknown/);
    const retired = registryFromRows([
      row("item", "pistol", 1n, pistol, "retired"),
    ]);
    expect(() => newInstancePin(retired, "pistol")).toThrow(/all retired/);
  });
  test("inventory rules take a per-instance resolver: two instances of one item, two footprints", () => {
    const reader = registryFromRows([
      row("item", "pistol", 2n, { ...pistol, width: 4, height: 2 }),
    ]);
    const pins: Record<string, bigint> = { a: 1n, b: 2n };
    const resolve = (i: { id: string; definitionId: string }) =>
      resolveItemDefinition(reader, i.definitionId, pins[i.id]);
    const item = (id: string, x: number) => ({
      id,
      definitionId: "pistol",
      containerId: "grid",
      equipmentSlot: "",
      x,
      y: 0,
      rotated: false,
    });
    const container = {
      id: "grid",
      parentItemId: "",
      kind: "grid",
      width: 7,
      height: 2,
      maxMassKg: 100,
      capacityLitres: 0,
      amountLitres: 0,
      liquidType: "",
    };
    // a (3 wide) at 0 and b (4 wide) at 3 fit in 7 cells; with the catalogue both are 3 wide.
    expect(() =>
      validateInventory(
        { items: [item("a", 0), item("b", 3)], containers: [container] },
        resolve,
        {},
        "grid",
        100,
      ),
    ).not.toThrow();
    pins.a = 2n;
    expect(() =>
      validateInventory(
        { items: [item("a", 0), item("b", 3)], containers: [container] },
        resolve,
        {},
        "grid",
        100,
      ),
    ).toThrow(/overlap/);
  });
});
