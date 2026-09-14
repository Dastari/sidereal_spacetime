import {
  createNativeTraversalRoomDocument,
  nativeTraversalRoomInstallation,
} from "@sidereal/sim/construction-traversal-document";
import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
import type { NativeTraversalDelivery } from "@sidereal/content/construction-traversal";
import {
  createNativeTraversalCompiler,
  type TraversalInstallation,
} from "@sidereal/sim/construction-traversal";
vi.mock("spacetimedb/server", () => ({
  SenderError: class extends Error {},
  table: () => ({}),
  t: new Proxy(
    {},
    { get: () => () => ({ primaryKey: () => ({}), unique: () => ({}) }) },
  ),
}));
vi.mock("./auth", () => ({
  requireGame: (ctx: any) => {
    if (!ctx.admitted) throw Error("game admission denied");
  },
  canConsume: (ctx: any) => ctx.admitted,
}));
import {
  beginConstructionTraversal,
  cancelConstructionTraversal,
  constructionTraversalPositionAllowed,
  installTraversalLink,
  interruptConstructionTraversalOwner,
  ownConstructionTraversals,
  ownConstructionTraversalLinks,
  requireStandingConstructionActor,
  requireUnreservedConstructionInstance,
  stepConstructionTraversals,
  traversalAdapterKey,
  type TraversalRegistry,
} from "./construction-traversal";

const base =
  "assets/art-library/designs/shipyard.structure.traversal-ladder/revisions/r000/a003/";
const delivery = JSON.parse(
  readFileSync(base + "delivery.json", "utf8"),
) as NativeTraversalDelivery & {
  sources: Record<string, { path: string; sha256: string }>;
};
const auditBytes = new Uint8Array(readFileSync(base + "traversal-audit.json"));
// Actual pinned delivery verification; this test does not install a runtime catalog,
// publish assets, create a database, or substitute a trusted-validation boolean.
const compile = createNativeTraversalCompiler({
  delivery,
  audit: auditBytes,
  sources: Object.fromEntries(
    Object.entries(delivery.sources).map(([key, pin]) => [
      key,
      new Uint8Array(readFileSync(pin.path)),
    ]),
  ),
});
const registry: TraversalRegistry = new Map([
  [
    traversalAdapterKey(delivery.adapterId, delivery.revision),
    {
      adapterId: delivery.adapterId,
      revision: delivery.revision,
      auditSha256: delivery.auditSha256,
      compile,
    },
  ],
]);
const owner = Identity.fromString("1".repeat(64)),
  other = Identity.fromString("2".repeat(64));
