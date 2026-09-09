import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Identity } from "spacetimedb";
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
vi.mock("./auth", () => ({
  requireGame: (ctx: any) => {
    if (!ctx.game) throw Error("Game admission required");
  },
  canReadGame: (ctx: any) => ctx.game,
  canConsume: (ctx: any) => ctx.game,
}));
vi.mock("./input-control", () => ({
  consumeInputControl: (ctx: any) => ctx.control,
}));
vi.mock("./construction-interactions", () => ({
  recoverConstructionSeatsForGrant: vi.fn(),
}));
import { createPublishedNativeExternalAirlockCompiler } from "@sidereal/sim/construction-airlock-plan";
import {
  createNativeAirlockDocument,
  remapNativeAirlockDocument,
  nativeAirlockDocumentIdentities,
} from "@sidereal/sim/construction-airlock-document";
import {
  installNativeAirlock,
  requestNativeAirlockDoor,
  stepNativeAirlocks,
  ownNativeAirlocks,
  scopedAtmosphereTable,
} from "./construction-airlock";
const compile = createPublishedNativeExternalAirlockCompiler(
  readFileSync(
    "assets/art-library/designs/shipyard.structure.external-airlock/revisions/r000/audit-a007.json",
  ),
);
function store(key = "id", indices: Record<string, string> = {}) {
  const rows: any[] = [];
  let writes = 0;
  const same = (a: any, b: any) => String(a) === String(b);
  const t: any = {
    rows,
    iter: () => rows.values(),
    get writes() {
      return writes;
    },
    insert: (r: any) => {
      if (rows.some((x) => same(x[key], r[key]))) throw Error("unique");
      rows.push(r);
      writes++;
      return r;
    },
  };
  t[key] = {
    find: (id: any) => rows.find((r) => same(r[key], id)),
    update: (r: any) => {
      const i = rows.findIndex((x) => same(x[key], r[key]));
      if (i < 0) throw Error("missing");
      rows[i] = r;
      writes++;
    },
    delete: (id: any) => {
      const i = rows.findIndex((r) => same(r[key], id));
      if (i >= 0) rows.splice(i, 1);
      writes++;
    },
  };
  for (const [name, k] of Object.entries(indices))
    t[name] = {
      filter: (v: any) => rows.filter((r) => same(r[k], v)).values(),
      find: (v: any) => rows.find((r) => same(r[k], v)),
    };
  return t;
}
function fixture() {
  const owner = Identity.fromString("a".repeat(64)),
    ctx: any = {
      sender: owner,
      game: true,
      control: true,
      connectionId: { toHexString: () => "connection-a" },
      timestamp: { microsSinceUnixEpoch: 1_000_000n },
      db: {},
    };
  const db = ctx.db;
  db.constructionAirlock = store("id", {
    by_owner: "owner",
    by_active: "active",
  });
  db.constructionInstance = store();
  db.constructionDoor = store("id", { by_instance: "instanceId" });
  db.constructionAtmosphere = store("id", { by_owner: "owner" });
  db.constructionLocation = store("characterId", { by_instance: "instanceId" });
  db.character = store("id", { by_owner: "owner" });
  db.inputControl = store("characterId");
  db.connectionPresence = store("connectionId");
  db.connectionPresence.insert({ connectionId: "connection-a", owner });
  db.authSession = store("connectionId", { by_owner: "owner" });
  db.authSession.insert({
    connectionId: "connection-a",
    owner,
    game: true,
    expiresMicros: 18446744073709551615n,
  });
  db.couchSeat = store("characterId");
  db.constructionTraversal = store("characterId");
  db.constructionStairWalk = store("characterId");
  db.constructionGrant = store("id", { by_principal: "principal" });
  db.constructionReceipt = store("id", { by_principal: "principal" });
  for (const capability of ["draft.read", "instance.spawn"])
    db.constructionGrant.insert({
      id: capability,
      principal: owner,
      workspaceId: "workspace",
      capability,
      expiresMicros: 18446744073709551615n,
      revoked: false,
    });
  const make = () => {
    const base = createNativeAirlockDocument(),
      d = remapNativeAirlockDocument(
        base,
        Object.fromEntries(
          nativeAirlockDocumentIdentities(base).map((id) => [id, randomUUID()]),
        ),
      ),
      id = randomUUID();
    db.constructionInstance.insert({
      id,
      owner,
      workspaceId: "workspace",
      documentJson: JSON.stringify(d),
    });
    const plan = compile(id),
      parts = plan.installation.map((p, i) => ({
        ...p,
        id: d.airlockRoom.parts.find((v) => v.sourcePartIndex === i)!.id,
      }));
    installNativeAirlock(ctx, id, parts, compile);
    return { id, d, parts };
  };
  const a = make(),
    b = make(),
    actor = {
      id: randomUUID(),
      owner,
      connected: true,
      shipId: a.id,
      localX: 1,
      localY: 1,
    };
  db.character.insert(actor);
  db.constructionLocation.insert({
    characterId: actor.id,
    instanceId: a.id,
    deckId: a.d.airlockRoom.deckId,
    visitId: "visit",
  });
  db.inputControl.insert({
    characterId: actor.id,
    connectionId: "connection-a",
    owner,
  });
  const row = () => db.constructionAirlock.id.find(a.id),
    door = (side = "inner") =>
      db.constructionDoor.id.find(
        side === "inner"
          ? a.d.airlockRoom.innerDoorId
          : a.d.airlockRoom.outerDoorId,
      );
  const request = (open: boolean, side = "inner", extra = {}) => {
    const args = {
      openingId: door(side).id,
      expectedVisitId: "visit",
      expectedRevision: door(side).revision,
      open,
      operationId: randomUUID(),
      ...extra,
    };
    requestNativeAirlockDoor(ctx, args, compile);
    return args;
  };
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      ctx.timestamp.microsSinceUnixEpoch += 50_000n;
      stepNativeAirlocks(ctx, compile);
    }
  };
  return { ctx, db, a, b, actor, row, door, request, tick };
}
test("two exact installations retain independent empty atmosphere and all native identities; replay never refills", () => {
  const f = fixture();
  expect(f.db.constructionDoor.rows).toHaveLength(4);
  expect(new Set([...f.a.parts, ...f.b.parts].map((p) => p.id)).size).toBe(140);
  expect(
    f.db.constructionAtmosphere.rows.every(
      (r: any) =>
        r.sourceMoles === 0 &&
        JSON.parse(r.gasJson).every((g: any) => g.moles === 0),
    ),
  ).toBe(true);
  const writes = f.db.constructionAtmosphere.writes;
  installNativeAirlock(f.ctx, f.a.id, f.a.parts, compile);
  expect(f.db.constructionAtmosphere.writes).toBe(writes);
  const bad = structuredClone(f.a.parts);
  bad[0].originM[0] += 0.01;
  expect(() => installNativeAirlock(f.ctx, f.a.id, bad, compile)).toThrow();
});
test("manual service retracts seals before hinge and exposes only keyed own instance state; second door interlocked", () => {
  const f = fixture(),
    other = { ...f.db.constructionAirlock.id.find(f.b.id) };
  f.request(true);
  f.tick(4);
  expect(f.row().innerSealRetraction).toBeGreaterThan(0);
  expect(f.door().fraction).toBe(0);
  f.tick(26);
  expect(f.door().fraction).toBe(1);
  expect(f.row().driverActorId).toBe("");
  expect(f.db.constructionAirlock.id.find(f.b.id)).toEqual(other);
  expect(ownNativeAirlocks(f.ctx)).toHaveLength(1);
  expect(ownNativeAirlocks(f.ctx)[0]).toMatchObject({
    id: f.a.id,
    innerFraction: 1,
    chamberPressurePa: 0,
  });
  expect(Object.keys(ownNativeAirlocks(f.ctx)[0])).not.toContain(
    "installedPartsJson",
  );
  f.db.character.id.update({ ...f.actor, localX: 7 });
  expect(() => f.request(true, "outer")).toThrow("interlock");
});
test.each([
  "disconnect",
  "grant",
  "expiry",
  "lease",
  "input",
  "admission",
  "distance",
] as const)(
  "manual movement holds on %s loss and never automatically resumes",
  (reason) => {
    const f = fixture();
    f.request(true);
    f.tick(10);
    const accepted = f.row().innerFraction;
    expect(accepted).toBeGreaterThan(0);
    if (reason === "disconnect")
      f.db.character.id.update({ ...f.actor, connected: false });
    if (reason === "grant")
      f.db.constructionGrant.id.update({
        ...f.db.constructionGrant.id.find("draft.read"),
        revoked: true,
      });
    if (reason === "expiry")
      f.db.constructionGrant.id.update({
        ...f.db.constructionGrant.id.find("draft.read"),
        expiresMicros: 0n,
      });
    if (reason === "lease")
      f.db.inputControl.characterId.update({
        characterId: f.actor.id,
        connectionId: "other",
      });
    if (reason === "input") f.ctx.control = false;
    if (reason === "admission") f.ctx.game = false;
    if (reason === "distance")
      f.db.character.id.update({ ...f.actor, localX: 0.4, localY: 0.4 });
    // Far corner is still supported but cannot reach the assigned service point.
    if (reason === "distance")
      f.db.character.id.update({ ...f.actor, localX: 7, localY: 1 });
    f.tick();
    expect(f.row().innerFraction).toBe(accepted);
    expect(f.row().driverActorId).toBe("");
    expect(f.door().moving).toBe(false);
    f.db.character.id.update(f.actor);
    f.ctx.game = true;
    f.ctx.control = true;
    f.db.inputControl.characterId.update({
      characterId: f.actor.id,
      connectionId: "connection-a",
    });
    f.db.constructionGrant.id.update({
      ...f.db.constructionGrant.id.find("draft.read"),
      revoked: false,
      expiresMicros: 18446744073709551615n,
    });
    const writes = [
      f.db.constructionAirlock.writes,
      f.db.constructionDoor.writes,
      f.db.constructionAtmosphere.writes,
    ];
    f.tick(20);
    expect(f.row().innerFraction).toBe(accepted);
    expect([
      f.db.constructionAirlock.writes,
      f.db.constructionDoor.writes,
      f.db.constructionAtmosphere.writes,
    ]).toEqual(writes);
    expect(f.db.character.id.find(f.actor.id)).toEqual(f.actor);
  },
);
test("same endpoint and operation replay do not drive mechanisms or rewrite idle gas; stale revision denied", () => {
  const f = fixture(),
    writes = [
      f.db.constructionAirlock.writes,
      f.db.constructionDoor.writes,
      f.db.constructionAtmosphere.writes,
    ];
  const op = f.request(false);
  requestNativeAirlockDoor(f.ctx, op, compile);
  f.tick(20);
  expect([
    f.db.constructionAirlock.writes,
    f.db.constructionDoor.writes,
    f.db.constructionAtmosphere.writes,
  ]).toEqual(writes);
  f.request(true);
  expect(() => f.request(false, "inner", { expectedRevision: 1n })).toThrow();
});
test("native door bypass and changed source reject instead of silently accepting mismatched collision", () => {
  const f = fixture();
  f.request(true);
  f.db.constructionDoor.id.update({ ...f.door(), fraction: 0.5 });
  expect(() => f.tick()).toThrow("bypassed");
  const g = fixture();
  g.request(true);
  const old = g.db.constructionInstance.id.find(g.a.id);
  g.db.constructionInstance.id.update({
    ...old,
    documentJson: old.documentJson + " ",
  });
  expect(() => g.tick()).toThrow("source/document");
});
test("scoped gas adapter cannot step or overwrite another instance; read grant and deck are enforced", () => {
  const f = fixture(),
    table = scopedAtmosphereTable(f.db.constructionAtmosphere, [f.a.id]);
  expect([...table.iter()].map((r) => r.id)).toEqual([f.a.id]);
  expect(table.id.find(f.b.id)).toBeUndefined();
  expect(() =>
    table.id.update(f.db.constructionAtmosphere.id.find(f.b.id)),
  ).toThrow("denied");
  f.db.constructionLocation.characterId.update({
    ...f.db.constructionLocation.characterId.find(f.actor.id),
    deckId: "another",
  });
  expect(ownNativeAirlocks(f.ctx)).toEqual([]);
  f.db.constructionLocation.characterId.update({
    characterId: f.actor.id,
    instanceId: f.a.id,
    deckId: f.a.d.airlockRoom.deckId,
    visitId: "visit",
  });
  f.db.constructionGrant.id.update({
    ...f.db.constructionGrant.id.find("draft.read"),
    revoked: true,
  });
  expect(ownNativeAirlocks(f.ctx)).toEqual([]);
});
test("accounted gas pressure denies unsafe opening without venting/refill or moving a leaf", () => {
  const f = fixture(),
    old = f.db.constructionAtmosphere.id.find(f.a.id),
    gas = JSON.parse(old.gasJson);
  gas[0].moles = 10000;
  // Test-only existing accepted allocation; no transport operation can create gas.
  f.db.constructionAtmosphere.id.update({
    ...old,
    gasJson: JSON.stringify(gas),
    sourceMoles: 10000,
  });
  const before = { ...f.db.constructionAtmosphere.id.find(f.a.id) };
  expect(() => f.request(true)).toThrow("unsafe-pressure");
  expect(f.door().fraction).toBe(0);
  f.tick(20);
  expect(f.db.constructionAtmosphere.id.find(f.a.id)).toEqual(before);
});
test("swept native door obstruction prevents service; blocked manual work expires without snapping shut", () => {
  const f = fixture();
  f.db.character.id.update({ ...f.actor, localX: 2.8 });
  expect(() => f.request(true)).toThrow("obstructed");
  f.db.character.id.update(f.actor);
  f.request(true);
  f.tick(10);
  const accepted = f.row().innerFraction;
  const body = {
    ...f.actor,
    id: randomUUID(),
    owner: Identity.fromString("b".repeat(64)),
    localX: 2.8,
    connected: false,
  };
  f.db.character.insert(body);
  f.db.constructionLocation.insert({
    characterId: body.id,
    instanceId: f.a.id,
    deckId: f.a.d.airlockRoom.deckId,
    visitId: "other",
  });
  f.tick(60);
  expect(f.row().innerFraction).toBe(accepted);
  expect(f.row().driverActorId).toBe("");
  expect(f.door().blocked).toBe(true);
});

