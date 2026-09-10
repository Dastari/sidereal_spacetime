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
vi.mock("./combat", () => ({ clearAim: vi.fn() }));
vi.mock("./construction-instances", () => ({
  readableInstances: (ctx: { db: { readableForTest: unknown[] } }) =>
    ctx.db.readableForTest,
}));
import { Identity } from "spacetimedb";
import {
  CARGO_CARRIER_REVISION,
  CARGO_CARRIER_RETENTION,
  SECURED_CARGO_PAYLOADS,
} from "@sidereal/content/cargo-carriers";
import {
  carrierInterface,
  type SecuredCargoAssembly,
} from "@sidereal/sim/cargo-carrier-assembly";
import type { CargoGrid } from "@sidereal/sim/construction-cargo";
import { ownCargoCarriers } from "./construction-cargo-carrier-views";
import {
  assertCargoStackMass,
  cargoCarrierPayloadMass,
  cargoCarrierCollision,
  type CargoCarrierContext,
} from "./construction-cargo-carriers";

type Container = NonNullable<
  ReturnType<CargoCarrierContext["db"]["inventoryContainer"]["id"]["find"]>
>;
type Scope = NonNullable<
  ReturnType<
    CargoCarrierContext["db"]["inventoryContainerScope"]["containerId"]["find"]
  >
>;
type Item = NonNullable<
  ReturnType<CargoCarrierContext["db"]["inventoryItem"]["id"]["find"]>
>;
type Membership = NonNullable<
  ReturnType<
    CargoCarrierContext["db"]["inventoryItemMembership"]["itemId"]["find"]
  >
>;
type Placement = NonNullable<
  ReturnType<
    CargoCarrierContext["db"]["constructionCargoPlacement"]["containerId"]["find"]
  >
