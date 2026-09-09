import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
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
        default() {
          return this;
        },
      }),
    },
  ),
}));
vi.mock("./auth", () => ({
  requireGame: (ctx: { live: boolean }) => {
    if (!ctx.live) throw Error("Live game required");
  },
}));
vi.mock("./combat", () => ({ clearAim: () => {} }));
vi.mock("./construction-flight-resolver", () => ({
  resolveShipFlightDefinition: () => ({
    status: "ready",
    kind: "construction",
  }),
}));
vi.mock("./construction", () => ({
  requireGrant: (ctx: any, _workspace: string, capability: string) => {
    if (!ctx.grants.has(capability)) throw Error("Grant required");
  },
  operation: (
    ctx: any,
    id: string,
    request: unknown,
    expected: bigint,
    current: bigint,
  ) => {
    const key = ctx.sender.toHexString() + ":" + id,
      serialized = JSON.stringify(request),
      old = ctx.db.constructionReceipt.id.find(key);
    if (old) {
      if (old.request !== serialized) throw Error("Operation changed");
      return { key, request: serialized, replay: true };
    }
    if (expected !== current) throw Error("Location revision changed");
    return { key, request: serialized, replay: false };
  },
  receipt: (
    ctx: any,
    id: string,
    request: string,
    resultId: string,
    revision: bigint,
  ) => ctx.db.constructionReceipt.insert({ id, request, resultId, revision }),
}));
import {
  beginConstructionFlightReview,
  returnConstructionFlightReview,
} from "./construction-flight-review";
function table(primary = "id", index?: string) {
  const rows = new Map<string, any>();
  const t: any = {
    rows,
    insert: (r: any) => {
      if (rows.has(r[primary])) throw Error("Duplicate row");
      rows.set(r[primary], { ...r });
    },
  };
  t[primary] = {
    find: (id: string) => rows.get(id),
    update: (r: any) => {
      if (!rows.has(r[primary])) throw Error("Missing row");
      rows.set(r[primary], { ...r });
    },
    delete: (id: string) => rows.delete(id),
  };
  if (index)
    t[index] = {
      find: (value: any) =>
        [...rows.values()].find((r) => String(r[index]) === String(value)),
      filter: (value: any) =>
        [...rows.values()].filter(
          (r) =>
            String(r[index === "by_owner" ? "owner" : index]) === String(value),
        ),
    };
  return t;
}
function fixture() {
  const owner = Identity.fromString("1".repeat(64));
  const db: any = {
    character: table("id", "by_owner"),
    constructionLocation: table("characterId"),
    worldAdmission: table("characterId"),
    constructionInstance: table(),
    constructionFlightBinding: table("shipId"),
    constructionFlightReview: table("characterId"),
    constructionFlightReceipt: table(),
    constructionReceipt: table(),
    ship: table(),
    shipWorldMotion: table("shipId"),
    station: table("id", "shipId"),
    couchSeat: table("characterId"),
    constructionStairWalk: table("characterId"),
    constructionTraversal: table("characterId"),
    constructionPilotSeat: table("characterId"),
    input: table("characterId"),
  };
  db.character.insert({
    id: "actor",
    owner,
    shipId: "target",
    localX: 0,
    localY: 9.375,
    connected: true,
    sprinting: false,
    name: "Captain",
  });
  db.constructionLocation.insert({
    characterId: "actor",
    visitId: "visit",
    instanceId: "target",
    deckId: "deck",
    revision: 3n,
    returnShipId: "original",
    returnX: 2,
    returnY: 3,
  });
  db.worldAdmission.insert({
    characterId: "actor",
    owner,
    shipId: "original",
    systemId: "system",
    revision: 7n,
  });
  db.constructionInstance.insert({
    id: "target",
    owner,
    workspaceId: "workspace",
    revision: 1n,
  });
  db.constructionFlightBinding.insert({
    shipId: "target",
    instanceId: "target",
    deckId: "deck",
    stationId: "station",
    instanceRevision: 1n,
  });
  for (const [id, x] of [
    ["original", 123],
    ["target", 999],
  ] as const) {
    db.ship.insert({ id, owner, revision: 5n, name: id });
    db.shipWorldMotion.insert({
      shipId: id,
      systemId: "system",
      x,
      y: 0,
      vx: 2,
      vy: 0,
    });
  }
  db.station.insert({
    id: "station",
    shipId: "target",
    operational: true,
    occupantId: undefined,
  });
  db.input.insert({
    characterId: "actor",
    throttle: 1,
    turn: 0,
    dx: 0,
    dy: 0,
    sprint: false,
  });
  const inventory = {
    pistol: { id: "same-pistol", energy: 112, containerId: "same-backpack" },
    backpack: { id: "same-backpack" },
    appearance: { body: "r008", look: "engineer" },
  };
  const ctx: any = {
    db,
    sender: owner,
    live: true,
    grants: new Set(["draft.read", "instance.spawn"]),
  };
  const args = {
    expectedVisitId: "visit",
    expectedVisitRevision: 3n,
    expectedAdmissionRevision: 7n,
    operationId: "begin",
  };
  return { db, ctx, args, inventory };
}
test("explicit switch touches admission only; original and target ships, item UUIDs and actor pose stay intact", () => {
  const f = fixture(),
    before = JSON.stringify(f.inventory),
    a = f.db.character.id.find("actor"),
    source = { ...f.db.shipWorldMotion.shipId.find("original") },
    target = { ...f.db.shipWorldMotion.shipId.find("target") };
  beginConstructionFlightReview(f.ctx, f.args);
  expect(f.db.worldAdmission.characterId.find("actor").shipId).toBe("target");
  expect(f.db.worldAdmission.characterId.find("actor").revision).toBe(8n);
  expect(f.db.character.id.find("actor")).toBe(a);
  expect(f.db.shipWorldMotion.shipId.find("original")).toEqual(source);
  expect(f.db.shipWorldMotion.shipId.find("target")).toEqual(target);
  expect(JSON.stringify(f.inventory)).toBe(before);
  const m = f.db.worldAdmission.characterId.find("actor");
  beginConstructionFlightReview(f.ctx, f.args);
  expect(f.db.worldAdmission.characterId.find("actor")).toBe(m);
});
test("new connection context resumes persisted review then grant-free return restores membership and original pose atomically", () => {
  const f = fixture();
  beginConstructionFlightReview(f.ctx, f.args);
  const reconnect = { ...f.ctx, grants: new Set<string>() };
  expect(
    f.db.constructionFlightReview.characterId.find("actor").originalShipId,
  ).toBe("original");
  f.db.shipWorldMotion.shipId.update({
    ...f.db.shipWorldMotion.shipId.find("original"),
    x: 456,
  });
  const args = {
    ...f.args,
    expectedAdmissionRevision: 8n,
    operationId: "return",
  };
  returnConstructionFlightReview(reconnect, args);
  expect(f.db.worldAdmission.characterId.find("actor").shipId).toBe("original");
  expect(f.db.worldAdmission.characterId.find("actor").revision).toBe(9n);
  expect(f.db.character.id.find("actor")).toMatchObject({
    shipId: "original",
    localX: 2,
    localY: 3,
  });
  expect(f.db.shipWorldMotion.shipId.find("original").x).toBe(456);
  expect(f.db.constructionLocation.characterId.find("actor")).toBeUndefined();
  expect(
    f.db.constructionFlightReview.characterId.find("actor"),
  ).toBeUndefined();
  expect(f.inventory.pistol.id).toBe("same-pistol");
  const admission = f.db.worldAdmission.characterId.find("actor");
  returnConstructionFlightReview(reconnect, args);
  expect(f.db.worldAdmission.characterId.find("actor")).toBe(admission);
});
test("grant, stale visit/admission and occupied pilot reservation cannot be bypassed", () => {
  const f = fixture();
  f.ctx.grants.clear();
  expect(() => beginConstructionFlightReview(f.ctx, f.args)).toThrow("Grant");
  f.ctx.grants = new Set(["draft.read", "instance.spawn"]);
  expect(() =>
    beginConstructionFlightReview(f.ctx, {
      ...f.args,
      expectedAdmissionRevision: 6n,
    }),
  ).toThrow("admission");
  beginConstructionFlightReview(f.ctx, f.args);
  f.db.constructionPilotSeat.insert({
    characterId: "actor",
    stationId: "station",
  });
  expect(() =>
    returnConstructionFlightReview(f.ctx, {
      ...f.args,
      expectedAdmissionRevision: 8n,
      operationId: "return",
    }),
  ).toThrow("Recover pilot");
  expect(f.db.worldAdmission.characterId.find("actor").shipId).toBe("target");
  expect(f.db.constructionFlightReview.characterId.find("actor")).toBeDefined();
});

