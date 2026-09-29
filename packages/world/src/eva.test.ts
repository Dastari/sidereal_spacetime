import { beforeEach, describe, expect, it, vi } from "vitest";
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
  requireGame: () => {},
  canConsume: (ctx: any, owner: Identity) =>
    !ctx.expired?.has(owner.toHexString()),
}));
vi.mock("./input-control", () => ({
  consumeInputControl: (ctx: any, id: string) =>
    !!ctx.db.character.id.find(id)?.connected,
}));
vi.mock("./interactions", () => ({ leaveCouch: () => {} }));
vi.mock("./construction-pilot-authority", () => ({
  recoverConstructionPilotAuthority: () => {},
}));
vi.mock("./construction-doors", () => ({
  constructionCollision: () => ({ stub: true }),
}));
vi.mock("./construction-standing-support", () => ({
  createConstructionStandingSupport: () => () => 0.1875,
}));
vi.mock("@sidereal/sim/construction-collision", () => ({
  canOccupyDeck: () => true,
}));
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  EVA,
  prefabEvaModel,
  shipToWorld,
  worldToShip,
  pointVelocity,
} from "@sidereal/sim/eva";
import { RESPAWN_MICROS } from "@sidereal/sim/combat-damage";
import { spatialCell } from "@sidereal/sim/spatial-cells";
import {
  cycleAirlock,
  emergencyReturn,
  evaModelFor,
  ownEvaBody,
  resolveEvaShot,
  stepEva,
  toggleMaglock,
  visibleEvaBodies,
} from "./eva";
import { characterTargets, damageCharacter, isDead } from "./combat-damage";
import { stepRespawns } from "./character-death";

const catalog = defaultPrefabComponentCatalog();
const wren = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
const model = prefabEvaModel(wren, catalog);
const lock = model.airlocks[0];

function table(
  primary: string,
  indexes: Record<string, string> = {},
  unique: string[] = [],
) {
  const rows = new Map<string, any>();
  const t: any = {
    rows,
    iter: () => [...rows.values()],
    insert: (r: any) => {
      if (rows.has(r[primary])) throw Error("duplicate " + r[primary]);
      for (const column of unique)
        if ([...rows.values()].some((o) => o[column] === r[column]))
          throw Error("unique " + column);
      rows.set(r[primary], r);
      return r;
    },
    [primary]: {
      find: (id: string) => rows.get(id),
      update: (r: any) => {
        if (!rows.has(r[primary])) throw Error("missing " + r[primary]);
        rows.set(r[primary], r);
      },
      delete: (id: string) => rows.delete(id),
    },
  };
  for (const column of unique)
    t[column] = {
      find: (v: any) => [...rows.values()].find((r) => r[column] === v),
    };
  for (const [name, column] of Object.entries(indexes))
    t[name] = {
      filter: (v: any) =>
        [...rows.values()].filter((r) =>
          typeof v === "object" && v?.isEqual
            ? v.isEqual(r[column])
            : r[column] === v,
        ),
    };
  t.by_cell = {
    filter: ([s, cx, cy]: [string, bigint, bigint]) =>
      [...rows.values()].filter(
        (r) => r.systemId === s && r.cellX === cx && r.cellY === cy,
      ),
  };
  return t;
}

const owner = Identity.fromString("1".repeat(64));
const other = Identity.fromString("3".repeat(64));

let now = 1_000_000_000n;
let ctx: any;
let uuid = 0;

function cell(x: number, y: number) {
  const c = spatialCell({ x, y });
  return { cellX: BigInt(c.cellX), cellY: BigInt(c.cellY) };
}

function setShip(
  id: string,
  pose: {
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    heading?: number;
    omega?: number;
  },
) {
  const row = {
    shipId: id,
    systemId: "sol",
    x: pose.x,
    y: pose.y,
    vx: pose.vx ?? 0,
    vy: pose.vy ?? 0,
    heading: pose.heading ?? 0,
    omega: pose.omega ?? 0,
    serverTick: 0n,
    ...cell(pose.x, pose.y),
  };
  if (ctx.db.shipWorldMotion.shipId.find(id))
    ctx.db.shipWorldMotion.shipId.update(row);
  else ctx.db.shipWorldMotion.insert(row);
}

