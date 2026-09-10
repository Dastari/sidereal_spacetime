import { expect, test } from "vitest";
import { Identity } from "spacetimedb";
import {
  editConstructionCargoGrid,
  type CargoGridContext,
  type CargoGridHooks,
  type CargoGridRow,
  type CargoPlacementRow,
  type QualifiedCargoRoot,
  type QualifiedCargoInterface,
  type CargoGridEdit,
  type CargoGridRequest,
} from "./construction-cargo-grid";
import type {
  CargoGrid,
  CargoInterface,
} from "@sidereal/sim/construction-cargo";

// Ratings here are explicit synthetic test fixtures, never native model approvals.
function fixture() {
  const principal = Identity.fromString("01".repeat(32));
  const grid: CargoGrid = {
    id: "zone",
    deckId: "deck",
    footprint: [
      [0, 0],
      [128, 0],
      [128, 128],
      [0, 128],
    ],
    baseZ: 0,
    roofZ: 128,
    horizontalStepUnits: 32,
    snapOrigin: [0, 0],
    acceptedFamilies: ["test-bearing"],
    maxLoadKg: 10000,
    bearingPatches: [{ id: "deck", rect: [0, 0, 128, 128], maxLoadKg: 10000 }],
    reservedVolumes: [],
  };
  let zone: CargoGridRow = {
    id: "zone",
    instanceId: "ship",
    deckId: "deck",
    definitionSha256: "a".repeat(64),
    gridJson: JSON.stringify(grid),
    revision: 1n,
  };
  const placements = new Map<string, CargoPlacementRow>(),
    roots = new Map<string, QualifiedCargoRoot>();
  const interfaces = new Map<string, QualifiedCargoInterface>();
  for (const [id, width, depth] of [
    ["small", 32, 32],
    ["large", 64, 64],
    ["long", 32, 64],
  ] as const) {
    const definition: CargoInterface = {
      id,
      definitionId: `test-${id}`,
      revision: "test-r1",
      kind: "cargo",
      size: [width, depth, 32],
      quarterTurns: [0, 1, 2, 3],
      bearingFamily: "test-bearing",
      tareMassKg: 10,
      maxGrossMassKg: 500,
      maxTopLoadKg: 2000,
      allowMultipleSupports: true,
      bottom: [{ id: "base", rect: [0, 0, width, depth], maxLoadKg: 5000 }],
      top: [{ id: "top", rect: [0, 0, width, depth], maxLoadKg: 5000 }],
      clearances: [],
    };
    interfaces.set(id, {
      assetId: `asset-${id}`,
      assetSha256: "b".repeat(64),
      ratingApprovalId: "synthetic-test-only",
      interface: definition,
    });
  }
  const receipts = new Map<
    string,
    { id: string; principal: Identity; requestJson: string; resultJson: string }
  >();
  const writes: string[] = [];
  const ctx: CargoGridContext = {
    sender: principal,
    db: {
      constructionCargoGrid: {
        id: {
          find: (id) => (id === zone.id ? zone : undefined),
          update: (r) => {
            writes.push("grid");
            zone = r;
          },
        },
      },
      constructionCargoPlacement: {
        containerId: {
          find: (id) => placements.get(id),
          update: (r) => {
            writes.push(r.containerId);
            placements.set(r.containerId, r);
          },
        },
        insert: (r) => {
          writes.push(r.containerId);
          placements.set(r.containerId, r);
        },
        by_grid: {
          filter: (id) =>
            [...placements.values()].filter((p) => p.gridId === id),
        },
      },
      constructionCargoOperation: {
        id: { find: (id) => receipts.get(id) },
        insert: (r) => {
          writes.push("receipt");
          receipts.set(r.id, r);
        },
        by_principal: { filter: () => receipts.values() },
      },
    },
  };
  const actor = {
    live: true,
    deckId: "deck",
    instanceId: "ship",
    permission: true,
    near: true,
    los: true,
  };
  const hooks: CargoGridHooks = {
    requireLiveGame: () => {
      if (!actor.live) throw Error("Live game required");
    },
    requireAccess: (_ctx, row) => {
      if (actor.deckId !== row.deckId || actor.instanceId !== row.instanceId)
        throw Error("Wrong accepted deck");
      if (!actor.permission) throw Error("Manipulate grant required");
      if (!actor.near || !actor.los) throw Error("Reach/LOS required");
    },
    requireQualifiedGrid: (_ctx, row) => {
      if (row.definitionSha256 !== "a".repeat(64))
        throw Error("Published cargo-only grid required");
    },
    container: (_ctx, id) => roots.get(id),
    interface: (_ctx, id) => interfaces.get(id),
    stagingAnchor: (_ctx, id, root) =>
      id.startsWith("free-")
        ? {
            id,
            instanceId: "ship",
            deckId: "deck",
            interfaceId: root.interfaceId,
            origin: [160, 0, 0],
            quarterTurns: 0,
          }
        : undefined,
  };
  const add = (id: string, interfaceId = "small") =>
    roots.set(id, {
      containerId: id,
      instanceId: "ship",
      deckId: "deck",
      inventoryRevision: 1n,
      assetId: `asset-${interfaceId}`,
      assetSha256: "b".repeat(64),
      interfaceId,
      interfaceRevision: "test-r1",
      payloadMassKg: 0,
      secured: true,
      kind: "cargo",
      availableForPlacement: true,
    });
  let operation = 0;
  const command = (edits: CargoGridEdit[]): CargoGridRequest => ({
    gridId: "zone",
    expectedGridRevision: zone.revision,
    operationId: `operation-${++operation}`,
    edits,
  });
  const place = (
    id: string,
    origin: [number, number, number],
    quarterTurns = 0,
  ): Extract<CargoGridEdit, { kind: "place" | "move" }> => ({
    kind: "place",
    containerId: id,
    origin,
    quarterTurns,
    expectedInventoryRevision: roots.get(id)!.inventoryRevision,
    expectedPlacementRevision: placements.get(id)?.revision ?? 0n,
  });
  const move = (
    id: string,
    origin: [number, number, number],
    quarterTurns = 0,
  ): CargoGridEdit => ({ ...place(id, origin, quarterTurns), kind: "move" });
  const remove = (id: string, anchor = `free-${id}`): CargoGridEdit => ({
    kind: "remove",
    containerId: id,
    destinationAnchorId: anchor,
    expectedInventoryRevision: roots.get(id)!.inventoryRevision,
    expectedPlacementRevision: placements.get(id)!.revision,
  });
  const run = (edits: CargoGridEdit[]) =>
    editConstructionCargoGrid(ctx, hooks, command(edits));
  const stack = () => {
    add("base", "large");
    add("top", "large");
    for (let i = 0; i < 4; i++) add(`middle-${i}`);
    run([
      place("base", [0, 0, 0]),
      ...[
        [0, 0],
        [32, 0],
        [0, 32],
        [32, 32],
      ].map(([x, y], i) => place(`middle-${i}`, [x, y, 32])),
      place("top", [0, 0, 64]),
    ]);
  };
  const snapshot = () =>
    JSON.stringify(
      {
        zone,
        placements: [...placements],
        roots: [...roots],
        receipts: [...receipts],
      },
      (_, v) => (typeof v === "bigint" ? String(v) : v),
    );
  return {
    ctx,
    hooks,
    roots,
    interfaces,
    actor,
    grid,
    placements,
    receipts,
    writes,
    zone: () => zone,
    setGrid: (g: CargoGrid) => {
      zone = { ...zone, gridJson: JSON.stringify(g) };
    },
    add,
    command,
    place,
    move,
    remove,
    run,
    stack,
    snapshot,
  };
}

