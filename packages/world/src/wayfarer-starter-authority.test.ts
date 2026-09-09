import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
vi.mock("spacetimedb/server", () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    SenderError: class extends Error {},
    Range: class {},
    table: () => ({}),
    t: new Proxy({}, { get: () => () => chain }),
  };
});
vi.mock("./auth", () => ({
  requireGame: (ctx: { live: boolean }) => {
    if (!ctx.live) throw Error("Live game required");
  },
  canReadGame: (ctx: { live: boolean }) => ctx.live,
}));
import {
  createWayfarerStarterAuthority,
  type WayfarerStarterContext,
} from "./wayfarer-starter-authority";
import { ownedGameShipAccess } from "./game-ship-access-authority";
import {
  issueWayfarerPersonalKit,
  preserveWayfarerStarterKit,
} from "./wayfarer-personal-kit";

type Row = Record<string, any>;
function fixture() {
  const tables = new Map<string, Row[]>();
  const primary: Record<string, string> = {
    personalStarterReceipt: "owner",
    gameShipAccess: "shipId",
    shipWorldMotion: "shipId",
    bodyWorldMotion: "bodyId",
    worldAdmission: "characterId",
    constructionFlightBinding: "shipId",
    constructionFlightStation: "stationId",
    constructionLocation: "characterId",
    input: "characterId",
    inventoryState: "characterId",
    inventoryContainerScope: "containerId",
    inventoryItemMembership: "itemId",
    instanceInventoryBinding: "placedObjectId",
    constructionInteractionBinding: "objectId",
  };
  const field: Record<string, string> = {
    by_owner: "owner",
    by_system: "systemId",
    by_ship: "shipId",
    by_deck: "deckId",
    by_instance: "instanceId",
    by_character: "characterId",
    by_principal: "principal",
  };
  const key = (v: unknown) => String(v);
  const db = new Proxy({} as Record<string, any>, {
    get(target, name: string) {
      if (target[name]) return target[name];
      const rows: Row[] = [];
      tables.set(name, rows);
      const pk = primary[name] ?? "id";
      target[name] = new Proxy(
        {
          rows,
          iter: () => rows.values(),
          insert: (row: Row) => {
            if (rows.some((r) => key(r[pk]) === key(row[pk])))
              throw Error("Duplicate row:" + name);
            rows.push({ ...row });
            return row;
          },
        },
        {
          get(t, index: string) {
            if (index in t) return (t as any)[index];
            const column = field[index] ?? index;
            return {
              find: (value: unknown) =>
                rows.find((r) => key(r[column]) === key(value)),
              filter: (value: unknown) =>
                rows.filter((r) => key(r[column]) === key(value)),
              update: (row: Row) => {
                const at = rows.findIndex((r) => key(r[pk]) === key(row[pk]));
                if (at < 0) throw Error("Missing row");
                rows[at] = { ...row };
              },
              delete: (value: unknown) => {
                const at = rows.findIndex((r) => key(r[column]) === key(value));
                if (at >= 0) rows.splice(at, 1);
              },
            };
          },
        },
      );
      return target[name];
    },
  });
  let sequence = 1;
  const owner = Identity.fromString("04".repeat(32));
  const raw = {
    db,
    sender: owner,
    live: true,
    timestamp: { microsSinceUnixEpoch: 123000000n },
    newUuidV4: () => ({
      toString: () =>
        `44444444-4444-4444-8444-${(sequence++).toString(16).padStart(12, "0")}`,
    }),
  };
  db.authSession.insert({
    id: "session",
    owner,
    game: true,
    expiresMicros: 999999999999n,
  });
  const ctx = raw as unknown as WayfarerStarterContext;
  const snapshot = () =>
    JSON.stringify([...tables], (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  return { ctx, raw, db, tables, snapshot };
}

test("actual starter database writers install two independent functional ships with no authoring grants or lab storage", () => {
  const f = fixture();
  const a = createWayfarerStarterAuthority(f.ctx, "Alpha");
  expect(a.kind).toBe("created");
  const instance = f.db.constructionInstance.id.find(a.actor.shipId);
  expect(
    ownedGameShipAccess(f.ctx, instance.id, instance.spawnDeckId),
  ).toMatchObject({
    readInterior: true,
    walkDeck: true,
    useObjects: true,
    authorBlueprints: false,
    pilotWithoutStation: false,
  });
  const before = f.snapshot();
  expect(createWayfarerStarterAuthority(f.ctx, "Renamed").kind).toBe(
    "existing",
  );
  expect(f.snapshot()).toBe(before);
  issueWayfarerPersonalKit(f.ctx, a.actor.id);
  expect(f.snapshot()).toBe(before);
  f.raw.sender = Identity.fromString("05".repeat(32));
  f.db.authSession.insert({
    id: "second-session",
    owner: f.raw.sender,
    game: true,
    expiresMicros: 999999999999n,
  });
  expect(
    ownedGameShipAccess(f.ctx, instance.id, instance.spawnDeckId).readInterior,
  ).toBe(false);
  const b = createWayfarerStarterAuthority(f.ctx, "Beta");
  expect(b.actor.shipId).not.toBe(a.actor.shipId);
  expect(f.db.ship.rows).toHaveLength(2);
  expect(f.db.station.rows).toHaveLength(2);
  expect(f.db.constructionFlightFitting.rows).toHaveLength(20);
  expect(f.db.instanceInventoryBinding.rows).toHaveLength(8);
  expect(f.db.constructionInteractionBinding.rows).toHaveLength(8);
  expect(f.db.inventoryItem.rows).toHaveLength(14);
  expect(f.db.inventoryContainer.rows).toHaveLength(14); // 8 empty ship grids + 6 personal/nested containers.
  expect(f.db.inventoryItemMembership.rows).toHaveLength(14);
  expect(f.db.inventoryContainerScope.rows).toHaveLength(14);
  expect(
    f.db.inventoryContainer.rows.filter(
      (r: Row) => r.characterId && !r.carried && !r.parentItemId,
    ),
  ).toEqual([]);
  expect(f.db.constructionGrant.rows).toEqual([]);
  expect(f.db.constructionWorkspace.rows).toEqual([]);
  for (const s of f.db.station.rows) {
    expect(s.operational).toBe(true);
    expect(s.occupantId).toBeUndefined();
  }
  for (const r of f.db.constructionLocation.rows)
    expect(r.returnShipId).toBe("");
  for (const r of f.db.inventoryContainerScope.rows.filter(
    (r: Row) => r.rootKind === "instance",
  ))
    expect(
      f.db.inventoryItem.rows.some((i: Row) => i.containerId === r.containerId),
    ).toBe(false);
});

test("old account and missing issued character never create replacements; expired identity denies", () => {
  const f = fixture();
  f.db.character.insert({
    id: "old",
    owner: f.raw.sender,
    shipId: "old-ship",
    connected: true,
  });
  expect(createWayfarerStarterAuthority(f.ctx, "Captain").actor.shipId).toBe(
    "old-ship",
  );
  expect(f.db.ship.rows).toEqual([]);
  expect(f.db.personalStarterReceipt.rows).toEqual([]);
  f.raw.live = false;
  expect(() => createWayfarerStarterAuthority(f.ctx, "Captain")).toThrow(
    /Live/,
  );
  const g = fixture();
  const issued = createWayfarerStarterAuthority(g.ctx, "Captain");
  g.db.character.id.delete(issued.actor.id);
  expect(() => createWayfarerStarterAuthority(g.ctx, "Captain")).toThrow(
    /recovery/,
  );
  expect(g.db.ship.rows).toHaveLength(1);
});

test("game access rechecks actual owner/motion/deck and does not consult workspace grants", () => {
  const f = fixture(),
    a = createWayfarerStarterAuthority(f.ctx, "Captain");
  const instance = f.db.constructionInstance.id.find(a.actor.shipId),
    motion = f.db.shipWorldMotion.shipId.find(a.actor.shipId);
  f.db.shipWorldMotion.shipId.update({ ...motion, systemId: "other" });
  expect(
    ownedGameShipAccess(f.ctx, instance.id, instance.spawnDeckId).useObjects,
  ).toBe(false);
  f.db.shipWorldMotion.shipId.update(motion);
  expect(
    ownedGameShipAccess(f.ctx, instance.id, "foreign-deck").readInterior,
  ).toBe(false);
  const ship = f.db.ship.id.find(instance.id);
  f.db.ship.id.update({ ...ship, owner: Identity.fromString("ff".repeat(32)) });
  expect(
    ownedGameShipAccess(f.ctx, instance.id, instance.spawnDeckId).walkDeck,
  ).toBe(false);
});

test("a late receipt write failure aborts every starter write in the enclosing transaction", () => {
  const f = fixture();
  f.db.personalStarterReceipt.insert = () => {
    throw Error("Receipt storage fault");
  };
  const before = new Map(
    [...f.tables].map(([key, rows]) => [key, rows.map((r) => ({ ...r }))]),
  );
  const transaction = () => {
    try {
      createWayfarerStarterAuthority(f.ctx, "Captain");
    } catch (error) {
      for (const [key, rows] of f.tables)
        rows.splice(0, rows.length, ...(before.get(key) ?? []));
      throw error;
    }
  };
  expect(transaction).toThrow(/Receipt storage fault/);
  for (const [key, rows] of f.tables)
    expect(rows).toEqual(before.get(key) ?? []);
});

test("personal-only initializer refuses partial inventory instead of repairing by duplication", () => {
  const f = fixture();
  f.db.character.insert({
    id: "actor",
    owner: f.raw.sender,
    shipId: "ship",
    connected: true,
  });
  f.db.inventoryContainer.insert({
    id: "prior-container",
    characterId: "actor",
  });
  expect(() => issueWayfarerPersonalKit(f.ctx, "actor")).toThrow(/recovery/);
  expect(f.db.inventoryContainer.rows).toHaveLength(1);
  expect(f.db.inventoryItem.rows).toEqual([]);
});

test("public kit replay never seeds legacy storage or repairs a redeemed missing kit", () => {
  const f = fixture();
  expect(preserveWayfarerStarterKit(f.ctx)).toBe(false);
  createWayfarerStarterAuthority(f.ctx, "Starter");
  const before = JSON.stringify([...f.tables], (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  expect(preserveWayfarerStarterKit(f.ctx)).toBe(true);
  expect(
    JSON.stringify([...f.tables], (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  ).toBe(before);
  f.db.inventoryState.rows.length = 0;
  expect(() => preserveWayfarerStarterKit(f.ctx)).toThrow("explicit recovery");
});