function addShip(id: string, who: Identity, characterId: string) {
  const db = ctx.db;
  db.ship.insert({ id, owner: who, name: id });
  db.constructionInstance.insert({
    id,
    owner: who,
    revision: 1n,
    blueprintId: "trusted-prefab:fed.s.wren@4",
    blueprintSha256: "wren-sha",
    spawnX: 0,
    spawnY: 0,
    documentJson: JSON.stringify({
      prefab: { document: wren, catalog: catalog.revision },
    }),
  });
  db.constructionDeck.insert({ id: id + "-deck", instanceId: id });
  db.gameShipAccess.insert({
    shipId: id,
    instanceId: id,
    deckId: id + "-deck",
    owner: who,
    characterId,
    templateSha256: "wren-sha",
    instanceRevision: 1n,
    lifecycle: "active",
  });
  db.constructionFlightBinding.insert({
    shipId: id,
    instanceId: id,
    owner: who,
  });
  setShip(id, { x: 0, y: 0 });
}

function addCharacter(
  id: string,
  who: Identity,
  shipId: string,
  at: readonly [number, number],
) {
  const db = ctx.db;
  db.character.insert({
    id,
    owner: who,
    name: id,
    shipId,
    localX: at[0],
    localY: at[1],
    connected: true,
    sprinting: false,
  });
  db.constructionLocation.insert({
    characterId: id,
    instanceId: shipId,
    deckId: shipId + "-deck",
    visitId: "v-" + id,
    revision: 1n,
  });
  db.worldAdmission.insert({
    characterId: id,
    owner: who,
    shipId,
    systemId: "sol",
    revision: 1n,
  });
  db.input.insert({
    characterId: id,
    sequence: 1n,
    throttle: 0,
    turn: 0,
    dx: 0,
    dy: 0,
    sprint: false,
    updatedMicros: 0n,
  });
}

function fixture() {
  const db: any = {
    character: table("id", { by_ship: "shipId", by_owner: "owner" }),
    ship: table("id", { by_owner: "owner" }),
    characterVitals: table("characterId"),
    characterAppearance: table("characterId"),
    constructionInstance: table("id"),
    constructionDeck: table("id"),
    constructionLocation: table("characterId", { by_instance: "instanceId" }),
    constructionPilotSeat: table("characterId"),
    constructionPassengerVisit: table("characterId"),
    constructionTraversal: table("characterId"),
    constructionStairWalk: table("characterId"),
    constructionFlightBinding: table("shipId"),
    constructionFlightDirty: table("shipId"),
    couchSeat: table("characterId"),
    station: table("id", {}, ["shipId"]),
    gameShipAccess: table("shipId"),
    worldAdmission: table("characterId", { by_owner: "owner" }),
    worldSystem: table("id"),
    shipWorldMotion: table("shipId"),
    inventoryItem: table("id", { by_character: "characterId" }),
    combatAim: table("characterId"),
    combatImpact: table("characterId"),
    input: table("characterId"),
    evaBody: table("characterId", {
      by_owner: "owner",
      by_anchor: "anchorShipId",
    }),
    evaAirlockCycle: table("characterId", { by_ship: "shipId" }, ["lockKey"]),
    authSession: table("connectionId", { by_owner: "owner" }),
    retiredIdentity: table("id", {}, ["source"]),
  };
  db.worldSystem.insert({ id: "sol" });
  ctx = {
    db,
    sender: owner,
    get timestamp() {
      return { microsSinceUnixEpoch: now };
    },
    newUuidV4: () => ({ toString: () => "uuid-" + ++uuid }),
    expired: new Set<string>(),
  };
  addShip("wren", owner, "cap");
  addCharacter("cap", owner, "wren", lock.inside);
  db.authSession.insert({ connectionId: "c1", owner, game: true });
  db.retiredIdentity.source.find = () => undefined;
}