>;
function fixture() {
  const assemblies = new Map<string, SecuredCargoAssembly>();
  const containers = new Map<string, Container>(),
    scopes = new Map<string, Scope>(),
    items = new Map<string, Item>(),
    membership = new Map<string, Membership>(),
    placements = new Map<string, Placement>();
  const grid: CargoGrid = {
    id: "grid",
    deckId: "deck",
    footprint: [
      [0, 0],
      [64, 0],
      [64, 64],
      [0, 64],
    ],
    baseZ: 6,
    roofZ: 82,
    horizontalStepUnits: 32,
    snapOrigin: [0, 0],
    acceptedFamilies: [carrierInterface("oneMetre").bearingFamily],
    maxLoadKg: 5000,
    bearingPatches: [{ id: "floor", rect: [0, 0, 64, 64], maxLoadKg: 5000 }],
    reservedVolumes: [],
  };
  const poses: [string, "oneMetre" | "twoMetre", number, number, number][] = [
    ["base", "twoMetre", 0, 0, 6],
    ["m00", "oneMetre", 0, 0, 28],
    ["m10", "oneMetre", 32, 0, 28],
    ["m01", "oneMetre", 0, 32, 28],
    ["m11", "oneMetre", 32, 32, 28],
    ["top", "twoMetre", 0, 0, 50],
  ];
  for (const [id, size, x, y, z] of poses) {
    assemblies.set(id, {
      id: id + "-assembly",
      carrierId: id + "-carrier",
      containerId: id,
      placedObjectId: id + "-placed",
      instanceId: "instance",
      deckId: "deck",
      carrierSize: size,
      payloadAssetId: SECURED_CARGO_PAYLOADS[0].installedAssetId,
      payloadGlbSha256: SECURED_CARGO_PAYLOADS[0].glbSha256,
      interfaceRevision: CARGO_CARRIER_REVISION,
      retentionRevision: CARGO_CARRIER_RETENTION.revision,
      upperFrameLocked: true,
      lifecycle: "active",
      revision: 1n,
    });
    containers.set(id, {
      id,
      kind: "grid",
      parentItemId: "",
      carried: false,
      width: 14,
      height: 14,
      maxMassKg: 500,
      capacityLitres: 0,
      amountLitres: 0,
      liquidType: "",
      name: id,
      characterId: "",
      shipId: "instance",
      localX: x / 32,
      localY: y / 32,
    });
    scopes.set(id, {
      containerId: id,
      rootContainerId: id,
      rootKind: "instance",
      rootCharacterId: "",
      instanceId: "instance",
      deckId: "deck",
      placedObjectId: id + "-placed",
      revision: 1n,
      instanceRevision: 1n,
      definitionRevision: "legacy-preserved",
      accessX: 0,
      accessY: 0,
      accessZ: 0.1875,
      lifecycle: "active",
    });
    placements.set(id, {
      containerId: id,
      instanceId: "instance",
      deckId: "deck",
      gridId: "grid",
      interfaceId: carrierInterface(size).id,
      interfaceRevision: CARGO_CARRIER_REVISION,
      originX: x,
      originY: y,
      originZ: z,
      quarterTurns: 0,
      secured: true,
      custodyAnchorId: "",
      revision: 1n,
    });
  }
  const db = {
    constructionCargoAssembly: {
      containerId: { find: (id: string) => assemblies.get(id) },
      by_instance: {
        filter: (id: string) =>
          [...assemblies.values()].filter((a) => a.instanceId === id),
      },
    },
    constructionCargoPlacement: {
      containerId: { find: (id: string) => placements.get(id) },
      by_grid: {
        filter: (id: string) =>
          [...placements.values()].filter((p) => p.gridId === id),
      },
    },
    constructionCargoGrid: {
      id: {
        find: (id: string) =>
          id === "grid"
            ? {
                id,
                instanceId: "instance",
                deckId: "deck",
                gridJson: JSON.stringify(grid),
                revision: 1n,
              }
            : undefined,
      },
    },
    inventoryContainer: { id: { find: (id: string) => containers.get(id) } },
    inventoryContainerScope: {
      containerId: { find: (id: string) => scopes.get(id) },
      by_root: {
        filter: (id: string) =>
          [...scopes.values()].filter((s) => s.rootContainerId === id),
      },
    },
    inventoryItem: { id: { find: (id: string) => items.get(id) } },
    inventoryItemMembership: {
      by_root: {
        filter: (id: string) =>
          [...membership.values()].filter((m) => m.rootContainerId === id),
      },
    },
  };
  const ctx = {
    sender: Identity.fromString("01".repeat(32)),
    db,
  } as unknown as CargoCarrierContext;
  const addFuel = (root: string, count: number) => {
    for (let i = 0; i < count; i++) {
      const id = root + "-fuel-" + i,
        cid = id + "-reservoir";
      items.set(id, {
        id,
        definitionId: "resource-canister",
        containerId: root,
        equipmentSlot: "",
        x: (i % 7) * 2,
        y: Math.floor(i / 7),
        rotated: true,
        characterId: "",
      });
      membership.set(id, {
        itemId: id,
        containerId: root,
        rootContainerId: root,
        rootCharacterId: "",
        revision: 1n,
      });
      containers.set(cid, {
        ...containers.get(root)!,
        id: cid,
        parentItemId: id,
        kind: "liquid",
        capacityLitres: 5,
        amountLitres: 5,
        liquidType: "fuel",
      });
      scopes.set(cid, { ...scopes.get(root)!, containerId: cid });
    }
  };
  return {
    ctx,
    assemblies,
    containers,
    scopes,
    items,
    membership,
    placements,
    grid,
    addFuel,
  };
}

