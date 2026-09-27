import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
import { CARGO_HANDLING_FIXTURE as FIXTURE } from "@sidereal/content/cargo-handling-fixture";
import { compileConstruction } from "@sidereal/sim/construction-transactions";
import { planConstructionInstance } from "@sidereal/sim/construction-instance";
import {
  compileDeckCollision,
  resolveDeckCollision,
} from "@sidereal/sim/construction-collision";
import type { ConstructionDocument } from "@sidereal/content/construction";
import {
  cargoCarrierCollision,
  moveCargoCarriers,
  type CargoCarrierContext,
} from "./construction-cargo-carriers";
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
vi.mock("./auth", () => ({ requireGame: () => {}, requireLiveGame: () => {} }));
vi.mock("./combat", () => ({ clearAim: () => {} }));
vi.mock("./construction-doors", () => ({
  constructionCollision: (
    _ctx: unknown,
    instance: { id: string; documentJson: string },
    deckId: string,
  ) =>
    cargoCarrierCollision(
      _ctx as CargoCarrierContext,
      resolveDeckCollision(
        compileDeckCollision(
          (JSON.parse(instance.documentJson) as ConstructionDocument).layout,
          deckId,
          {
            shipId: instance.id,
            perimeterHalfWidthM: 0,
            partitionHalfWidthM: 0,
          },
        ),
        [],
      ),
    ),
}));
import { installCargoHandlingFixture } from "./construction-cargo-fixture";
function table(primary = "id", indices: Record<string, string> = {}) {
  const rows = new Map<string, Record<string, unknown>>();
  const value: Record<string, unknown> = {
    rows,
    insert: (r: Record<string, unknown>) => {
      const id = String(r[primary]);
      if (rows.has(id)) throw Error("duplicate");
      rows.set(id, { ...r });
      return r;
    },
  };
  value[primary] = {
    find: (id: string) => rows.get(id),
    update: (r: Record<string, unknown>) => {
      rows.set(String(r[primary]), { ...r });
    },
  };
  for (const [name, column] of Object.entries(indices))
    value[name] = {
      filter: (id: unknown) =>
        [...rows.values()].filter((r) => String(r[column]) === String(id)),
    };
  return value as typeof value & { rows: typeof rows };
}
function fixture() {
  const sender = Identity.fromString("01".repeat(32));
  let sequence = 0;
  const uuid = () =>
    `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, "0")}`;
  const snapshot = compileConstruction(FIXTURE.documentJson),
    plan = planConstructionInstance(
      snapshot,
      {
        blueprintRevisionId: FIXTURE.id,
        expectedBlueprintSha256: FIXTURE.sha256,
        sourceDeckId: FIXTURE.sourceDeckId,
        bodyRadiusM: 0.3,
        bodyHeightM: 1.8,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
        objectCollisionBindings: [],
      },
      uuid,
    );
  const db = {
    constructionFlightBinding: table("shipId"),
    constructionInstance: table(),
    constructionGrant: table("id", { by_principal: "principal" }),
    constructionReceipt: table("id", { by_principal: "principal" }),
    constructionCargoAssembly: table("containerId", {
      by_instance: "instanceId",
    }),
    constructionCargoGrid: table("id", { by_instance: "instanceId" }),
    constructionCargoPlacement: table("containerId", { by_grid: "gridId" }),
    inventoryContainer: table(),
    inventoryItem: table(),
    inventoryContainerScope: table("containerId", {
      by_root: "rootContainerId",
    }),
    instanceInventoryBinding: table("placedObjectId"),
    constructionLocation: table("characterId", { by_instance: "instanceId" }),
    character: table("id", { by_owner: "owner" }),
    constructionDeck: table(),
    constructionTraversal: table("characterId"),
    constructionStairWalk: table("characterId"),
    couchSeat: table("characterId"),
    station: table("id", { by_ship: "shipId" }),
    shipWorldMotion: table("shipId"),
    inventoryItemMembership: table("itemId", { by_root: "rootContainerId" }),
    constructionCargoOperation: table("id", { by_principal: "principal" }),
  };
  db.constructionInstance.rows.set(plan.instanceId, {
    id: plan.instanceId,
    owner: sender,
    blueprintSha256: FIXTURE.sha256,
    revision: 1n,
    workspaceId: "workspace",
    documentJson: JSON.stringify(plan.document),
    idMapJson: JSON.stringify(plan.mappings),
  });
  db.constructionGrant.rows.set("grant", {
    id: "grant",
    principal: sender,
    workspaceId: "workspace",
    capability: "instance.spawn",
    expiresMicros: 100000n,
    revoked: false,
  });
  db.inventoryItem.rows.set("kept-personal-item", {
    id: "kept-personal-item",
    containerId: "personal-pockets",
  });
  db.station.shipId = { find: () => undefined };
  const ctx = {
    db,
    connectionId: "test-live-connection",
    sender,
    timestamp: { microsSinceUnixEpoch: 1n },
    newUuidV4: uuid,
  } as unknown as CargoCarrierContext;
  const request = {
    instanceId: plan.instanceId,
    expectedInstanceRevision: 1n,
    operationId: "install",
  };
  return { ctx, db, plan, request, allocated: () => sequence };
}
test("native fixture allocates six independent empty roots, preserves personal items and replays with no UUID churn", () => {
  const f = fixture(),
    grid = installCargoHandlingFixture(f.ctx, f.request),
    count = f.allocated();
  expect(f.db.constructionCargoAssembly.rows.size).toBe(6);
  expect(f.db.inventoryContainer.rows.size).toBe(6);
  expect(f.db.inventoryContainerScope.rows.size).toBe(6);
  expect(f.db.instanceInventoryBinding.rows.size).toBe(6);
  const assemblies = [...f.db.constructionCargoAssembly.rows.values()];
  expect(
    new Set(
      assemblies.flatMap((a) => [
        a.id,
        a.carrierId,
        a.containerId,
        a.placedObjectId,
      ]),
    ).size,
  ).toBe(24);
  expect([...f.db.inventoryItem.rows.keys()]).toEqual(["kept-personal-item"]);
  expect(installCargoHandlingFixture(f.ctx, f.request)).toBe(grid);
  expect(f.allocated()).toBe(count);
  expect(f.db.inventoryContainer.rows.size).toBe(6);
  expect(() =>
    installCargoHandlingFixture(f.ctx, { ...f.request, operationId: "second" }),
  ).toThrow("already installed");
});
test("all six stack access approaches are on the paired native floor, including rear middle carriers", () => {
  const f = fixture();
  installCargoHandlingFixture(f.ctx, f.request);
  const scopes = [...f.db.inventoryContainerScope.rows.values()];
  expect(scopes.every((s) => s.accessZ === 0.1875)).toBe(true);
  expect(scopes.some((s) => Number(s.accessY) > 2)).toBe(true);
  expect(f.plan.document.floors).toHaveLength(12);
  expect(f.plan.document.roofKit).toBeDefined();
});
test("fixture install rejects lost grants and foreign/existing ship documents before cargo writes", () => {
  const f = fixture();
  f.db.constructionGrant.rows.clear();
  expect(() => installCargoHandlingFixture(f.ctx, f.request)).toThrow();
  expect(f.db.inventoryContainer.rows.size).toBe(0);
  const g = fixture();
  g.db.constructionInstance.rows.get(g.plan.instanceId)!.blueprintSha256 =
    "unrelated-wayfarer";
  expect(() => installCargoHandlingFixture(g.ctx, g.request)).toThrow(
    "Exact owned",
  );
  expect(g.db.inventoryContainer.rows.size).toBe(0);
});
test("fixture installation refuses to place a carrier on an accepted occupant", () => {
  const f = fixture();
  f.db.constructionLocation.rows.set("actor", {
    characterId: "actor",
    instanceId: f.plan.instanceId,
    deckId: f.plan.spawn.deckId,
  });
  f.db.character.rows.set("actor", { id: "actor", localX: 1, localY: 1 });
  expect(() => installCargoHandlingFixture(f.ctx, f.request)).toThrow(
    "occupants",
  );
  expect(f.db.constructionCargoGrid.rows.size).toBe(0);
  expect(f.db.inventoryContainer.rows.size).toBe(0);
});