const as = (who: Identity) => ({
  ...ctx,
  sender: who,
  db: ctx.db,
  timestamp: ctx.timestamp,
});
function tick(ms = 50) {
  now += BigInt(ms) * 1000n;
  stepEva(ctx);
}
function ticks(n: number, before?: () => void) {
  for (let i = 0; i < n; i++) {
    before?.();
    tick();
  }
}
function input(
  id: string,
  v: { throttle?: number; turn?: number; dx?: number; dy?: number },
) {
  const row = ctx.db.input.characterId.find(id);
  ctx.db.input.characterId.update({
    ...row,
    throttle: 0,
    turn: 0,
    dx: 0,
    dy: 0,
    ...v,
    updatedMicros: now,
  });
}
function goOutside() {
  cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id });
  now += lock.cycleMicros;
  tick();
  return ctx.db.evaBody.characterId.find("cap");
}

beforeEach(() => {
  now = 1_000_000_000n;
  uuid = 0;
  fixture();
});

describe("airlock cycle out", () => {
  it("derives the airlock from the live instance document", () => {
    expect(evaModelFor(ctx.db, "wren")?.airlocks.map((a) => a.id)).toEqual([
      "airlock",
    ]);
  });

  it("cycles for half the component cycle, then puts the character in space with the ship's point velocity", () => {
    setShip("wren", {
      x: 100,
      y: 50,
      vx: 10,
      vy: -4,
      heading: 0.3,
      omega: 0.1,
    });
    cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id });
    expect(ctx.db.evaAirlockCycle.characterId.find("cap")).toMatchObject({
      direction: "out",
      lockKey: "wren/airlock",
    });
    // still aboard until the cycle ends; walking input is not consumed by EVA
    tick();
    expect(ctx.db.evaBody.characterId.find("cap")).toBeUndefined();
    expect(ctx.db.constructionLocation.characterId.find("cap")).toBeDefined();
    now += lock.cycleMicros;
    tick();
    const body = ctx.db.evaBody.characterId.find("cap");
    expect(body).toMatchObject({
      phase: "free",
      exitShipId: "wren",
      systemId: "sol",
      anchorShipId: "",
    });
    expect(ctx.db.constructionLocation.characterId.find("cap")).toBeUndefined();
    expect(ctx.db.evaAirlockCycle.characterId.find("cap")).toBeUndefined();
    const pose = { x: 100, y: 50, vx: 10, vy: -4, heading: 0.3, omega: 0.1 };
    const exit = shipToWorld(pose, lock.outside);
    // one tick of integration after the exit
    expect(Math.hypot(body.x - exit[0], body.y - exit[1])).toBeLessThan(1);
    const v = pointVelocity(pose, exit);
    expect(Math.hypot(body.vx - v[0], body.vy - v[1])).toBeLessThan(0.1);
    // the character keeps its home ship and no longer counts as ship mass
    expect(ctx.db.character.id.find("cap").shipId).toBe("wren");
    expect(ctx.db.constructionFlightDirty.shipId.find("wren")).toBeDefined();
  });

  it("requires reach, standing and owned access; one character per airlock", () => {
    ctx.db.character.id.update({
      ...ctx.db.character.id.find("cap"),
      localX: lock.inside[0] - 2,
    });
    expect(() =>
      cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id }),
    ).toThrow("Move closer");
    ctx.db.character.id.update({
      ...ctx.db.character.id.find("cap"),
      localX: lock.inside[0],
    });
    ctx.db.couchSeat.insert({ characterId: "cap" });
    expect(() =>
      cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id }),
    ).toThrow("Stand up");
    ctx.db.couchSeat.characterId.delete("cap");
    expect(() =>
      cycleAirlock(ctx, { shipId: "wren", airlockId: "nope" }),
    ).toThrow("No exterior airlock");
    // a stranger standing at the hatch of someone else's ship has no access
    addCharacter("guest", other, "wren", lock.inside);
    expect(() =>
      cycleAirlock(as(other), { shipId: "wren", airlockId: lock.id }),
    ).toThrow("does not open");
    cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id });
    ctx.db.gameShipAccess.shipId.update({
      ...ctx.db.gameShipAccess.shipId.find("wren"),
      characterId: "guest",
      owner: other,
    });
    expect(() =>
      cycleAirlock(as(other), { shipId: "wren", airlockId: lock.id }),
    ).toThrow();
  });

  it("cancels on a second press, on disconnect and on death", () => {
    cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id });
    cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id });
    expect(ctx.db.evaAirlockCycle.characterId.find("cap")).toBeUndefined();

    cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id });
    ctx.db.character.id.update({
      ...ctx.db.character.id.find("cap"),
      connected: false,
    });
    tick();
    expect(ctx.db.evaAirlockCycle.characterId.find("cap")).toBeUndefined();
    ctx.db.character.id.update({
      ...ctx.db.character.id.find("cap"),
      connected: true,
    });

    cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id });
    damageCharacter(ctx, "cap", 500);
    expect(isDead(ctx, "cap")).toBe(true);
    expect(ctx.db.evaAirlockCycle.characterId.find("cap")).toBeUndefined();
    now += lock.cycleMicros;
    tick();
    expect(ctx.db.evaBody.characterId.find("cap")).toBeUndefined();
  });

  it("cancels when the character walks away from the hatch", () => {
    cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id });
    ctx.db.character.id.update({
      ...ctx.db.character.id.find("cap"),
      localX: lock.inside[0] - 3,
    });
    tick();
    expect(ctx.db.evaAirlockCycle.characterId.find("cap")).toBeUndefined();
  });
});