function makeDeniedGameFixture() {
  const f = fixture();
  f.db.constructionInstance.id.update({
    ...f.db.constructionInstance.id.find(f.a.id),
    workspaceId: "trusted-starter-templates",
    revision: 1n,
    blueprintSha256: "unqualified-native-airlock",
  });
  for (const g of f.db.constructionGrant.rows)
    g.workspaceId = "trusted-starter-templates";
  f.db.retiredIdentity = store("source");
  f.db.authSession = store("id", { by_owner: "owner" });
  f.db.authSession.insert({
    id: "auth",
    owner: f.ctx.sender,
    game: true,
    expiresMicros: 999999999n,
  });
  f.db.gameShipAccess = store("shipId");
  f.db.ship = store();
  f.db.shipWorldMotion = store("shipId");
  f.db.constructionDeck = store();
  f.db.worldAdmission = store("characterId");
  return f;
}
test("reserved game namespace never falls back to valid review grants without a durable binding", () => {
  const f = makeDeniedGameFixture();
  expect(ownNativeAirlocks(f.ctx)).toEqual([]);
  expect(() => f.request(true)).toThrow();
  expect(f.row().active).toBe(false);
});
test("normal game policy rejects an unregistered airlock template even with matching forged relation rows", () => {
  const f = makeDeniedGameFixture(),
    instance = f.db.constructionInstance.id.find(f.a.id);
  f.db.gameShipAccess.insert({
    shipId: f.a.id,
    instanceId: f.a.id,
    characterId: f.actor.id,
    owner: f.ctx.sender,
    deckId: f.a.d.airlockRoom.deckId,
    lifecycle: "active",
    instanceRevision: 1n,
    templateSha256: instance.blueprintSha256,
  });
  f.db.ship.insert({
    id: f.a.id,
    name: "Unregistered airlock",
    owner: f.ctx.sender,
  });
  f.db.shipWorldMotion.insert({ shipId: f.a.id, systemId: "shared-system" });
  f.db.constructionDeck.insert({
    id: f.a.d.airlockRoom.deckId,
    instanceId: f.a.id,
  });
  f.db.worldAdmission.insert({
    characterId: f.actor.id,
    shipId: f.a.id,
    systemId: "shared-system",
    owner: f.ctx.sender,
  });
  expect(ownNativeAirlocks(f.ctx)).toEqual([]);
  expect(() => f.request(true)).toThrow();
});

