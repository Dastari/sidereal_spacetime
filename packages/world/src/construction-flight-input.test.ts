import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    SenderError: class extends Error {},
    Range: class {},
    table: () => ({}),
    t: new Proxy({}, { get: () => () => chain }),
  };
});
vi.mock("./auth", () => ({ requireGame: () => {}, canReadGame: () => true }));
import { readConstructionFlightInput } from "./construction-flight-input";
import { compileFlightDefinition } from "@sidereal/sim/flight-definition";
import source from "@sidereal/content/wayfarer-rebuild-r002.json";
import { WAYFARER_REBUILD_SHA256 } from "@sidereal/sim/wayfarer-rebuild-contract";
import { INVENTORY_DEFINITIONS } from "@sidereal/content/inventory";
function fixture() {
  const tables: Record<string, any[]> = {
    constructionInstance: [
      {
        id: "ship",
        blueprintSha256: WAYFARER_REBUILD_SHA256,
        documentJson: JSON.stringify(source),
        idMapJson: "{}",
      },
    ],
  };
  const db = new Proxy({} as any, {
    get: (_, name: string) =>
      new Proxy(
        {},
        {
          get: (_, index: string) => {
            const rows = (tables[name] ??= []);
            const field =
              (
                {
                  by_ship: "shipId",
                  by_character: "characterId",
                  by_instance: "instanceId",
                  by_root: "rootContainerId",
                } as Record<string, string>
              )[index] ?? index;
            return {
              find: (id: string) => rows.find((r) => r[field] === id),
              filter: (id: string) => rows.filter((r) => r[field] === id),
            };
          },
        },
      ),
  });
  const ctx: any = { db, sender: { toHexString: () => "owner" } };
  const compile = () => {
    const result = compileFlightDefinition(
      readConstructionFlightInput(ctx, "ship"),
    );
    if (result.status !== "ready") throw Error(result.reason);
    return result;
  };
  const container = (id: string, characterId: string, carried: boolean) => ({
    id,
    characterId,
    parentItemId: "",
    kind: "grid",
    name: id,
    width: 8,
    height: 8,
    maxMassKg: 1000,
    capacityLitres: 0,
    amountLitres: 0,
    liquidType: "",
    shipId: "ship",
    localX: 2,
    localY: 3,
    carried,
  });
  const definition = INVENTORY_DEFINITIONS.find((d) => d.massKg > 0)!;
  const item = (
    id: string,
    characterId: string,
    containerId: string,
    equipmentSlot = "",
  ) => ({
    id,
    characterId,
    containerId,
    equipmentSlot,
    definitionId: definition.id,
    x: 0,
    y: 0,
    rotated: false,
  });
  return { tables, ctx, compile, container, item, definition };
}
test("crew, equipped items and pocket payload count once; disconnected bodies and abandoned ground payload remain physical", () => {
  const f = fixture(),
    empty = f.compile();
  f.tables.character = [
    { id: "crew", shipId: "ship", localX: 1, localY: 2, connected: false },
  ];
  f.tables.inventoryContainer = [
    f.container("pockets", "crew", true),
    f.container("ground", "departed", false),
  ];
  f.tables.inventoryItem = [
    f.item("pocket-item", "crew", "pockets"),
    f.item("equipped", "crew", "", "body"),
    f.item("ground-item", "departed", "ground"),
  ];
  const loaded = f.compile();
  expect(loaded.mass.massKg - empty.mass.massKg).toBeCloseTo(
    80 + 3 * f.definition.massKg,
    8,
  );
  expect(loaded.contributions.filter((c) => c.source === "crew")).toMatchObject(
    [{ sourceId: "crew", massKg: 80 + 2 * f.definition.massKg, x: 1, y: 2 }],
  );
  expect(
    loaded.contributions.filter((c) => c.source === "cargo"),
  ).toMatchObject([
    { sourceId: "ground", massKg: f.definition.massKg, x: 2, y: 3 },
  ]);
  f.tables.constructionStairWalk = [
    { characterId: "crew", instanceId: "ship", acceptedX: -2, acceptedY: -3 },
  ];
  const moved = f.compile();
  expect(moved.mass.massKg).toBe(loaded.mass.massKg);
  expect(moved.mass.centerX).not.toBe(loaded.mass.centerX);
  expect(moved.contributions.find((c) => c.source === "crew")).toMatchObject({
    x: -2,
    y: -3,
  });
});
test("adopted cargo shell and root payload use the carrier placement without duplicate mass", () => {
  const f = fixture(),
    empty = f.compile();
  const shell = source.layout.assembly.parts.find(
    (p) => p.assetId === "part-c06e4f5f6f6dace38e41",
  )!;
  f.tables.inventoryContainer = [f.container("root", "", false)];
  f.tables.inventoryItem = [f.item("payload", "", "root")];
  f.tables.instanceInventoryBinding = [
    { placedObjectId: shell.id, containerId: "root", instanceId: "ship" },
  ];
  f.tables.inventoryContainerScope = [
    {
      containerId: "root",
      rootContainerId: "root",
      instanceId: "ship",
      placedObjectId: shell.id,
      lifecycle: "active",
      rootKind: "instance",
    },
  ];
  f.tables.inventoryItemMembership = [
    { itemId: "payload", containerId: "root", rootContainerId: "root" },
  ];
  f.tables.constructionCargoAssembly = [
    {
      containerId: "root",
      placedObjectId: shell.id,
      instanceId: "ship",
      carrierSize: "oneMetre",
      lifecycle: "active",
    },
  ];
  f.tables.constructionCargoPlacement = [
    {
      containerId: "root",
      instanceId: "ship",
      originX: -64,
      originY: -96,
      originZ: 0,
      quarterTurns: 0,
    },
  ];
  const loaded = f.compile(),
    oldShell = empty.contributions.find((c) => c.sourceId === shell.id)!;
  expect(loaded.mass.massKg - empty.mass.massKg).toBeCloseTo(
    20 - oldShell.massKg + f.definition.massKg,
    8,
  );
  expect(
    loaded.contributions.filter((c) => c.sourceId === shell.id),
  ).toHaveLength(1);
  expect(loaded.contributions.find((c) => c.source === "cargo")).toMatchObject({
    x: -1.5,
    y: -2.5,
    massKg: f.definition.massKg,
  });
  f.tables.constructionCargoPlacement[0].originX = -128;
  const moved = f.compile();
  expect(moved.mass.massKg).toBe(loaded.mass.massKg);
  expect(moved.mass.centerX).not.toBe(loaded.mass.centerX);
  expect(JSON.parse(f.tables.constructionInstance[0].documentJson)).toEqual(
    source,
  );
});
test("missing cargo membership and unrecognized structure fail closed", () => {
  const f = fixture();
  f.tables.instanceInventoryBinding = [
    { placedObjectId: "missing", containerId: "missing", instanceId: "ship" },
  ];
  expect(f.compile).toThrow("invalid-flight-cargo-root-binding");
  f.tables.constructionInstance[0].blueprintSha256 = "unknown";
  expect(f.compile).toThrow("unqualified-flight-structure");
});