test("actual adapter moves one installed native carrier, retains contents/revisions and treats replay as a no-op", () => {
  const f = fixture();
  const gridId = installCargoHandlingFixture(f.ctx, f.request);
  const top = [...f.db.constructionCargoPlacement.rows.values()].find(
    (p) => p.originZ === 50,
  )!;
  f.db.constructionDeck.rows.set(f.plan.spawn.deckId, {
    id: f.plan.spawn.deckId,
    instanceId: f.plan.instanceId,
    elevation: 0,
  });
  f.db.character.rows.set("actor", {
    id: "actor",
    owner: f.ctx.sender,
    shipId: f.plan.instanceId,
    connected: true,
    localX: 2,
    localY: -0.325,
  });
  f.db.constructionLocation.rows.set("actor", {
    characterId: "actor",
    instanceId: f.plan.instanceId,
    deckId: f.plan.spawn.deckId,
    revision: 1n,
  });
  const request = {
    gridId,
    expectedGridRevision: 1n,
    operationId: "move-top",
    edits: [
      {
        kind: "move" as const,
        containerId: String(top.containerId),
        expectedPlacementRevision: 1n,
        expectedInventoryRevision: 1n,
        origin: [96, 0, 6] as [number, number, number],
        quarterTurns: 0,
      },
    ],
  };
  const originalItems = JSON.stringify([...f.db.inventoryItem.rows]);
  const result = moveCargoCarriers(f.ctx, request);
  expect(result.changedContainerIds).toEqual([top.containerId]);
  expect(
    f.db.constructionCargoPlacement.rows.get(String(top.containerId))!.originX,
  ).toBe(96);
  expect(
    f.db.inventoryContainerScope.rows.get(String(top.containerId))!.revision,
  ).toBe(2n);
  expect(JSON.stringify([...f.db.inventoryItem.rows])).toBe(originalItems);
  expect(moveCargoCarriers(f.ctx, request)).toEqual(result);
  expect(
    f.db.inventoryContainerScope.rows.get(String(top.containerId))!.revision,
  ).toBe(2n);
  expect(() =>
    moveCargoCarriers(f.ctx, {
      ...request,
      operationId: "stale-new-operation",
    }),
  ).toThrow("revision conflict");
});

