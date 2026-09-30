import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
vi.mock("spacetimedb/server", () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    SenderError: class extends Error {},
    table: () => ({}),
    t: new Proxy({}, { get: () => () => chain }),
  };
});
vi.mock("./auth", () => ({
  requireGame: (ctx: any) => {
    if (!ctx.game) throw Error("Game admission required");
  },
}));
vi.mock("./input-control", () => ({
  consumeInputControl: (ctx: any) => ctx.control,
}));
vi.mock("./combat", () => ({ clearAim: () => {} }));
vi.mock("./construction", () => ({
  requireGrant: () => {
    throw Error("Access required");
  },
}));
vi.mock("./construction-passenger-access", () => ({
  acceptedPassengerAccess: () => ({ readInterior: false }),
}));
vi.mock("./game-ship-access-authority", () => ({
  GAME_OWNED_TEMPLATE_NAMESPACE: "trusted",
  ownedGameShipAccess: (ctx: any) => ({
    readInterior: ctx.access,
    useObjects: ctx.access,
  }),
}));
vi.mock("./construction-flight-dirty", () => ({
  commitFlightCharacter: (_ctx: any, row: any, update: any) => update(row),
}));
vi.mock("./construction-doors", () => ({
  constructionCollision: (ctx: any) => ctx.frame,
}));
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  prefabConstructionDocument,
  prefabWalkFrame,
} from "@sidereal/sim/prefab-construction";
import { prefabBedSeats, qualifyPrefabBed } from "@sidereal/sim/prefab-seats";
import {
  constructionInteractionView,
  interactWithConstructionObject,
  releaseConstructionSeat,
} from "./construction-interactions";

function store(key = "id", indices: Record<string, string> = {}) {
  const rows: any[] = [];
  const table: any = {
    rows,
    iter: () => rows.values(),
    insert: (r: any) => {
      if (rows.some((o) => o[key] === r[key])) throw Error("unique");
      rows.push(r);
      return r;
    },
  };
  table[key] = {
    find: (v: any) => rows.find((r) => r[key] === v),
    update: (r: any) => {
      const i = rows.findIndex((o) => o[key] === r[key]);
      if (i < 0) throw Error("missing");
      rows[i] = r;
    },
    delete: (v: any) => {
      const i = rows.findIndex((o) => o[key] === v);
      if (i >= 0) rows.splice(i, 1);
    },
  };
  for (const [name, field] of Object.entries(indices))
    table[name] = {
      filter: (v: any) => rows.filter((r) => r[field] === v),
      find: (v: any) => rows.find((r) => r[field] === v),
    };
  return table;
}
function fixture() {
  const doc = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
  const catalog = defaultPrefabComponentCatalog();
  const frame = {
    ...prefabWalkFrame(doc, catalog),
    shipId: "ship",
    deckId: "deck",
  };
  const bed = prefabBedSeats(doc, catalog).find((b) =>
    qualifyPrefabBed(frame, b),
  )!;
  const owner = Identity.fromString("a".repeat(64));
  const db: any = {
    character: store("id", { by_owner: "owner" }),
    constructionLocation: store("characterId", { by_instance: "instanceId" }),
    constructionInstance: store(),
    constructionDeck: store(),
    constructionInteractionBinding: store("objectId", {
      by_instance: "instanceId",
      by_recovery: "recoveryRequested",
      placedObjectId: "placedObjectId",
    }),
    interactionObject: store("id", { by_ship: "shipId" }),
    couchSeat: store("characterId", { objectId: "objectId" }),
    input: store("characterId"),
    station: store("id", { shipId: "shipId" }),
    interactionReceipt: store("id", { by_character: "characterId" }),
    interactionObjectPin: store("objectId"),
    contentDefinitionHead: store("definitionKey"),
    contentDefinition: store("definitionRef"),
    constructionGrant: store("id", { by_principal: "principal" }),
    constructionStairWalk: store("characterId"),
    constructionTraversal: store("characterId"),
  };
  db.character.insert({
    id: "actor",
    owner,
    shipId: "ship",
    connected: true,
    localX: bed.approachX,
    localY: bed.approachY,
    sprinting: true,
  });
  db.constructionLocation.insert({
    characterId: "actor",
    instanceId: "ship",
    deckId: "deck",
  });
  db.constructionInstance.insert({
    id: "ship",
    owner,
    workspaceId: "trusted",
    spawnDeckId: "deck",
    revision: 1n,
    documentJson: JSON.stringify(prefabConstructionDocument(doc, catalog)),
    idMapJson: '{"objects":[]}',
  });
  db.constructionDeck.insert({ id: "deck", instanceId: "ship", elevation: 0 });
  db.input.insert({
    characterId: "actor",
    dx: 1,
    dy: 1,
    throttle: 1,
    turn: 1,
    sprint: true,
  });
  let ids = 0;
  const ctx: any = {
    db,
    sender: owner,
    frame,
    game: true,
    control: true,
    access: true,
    timestamp: { microsSinceUnixEpoch: 1n },
    newUuidV4: () => `uuid-${++ids}`,
  };
  const args = {
    objectId: `ship:seat:${bed.placementId}`,
    action: "sit",
    expectedRevision: 1n,
    operationId: "sit-1",
  };
  const transact = (request = args) => {
    const snapshot = Object.values(db).map((t: any) => [...t.rows]);
    try {
      return interactWithConstructionObject(ctx, request);
    } catch (e) {
      Object.values(db).forEach((t: any, i) =>
        t.rows.splice(0, t.rows.length, ...snapshot[i]),
      );
      throw e;
    }
  };
  return { ctx, db, bed, args, transact };
}
test("bed descriptors are read-only; first sit uses existing exclusive seat, clears input and safe exit", () => {
  const f = fixture();
  const rows = constructionInteractionView(f.ctx);
  expect(rows.find((r) => r.id === f.args.objectId)).toMatchObject({
    kind: "seat",
    revision: 1n,
    reachable: true,
  });
  expect(f.db.interactionObject.rows).toHaveLength(0);
  expect(f.transact()).toBe(true);
  expect(f.db.couchSeat.characterId.find("actor").objectId).toBe(
    f.args.objectId,
  );
  expect(f.db.station.rows).toHaveLength(0);
  expect(f.db.character.id.find("actor")).toMatchObject({
    localX: f.bed.seatX,
    localY: f.bed.seatY,
    sprinting: false,
  });
  expect(f.db.input.characterId.find("actor")).toMatchObject({
    dx: 0,
    dy: 0,
    throttle: 0,
    turn: 0,
    sprint: false,
  });
  expect(f.transact()).toBe(true); // exact retry
  expect(f.db.interactionReceipt.rows).toHaveLength(1);
  expect(releaseConstructionSeat(f.ctx, "actor", "stand")).toEqual({
    handled: true,
    released: true,
  });
  expect(f.db.couchSeat.rows).toHaveLength(0);
  expect(f.db.character.id.find("actor")).toMatchObject({
    localX: f.bed.approachX,
    localY: f.bed.approachY,
  });
});
test("unadmitted, out-of-reach, stale and unsupported first use leaves no seat or registration", () => {
  for (const invalidate of [
    (f: ReturnType<typeof fixture>) => {
      f.ctx.game = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.ctx.access = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.ctx.control = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.db.character.rows[0] = { ...f.db.character.rows[0], localY: 999 };
    },
    (f: ReturnType<typeof fixture>) => {
      f.args.expectedRevision = 99n;
    },
    (f: ReturnType<typeof fixture>) => {
      f.ctx.frame = { ...f.ctx.frame, floors: [] };
    },
    (f: ReturnType<typeof fixture>) => {
      f.db.constructionDeck.rows[0] = {
        ...f.db.constructionDeck.rows[0],
        elevation: 3,
      };
    },
  ]) {
    const f = fixture();
    invalidate(f);
    expect(() => f.transact()).toThrow();
    expect(f.db.interactionObject.rows).toHaveLength(0);
    expect(f.db.constructionInteractionBinding.rows).toHaveLength(0);
    expect(f.db.couchSeat.rows).toHaveLength(0);
  }
});
test("forged object stays unavailable and occupied bed rejects a second character", () => {
  const f = fixture();
  expect(
    f.transact({ ...f.args, objectId: "foreign:seat:prefab:mount:bunk" }),
  ).toBe(false);
  f.transact();
  const second = Identity.fromString("b".repeat(64));
  f.db.character.insert({
    ...f.db.character.rows[0],
    id: "second",
    owner: second,
    localX: f.bed.approachX,
    localY: f.bed.approachY,
  });
  f.db.constructionLocation.insert({
    characterId: "second",
    instanceId: "ship",
    deckId: "deck",
  });
  f.ctx.sender = second;
  expect(() =>
    f.transact({ ...f.args, expectedRevision: 2n, operationId: "sit-2" }),
  ).toThrow();
  expect(f.db.couchSeat.rows).toHaveLength(1);
});