test("service projection uses accepted support/approach and active control, without crossing closed doors", () => {
  const f = fixture();
  expect(ownNativeAirlocks(f.ctx)[0]).toMatchObject({
    innerCanService: true,
    outerCanService: false,
  });
  f.db.character.id.update({ ...f.actor, localX: 4, localY: 1 });
  expect(ownNativeAirlocks(f.ctx)[0]).toMatchObject({
    innerCanService: true,
    outerCanService: true,
  });
  f.db.character.id.update({ ...f.actor, localX: 4, localY: 3 });
  expect(ownNativeAirlocks(f.ctx)[0]).toMatchObject({
    innerCanService: false,
    outerCanService: false,
  });
  f.db.character.id.update(f.actor);
  f.db.connectionPresence.connectionId.delete("connection-a");
  expect(ownNativeAirlocks(f.ctx)[0]).toMatchObject({
    innerCanService: false,
    outerCanService: false,
  });
});

test("chamber-side manual service remains reachable throughout native inner closure", () => {
  const f = fixture();
  f.request(true);
  for (let n = 0; n < 35; n++) f.tick();
  f.db.character.id.update({ ...f.actor, localX: 4, localY: 1 });
  f.request(false);
  for (let n = 0; n < 35; n++) f.tick();
  expect(f.row()).toMatchObject({
    innerFraction: 0,
    innerSealRetraction: 0,
    driverActorId: "",
    active: false,
  });
});

test("revoked current access cannot replay an earlier accepted manual-service receipt", () => {
  const f = fixture();
  const args = {
    openingId: f.door().id,
    expectedVisitId: "visit",
    expectedRevision: 1n,
    open: true,
    operationId: "permission-replay",
  };
  requestNativeAirlockDoor(f.ctx, args, compile);
  const grant = f.db.constructionGrant.id.find("draft.read");
  f.db.constructionGrant.id.update({ ...grant, revoked: true });
  expect(() => requestNativeAirlockDoor(f.ctx, args, compile)).toThrow(
    "manual service",
  );
});