test("actual native fixture unloads and rebuilds all six carriers from reachable supported actor positions without losing item UUIDs", () => {
  const f = fixture(),
    gridId = installCargoHandlingFixture(f.ctx, f.request);
  const rows = [...f.db.constructionCargoPlacement.rows.values()];
  const top = rows.find((p) => p.originZ === 50)!,
    middle = rows
      .filter((p) => p.originZ === 28)
      .sort(
        (a, b) =>
          Number(a.originY) - Number(b.originY) ||
          Number(a.originX) - Number(b.originX),
      );
  f.db.constructionDeck.rows.set(f.plan.spawn.deckId, {
    id: f.plan.spawn.deckId,
    instanceId: f.plan.instanceId,
    elevation: 0,
  });
  f.db.constructionLocation.rows.set("actor", {
    characterId: "actor",
    instanceId: f.plan.instanceId,
    deckId: f.plan.spawn.deckId,
    revision: 1n,
  });
  for (const row of rows) {
    const root = String(row.containerId),
      id = "preserved-item-" + root;
    f.db.inventoryItem.rows.set(id, {
      id,
      definitionId: "medkit",
      containerId: root,
      equipmentSlot: "",
      x: 0,
      y: 0,
      rotated: false,
      characterId: "",
    });
    f.db.inventoryItemMembership.rows.set(id, {
      itemId: id,
      containerId: root,
      rootContainerId: root,
      rootCharacterId: "",
      revision: 1n,
    });
  }
  const beforeItems = JSON.stringify([...f.db.inventoryItem.rows]),
    beforeDocument = f.db.constructionInstance.rows.get(
      f.plan.instanceId,
    )!.documentJson;
  let operation = 0;
  const move = (
    row: Record<string, unknown>,
    origin: [number, number, number],
    position: [number, number],
  ) => {
    f.db.character.rows.set("actor", {
      id: "actor",
      owner: f.ctx.sender,
      shipId: f.plan.instanceId,
      connected: true,
      localX: position[0],
      localY: position[1],
    });
    const containerId = String(row.containerId),
      p = f.db.constructionCargoPlacement.rows.get(containerId)!,
      scope = f.db.inventoryContainerScope.rows.get(containerId)!,
      grid = f.db.constructionCargoGrid.rows.get(gridId)!;
    moveCargoCarriers(f.ctx, {
      gridId,
      expectedGridRevision: grid.revision as bigint,
      operationId: "handling-" + ++operation,
      edits: [
        {
          kind: "move",
          containerId,
          expectedPlacementRevision: p.revision as bigint,
          expectedInventoryRevision: scope.revision as bigint,
          origin,
          quarterTurns: 0,
        },
      ],
    });
  };
  move(top, [96, 0, 6], [2, -0.325]);
  const positions: [number, number][] = [
    [-0.325, 2],
    [2.325, 2],
    [1.5, 2.5],
    [2.5, 2.5],
  ];
  for (let i = 0; i < 4; i++) move(middle[i]!, [i * 32, 96, 6], positions[i]!);
  expect(
    [...f.db.constructionCargoPlacement.rows.values()].every(
      (p) => p.originZ === 6,
    ),
  ).toBe(true);
  for (let i = 3; i >= 0; i--) {
    const p = middle[i]!;
    move(
      p,
      [Number(p.originX), Number(p.originY), Number(p.originZ)],
      positions[i]!,
    );
  }
  move(top, [0, 0, 50], [2, -0.325]);
  expect(f.db.constructionCargoGrid.rows.get(gridId)!.revision).toBe(11n);
  for (const before of rows) {
    const after = f.db.constructionCargoPlacement.rows.get(
      String(before.containerId),
    )!;
    expect([after.originX, after.originY, after.originZ]).toEqual([
      before.originX,
      before.originY,
      before.originZ,
    ]);
  }
  expect(JSON.stringify([...f.db.inventoryItem.rows])).toBe(beforeItems);
  expect(
    f.db.constructionInstance.rows.get(f.plan.instanceId)!.documentJson,
  ).toBe(beforeDocument);
});