function table(primary = "id", indexes: Record<string, string> = {}) {
  const rows = new Map<string, any>();
  const result: any = {
    iter: () => rows.values(),
    insert: (row: any) => {
      if (rows.has(row[primary])) throw Error("duplicate");
      rows.set(row[primary], row);
    },
    [primary]: {
      find: (id: string) => rows.get(id),
      update: (row: any) => {
        if (!rows.has(row[primary])) throw Error("missing");
        rows.set(row[primary], row);
      },
      delete: (id: string) => rows.delete(id),
    },
  };
  for (const [name, column] of Object.entries(indexes))
    result[name] = {
      filter: function* (value: any) {
        for (const row of rows.values())
          if (
            value?.isEqual ? value.isEqual(row[column]) : row[column] === value
          )
            yield row;
      },
    };
  return result;
}
function database() {
  return {
    constructionTraversalLink: table("id", {
      by_owner: "owner",
      by_instance: "instanceId",
    }),
    constructionFlightBinding: table("shipId"),
    constructionTraversal: table("characterId", {
      by_owner: "owner",
      by_instance: "instanceId",
    }),
    constructionTraversalReservation: table("linkId", {
      by_instance: "instanceId",
    }),
    constructionTraversalClock: table(),
    constructionTraversalAudit: table("id", { by_owner: "owner" }),
    constructionInstance: table("id", { by_owner: "owner" }),
    constructionDeck: table(),
    constructionLocation: table("characterId", { by_instance: "instanceId" }),
    character: table("id", { by_owner: "owner" }),
    constructionGrant: table("id", { by_principal: "principal" }),
    constructionReceipt: table("id", { by_principal: "principal" }),
    input: table("characterId"),
    combatAim: table("characterId"),
    couchSeat: table("characterId"),
    station: table("shipId"),
  };
}
function fixture() {
  let serial = 0;
  const ctx: any = {
    db: database(),
    sender: owner,
    admitted: true,
    timestamp: { microsSinceUnixEpoch: 1n },
    newUuidV4: () => ({ toString: () => "allocated-" + ++serial }),
  };
  const db = () => ctx.db;
  for (const capability of ["instance.spawn", "draft.read"])
    db().constructionGrant.insert({
      id: capability,
      principal: owner,
      workspaceId: "workspace",
      capability,
      expiresMicros: 18446744073709551615n,
      revoked: false,
      revision: 1n,
    });
  function prepare(
    id = "instance-a",
    principal = owner,
  ): TraversalInstallation {
    const document = createNativeTraversalRoomDocument();
    document.layout.id = id;
    const deckId = (source: string) =>
      source === "lower-deck" ? id + ":lower" : id + ":upper";
    document.layout.decks = document.layout.decks.map((d) => ({
      ...d,
      id: deckId(d.id),
      holes: d.holes.map((h) => ({ ...h, id: id + ":" + h.id })),
    }));
    document.layout.playableDeckId = id + ":lower";
    document.layout.tiles = document.layout.tiles.map((t) => ({
      ...t,
      id: id + ":" + t.id,
      deckId: deckId(t.deckId),
    }));
    document.floors = document.floors.map((p) => ({
      ...p,
      id: id + ":" + p.id,
      deckId: deckId(p.deckId),
    }));
    const r = document.traversalRoom!;
    document.traversalRoom = {
      ...r,
      lowerDeckId: id + ":lower",
      upperDeckId: id + ":upper",
      linkId: id + ":link",
      parts: r.parts.map((p) => ({ ...p, id: id + ":" + p.id })),
      apertures: r.apertures.map((p) => ({ ...p, id: id + ":" + p.id })),
    };
    const i = nativeTraversalRoomInstallation(document, 1n, 1n);
    db().constructionInstance.insert({
      id,
      owner: principal,
      workspaceId: "workspace",
      revision: 1n,
      idMapJson: JSON.stringify({
        traversalLinks: [{ sourceId: "source-link", instanceId: i.linkId }],
        nativeParts: i.parts.map((p) => ({
          sourceId: "native-" + p.sourcePartId,
          instanceId: p.id,
        })),
        traversalApertures: i.apertures.map((p) => ({
          sourceId: "physical-" + p.sourceApertureId,
          instanceId: p.id,
        })),
      }),
      documentJson: JSON.stringify(document),
    });
    for (const side of [i.lower, i.upper])
      db().constructionDeck.insert({
        id: side.deckId,
        instanceId: id,
        elevation: side.originZ,
        ceiling: 3,
      });
    return i;
  }
  function install(id = "instance-a", principal = owner) {
    const i = prepare(id, principal);
    installTraversalLink(
      { ...ctx, sender: principal },
      {
        sourceLinkId: "source-link",
        adapterId: delivery.adapterId,
        adapterRevision: delivery.revision,
        installation: i,
      },
      registry,
    );
    return i;
  }
  function actor(
    id = "actor-a",
    instanceId = "instance-a",
    principal = owner,
    deck = "lower",
    x = 3.1,
    y = 1.25,
  ) {
    db().character.insert({
      id,
      owner: principal,
      name: id,
      shipId: instanceId,
      localX: x,
      localY: y,
      connected: true,
      sprinting: true,
    });
    db().constructionLocation.insert({
      characterId: id,
      instanceId,
      deckId: instanceId + ":" + deck,
      visitId: id + ":visit",
      revision: 1n,
      returnShipId: "stock-ship",
      returnX: 7,
      returnY: 11,
    });
    db().input.insert({
      characterId: id,
      dx: 1,
      dy: 1,
      throttle: 1,
      turn: 1,
      sprint: true,
      updatedMicros: 99n,
    });
    db().combatAim.insert({ characterId: id, active: true, angle: 2 });
  }
  function request(id = "actor-a") {
    const v = db().constructionLocation.characterId.find(id);
    return {
      linkId: v.instanceId + ":link",
      expectedVisitId: v.visitId,
      expectedLocationRevision: v.revision,
      expectedInstanceRevision: 1n,
      expectedLinkRevision: 1n,
      operationId: "begin-" + id,
    };
  }
  function begin(id = "actor-a", args = request(id)) {
    beginConstructionTraversal(ctx, id, args, registry);
  }
  function tick(count = 1, gap = 50000n) {
    for (let i = 0; i < count; i++) {
      ctx.timestamp = {
        microsSinceUnixEpoch: ctx.timestamp.microsSinceUnixEpoch + gap,
      };
      stepConstructionTraversals(ctx, registry);
    }
  }
  function reload() {
    const next = database();
    for (const name of Object.keys(next) as (keyof typeof next)[])
      for (const row of db()[name].iter()) next[name].insert({ ...row });
    ctx.db = next;
  }
  function active(id = "actor-a") {
    return db().constructionTraversal.characterId.find(id);
  }
  function revoke(capability = "instance.spawn") {
    const g = db().constructionGrant.id.find(capability);
    db().constructionGrant.id.update({ ...g, revoked: true });
  }
  return {
    ctx,
    db,
    prepare,
    install,
    actor,
    request,
    begin,
    tick,
    reload,
    active,
    revoke,
    allocated: () => serial,
  };
}