test("actual root inventory mass includes retained nested liquid containers", () => {
  const f = fixture();
  f.addFuel("m00", 2);
  expect(cargoCarrierPayloadMass(f.ctx, "m00")).toBeCloseTo(9.2);
  expect(() => assertCargoStackMass(f.ctx, ["m00"])).not.toThrow();
  expect([...f.items.keys()]).toEqual(["m00-fuel-0", "m00-fuel-1"]);
});
test("supported stack rejects a legal-capacity inventory load above carrier rating", () => {
  const f = fixture();
  f.addFuel("m00", 60);
  expect(cargoCarrierPayloadMass(f.ctx, "m00")).toBeCloseTo(276);
  expect(() => assertCargoStackMass(f.ctx, ["m00"])).toThrow("gross-load");
  expect(f.containers.get("m00")!.maxMassKg).toBe(500);
});
test("moving a support away is rejected without any inventory deletion", () => {
  const f = fixture();
  f.addFuel("top", 1);
  f.placements.delete("m00");
  expect(() => assertCargoStackMass(f.ctx, ["top"])).toThrow("unsupported");
  expect(f.items.has("top-fuel-0")).toBe(true);
});
test("collision overlays preserve unrelated walls and do not duplicate on recomposition", () => {
  const f = fixture();
  const frame = {
    shipId: "instance",
    deckId: "deck",
    fingerprint: "base",
    elevationM: 0.1875,
    floors: [
      [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
    ],
    segments: [],
    obstacles: [
      {
        id: "base-placed:0",
        definitionId: "old-cargo",
        vertices: [
          [0, 0],
          [0.5, 0],
          [0.5, 0.5],
          [0, 0.5],
        ],
      },
      {
        id: "unrelated-wall",
        definitionId: "wall",
        vertices: [
          [3, 0],
          [3.1, 0],
          [3.1, 4],
          [3, 4],
        ],
      },
    ],
  } as Parameters<typeof cargoCarrierCollision>[1];
  const once = cargoCarrierCollision(f.ctx, frame),
    twice = cargoCarrierCollision(f.ctx, once);
  expect(once.obstacles).toHaveLength(7);
  expect(twice.obstacles).toHaveLength(7);
  expect(twice.fingerprint).toBe(once.fingerprint);
  expect(twice.obstacles.some((o) => o.id === "unrelated-wall")).toBe(true);
  expect(twice.obstacles.some((o) => o.id === "base-placed:0")).toBe(false);
});

test("unknown or invalid nested liquid cannot disappear from supported load", () => {
  const f = fixture();
  f.addFuel("m00", 1);
  const id = "m00-fuel-0-reservoir";
  f.containers.set(id, { ...f.containers.get(id)!, liquidType: "unknown" });
  expect(() => cargoCarrierPayloadMass(f.ctx, "m00")).toThrow("liquid mass");
  f.containers.set(id, {
    ...f.containers.get(id)!,
    liquidType: "fuel",
    amountLitres: 6,
  });
  expect(() => cargoCarrierPayloadMass(f.ctx, "m00")).toThrow("liquid mass");
});

test("carrier projection follows accepted interior/deck access without requiring a standing actor", () => {
  const f = fixture();
  f.addFuel("m00", 1);
  const visible = [{ id: "instance", revision: 1n }];
  let location = { instanceId: "instance", deckId: "deck", revision: 1n };
  const ctx = {
    ...f.ctx,
    db: {
      ...f.ctx.db,
      readableForTest: visible,
      character: {
        by_owner: {
          filter: () => [{ id: "actor", connected: true, shipId: "instance" }],
        },
      },
      constructionLocation: { characterId: { find: () => location } },
      station: { shipId: { find: () => ({ occupantId: "actor" }) } },
    },
  } as unknown as CargoCarrierContext;
  const rows = ownCargoCarriers(ctx);
  expect(rows).toHaveLength(6);
  expect(rows.find((r) => r.containerId === "m00")!.payloadMassKg).toBeCloseTo(
    4.6,
  );
  expect(rows.every((r) => !("items" in r) && !("documentJson" in r))).toBe(
    true,
  );
  location = { ...location, deckId: "other-deck" };
  expect(ownCargoCarriers(ctx)).toEqual([]);
  location = { instanceId: "instance", deckId: "deck", revision: 2n };
  expect(ownCargoCarriers(ctx)).toEqual([]);
  location = { instanceId: "instance", deckId: "deck", revision: 1n };
  visible.length = 0;
  expect(ownCargoCarriers(ctx)).toEqual([]);
});
