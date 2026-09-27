import { inventoryMetadataTestTables } from "./scoped-inventory-test-support";
import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({
  SenderError: class extends Error {},
  table: () => ({}),
  t: new Proxy(
    {},
    {
      get: () => () => ({
        primaryKey() {
          return this;
        },
        unique() {
          return this;
        },
      }),
    },
  ),
}));
import { seedCharacterUniforms } from "./inventory";
import { LAB_STORAGE_FIXTURES } from "@sidereal/content/storage-fixtures";
test("uniform migration fills the original four containers once, retaining cargo, IDs and placements", () => {
  const grid = (id: string, carried = false) => ({
    id,
    characterId: "actor",
    name: id,
    kind: "grid",
    parentItemId: "",
    carried,
    shipId: "ship",
    width: 6,
    height: 6,
    maxMassKg: 500,
    capacityLitres: 0,
    amountLitres: 0,
    liquidType: "",
    localX: 100,
    localY: 100,
  });
  const containers = [
    grid("pockets", true),
    ...LAB_STORAGE_FIXTURES.map((_, i) => grid("crate-" + i)),
  ];
  const bindings = LAB_STORAGE_FIXTURES.map((f, i) => ({
    id: "binding-" + i,
    characterId: "actor",
    containerId: "crate-" + i,
    placementId: f.placementId,
  }));
  const original = {
    id: "existing-pistol",
    characterId: "actor",
    definitionId: "compact-pistol",
    containerId: "crate-0",
    equipmentSlot: "",
    x: 2,
    y: 3,
    rotated: true,
  };
  const items = [{ ...original }];
  let sequence = 0,
    receipt: { characterId: string; version: number } | undefined,
    state = { characterId: "actor", revision: 12n, kitGranted: true };
  const db = {
    constructionFlightBinding: { shipId: { find: () => undefined } },
    ...inventoryMetadataTestTables(),
    character: { id: { find: () => ({ id: "actor", shipId: "ship" }) } },
    characterUniformIssue: {
      characterId: { find: () => receipt },
      insert: (r: NonNullable<typeof receipt>) => (receipt = r),
    },
    inventoryContainer: {
      by_character: { filter: () => containers },
      id: {
        update: (r: (typeof containers)[number]) =>
          containers.splice(
            containers.findIndex((c) => c.id === r.id),
            1,
            r,
          ),
      },
      insert: (r: (typeof containers)[number]) => containers.push(r),
    },
    inventoryItem: {
      by_character: { filter: () => items },
      insert: (r: typeof original) => items.push(r),
    },
    storageBinding: { by_character: { filter: () => bindings } },
    inventoryState: {
      characterId: {
        find: () => state,
        update: (s: typeof state) => (state = s),
      },
    },
  };
  const ctx = {
    db,
    newUuidV4: () => `new-${++sequence}`,
  } as unknown as Parameters<typeof seedCharacterUniforms>[0];
  containers.find((c) => c.id === "crate-0")!.maxMassKg = 6;
  expect(seedCharacterUniforms(ctx, "actor")).toBe(false);
  expect(items).toEqual([original]);
  expect(containers).toHaveLength(5);
  expect(containers.find((c) => c.id === "crate-0")!.width).toBe(6);
  expect(receipt).toBeUndefined();
  expect(state.revision).toBe(12n);
  containers.find((c) => c.id === "crate-0")!.maxMassKg = 500;
  expect(seedCharacterUniforms(ctx, "actor")).toBe(true);
  expect(items).toHaveLength(91);
  expect(items.find((i) => i.id === original.id)).toEqual(original);
  expect(containers.filter((c) => !c.parentItemId).map((c) => c.id)).toEqual([
    "pockets",
    "crate-0",
    "crate-1",
    "crate-2",
    "crate-3",
  ]);
  for (const id of ["crate-0", "crate-1", "crate-2", "crate-3"]) {
    expect(containers.find((c) => c.id === id)?.width).toBe(14);
    expect(
      items.some(
        (i) => i.containerId === id && i.definitionId.startsWith("crew-"),
      ),
    ).toBe(true);
  }
  expect(containers.every((c) => c.localX === 100 && c.localY === 100)).toBe(
    true,
  );
  const ids = items.map((i) => i.id);
  expect(state.revision).toBe(13n);
  expect(seedCharacterUniforms(ctx, "actor")).toBe(true);
  expect(items.map((i) => i.id)).toEqual(ids);
  expect(state.revision).toBe(13n);
  containers.find((c) => c.id === "crate-0")!.width = 12;
  expect(seedCharacterUniforms(ctx, "actor")).toBe(true);
  expect(items.map((i) => i.id)).toEqual(ids);
  expect(containers.find((c) => c.id === "crate-0")!.width).toBe(14);
  expect(state.revision).toBe(14n);
});