test("actual exhaustive native installation must match authoritative UUID mapping and deck datums", () => {
  const f = fixture(),
    i = f.prepare();
  const install = (installation = i, ctx = f.ctx) =>
    installTraversalLink(
      ctx,
      {
        sourceLinkId: "source-link",
        adapterId: delivery.adapterId,
        adapterRevision: delivery.revision,
        installation,
      },
      registry,
    );
  expect(() => install({ ...i, parts: i.parts.slice(1) })).toThrow(
    /exhaustive/,
  );
  expect(() => install(i, { ...f.ctx, sender: other })).toThrow(/owned/);
  const d = f.db().constructionDeck.id.find(i.upper.deckId);
  f.db().constructionDeck.id.update({ ...d, elevation: 4 });
  expect(() => install()).toThrow(/deck/);
  f.db().constructionDeck.id.update(d);
  const row = install();
  expect(install()).toEqual(row);
  expect([...f.db().constructionTraversalLink.iter()]).toHaveLength(1);
  expect(() =>
    installTraversalLink(
      f.ctx,
      {
        sourceLinkId: "source-link",
        adapterId: delivery.adapterId,
        adapterRevision: delivery.revision,
        installation: i,
      },
      new Map(),
    ),
  ).toThrow(/qualified native adapter/);
});

test("begin validates game, grant, visit, standing, reach and all revisions before allocating; replay still requires grant", () => {
  const f = fixture();
  f.install();
  f.actor();
  const request = f.request();
  for (const [key, value] of [
    ["expectedLocationRevision", 2n],
    ["expectedInstanceRevision", 2n],
    ["expectedLinkRevision", 2n],
    ["expectedVisitId", "stale"],
  ] as const)
    expect(() => f.begin("actor-a", { ...request, [key]: value })).toThrow();
  f.ctx.admitted = false;
  expect(() => f.begin()).toThrow(/admission/);
  f.ctx.admitted = true;
  const a = f.db().character.id.find("actor-a");
  f.db().character.id.update({ ...a, localX: 0 });
  expect(() => f.begin()).toThrow(/landing|approach/);
  f.db().character.id.update(a);
  f.db().couchSeat.insert({ characterId: "actor-a" });
  expect(() => f.begin()).toThrow(/standing/);
  f.db().couchSeat.characterId.delete("actor-a");
  expect(f.allocated()).toBe(0);
  f.begin();
  const active = f.active();
  expect([active.acceptedX, active.acceptedY, active.acceptedZ]).toEqual([
    3.1, 1.25, 0.1875,
  ]);
  expect(f.db().input.characterId.find("actor-a")).toMatchObject({
    dx: 0,
    dy: 0,
    throttle: 0,
    turn: 0,
    sprint: false,
  });
  expect(f.db().combatAim.characterId.find("actor-a").active).toBe(false);
  f.begin("actor-a", request);
  expect(f.allocated()).toBe(1);
  expect(f.active()).toEqual(active);
  f.revoke();
  expect(() => f.begin("actor-a", request)).toThrow(/grant|capability/i);
  expect(f.allocated()).toBe(1);
});

test("same owner two-character contention reserves both landings while a second instance remains independent", () => {
  const f = fixture();
  f.install();
  f.install("instance-b");
  f.actor();
  f.actor("actor-b", "instance-a", owner, "upper", 0, 0);
  f.actor("actor-c", "instance-b");
  f.begin();
  f.begin("actor-c");
  const b = f.db().character.id.find("actor-b");
  f.db().character.id.update({ ...b, localX: 3, localY: 1.25 });
  expect(() => f.begin("actor-b")).toThrow(/reserved|conflict|occupied/);
  expect(f.allocated()).toBe(2);
  expect(
    constructionTraversalPositionAllowed(
      f.ctx,
      "actor-b",
      "instance-a",
      "instance-a:upper",
      3,
      1.25,
    ),
  ).toBe(false);
  f.db().character.id.update(b);
  expect(
    constructionTraversalPositionAllowed(
      f.ctx,
      "actor-b",
      "instance-a",
      "instance-a:upper",
      0,
      0,
    ),
  ).toBe(true);
  expect(() => requireStandingConstructionActor(f.ctx, "actor-a")).toThrow(
    /traversing/,
  );
  expect(() =>
    requireUnreservedConstructionInstance(f.ctx, "instance-a"),
  ).toThrow(/reserved/);
  f.db().character.id.update(b);
  f.tick(160);
  expect(f.active()).toBeUndefined();
  expect(f.active("actor-c")).toBeUndefined();
  expect(f.db().constructionLocation.characterId.find("actor-a").deckId).toBe(
    "instance-a:upper",
  );
  expect(f.db().constructionLocation.characterId.find("actor-c").deckId).toBe(
    "instance-b:upper",
  );
});