describe("jetpack flight in the world tick", () => {
  it("thrusts along the heading and stabilises back to rest", () => {
    const start = goOutside();
    // heading faces out of the starboard hatch (+x local, ship heading 0 → world +x)
    input("cap", { throttle: 1 });
    ticks(20, () => input("cap", { throttle: 1 }));
    const moved = ctx.db.evaBody.characterId.find("cap");
    expect(moved.x - start.x).toBeGreaterThan(1.5); // 1 s from rest: 6 (1 - (1 - e^-0.83) / 0.83) m
    expect(moved.forward).toBe(1);
    input("cap", {});
    ticks(200);
    const rest = ctx.db.evaBody.characterId.find("cap");
    expect(Math.hypot(rest.vx, rest.vy)).toBeLessThan(1e-3);
  });

  it("ignores stale, disconnected and dead input", () => {
    goOutside();
    input("cap", { throttle: 1 });
    now += 400_000n; // stale
    tick();
    expect(ctx.db.evaBody.characterId.find("cap").forward).toBe(0);
    input("cap", { throttle: 1 });
    ctx.db.character.id.update({
      ...ctx.db.character.id.find("cap"),
      connected: false,
    });
    tick();
    expect(ctx.db.evaBody.characterId.find("cap").forward).toBe(0);
  });

  it("holds station next to the moving ship without input (relative motion)", () => {
    setShip("wren", { x: 0, y: 0, vx: 25, vy: 5 });
    const start = goOutside();
    const startLocal = worldToShip(
      {
        x: ctx.db.shipWorldMotion.shipId.find("wren").x,
        y: 0,
        vx: 0,
        vy: 0,
        heading: 0,
        omega: 0,
      },
      [start.x, start.y],
    );
    ticks(100, () => {
      const m = ctx.db.shipWorldMotion.shipId.find("wren");
      setShip("wren", { ...m, x: m.x + m.vx * 0.05, y: m.y + m.vy * 0.05 });
    });
    const m = ctx.db.shipWorldMotion.shipId.find("wren");
    const body = ctx.db.evaBody.characterId.find("cap");
    const local = worldToShip({ ...m }, [body.x, body.y]);
    expect(
      Math.hypot(local[0] - startLocal[0], local[1] - (start.y - 0)),
    ).toBeLessThan(0.6);
    expect(body.refShipId).toBe("wren");
    expect(body.vx).toBeCloseTo(25, 3);
  });
});