test("current source revision and access are rechecked; obstructed disconnect exit retains occupancy until support returns", () => {
  const f = fixture();
  f.transact();
  const original = f.db.constructionInstance.rows[0];
  f.db.constructionInstance.rows[0] = { ...original, revision: 2n };
  expect(
    constructionInteractionView(f.ctx).some((r) => r.id === f.args.objectId),
  ).toBe(false);
  expect(() =>
    f.transact({
      ...f.args,
      expectedRevision: 2n,
      operationId: "changed-source",
    }),
  ).toThrow();
  expect(f.db.couchSeat.rows).toHaveLength(1);
  f.db.constructionInstance.rows[0] = original;
  const frame = f.ctx.frame;
  f.ctx.frame = { ...frame, floors: [] };
  const before = { ...f.db.character.rows[0] };
  expect(releaseConstructionSeat(f.ctx, "actor", "disconnect")).toEqual({
    handled: true,
    released: false,
  });
  expect(f.db.character.rows[0]).toEqual(before);
  expect(f.db.couchSeat.rows).toHaveLength(1);
  expect(f.db.constructionInteractionBinding.rows[0].recoveryRequested).toBe(
    true,
  );
  f.ctx.frame = frame;
  expect(releaseConstructionSeat(f.ctx, "actor", "disconnect")).toEqual({
    handled: true,
    released: true,
  });
  f.ctx.access = false;
  expect(constructionInteractionView(f.ctx)).toEqual([]);
  expect(() =>
    f.transact({
      ...f.args,
      expectedRevision: 3n,
      operationId: "access-revoked",
    }),
  ).toThrow();
  expect(f.db.couchSeat.rows).toHaveLength(0);
});