test("fixed ticks never catch up; arrival commits deck and destination atomically and descending returns to lower", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.begin();
  f.tick(35);
  const before = f.active();
  expect(before.acceptedZ).toBeGreaterThan(0.1875);
  expect(f.db().constructionLocation.characterId.find("actor-a")).toMatchObject(
    { deckId: "instance-a:lower", revision: 1n },
  );
  expect(f.db().character.id.find("actor-a")).toMatchObject({
    localX: 3.1,
    localY: 1.25,
  });
  expect(stepConstructionTraversals(f.ctx, registry)).toBe(false);
  expect(f.active()).toEqual(before);
  f.reload();
  f.tick(1, 900000000n);
  expect(
    JSON.parse(f.active().stateJson).distanceM -
      JSON.parse(before.stateJson).distanceM,
  ).toBeCloseTo(0.04, 10);
  f.tick(160);
  expect(f.active()).toBeUndefined();
  expect([...f.db().constructionTraversalReservation.iter()]).toHaveLength(0);
  expect(f.db().constructionLocation.characterId.find("actor-a")).toMatchObject(
    {
      deckId: "instance-a:upper",
      revision: 2n,
      returnShipId: "stock-ship",
      returnX: 7,
      returnY: 11,
    },
  );
  expect(f.db().character.id.find("actor-a")).toMatchObject({
    localX: 3,
    localY: 1.25,
  });
  f.begin("actor-a", { ...f.request(), operationId: "descend" });
  f.tick(160);
  expect(f.db().constructionLocation.characterId.find("actor-a")).toMatchObject(
    { deckId: "instance-a:lower", revision: 3n },
  );
  expect(
    [...f.db().constructionTraversalAudit.iter()].map((a: any) => a.outcome),
  ).toEqual(["arrived", "arrived"]);
});

test.each(["cancel", "disconnect", "grant", "admission"])(
  "%s persists continuous reversal across reload and releases only at accepted source",
  (reason) => {
    const f = fixture();
    f.install();
    f.actor();
    f.begin();
    f.tick(50);
    const before = f.active();
    if (reason === "cancel")
      cancelConstructionTraversal(f.ctx, "actor-a", {
        traversalId: before.id,
        expectedVisitId: before.visitId,
        expectedRevision: before.revision,
        operationId: "cancel-a",
      });
    if (reason === "disconnect") {
      const a = f.db().character.id.find("actor-a");
      f.db().character.id.update({ ...a, connected: false });
      interruptConstructionTraversalOwner(f.ctx, owner);
    }
    if (reason === "grant") f.revoke();
    if (reason === "admission") f.ctx.admitted = false;
    if (reason === "cancel" || reason === "disconnect")
      expect([
        f.active().acceptedX,
        f.active().acceptedY,
        f.active().acceptedZ,
      ]).toEqual([before.acceptedX, before.acceptedY, before.acceptedZ]);
    f.tick();
    expect(f.active().phase).toBe("returning");
    const returning = f.active();
    expect(JSON.parse(returning.stateJson).distanceM).toBeLessThan(
      JSON.parse(before.stateJson).distanceM,
    );
    f.reload();
    expect(f.active()).toEqual(returning);
    f.tick(60);
    expect(f.active()).toBeUndefined();
    expect([...f.db().constructionTraversalReservation.iter()]).toHaveLength(0);
    expect(f.db().character.id.find("actor-a")).toMatchObject({
      localX: 3.1,
      localY: 1.25,
    });
    expect(
      f.db().constructionLocation.characterId.find("actor-a"),
    ).toMatchObject({ deckId: "instance-a:lower", revision: 2n });
    expect([...f.db().constructionTraversalAudit.iter()][0].outcome).toBe(
      "cancelled",
    );
  },
);