describe("maglock", () => {
  function hover(local: [number, number]) {
    const body = ctx.db.evaBody.characterId.find("cap");
    const m = ctx.db.shipWorldMotion.shipId.find("wren");
    const [x, y] = shipToWorld(m, local);
    const [vx, vy] = pointVelocity(m, [x, y]);
    ctx.db.evaBody.characterId.update({ ...body, x, y, vx, vy, ...cell(x, y) });
  }

  it("attaches over the hull, walks in the ship frame and follows the ship", () => {
    goOutside();
    hover([0, 0]);
    toggleMaglock(ctx);
    let body = ctx.db.evaBody.characterId.find("cap");
    expect(body).toMatchObject({ phase: "maglocked", anchorShipId: "wren" });
    ticks(20, () => input("cap", { dy: 1 }));
    body = ctx.db.evaBody.characterId.find("cap");
    expect(body.localY).toBeCloseTo(20 * EVA.walkSpeed * 0.05, 6);
    expect(body.walking).toBe(true);
    // the ship moves and turns: the body keeps its local point
    setShip("wren", { x: 40, y: -10, vx: 3, heading: 1.1, omega: 0.2 });
    input("cap", {});
    tick();
    body = ctx.db.evaBody.characterId.find("cap");
    const world = shipToWorld(ctx.db.shipWorldMotion.shipId.find("wren"), [
      body.localX,
      body.localY,
    ]);
    expect(body.x).toBeCloseTo(world[0], 9);
    expect(body.y).toBeCloseTo(world[1], 9);
    expect(body.walking).toBe(false);
    // detach: free with the hull point's velocity
    toggleMaglock(ctx);
    body = ctx.db.evaBody.characterId.find("cap");
    const v = pointVelocity(ctx.db.shipWorldMotion.shipId.find("wren"), [
      body.x,
      body.y,
    ]);
    expect(body.phase).toBe("free");
    expect(body.vx).toBeCloseTo(v[0], 9);
    expect(body.vy).toBeCloseTo(v[1], 9);
  });

  it("stays on the hull when walking at the edge", () => {
    goOutside();
    hover([0, 0]);
    toggleMaglock(ctx);
    ticks(200, () => input("cap", { dx: 1 }));
    const body = ctx.db.evaBody.characterId.find("cap");
    expect(model.hull.some((p) => p)).toBe(true);
    expect(body.phase).toBe("maglocked");
    expect(body.localX).toBeLessThan(model.radiusM);
  });

  it("refuses far from any hull or at high relative speed", () => {
    goOutside();
    hover([20, 0]);
    expect(() => toggleMaglock(ctx)).toThrow("No hull");
    hover([0, 0]);
    const body = ctx.db.evaBody.characterId.find("cap");
    ctx.db.evaBody.characterId.update({ ...body, vx: body.vx + 5 });
    expect(() => toggleMaglock(ctx)).toThrow("No hull");
  });

  it("floats free when the anchor ship disappears", () => {
    goOutside();
    hover([0, 0]);
    toggleMaglock(ctx);
    ctx.db.shipWorldMotion.shipId.delete("wren");
    tick();
    expect(ctx.db.evaBody.characterId.find("cap")).toMatchObject({
      phase: "free",
      anchorShipId: "",
    });
  });
});

describe("re-entry", () => {
  it("cycles in from the hatch and stands the character on the deck", () => {
    goOutside();
    cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id });
    const held = ctx.db.evaBody.characterId.find("cap");
    expect(held).toMatchObject({
      phase: "maglocked",
      anchorShipId: "wren",
      localX: lock.outside[0],
    });
    expect(ctx.db.evaAirlockCycle.characterId.find("cap").direction).toBe("in");
    now += lock.cycleMicros;
    tick();
    expect(ctx.db.evaBody.characterId.find("cap")).toBeUndefined();
    const location = ctx.db.constructionLocation.characterId.find("cap");
    expect(location).toMatchObject({ instanceId: "wren", deckId: "wren-deck" });
    const actor = ctx.db.character.id.find("cap");
    expect([actor.localX, actor.localY]).toEqual(lock.inside);
  });

  it("completes while disconnected (safer aboard)", () => {
    goOutside();
    cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id });
    ctx.db.character.id.update({
      ...ctx.db.character.id.find("cap"),
      connected: false,
    });
    now += lock.cycleMicros;
    tick();
    expect(ctx.db.constructionLocation.characterId.find("cap")).toBeDefined();
  });

  it("is refused out of reach and without entry access", () => {
    goOutside();
    const body = ctx.db.evaBody.characterId.find("cap");
    ctx.db.evaBody.characterId.update({ ...body, x: body.x + 5 });
    expect(() =>
      cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id }),
    ).toThrow("Move closer");
    ctx.db.evaBody.characterId.update(body);
    ctx.db.gameShipAccess.shipId.update({
      ...ctx.db.gameShipAccess.shipId.find("wren"),
      lifecycle: "suspended",
    });
    expect(() =>
      cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id }),
    ).toThrow("does not open");
  });
});