test("database metadata and bigint fitting revisions never enter the pure physical hash", () => {
  const f = fixture();
  const part = source.layout.assembly.parts.find(
    (p) => p.assetId === "part-e8b51ac6443c73becfcb",
  )!;
  f.tables.constructionFlightFitting = [
    {
      id: "fitted-main",
      placedObjectId: part.id,
      sourceDeviceId: part.id,
      shipId: "ship",
      definitionId: "main-drive-v1",
      definitionRevision: 1,
      kind: "actuator",
      installed: true,
      powered: true,
      availability: 1,
      revision: 37n,
    },
  ];
  const result = f.compile();
  expect(result.actuators).toHaveLength(1);
  expect(result.actuators[0]).toMatchObject({
    id: "fitted-main",
    maxThrustN: 14000,
  });
  expect(result.mass.massKg).toBeCloseTo(12000, 7);
});

test("flight inventory unit mass remains bound to physical v1 when unrelated inventory metadata changes", () => {
  const f = fixture();
  f.tables.inventoryContainer = [f.container("ground", "departed", false)];
  f.tables.inventoryItem = [f.item("payload", "departed", "ground")];
  const before = f.compile(),
    original = f.definition.massKg;
  try {
    f.definition.massKg = original + 50;
    const after = f.compile();
    expect(after.mass).toEqual(before.mass);
    expect(after.inputHash).toBe(before.inputHash);
  } finally {
    f.definition.massKg = original;
  }
});
