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
import {
  dropItem,
  transferItem,
  takeAll,
  storeAll,
  groundItemsView,
} from "./inventory-operations";
import { equipItem } from "./inventory";
import { validateInventory } from "../../sim/src/inventory";
import {
  INVENTORY_DEFINITIONS,
  LIQUID_DENSITY_KG_PER_LITRE,
  CHARACTER_CARRY_LIMIT_KG,
} from "../../content/src/inventory";
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
  function table<
    T extends {
      id?: string;
      characterId?: string;
      containerId?: string;
      itemId?: string;
    },
  >(rows: T[], key: "id" | "characterId" | "containerId" | "itemId" = "id") {
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
    timestamp: { microsSinceUnixEpoch: 1n },
    newUuidV4: () => `uuid-${++n}`,
    db: {
      constructionFlightBinding: {shipId:{find:()=>undefined}},
      character: {
        id: {find:(id:string)=>id===actor.id?actor:undefined},
        by_owner: {
          filter: (owner: string) => (owner === "owner" ? [actor] : []),
        },
      },
      inventoryItemMembership: table<{
        itemId: string;
        containerId: string;
        rootContainerId: string;
        revision: bigint;
      }>([], "itemId"),
      inventoryContainerScope: table<{
        containerId: string;
        rootContainerId: string;
        rootKind: string;
        revision: bigint;
      }>([], "containerId"),
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
    grid,
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

const inventorySnapshot = (f: ReturnType<typeof fixture>) =>
  JSON.stringify(
    {
      items: f.items,
      containers: f.containers,
      bindings: f.bindings,
      states: f.states,
      receipts: f.receipts,
    },
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
  );
function replacement(
  f: ReturnType<typeof fixture>,
  source = "crate",
  width = 8,
  height = 6,
) {
  f.items.push(
    f.item("replacement", "field-pack", source, source === "bag" ? 3 : 0),
  );
  f.containers.push(
    f.grid("replacement-storage", width, height, false, "replacement"),
  );
}
test("primary ground pickup equips an empty back slot despite completely full pockets, preserving nested contents", () => {
  const f = fixture();
  f.items.push(f.item("pocket-blocker", "medkit", "pockets", 2));
  dropItem(f.ctx, { ...f.mutation(), itemId: "pack" });
  const command = { ...f.mutation(), itemId: "pack", containerId: "" };
  transferItem(f.ctx, command);
  const after = inventorySnapshot(f);
  transferItem(f.ctx, command);
  expect(inventorySnapshot(f)).toBe(after);
  expect(f.items.find((i) => i.id === "pack")?.equipmentSlot).toBe("back");
  expect(f.items.find((i) => i.id === "gun")?.containerId).toBe("bag");
  expect(f.bindings).toHaveLength(0);
  expect(f.states[0].revision).toBe(3n);
});
test("backpack equip transfers contents into an occupied replacement, returns old pack to source and preserves every UUID and liquid row", () => {
  const f = fixture();
  replacement(f);
  f.items.push(f.item("new-medkit", "medkit", "replacement-storage"));
  f.items.push(f.item("fuel", "resource-canister", "bag", 2));
  f.containers.push({
    ...f.grid("fuel-reservoir", 0, 0, false, "fuel"),
    kind: "liquid",
    capacityLitres: 5,
    amountLitres: 2,
    liquidType: "fuel",
  });
  const ids = f.items.map((i) => i.id).sort();
  const liquid = { ...f.containers.at(-1)! };
  const command = { ...f.mutation(), itemId: "replacement" };
  equipItem(f.ctx, command);
  expect(f.items.find((i) => i.id === "replacement")?.equipmentSlot).toBe(
    "back",
  );
  expect(f.items.find((i) => i.id === "pack")?.containerId).toBe("crate");
  for (const id of ["gun", "fuel", "new-medkit"])
    expect(f.items.find((i) => i.id === id)?.containerId).toBe(
      "replacement-storage",
    );
  expect(f.items.find((i) => i.id === "new-medkit")).toMatchObject({
    x: 0,
    y: 0,
    rotated: false,
  });
  expect(f.containers.find((c) => c.id === liquid.id)).toEqual(liquid);
  expect(f.items.map((i) => i.id).sort()).toEqual(ids);
  const after = inventorySnapshot(f);
  equipItem(f.ctx, command);
  expect(inventorySnapshot(f)).toBe(after);
  expect(() => equipItem(f.ctx, { ...command, itemId: "pack" })).toThrow(
    "different request",
  );
  expect(inventorySnapshot(f)).toBe(after);
});
test("replacement carried inside old pack equips without self-containment or intermediary space; empty old pack drops at the actor", () => {
  const f = fixture();
  replacement(f, "bag");
  f.items.push(f.item("pocket-blocker", "medkit", "pockets", 2));
  equipItem(f.ctx, { ...f.mutation(), itemId: "replacement" });
  expect(f.items.find((i) => i.id === "gun")?.containerId).toBe(
    "replacement-storage",
  );
  expect(f.items.some((i) => i.containerId === "bag")).toBe(false);
  expect(groundItemsView(f.ctx).map((i) => i.id)).toEqual(["pack"]);
  const c = f.containers.find(
    (c) => c.id === f.items.find((i) => i.id === "pack")?.containerId,
  )!;
  expect([c.localX, c.localY, c.width, c.height]).toEqual([0, 10.25, 3, 4]);
  expect(
    f.items.filter((i) => i.equipmentSlot === "back").map((i) => i.id),
  ).toEqual(["replacement"]);
});
test("ground backpack swap reuses its source wrapper and updates the ground item identity", () => {
  const f = fixture();
  replacement(f);
  dropItem(f.ctx, { ...f.mutation(), itemId: "replacement" });
  const source = f.bindings[0].containerId;
  equipItem(f.ctx, { ...f.mutation(), itemId: "replacement" });
  expect(f.bindings).toHaveLength(1);
  expect(f.bindings[0]).toMatchObject({
    containerId: source,
    placementId: "ground:pack",
  });
  expect(groundItemsView(f.ctx).map((i) => i.id)).toEqual(["pack"]);
});
test.each(["shape", "payload", "carry"])(
  "backpack swap rejects %s overflow atomically including wrappers, receipts and revision",
  (reason) => {
    const f = fixture();
    replacement(
      f,
      "bag",
      reason === "shape" ? 3 : 8,
      reason === "shape" ? 3 : 6,
    );
    if (reason === "payload") f.containers.at(-1)!.maxMassKg = 3;
    if (reason === "carry") {
      // Existing carried state remains below 32 kg; a world-source replacement
      // contains additional mass which pushes the final carried state over it.
      f.items.find((i) => i.id === "replacement")!.containerId = "crate";
      for (let n = 0; n < 6; n++)
        f.items.push(f.item(`old-rifle-${n}`, "long-rifle", "bag", n * 2 + 2));
      f.containers.find((c) => c.id === "bag")!.width = 16;
      f.containers.find((c) => c.id === "bag")!.maxMassKg = 40;
      f.items.push(f.item("new-rifle", "long-rifle", "replacement-storage"));
      f.containers.at(-1)!.maxMassKg = 40;
    }
    const before = inventorySnapshot(f);
    expect(() =>
      validateInventory(
        f,
        INVENTORY_DEFINITIONS,
        LIQUID_DENSITY_KG_PER_LITRE,
        "pockets",
        CHARACTER_CARRY_LIMIT_KG,
      ),
    ).not.toThrow();
    expect(() =>
      equipItem(f.ctx, { ...f.mutation(), itemId: "replacement" }),
    ).toThrow(
      reason === "shape"
        ? "Tetris space"
        : reason === "payload"
          ? "payload limit"
          : "carry limit",
    );
    expect(inventorySnapshot(f)).toBe(before);
  },
);
test("backpack swap rechecks standing for fallback drop, proximity and ownership without mutations", () => {
  const f = fixture();
  replacement(f, "bag");
  f.seat();
  let before = inventorySnapshot(f);
  expect(() =>
    equipItem(f.ctx, { ...f.mutation(), itemId: "replacement" }),
  ).toThrow("Stand up");
  expect(inventorySnapshot(f)).toBe(before);
  f.items.find((i) => i.id === "replacement")!.containerId = "crate";
  f.actor.localY = -10;
  before = inventorySnapshot(f);
  expect(() =>
    equipItem(f.ctx, { ...f.mutation(), itemId: "replacement" }),
  ).toThrow("out of reach");
  expect(inventorySnapshot(f)).toBe(before);
  f.raw.sender = "stranger";
  expect(() =>
    equipItem(f.ctx, { ...f.mutation(), itemId: "replacement" }),
  ).toThrow("unavailable");
  expect(inventorySnapshot(f)).toBe(before);
});