test("a newly blocked return preserves accepted position and reservation; geometry invalidation never teleports", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.actor("actor-b", "instance-a", owner, "lower", 0, 0);
  f.begin();
  f.tick(45);
  const before = f.active();
  const b = f.db().character.id.find("actor-b");
  f.db().character.id.update({
    ...b,
    localX: before.acceptedX,
    localY: before.acceptedY,
  });
  f.tick();
  expect(f.active().phase).toBe("blocked");
  expect([
    f.active().acceptedX,
    f.active().acceptedY,
    f.active().acceptedZ,
  ]).toEqual([before.acceptedX, before.acceptedY, before.acceptedZ]);
  expect([...f.db().constructionTraversalReservation.iter()]).toHaveLength(1);
  f.db().character.id.update(b);
  f.tick(60);
  expect(f.active()).toBeUndefined();
  f.begin("actor-a", { ...f.request(), operationId: "again" });
  f.tick(40);
  const mid = f.active();
  const instance = f.db().constructionInstance.id.find("instance-a");
  f.db().constructionInstance.id.update({ ...instance, revision: 2n });
  f.tick();
  expect(f.active()).toMatchObject({
    phase: "blocked",
    interruption: "geometry-changed",
    acceptedX: mid.acceptedX,
    acceptedY: mid.acceptedY,
    acceptedZ: mid.acceptedZ,
  });
  f.reload();
  f.tick();
  expect(f.active().phase).toBe("blocked");
  expect([...f.db().constructionTraversalReservation.iter()]).toHaveLength(1);
});

test("own active status survives read-grant loss while link discovery remains restricted", () => {
  const f = fixture();
  f.install();
  f.actor();
  expect(ownConstructionTraversalLinks(f.ctx)).toHaveLength(1);
  f.begin();
  const view = ownConstructionTraversals(f.ctx);
  expect(view).toHaveLength(1);
  expect(Object.keys(view[0]).sort()).toEqual(
    [
      "characterId",
      "traversalId",
      "instanceId",
      "linkId",
      "sourceDeckId",
      "destinationDeckId",
      "phase",
      "interruption",
      "revision",
      "x",
      "y",
      "z",
    ].sort(),
  );
  expect(ownConstructionTraversals({ ...f.ctx, sender: other })).toEqual([]);
  expect(ownConstructionTraversalLinks({ ...f.ctx, sender: other })).toEqual(
    [],
  );
  f.reload();
  expect(ownConstructionTraversals(f.ctx)).toEqual(view);
  f.revoke("draft.read");
  expect(ownConstructionTraversals(f.ctx)).toEqual(view);
  expect(ownConstructionTraversalLinks(f.ctx)).toEqual([]);
});

test("cancel rejects future revision, replays without a second return transition, and rechecks expired grants before receipt", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.begin();
  f.tick(10);
  const row = f.active();
  const args = {
    traversalId: row.id,
    expectedVisitId: row.visitId,
    expectedRevision: row.revision,
    operationId: "cancel-once",
  };
  expect(() =>
    cancelConstructionTraversal(f.ctx, "actor-a", {
      ...args,
      expectedRevision: row.revision + 1n,
    }),
  ).toThrow(/revision/i);
  expect(() =>
    cancelConstructionTraversal({ ...f.ctx, sender: other }, "actor-a", args),
  ).toThrow(/owned/);
  cancelConstructionTraversal(f.ctx, "actor-a", args);
  const returning = f.active();
  cancelConstructionTraversal(f.ctx, "actor-a", args);
  expect(f.active()).toEqual(returning);
  const grant = f.db().constructionGrant.id.find("instance.spawn");
  f.db().constructionGrant.id.update({
    ...grant,
    expiresMicros: f.ctx.timestamp.microsSinceUnixEpoch,
  });
  expect(() => cancelConstructionTraversal(f.ctx, "actor-a", args)).toThrow(
    /grant|capability/i,
  );
  f.tick(12);
  expect(f.active()).toBeUndefined();
  expect([...f.db().constructionTraversalAudit.iter()]).toHaveLength(1);
});

test("expired grants reverse at consumption; restoring admission cannot turn a persisted return outbound", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.begin();
  f.tick(30);
  const g = f.db().constructionGrant.id.find("instance.spawn");
  f.db().constructionGrant.id.update({
    ...g,
    expiresMicros: f.ctx.timestamp.microsSinceUnixEpoch + 1n,
  });
  f.tick();
  expect(f.active()).toMatchObject({
    phase: "returning",
    interruption: "access-lost",
  });
  const distance = JSON.parse(f.active().stateJson).distanceM;
  f.db().constructionGrant.id.update(g);
  f.reload();
  f.tick();
  expect(f.active()).toMatchObject({
    phase: "returning",
    interruption: "access-lost",
  });
  expect(JSON.parse(f.active().stateJson).distanceM).toBeLessThan(distance);
  f.tick(40);
  expect([...f.db().constructionTraversalAudit.iter()][0].interruption).toBe(
    "access-lost",
  );
});

