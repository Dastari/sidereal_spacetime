import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({
  SenderError: class extends Error {},
  t: new Proxy({}, { get: () => () => ({ primaryKey() { return this; } }) }),
}));
import {
  dropItem,
  transferItem,
  takeAll,
  storeAll,
  groundItemsView,
} from "./inventory-operations";
import { equipItem } from "./inventory";
function fixture() {
  const actor = {
    id: "actor",
    shipId: "ship",
    connected: true,
    localX: 0,
    localY: 10.25,
  };
  const grid = (
    id: string,
    width: number,
    height: number,
    carried = false,
    parentItemId = "",
  ) => ({
    id,
    characterId: "actor",
    shipId: "ship",
    parentItemId,
    kind: "grid",
    name: id,
    width,
    height,
    maxMassKg: 24,
    capacityLitres: 0,
    amountLitres: 0,
    liquidType: "",
    localX: 0,
    localY: 10.25,
    carried,
  });
  const item = (
    id: string,
    definitionId: string,
    containerId: string,
    x = 0,
    y = 0,
    equipmentSlot = "",
  ) => ({
    id,
    definitionId,
    characterId: "actor",
    containerId,
    x,
    y,
    equipmentSlot,
    rotated: false,
  });
  const items = [
    item("pack", "field-pack", "", 0, 0, "back"),
    item("gun", "carbine", "bag"),
    item("medical", "medkit", "pockets"),
  ];
  const containers = [
    grid("pockets", 4, 2, true),
    grid("bag", 8, 6, false, "pack"),
    grid("crate", 14, 14),
  ];
  const bindings: {
    id: string;
    characterId: string;
    containerId: string;
    placementId: string;
  }[] = [];
  const receipts: {
    id: string;
    characterId: string;
    request: string;
    revision: bigint;
  }[] = [];
  const states = [{ characterId: "actor", revision: 1n, kitGranted: true }];
  function table<T extends { id?: string; characterId?: string }>(
    rows: T[],
    key: "id" | "characterId" = "id",
  ) {
    const index = {
      find: (id: string) => rows.find((r) => r[key] === id),
      update: (row: T) => {
        const i = rows.findIndex((r) => r[key] === row[key]);
        rows[i] = row;
      },
      delete: (id: string) => {
        const i = rows.findIndex((r) => r[key] === id);
        if (i >= 0) rows.splice(i, 1);
      },
    };
    return {
      [key]: index,
      by_character: {
        filter: (id: string) => rows.filter((r) => r.characterId === id),
      },
      insert: (row: T) => {
        rows.push(row);
        return row;
      },
    };
  }
  let n = 0,
    seated = false;
  const raw = {
    sender: "owner",
    newUuidV4: () => `uuid-${++n}`,
    db: {
      character: {
        by_owner: {
          filter: (owner: string) => (owner === "owner" ? [actor] : []),
        },
      },
      inventoryItem: table(items),
      inventoryContainer: table(containers),
      storageBinding: table(bindings),
      inventoryState: table(states, "characterId"),
      inventoryReceipt: table(receipts),
      station: {
        shipId: { find: () => ({ occupantId: seated ? actor.id : undefined }) },
      },
      couchSeat: { characterId: { find: () => undefined } },
    },
  };
  const ctx = raw as unknown as Parameters<typeof dropItem>[0];
  const mutation = () => ({
    expectedRevision: states[0].revision,
    operationId: `op-${++n}`,
  });
  return {
    ctx,
    raw,
    actor,
    items,
    containers,
    bindings,
    states,
    receipts,
    item,
    mutation,
    seat: () => {
      seated = true;
    },
  };
}
test("drop retains item/backpack contents and authoritative position; pickup removes only its empty wrapper", () => {
  const f = fixture(),
    before = f.items.map((i) => i.id).sort();
  const command = { ...f.mutation(), itemId: "pack" };
  dropItem(f.ctx, command);
  dropItem(f.ctx, command);
  expect(f.bindings).toHaveLength(1);
  expect(f.states[0].revision).toBe(2n);
  const ground = f.containers.find((c) => c.id === f.bindings[0].containerId)!;
  expect([ground.localX, ground.localY]).toEqual([0, 10.25]);
  expect(f.items.find((i) => i.id === "gun")?.containerId).toBe("bag");
  expect(groundItemsView(f.ctx).map((i) => i.id)).toEqual(["pack"]);
  equipItem(f.ctx, { ...f.mutation(), itemId: "pack" });
  expect(f.bindings).toHaveLength(0);
  expect(f.containers.some((c) => c.id === ground.id)).toBe(false);
  expect(f.items.map((i) => i.id).sort()).toEqual(before);
  expect(f.items.find((i) => i.id === "pack")?.equipmentSlot).toBe("back");
});
test("ground discovery, pickup reach, foreign ownership and sitting are rechecked", () => {
  const f = fixture();
  dropItem(f.ctx, { ...f.mutation(), itemId: "medical" });
  f.actor.localY = 8.1;
  expect(groundItemsView(f.ctx)[0]?.reachable).toBe(false);
  expect(() =>
    transferItem(f.ctx, {
      ...f.mutation(),
      itemId: "medical",
      containerId: "",
    }),
  ).toThrow("out of reach");
  f.actor.localY = -10;
  expect(groundItemsView(f.ctx)).toEqual([]);
  f.actor.localY = 10.25;
  f.raw.sender = "stranger";
  expect(groundItemsView(f.ctx)).toEqual([]);
  expect(() => dropItem(f.ctx, { ...f.mutation(), itemId: "gun" })).toThrow();
  f.raw.sender = "owner";
  f.seat();
  expect(() => dropItem(f.ctx, { ...f.mutation(), itemId: "gun" })).toThrow(
    "Stand up",
  );
});
test("quick transfer prefers equipped backpack and rejects self-containing drops and stale revisions", () => {
  const f = fixture();
  transferItem(f.ctx, { ...f.mutation(), itemId: "medical", containerId: "" });
  expect(f.items.find((i) => i.id === "medical")?.containerId).toBe("bag");
  expect(() =>
    transferItem(f.ctx, {
      ...f.mutation(),
      itemId: "pack",
      containerId: "bag",
    }),
  ).toThrow("No room");
  expect(() =>
    dropItem(f.ctx, {
      expectedRevision: 1n,
      operationId: "stale",
      itemId: "gun",
    }),
  ).toThrow("revision conflict");
  expect(f.bindings).toHaveLength(0);
});
test("take all moves the fitting subset atomically and retains oversized or overweight contents", () => {
  const f = fixture();
  f.containers[0].maxMassKg = 0.8;
  f.containers[1].maxMassKg = 4;
  f.items.push(
    f.item("extra-medical", "medkit", "crate"),
    f.item("rifle", "long-rifle", "crate", 2),
  );
  const command = { ...f.mutation(), containerId: "crate" };
  takeAll(f.ctx, command);
  takeAll(f.ctx, command);
  expect(f.items.find((i) => i.id === "extra-medical")?.containerId).toBe(
    "bag",
  );
  expect(f.items.find((i) => i.id === "rifle")?.containerId).toBe("crate");
  expect(f.states[0].revision).toBe(2n);
  expect(() => takeAll(f.ctx, { ...f.mutation(), containerId: "bag" })).toThrow(
    "nearby storage",
  );
});
test("quick transfer and take all require a contiguous footprint, not just enough empty cells", () => {
  const f = fixture();
  f.containers[1].width = 4;
  f.containers[1].height = 4;
  f.items[1].containerId = "crate";
  // Eight free cells remain in alternating columns, but neither orientation
  // of the 2x4 carbine fits. Pockets also lack a free 4x2 rectangle.
  for (const x of [1, 3])
    for (const y of [0, 2])
      f.items.push(f.item(`block-${x}-${y}`, "power-cell", "bag", x, y));
  f.items.push(f.item("scanner", "scanner", "crate", 2));
  const before = JSON.stringify(f.items);
  expect(() =>
    transferItem(f.ctx, { ...f.mutation(), itemId: "gun", containerId: "bag" }),
  ).toThrow("No room");
  expect(JSON.stringify(f.items)).toBe(before);
  expect(f.states[0].revision).toBe(1n);
  takeAll(f.ctx, { ...f.mutation(), containerId: "crate" });
  expect(f.items.find((i) => i.id === "gun")?.containerId).toBe("crate");
  expect(f.items.find((i) => i.id === "scanner")?.containerId).toBe("bag");
});
test("store all moves only fitting carried contents, retains equipment, and retries exactly once", () => {
  const f = fixture();
  f.containers[2].width = f.containers[2].height = 2;
  f.items[2].containerId = "bag";
  f.items[2].x = 2;
  const command = {
    ...f.mutation(),
    containerId: "bag",
    destinationId: "crate",
  };
  storeAll(f.ctx, command);
  storeAll(f.ctx, command);
  expect(f.items.find((i) => i.id === "medical")?.containerId).toBe("crate");
  expect(f.items.find((i) => i.id === "gun")?.containerId).toBe("bag");
  expect(f.items.find((i) => i.id === "pack")?.equipmentSlot).toBe("back");
  expect(f.states[0].revision).toBe(2n);
  expect(() =>
    storeAll(f.ctx, {
      ...f.mutation(),
      containerId: "crate",
      destinationId: "bag",
    }),
  ).toThrow("carried inventory");
  f.actor.localY = -10;
  expect(() =>
    storeAll(f.ctx, {
      ...f.mutation(),
      containerId: "bag",
      destinationId: "crate",
    }),
  ).toThrow("nearby storage");
});