test("actual table adapter installs mixed2m→four1m→2m support in one revision without touching container payloads", () => {
  const f = fixture();
  f.stack();
  expect(f.placements.size).toBe(6);
  expect(f.zone().revision).toBe(2n);
  expect([...f.placements.keys()].sort()).toEqual([...f.roots.keys()].sort());
  expect(
    [...f.roots.values()].every(
      (r) => r.inventoryRevision === 1n && r.payloadMassKg === 0,
    ),
  ).toBe(true);
  expect(f.writes.filter((w) => w === "grid")).toHaveLength(1);
});
test("unsupported removal/movement rejects before any table write and preserves all identities", () => {
  const f = fixture();
  f.stack();
  for (const edit of [f.remove("middle-3"), f.move("base", [64, 0, 0])]) {
    const before = f.snapshot(),
      count = f.writes.length;
    expect(() => f.run([edit])).toThrow();
    expect(f.snapshot()).toBe(before);
    expect(f.writes).toHaveLength(count);
  }
});
test("top removal retains physical custody and original container record; repeat place uses same UUID", () => {
  const f = fixture();
  f.stack();
  const roots = JSON.stringify([...f.roots], (_, v) =>
    typeof v === "bigint" ? String(v) : v,
  );
  const r = f.run([f.remove("top")]);
  expect(r.detachedContainerIds).toEqual(["top"]);
  expect(f.placements.get("top")?.custodyAnchorId).toBe("free-top");
  expect(f.placements.get("top")?.gridId).toBe("");
  f.run([f.place("top", [0, 0, 64])]);
  expect(f.placements.get("top")?.gridId).toBe("zone");
  expect(
    JSON.stringify([...f.roots], (_, v) =>
      typeof v === "bigint" ? String(v) : v,
    ),
  ).toBe(roots);
});
test.each(["deck", "permission", "near", "los", "live"])(
  "current %s admission remains required even for an exact receipt replay",
  (field) => {
    const f = fixture();
    f.add("box");
    const r = f.command([f.place("box", [0, 0, 0])]);
    editConstructionCargoGrid(f.ctx, f.hooks, r);
    if (field === "deck") f.actor.deckId = "other";
    else if (field === "permission") f.actor.permission = false;
    else if (field === "near") f.actor.near = false;
    else if (field === "los") f.actor.los = false;
    else f.actor.live = false;
    const before = f.snapshot();
    expect(() => editConstructionCargoGrid(f.ctx, f.hooks, r)).toThrow();
    expect(f.snapshot()).toBe(before);
  },
);
test("exact replay causes no writes; same operation different payload rejects; stale second editor cannot overwrite", () => {
  const f = fixture();
  f.add("box");
  const r = f.command([f.place("box", [0, 0, 0])]),
    second = f.command([f.place("box", [32, 0, 0])]);
  const result = editConstructionCargoGrid(f.ctx, f.hooks, r),
    before = f.snapshot(),
    count = f.writes.length;
  expect(editConstructionCargoGrid(f.ctx, f.hooks, r)).toEqual(result);
  expect(f.writes).toHaveLength(count);
  expect(() =>
    editConstructionCargoGrid(f.ctx, f.hooks, {
      ...r,
      edits: [f.place("box", [32, 0, 0])],
    }),
  ).toThrow("different payload");
  expect(() => editConstructionCargoGrid(f.ctx, f.hooks, second)).toThrow(
    "revision conflict",
  );
  expect(f.snapshot()).toBe(before);
});
test("live inventory revisions prevent stale moves; fresh payload must respect rated support capacity", () => {
  const f = fixture();
  f.stack();
  const r = f.command([f.move("top", [64, 0, 0])]);
  f.roots.get("top")!.inventoryRevision = 2n;
  expect(() => editConstructionCargoGrid(f.ctx, f.hooks, r)).toThrow(
    "inventory revision conflict",
  );
  f.roots.get("top")!.payloadMassKg = 600;
  const before = f.snapshot();
  expect(() => f.run([f.remove("top")])).toThrow("Existing cargo stack");
  expect(f.snapshot()).toBe(before);
});
test.each(["asset", "revision", "ratings", "equipment", "custody"])(
  "unqualified %s cannot place an approved-looking model",
  (what) => {
    const f = fixture();
    f.add("box");
    const root = f.roots.get("box")!;
    if (what === "asset") root.assetSha256 = "c".repeat(64);
    if (what === "revision") root.interfaceRevision = "other";
    if (what === "ratings") f.interfaces.get("small")!.ratingApprovalId = "";
    if (what === "equipment") root.kind = "equipment";
    if (what === "custody") root.availableForPlacement = false;
    expect(() => f.run([f.place("box", [0, 0, 0])])).toThrow();
    expect(f.writes).toEqual([]);
  },
);
test("roof, overlap, rotation and incomplete support use the common solver without rescaling", () => {
  const f = fixture();
  f.add("one", "long");
  f.add("two", "long");
  f.run([f.place("one", [0, 0, 0], 1)]);
  expect(f.placements.get("one")?.quarterTurns).toBe(1);
  for (const edit of [
    f.place("two", [32, 0, 0]),
    f.place("two", [0, 0, 128]),
    f.place("two", [0, 0, 64]),
    f.place("two", [1, 0, 0]),
    f.place("two", [0, 0, 0], 4),
  ]) {
    const before = f.snapshot();
    expect(() => f.run([edit])).toThrow();
    expect(f.snapshot()).toBe(before);
  }
});
test("unsupported removal anchor and duplicate same-anchor batch are rejected atomically", () => {
  const f = fixture();
  f.add("one");
  f.add("two");
  f.run([f.place("one", [0, 0, 0]), f.place("two", [32, 0, 0])]);
  for (const edits of [
    [f.remove("one", "missing")],
    [f.remove("one", "free-shared"), f.remove("two", "free-shared")],
  ]) {
    const before = f.snapshot();
    expect(() => f.run(edits)).toThrow();
    expect(f.snapshot()).toBe(before);
  }
});
test("distinct staging anchors with overlapping nominal boxes cannot detach a batch", () => {
  const f = fixture();
  f.add("one");
  f.add("two");
  f.run([f.place("one", [0, 0, 0]), f.place("two", [32, 0, 0])]);
  const before = f.snapshot();
  expect(() => f.run([f.remove("one"), f.remove("two")])).toThrow(
    "destinations overlap",
  );
  expect(f.snapshot()).toBe(before);
});
test("no-op move records only a receipt and does not rewrite the grid or placement", () => {
  const f = fixture();
  f.add("box");
  f.run([f.place("box", [0, 0, 0])]);
  const before = f.writes.length;
  expect(f.run([f.move("box", [0, 0, 0])]).changedContainerIds).toEqual([]);
  expect(f.writes.slice(before)).toEqual(["receipt"]);
  expect(f.zone().revision).toBe(2n);
});
test("oversized mutation, duplicate identity, nonfinite coordinate and oversized server grid fail boundedly", () => {
  const f = fixture();
  f.add("box");
  for (const edits of [
    Array.from({ length: 257 }, () => f.place("box", [0, 0, 0])),
    [f.place("box", [0, 0, 0]), f.place("box", [32, 0, 0])],
    [f.place("box", [NaN, 0, 0])],
  ])
    expect(() => f.run(edits)).toThrow();
  f.ctx.db.constructionCargoGrid.id.update({
    ...f.zone(),
    gridJson: " ".repeat(131073),
  });
  const before = f.writes.length;
  expect(() => f.run([f.place("box", [0, 0, 0])])).toThrow("byte budget");
  expect(f.writes).toHaveLength(before);
});