test("missing reservation or unavailable native registry fails closed without release or position reconstruction", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.begin();
  f.tick(35);
  const before = f.active();
  const held = f
    .db()
    .constructionTraversalReservation.linkId.find(before.linkId);
  f.db().constructionTraversalReservation.linkId.delete(before.linkId);
  f.tick();
  expect(f.active()).toMatchObject({
    phase: "blocked",
    interruption: "reservation-lost",
    acceptedX: before.acceptedX,
    acceptedY: before.acceptedY,
    acceptedZ: before.acceptedZ,
  });
  expect(() =>
    requireUnreservedConstructionInstance(f.ctx, before.instanceId),
  ).toThrow(/reserved/);
  f.db().constructionTraversalReservation.insert(held);
  f.ctx.timestamp = {
    microsSinceUnixEpoch: f.ctx.timestamp.microsSinceUnixEpoch + 50000n,
  };
  stepConstructionTraversals(f.ctx, new Map());
  expect(f.active()).toMatchObject({
    phase: "blocked",
    interruption: "geometry-changed",
    acceptedX: before.acceptedX,
    acceptedY: before.acceptedY,
    acceptedZ: before.acceptedZ,
  });
  expect([...f.db().constructionTraversalReservation.iter()]).toHaveLength(1);
  f.reload();
  f.tick();
  expect(f.active().phase).toBe("returning");
});

test("a stale source location revision cannot commit arrival or silently release the return reservation", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.begin();
  f.tick(35);
  const visit = f.db().constructionLocation.characterId.find("actor-a");
  f.db().constructionLocation.characterId.update({ ...visit, revision: 2n });
  f.tick(100);
  expect(f.active()).toMatchObject({
    phase: "blocked",
    interruption: "source-blocked",
  });
  expect(f.db().constructionLocation.characterId.find("actor-a").deckId).toBe(
    "instance-a:lower",
  );
  expect([...f.db().constructionTraversalReservation.iter()]).toHaveLength(1);
  expect([...f.db().constructionTraversalAudit.iter()]).toHaveLength(0);
});

test("current document and exhaustive ID maps are revalidated even if a buggy edit forgets its revision bump", () => {
  const f = fixture();
  f.install();
  f.actor();
  const original = f.db().constructionInstance.id.find("instance-a");
  const changed = JSON.parse(original.documentJson);
  changed.layout.decks[1].holes = [];
  f.db().constructionInstance.id.update({
    ...original,
    documentJson: JSON.stringify(changed),
  });
  expect(() => f.begin()).toThrow(/installation changed/);
  expect(ownConstructionTraversalLinks(f.ctx)).toEqual([]);
  expect(f.allocated()).toBe(0);
  const mapping = JSON.parse(original.idMapJson);
  mapping.nativeParts.pop();
  f.db().constructionInstance.id.update({
    ...original,
    idMapJson: JSON.stringify(mapping),
  });
  expect(() => f.begin()).toThrow(/installation changed/);
  f.db().constructionInstance.id.update(original);
  f.begin();
  f.tick(35);
  const before = f.active();
  f.db().constructionInstance.id.update({
    ...original,
    documentJson: JSON.stringify(changed),
  });
  f.tick();
  expect(f.active()).toMatchObject({
    phase: "blocked",
    interruption: "geometry-changed",
    acceptedX: before.acceptedX,
    acceptedY: before.acceptedY,
    acceptedZ: before.acceptedZ,
  });
  expect([...f.db().constructionTraversalReservation.iter()]).toHaveLength(1);
});

test("delayed cancellation accepts a positive observed revision for its exact journey and rejects cross-journey reuse", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.begin();
  f.tick(20);
  const observed = f.active();
  const args = {
    traversalId: observed.id,
    expectedVisitId: observed.visitId,
    expectedRevision: observed.revision,
    operationId: "delayed-cancel",
  };
  f.tick(8);
  expect(() =>
    cancelConstructionTraversal(f.ctx, "actor-a", {
      ...args,
      expectedRevision: 0n,
    }),
  ).toThrow(/revision/);
  expect(() =>
    cancelConstructionTraversal(f.ctx, "actor-a", {
      ...args,
      traversalId: "other-journey",
    }),
  ).toThrow(/traversal/);
  cancelConstructionTraversal(f.ctx, "actor-a", args);
  expect(f.active().phase).toBe("returning");
  f.tick(40);
  expect(f.active()).toBeUndefined();
  cancelConstructionTraversal(f.ctx, "actor-a", args);
  expect([...f.db().constructionTraversalAudit.iter()]).toHaveLength(1);
  f.begin("actor-a", { ...f.request(), operationId: "new-journey" });
  const next = f.active();
  expect(() => cancelConstructionTraversal(f.ctx, "actor-a", args)).toThrow(
    /traversal/,
  );
  expect(f.active()).toEqual(next);
});