describe("death, respawn and stranding in EVA", () => {
  it("respawns a character killed in EVA aboard the own ship", () => {
    goOutside();
    damageCharacter(ctx, "cap", 500);
    expect(isDead(ctx, "cap")).toBe(true);
    // the body stays in space while dead
    tick();
    expect(ctx.db.evaBody.characterId.find("cap")).toBeDefined();
    now += RESPAWN_MICROS;
    stepRespawns(ctx);
    expect(isDead(ctx, "cap")).toBe(false);
    expect(ctx.db.evaBody.characterId.find("cap")).toBeUndefined();
    expect(
      ctx.db.constructionLocation.characterId.find("cap")?.instanceId,
    ).toBe("wren");
  });

  it("offers an emergency return only when stranded, then returns aboard", () => {
    goOutside();
    expect(() => emergencyReturn(ctx)).toThrow("within reach");
    const body = ctx.db.evaBody.characterId.find("cap");
    ctx.db.evaBody.characterId.update({
      ...body,
      x: 5000,
      ...cell(5000, body.y),
    });
    expect(ownEvaBody(ctx)[0].stranded).toBe(true);
    emergencyReturn(ctx);
    expect(ctx.db.evaBody.characterId.find("cap").returnEndsMicros).toBe(
      now + EVA.emergencyReturnMicros,
    );
    now += EVA.emergencyReturnMicros;
    tick();
    expect(ctx.db.evaBody.characterId.find("cap")).toBeUndefined();
    expect(ctx.db.constructionLocation.characterId.find("cap")).toBeDefined();
  });
});

describe("combat and visibility in EVA", () => {
  function secondSpacewalker() {
    addShip("kite", other, "mate");
    setShip("kite", { x: 30, y: 0 });
    addCharacter("mate", other, "kite", lock.inside);
    ctx.db.authSession.insert({ connectionId: "c2", owner: other, game: true });
    cycleAirlock(as(other), { shipId: "kite", airlockId: lock.id });
  }

  it("EVA beams hit other EVA bodies, never crew aboard; deck beams never hit EVA bodies", () => {
    secondSpacewalker();
    goOutside();
    const a = ctx.db.evaBody.characterId.find("cap");
    const b = ctx.db.evaBody.characterId.find("mate");
    const angle = Math.atan2(b.x - a.x, b.y - a.y);
    const hit = resolveEvaShot(ctx, a, angle, 60);
    expect(hit).toMatchObject({ kind: "character", targetId: "mate" });
    expect(resolveEvaShot(ctx, a, angle + Math.PI, 60).kind).toBe("none");
    expect(characterTargets(ctx, { id: "cap", shipId: "wren" })).toEqual([]);
  });

  it("shows EVA bodies within discovery, with cosmetic columns only", () => {
    secondSpacewalker();
    goOutside();
    const rows = visibleEvaBodies(ctx);
    expect(rows.map((r) => r.characterId)).toEqual(["cap", "mate"]);
    const row = rows[1] as Record<string, unknown>;
    for (const secret of [
      "health",
      "refVx",
      "returnEndsMicros",
      "owner",
      "endsMicros",
    ])
      expect(row[secret]).toBeUndefined();
    expect(row.cycling).toBe(false);
    // far away: not visible to the other spacewalker, still to itself
    const b = ctx.db.evaBody.characterId.find("mate");
    ctx.db.evaBody.characterId.update({ ...b, x: 900, ...cell(900, b.y) });
    expect(visibleEvaBodies(ctx).map((r) => r.characterId)).toEqual(["cap"]);
  });
});