test("late return failure propagates so enclosing transaction restores admission, visit and original actor state", () => {
  const f = fixture();
  beginConstructionFlightReview(f.ctx, f.args);
  const saved = new Map(
    Object.entries(f.db).map(([name, t]: [string, any]) => [
      name,
      new Map(t.rows),
    ]),
  );
  f.db.constructionReceipt.insert = () => {
    throw Error("storage failure");
  };
  expect(() => {
    try {
      returnConstructionFlightReview(f.ctx, {
        ...f.args,
        expectedAdmissionRevision: 8n,
        operationId: "return",
      });
    } catch (error) {
      for (const [name, rows] of saved) {
        f.db[name].rows.clear();
        for (const [id, row] of rows) f.db[name].rows.set(id, row);
      }
      throw error;
    }
  }).toThrow("storage failure");
  expect(f.db.worldAdmission.characterId.find("actor")).toMatchObject({
    shipId: "target",
    revision: 8n,
  });
  expect(f.db.character.id.find("actor").shipId).toBe("target");
  expect(f.db.constructionLocation.characterId.find("actor")).toBeDefined();
  expect(f.db.constructionFlightReview.characterId.find("actor")).toBeDefined();
});
test("old begin receipt cannot silently reattach a returned owner; changed source system denies restoration", () => {
  const f = fixture();
  beginConstructionFlightReview(f.ctx, f.args);
  f.db.shipWorldMotion.shipId.update({
    ...f.db.shipWorldMotion.shipId.find("original"),
    systemId: "another",
  });
  const args = {
    ...f.args,
    expectedAdmissionRevision: 8n,
    operationId: "return",
  };
  expect(() => returnConstructionFlightReview(f.ctx, args)).toThrow(
    "admission changed",
  );
  expect(f.db.worldAdmission.characterId.find("actor").revision).toBe(8n);
  f.db.shipWorldMotion.shipId.update({
    ...f.db.shipWorldMotion.shipId.find("original"),
    systemId: "system",
  });
  returnConstructionFlightReview(f.ctx, args);
  expect(() => beginConstructionFlightReview(f.ctx, f.args)).toThrow(
    "entered flight-review",
  );
  expect(f.db.worldAdmission.characterId.find("actor").shipId).toBe("original");
});