test("server landing eligibility uses the same full actor footprint as begin, including diagonal near-anchor denial", () => {
  const f = fixture();
  f.install();
  f.actor();
  expect(ownConstructionTraversalLinks(f.ctx)[0].atLanding).toBe(true);
  const actor = f.db().character.id.find("actor-a");
  for (const point of [
    [3.2, 1.25],
    [3.14, 1.41],
    [3.15, 1.4],
  ]) {
    f.db().character.id.update({
      ...actor,
      localX: point[0],
      localY: point[1],
    });
    const inside = ownConstructionTraversalLinks(f.ctx)[0].atLanding;
    if (inside) {
      f.begin();
      expect(f.active()).toBeDefined();
      return;
    }
    expect(() => f.begin()).toThrow(/landing/);
  }
  throw Error("Expected exact landing edge to be accepted");
});

test("ordinary movement cannot graze a reserved landing corner between two clear endpoints", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.actor("actor-b", "instance-a", owner, "lower", 2.1, 0.9);
  f.begin();
  expect(
    constructionTraversalPositionAllowed(
      f.ctx,
      "actor-b",
      "instance-a",
      "instance-a:lower",
      2.1,
      0.9,
    ),
  ).toBe(true);
  expect(
    constructionTraversalPositionAllowed(
      f.ctx,
      "actor-b",
      "instance-a",
      "instance-a:lower",
      2.6,
      0.3,
    ),
  ).toBe(false);
  expect(
    constructionTraversalPositionAllowed(
      f.ctx,
      "actor-b",
      "instance-a",
      "instance-a:lower",
      1.9,
      0.3,
    ),
  ).toBe(true);
});

test("full workspace grant loss retains own accepted return position until terminal commit", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.begin();
  f.tick(60);
  const before = f.active();
  f.revoke("draft.read");
  f.revoke("instance.spawn");
  f.tick();
  expect(f.active().phase).toBe("returning");
  const view = ownConstructionTraversals(f.ctx);
  expect(view).toHaveLength(1);
  expect(view[0].z).toBe(f.active().acceptedZ);
  expect(view[0].z).toBeLessThan(before.acceptedZ);
  expect(ownConstructionTraversalLinks(f.ctx)).toEqual([]);
  expect(ownConstructionTraversals({ ...f.ctx, sender: other })).toEqual([]);
  f.reload();
  expect(ownConstructionTraversals(f.ctx)).toEqual(view);
  f.tick(120);
  expect(f.active()).toBeUndefined();
  expect(ownConstructionTraversals(f.ctx)).toEqual([]);
  expect([...f.db().constructionTraversalReservation.iter()]).toHaveLength(0);
});

test("idle traversal schedules do not write clocks before or after a journey", () => {
  const f = fixture();
  f.tick(100);
  expect([...f.db().constructionTraversalClock.iter()]).toEqual([]);
  f.install();
  f.actor();
  f.begin();
  f.tick(1, 86400000000n);
  const first = f.active();
  expect(first.acceptedY).toBeLessThanOrEqual(1.25 + 0.04);
  expect([...f.db().constructionTraversalClock.iter()][0].tick).toBe(1n);
  f.tick(200);
  expect(f.active()).toBeUndefined();
  const idleClock = [...f.db().constructionTraversalClock.iter()];
  const update = vi.spyOn(f.db().constructionTraversalClock.id, "update");
  f.tick(100);
  expect(update).not.toHaveBeenCalled();
  expect([...f.db().constructionTraversalClock.iter()]).toEqual(idleClock);
});

test("active traversal does not rewrite already cleared input and link view keys distinguish owned actors", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.actor("actor-b");
  const links = ownConstructionTraversalLinks(f.ctx);
  expect(links).toHaveLength(2);
  expect(new Set(links.map((l) => l.id)).size).toBe(2);
  // Move the second body away before the first reserves the landing.
  const b = f.db().character.id.find("actor-b");
  f.db().character.id.update({ ...b, localX: 5, localY: 5 });
  f.begin();
  const inputUpdate = vi.spyOn(f.db().input.characterId, "update");
  f.tick(10);
  expect(inputUpdate).not.toHaveBeenCalled();
});

test("blocked traversal writes only first state/reason changes and resumes one fixed step after idle", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.begin();
  f.tick(35);
  const before = f.active(),
    held = f.db().constructionTraversalReservation.linkId.find(before.linkId);
  f.db().constructionTraversalReservation.linkId.delete(before.linkId);
  f.tick();
  expect(f.active()).toMatchObject({
    phase: "blocked",
    interruption: "reservation-lost",
    revision: before.revision + 1n,
  });
  const blocked = { ...f.active() };
  const update = vi.spyOn(f.db().constructionTraversal.characterId, "update");
  const clock = vi.spyOn(f.db().constructionTraversalClock.id, "update");
  const input = vi.spyOn(f.db().input.characterId, "update");
  f.tick(100);
  expect(f.active()).toEqual(blocked);
  for (const spy of [update, clock, input]) expect(spy).not.toHaveBeenCalled();
  f.db().constructionTraversalReservation.insert(held);
  f.ctx.timestamp.microsSinceUnixEpoch += 50_000n;
  stepConstructionTraversals(f.ctx, new Map());
  expect(f.active()).toMatchObject({
    phase: "blocked",
    interruption: "geometry-changed",
    revision: blocked.revision + 1n,
  });
  expect(update).toHaveBeenCalledTimes(1);
  expect(clock).toHaveBeenCalledTimes(1);
  for (let i = 0; i < 100; i++) {
    f.ctx.timestamp.microsSinceUnixEpoch += 50_000n;
    stepConstructionTraversals(f.ctx, new Map());
  }
  expect(update).toHaveBeenCalledTimes(1);
  expect(clock).toHaveBeenCalledTimes(1);
  const stoppedDistance = JSON.parse(f.active().stateJson).distanceM;
  const linkSpeed = JSON.parse(
    f.db().constructionTraversalLink.id.find(before.linkId).installationJson,
  ).policy.metresPerSecond;
  f.ctx.timestamp.microsSinceUnixEpoch += 86_400_000_000n;
  f.tick();
  expect(f.active().phase).toBe("returning");
  expect(
    stoppedDistance - JSON.parse(f.active().stateJson).distanceM,
  ).toBeCloseTo(linkSpeed * 0.05, 12);
  expect(update).toHaveBeenCalledTimes(2);
  expect(clock).toHaveBeenCalledTimes(2);
  const resumed = { ...f.active() };
  expect(stepConstructionTraversals(f.ctx, registry)).toBe(false);
  expect(f.active()).toEqual(resumed);
});

test("unchanged physical obstruction keeps reservation without writes and removal resumes return", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.actor("actor-b", "instance-a", owner, "lower", 0, 0);
  f.begin();
  f.tick(45);
  const before = f.active(),
    blocker = f.db().character.id.find("actor-b");
  f.db().character.id.update({
    ...blocker,
    localX: before.acceptedX,
    localY: before.acceptedY,
  });
  f.tick();
  expect(f.active().phase).toBe("blocked");
  const stopped = { ...f.active() };
  const writes = vi.spyOn(f.db().constructionTraversal.characterId, "update");
  const clock = vi.spyOn(f.db().constructionTraversalClock.id, "update");
  f.tick(100);
  expect(f.active()).toEqual(stopped);
  expect(writes).not.toHaveBeenCalled();
  expect(clock).not.toHaveBeenCalled();
  expect([...f.db().constructionTraversalReservation.iter()]).toHaveLength(1);
  f.db().character.id.update(blocker);
  f.tick();
  expect(f.active().phase).toBe("returning");
  expect(writes).toHaveBeenCalledTimes(1);
  f.tick(60);
  expect(f.active()).toBeUndefined();
  expect([...f.db().constructionTraversalAudit.iter()]).toHaveLength(1);
});

test("one blocked journey stays unchanged while another journey advances the shared sample clock", () => {
  const f = fixture();
  f.install();
  f.actor();
  f.begin();
  f.tick(20);
  f.db().constructionTraversalReservation.linkId.delete(f.active().linkId);
  f.tick();
  const blocked = { ...f.active() };
  f.install("instance-b");
  f.actor("actor-b", "instance-b");
  f.begin("actor-b");
  const before = JSON.parse(f.active("actor-b").stateJson).distanceM;
  const update = vi.spyOn(f.db().constructionTraversal.characterId, "update");
  f.tick(10);
  expect(f.active()).toEqual(blocked);
  expect(JSON.parse(f.active("actor-b").stateJson).distanceM).toBeGreaterThan(
    before,
  );
  expect(
    update.mock.calls.filter(
      ([row]) => (row as { characterId: string }).characterId === "actor-a",
    ),
  ).toHaveLength(0);
  expect(
    update.mock.calls.filter(
      ([row]) => (row as { characterId: string }).characterId === "actor-b",
    ),
  ).toHaveLength(10);
});
