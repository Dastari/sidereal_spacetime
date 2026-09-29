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
  evaSuitRefusal,
  exteriorPanelAllowed,
  ownEvaBody,
  resolveEvaShot,
  stepEva,
  toggleMaglock,
  setSuit,
  tryStepOut,
  visibleEvaBodies,
} from "./eva";
import {
  logicDeviceState,
  pressShipButton,
  shipPrefabBinding,
  stepShipLogic,
  visibleShipLogic,
} from "./ship-logic";
import { shipLogicModel } from "@sidereal/sim/ship-logic-model";
import { characterTargets, damageCharacter, isDead } from "./combat-damage";
import { stepRespawns } from "./character-death";
import {
  lifecycleTestTables,
  itemDefinitionTestTables,
} from "./lifecycle-test-tables";
import WREN_R6 from "./fixtures/fed-s-wren-r6.prefab.json";

const catalog = defaultPrefabComponentCatalog();
const wren = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
const model = prefabEvaModel(wren, catalog);
const lock = model.entries[0];
const logic = shipLogicModel(wren, catalog)!;
const panel = (id: string) => logic.panels.find((p) => p.deviceId === id)!;
const innerDoor = logic.doors.find((d) => d.deviceId === "door-inner")!;

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
const third = Identity.fromString("5".repeat(64));

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
    ...lifecycleTestTables(),
    ...itemDefinitionTestTables(),
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
    shipLogicState: table("key", { by_ship: "shipId" }),
    evaSuit: table("characterId"),
    shipLogicTimer: table("key", { by_ship: "shipId" }),
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
  stepShipLogic(ctx);
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
const plusN = (p: readonly number[], n: readonly number[], d: number) =>
  [p[0] + n[0] * d, p[1] + n[1] * d] as [number, number];
function place(id: string, at: readonly [number, number]) {
  const c = ctx.db.character.id.find(id);
  ctx.db.character.id.update({ ...c, localX: at[0], localY: at[1] });
}
function press(deviceId: string, who = owner, shipId = "wren") {
  pressShipButton(
    as(who),
    { shipId, deviceId },
    (actorId, ship) => exteriorPanelAllowed(ctx, actorId, ship),
    (characterId) => evaSuitRefusal(ctx, characterId),
  );
}
const binding = () => shipPrefabBinding(ctx.db, "wren")!;
const device = (deviceId: string) => {
  const s = logicDeviceState(ctx.db, binding(), deviceId);
  return s?.kind === "airlock-controller" ? s.phase : s?.kind;
};
const doorOpen = (deviceId: string) => {
  const s = logicDeviceState(ctx.db, binding(), deviceId);
  return s?.kind === "door" && s.open;
};
/** Equip the EVA suit (pressure suit, helmet, jetpack and mag boots). */
function suitUp(who: string) {
  for (const [slot, part] of [
    ["uniform", "body"],
    ["helmet", "helmet"],
    ["back", "pack"],
    ["boots", "boots"],
  ])
    ctx.db.inventoryItem.insert({
      id: `${who}-suit-${part}`,
      characterId: who,
      definitionId: `wardrobe-suit-${part}`,
      containerId: "",
      equipmentSlot: slot,
      x: 0,
      y: 0,
      rotated: false,
    });
}
/** Press the inside button, wait out the 3 s cycle, walk out through the open hatch. */
function goOutside(who = "cap") {
  if (!ctx.db.inventoryItem.rows.has(`${who}-suit-body`)) suitUp(who);
  place(who, panel("btn-lock-in").front);
  press("btn-lock-in");
  ticks(62);
  expect(doorOpen("door-outer")).toBe(true);
  place(who, plusN(lock.hatch, lock.normal, -0.3));
  const actor = ctx.db.character.id.find(who);
  expect(
    tryStepOut(ctx, actor, { dx: lock.normal[0], dy: lock.normal[1] }),
  ).toBe(true);
  return ctx.db.evaBody.characterId.find(who);
}

beforeEach(() => {
  now = 1_000_000_000n;
  uuid = 0;
  fixture();
});

describe("airlock buttons and ship logic (Wren r6)", () => {
  it("starts pressurised: hold door open, hatch shut, no rows written", () => {
    expect(doorOpen("door-inner")).toBe(true);
    expect(doorOpen("door-outer")).toBe(false);
    expect(ctx.db.shipLogicState.rows.size).toBe(0);
  });

  it("inside button: interlocked 3 s cycle, then the outer door opens", () => {
    suitUp("cap");
    place("cap", panel("btn-lock-in").front);
    press("btn-lock-in");
    expect(doorOpen("door-inner")).toBe(false);
    expect(doorOpen("door-outer")).toBe(false);
    ticks(55);
    expect(doorOpen("door-outer")).toBe(false);
    ticks(7);
    expect(doorOpen("door-outer")).toBe(true);
    expect(doorOpen("door-inner")).toBe(false);
    const rows = visibleShipLogic(ctx);
    expect(rows.find((r) => r.deviceId === "lock")).toMatchObject({
      state: "vacuum",
      light: "red",
    });
    expect(rows.find((r) => r.deviceId === "btn-lock-out")).toMatchObject({
      light: "red",
    });
  });

  it("requires proximity on the button's side, standing, and no dead presser", () => {
    place("cap", [0, 0]);
    expect(() => press("btn-lock-in")).toThrow("closer");
    place("cap", panel("btn-lock-in").front);
    expect(() => press("btn-lock-out")).toThrow("outside of the hull");
    ctx.db.couchSeat.insert({ characterId: "cap" });
    expect(() => press("btn-lock-in")).toThrow("Stand up");
    ctx.db.couchSeat.characterId.delete("cap");
    damageCharacter(ctx, "cap", 500);
    expect(() => press("btn-lock-in")).toThrow("dead");
  });

  it("never closes a door on a body: the cycle waits until the doorway is clear", () => {
    addCharacter("mate", owner, "wren", innerDoor.center);
    suitUp("cap");
    suitUp("mate");
    place("cap", panel("btn-lock-in").front);
    press("btn-lock-in");
    ticks(80);
    expect(doorOpen("door-inner")).toBe(true);
    expect(doorOpen("door-outer")).toBe(false);
    place("mate", plusN(innerDoor.center, innerDoor.normal, 2));
    ticks(6);
    expect(doorOpen("door-inner")).toBe(false);
    ticks(62);
    expect(doorOpen("door-outer")).toBe(true);
  });

  it("shows device states only for the ship the viewer is at", () => {
    expect(visibleShipLogic(ctx).length).toBe(6);
    addShip("kite", other, "mate");
    addCharacter("mate", other, "kite", lock.inside);
    expect(visibleShipLogic(as(other)).every((r) => r.shipId === "kite")).toBe(
      true,
    );
    const row = visibleShipLogic(ctx)[0] as Record<string, unknown>;
    for (const secret of ["owner", "characterId", "stateJson"])
      expect(row[secret]).toBeUndefined();
  });
});

describe("the EVA suit (vacuum needs suit, helmet and jetpack)", () => {
  it("an unsuited walker cannot step out, and cannot cycle the lock toward vacuum", () => {
    place("cap", panel("btn-lock-in").front);
    expect(() => press("btn-lock-in")).toThrow(
      "EVA needs a pressure suit, helmet and EVA jetpack",
    );
    // The hall button only pressurises: fine without a suit.
    addCharacter("mate", third, "wren", panel("btn-hall").front);
    press("btn-hall", third);
    // A suited crewmate opens the lock; the unsuited one still cannot step out.
    suitUp("mate");
    place("mate", panel("btn-lock-in").front);
    place("cap", [0, 0]);
    press("btn-lock-in", third);
    ticks(62);
    expect(doorOpen("door-outer")).toBe(true);
    place("cap", plusN(lock.hatch, lock.normal, -0.3));
    expect(
      tryStepOut(ctx, ctx.db.character.id.find("cap"), { dx: 1, dy: 0 }),
    ).toBe(false);
    suitUp("cap");
    expect(
      tryStepOut(ctx, ctx.db.character.id.find("cap"), { dx: 1, dy: 0 }),
    ).toBe(true);
    expect(ctx.db.evaSuit.characterId.find("cap")).toMatchObject({
      mode: "hold",
      omega: 0,
    });
  });

  it("the lock will not depressurise with an unsuited body in the chamber", () => {
    suitUp("cap");
    place("cap", panel("btn-lock-in").front);
    addCharacter(
      "mate",
      third,
      "wren",
      plusN(panel("btn-lock-in").front, [0, -1], 1),
    );
    expect(() => press("btn-lock-in")).toThrow("no EVA suit");
    place("mate", panel("btn-hall").front);
    press("btn-lock-in");
    expect(device("lock")).toBe("depressurising");
  });
});

describe("rigid body and suit IFCS in the world tick", () => {
  it("a free-mode spin persists across ticks (angular momentum), the stabiliser stops it", () => {
    goOutside();
    ticks(10, () => input("cap", { dx: 1 }));
    ticks(120);
    const suit = ctx.db.evaSuit.characterId.find("cap");
    ctx.db.evaSuit.characterId.update({
      ...suit,
      mode: "free",
      omega: 1.2,
      facingActive: false,
    });
    const h0 = ctx.db.evaBody.characterId.find("cap").localHeading;
    ticks(20);
    expect(ctx.db.evaSuit.characterId.find("cap").omega).toBe(1.2);
    const h1 = ctx.db.evaBody.characterId.find("cap").localHeading;
    const turned = (((h1 - h0) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    expect(turned).toBeCloseTo(1.2, 6);
    setSuit(ctx, { mode: "hold", facing: 0, facingActive: false });
    ticks(60);
    expect(ctx.db.evaSuit.characterId.find("cap").omega).toBe(0);
  });

  it("turns to the commanded facing smoothly through torque", () => {
    goOutside();
    ticks(10, () => input("cap", { dx: 1 }));
    ticks(120);
    setSuit(ctx, { mode: "hold", facing: 2, facingActive: true });
    tick();
    const early = ctx.db.evaBody.characterId.find("cap").localHeading;
    expect(Math.abs(early - 2)).toBeGreaterThan(0.3);
    ticks(60);
    expect(ctx.db.evaBody.characterId.find("cap").localHeading).toBeCloseTo(
      2,
      3,
    );
    expect(() =>
      setSuit(ctx, { mode: "warp", facing: 0, facingActive: false }),
    ).toThrow("mode");
  });
});

describe("same-plane EVA: the doorway hand-off", () => {
  it("walks out through the open hatch at the same ship-local point, with the ship's velocity", () => {
    setShip("wren", {
      x: 100,
      y: -50,
      vx: 20,
      vy: 5,
      heading: 0.6,
      omega: 0.1,
    });
    const exitAt = plusN(lock.hatch, lock.normal, -0.3);
    const body = goOutside();
    expect(body.phase).toBe("local");
    expect(body.anchorShipId).toBe("wren");
    expect(body.localX).toBeCloseTo(exitAt[0], 9);
    expect(body.localY).toBeCloseTo(exitAt[1], 9);
    const w = shipToWorld(ctx.db.shipWorldMotion.shipId.find("wren"), exitAt);
    expect(body.x).toBeCloseTo(w[0], 9);
    expect(ctx.db.constructionLocation.characterId.find("cap")).toBeUndefined();
    expect(ctx.db.constructionFlightDirty.shipId.find("wren")).toBeDefined();
  });

  it("a shut hatch is a wall: no step-out, and pushing does nothing", () => {
    place("cap", plusN(lock.hatch, lock.normal, -0.3));
    const actor = ctx.db.character.id.find("cap");
    expect(tryStepOut(ctx, actor, { dx: 1, dy: 0 })).toBe(false);
    expect(ctx.db.evaBody.characterId.find("cap")).toBeUndefined();
  });

  it("floats back in through the open hatch and stands on the deck at the same point", () => {
    goOutside();
    ticks(20, () => input("cap", { dx: 1 }));
    ticks(30);
    const out = ctx.db.evaBody.characterId.find("cap");
    expect(out.localX).toBeGreaterThan(lock.hatch[0] + 0.5);
    let aboard = false;
    for (let i = 0; i < 80 && !aboard; i++) {
      input("cap", { dx: -1 });
      tick();
      aboard = !ctx.db.evaBody.characterId.find("cap");
    }
    expect(aboard).toBe(true);
    const c = ctx.db.character.id.find("cap");
    expect(ctx.db.constructionLocation.characterId.find("cap")?.visitId).toBe(
      "v-cap",
    );
    expect(lock.hatch[0] - c.localX).toBeGreaterThanOrEqual(
      EVA.entryDepthM - 1e-9,
    );
    expect(lock.hatch[0] - c.localX).toBeLessThan(EVA.entryDepthM + 0.35);
  });

  it("with the hatch shut the hull is solid from outside: the body stops at the hull", () => {
    goOutside();
    ticks(20, () => input("cap", { dx: 1 }));
    // Cycle back: inside button unreachable from outside, so use the outside button path:
    // the outside button only opens; shut the hatch by cycling from the hall.
    place("cap", [0, 0]);
    const body = ctx.db.evaBody.characterId.find("cap");
    // Close the hatch through logic (another crew member presses the hall button).
    addCharacter("mate", third, "wren", panel("btn-hall").front);
    press("btn-hall", third);
    ticks(120);
    expect(doorOpen("door-outer")).toBe(false);
    ticks(60, () => input("cap", { dx: -1 }));
    const after = ctx.db.evaBody.characterId.find("cap");
    expect(after).toBeDefined();
    expect(after.localX).toBeGreaterThan(
      lock.hatch[0] + EVA.bodyRadiusM - 0.05,
    );
    expect(body.phase).toBe("local");
  });
});

describe("outside panel and entry gate", () => {
  it("the outside button calls the hatch open for the owner, never for a stranger", () => {
    goOutside();
    ticks(20, () => input("cap", { dx: 1 }));
    // Cycle the lock back to pressurised from inside via the hall button (crew aboard).
    addCharacter("mate", third, "wren", panel("btn-hall").front);
    press("btn-hall", third);
    ticks(120);
    expect(doorOpen("door-outer")).toBe(false);
    const b = ctx.db.evaBody.characterId.find("cap");
    const front = panel("btn-lock-out").front;
    ctx.db.evaBody.characterId.update({
      ...b,
      localX: front[0],
      localY: front[1],
      vx: b.refVx,
      vy: b.refVy,
    });
    press("btn-lock-out");
    ticks(62);
    expect(doorOpen("door-outer")).toBe(true);
    // A stranger's spacewalker at the same panel: refused.
    addShip("kite", other, "x");
    addCharacter("x", other, "kite", [0, 0]);
    ctx.db.constructionLocation.characterId.delete("x");
    ctx.db.evaBody.insert({
      ...ctx.db.evaBody.characterId.find("cap"),
      characterId: "x",
      owner: other,
    });
    ctx.db.authSession.insert({ connectionId: "c2", owner: other, game: true });
    expect(() => press("btn-lock-out", other)).toThrow("does not respond");
  });

  it("a stranger cannot float in through an open hatch (the lane is hull for them)", () => {
    goOutside();
    addShip("kite", other, "x");
    addCharacter("x", other, "kite", [0, 0]);
    ctx.db.constructionLocation.characterId.delete("x");
    const cap = ctx.db.evaBody.characterId.find("cap");
    ctx.db.evaBody.insert({
      ...cap,
      characterId: "x",
      owner: other,
      localX: lock.hatch[0] + 1,
      localY: lock.hatch[1],
    });
    ticks(60, () => input("x", { dx: -1 }));
    const x = ctx.db.evaBody.characterId.find("x");
    expect(x).toBeDefined();
    expect(x.localX).toBeGreaterThan(lock.hatch[0] + EVA.bodyRadiusM - 0.05);
  });
});

describe("frames: ride along in the bubble, drop off when left behind", () => {
  it("rides with a moving, turning ship without input (same local point)", () => {
    setShip("wren", { x: 0, y: 0, vx: 10, vy: 4, omega: 0.2 });
    const body = goOutside();
    ticks(10, () => input("cap", { dx: 1 }));
    ticks(240);
    const before = ctx.db.evaBody.characterId.find("cap");
    for (let i = 0; i < 40; i++) {
      const m = ctx.db.shipWorldMotion.shipId.find("wren");
      setShip("wren", {
        x: m.x + 0.5,
        y: m.y + 0.2,
        vx: 10,
        vy: 4,
        heading: m.heading + 0.01,
        omega: 0.2,
      });
      tick();
    }
    const after = ctx.db.evaBody.characterId.find("cap");
    expect(after.phase).toBe("local");
    expect(after.localX).toBeCloseTo(before.localX, 6);
    expect(after.localY).toBeCloseTo(before.localY, 6);
    const m = ctx.db.shipWorldMotion.shipId.find("wren");
    const w = shipToWorld(m, [after.localX, after.localY]);
    expect(after.x).toBeCloseTo(w[0], 6);
    expect(body.phase).toBe("local");
  });

  it("keeps station while the ship accelerates within the suit's limit", () => {
    goOutside();
    ticks(10, () => input("cap", { dx: 1 }));
    ticks(240);
    const before = ctx.db.evaBody.characterId.find("cap");
    for (let i = 1; i <= 40; i++) {
      const m = ctx.db.shipWorldMotion.shipId.find("wren");
      // 3 m/s² along the bow, integrated by the test like the ship step would.
      setShip("wren", { x: m.x, y: m.y + m.vy * 0.05, vx: 0, vy: 0.15 * i });
      tick();
    }
    const after = ctx.db.evaBody.characterId.find("cap");
    expect(after.phase).toBe("local");
    expect(
      Math.hypot(after.localX - before.localX, after.localY - before.localY),
    ).toBeLessThan(0.02);
  });

  it("drops into world space when the ship out-accelerates the suit, keeping its velocity", () => {
    goOutside();
    ticks(10, () => input("cap", { dx: 1 }));
    ticks(40);
    const before = ctx.db.evaBody.characterId.find("cap");
    setShip("wren", { x: 0, y: 0, vx: 0, vy: 1.0 }); // +20 m/s² this tick
    tick();
    const after = ctx.db.evaBody.characterId.find("cap");
    expect(after.phase).toBe("free");
    expect(after.anchorShipId).toBe("");
    expect(after.vy).toBeCloseTo(before.vy, 6);
  });

  it("drops out beyond the release radius and is captured again when slow inside the bubble", () => {
    goOutside();
    const b = ctx.db.evaBody.characterId.find("cap");
    ctx.db.evaBody.characterId.update({
      ...b,
      localX: model.radiusM + EVA.releaseM + 2,
      localY: 0,
    });
    tick();
    const free = ctx.db.evaBody.characterId.find("cap");
    expect(free.phase).toBe("free");
    ctx.db.evaBody.characterId.update({
      ...free,
      x: model.radiusM + 10,
      y: 0,
      vx: 0,
      vy: 0,
      ...cell(model.radiusM + 10, 0),
    });
    tick();
    const again = ctx.db.evaBody.characterId.find("cap");
    expect(again.phase).toBe("local");
    expect(again.anchorShipId).toBe("wren");
  });
});

describe("ship impacts with leeway", () => {
  function freeBodyBeside(vx: number) {
    goOutside();
    const b = ctx.db.evaBody.characterId.find("cap");
    // A free body 0.4 m off the starboard hull away from the hatch, at rest in the world.
    const wall = [lock.hatch[0] + EVA.bodyRadiusM + 0.1, lock.hatch[1] - 3];
    ctx.db.evaBody.characterId.update({
      ...b,
      phase: "free",
      anchorShipId: "",
      x: wall[0],
      y: wall[1],
      vx: 0,
      vy: 0,
      refVx: 0,
      refVy: 0,
      refShipId: "",
      ...cell(wall[0], wall[1]),
    });
    // The ship lurches starboard into the body at `vx`.
    setShip("wren", { x: 0.3, y: 0, vx });
    tick();
  }
  it("a slow ship pushes the body out without damage", () => {
    freeBodyBeside(2);
    expect(ctx.db.characterVitals.characterId.find("cap")?.health ?? 100).toBe(
      100,
    );
    const b = ctx.db.evaBody.characterId.find("cap");
    expect(b.x).toBeGreaterThan(lock.hatch[0] + 0.3 + EVA.bodyRadiusM - 0.01);
  });
  it("a fast ship hurts, and a very fast one kills through the normal death path", () => {
    freeBodyBeside(9);
    const hp = ctx.db.characterVitals.characterId.find("cap")?.health;
    expect(hp).toBeLessThan(100);
    expect(hp).toBeGreaterThan(0);
    fixture();
    freeBodyBeside(20);
    expect(isDead(ctx, "cap")).toBe(true);
  });
});

describe("ships without ship logic never strand anyone (live report 2026-09-29)", () => {
  /** The ship becomes a logic-less Wren (r6 document; r2-r5 behave the same). */
  function logicLess() {
    const instance = ctx.db.constructionInstance.id.find("wren");
    ctx.db.constructionInstance.id.update({
      ...instance,
      revision: instance.revision + 1n,
      documentJson: JSON.stringify({
        prefab: { document: WREN_R6, catalog: catalog.revision },
      }),
    });
    const access = ctx.db.gameShipAccess.shipId.find("wren");
    ctx.db.gameShipAccess.shipId.update({
      ...access,
      instanceRevision: instance.revision + 1n,
    });
  }
  /** A milestone-1 spacewalker carried over the publish: outside, unsuited, near the hatch. */
  function carriedOver(at: readonly [number, number]) {
    ctx.db.constructionLocation.characterId.delete("cap");
    ctx.db.evaBody.insert({
      characterId: "cap",
      owner,
      systemId: "sol",
      ...cell(at[0], at[1]),
      phase: "free",
      x: at[0],
      y: at[1],
      vx: 0,
      vy: 0,
      heading: 0,
      anchorShipId: "",
      localX: 0,
      localY: 0,
      localHeading: 0,
      refShipId: "",
      refVx: 0,
      refVy: 0,
      forward: 0,
      strafe: 0,
      turn: 0,
      walking: false,
      exitShipId: "wren",
      visitId: "v-cap",
      deckId: "wren-deck",
      returnEndsMicros: 0n,
      serverTick: 0n,
      revision: 1n,
    });
  }

  it("an unsuited walker cannot leave a ship without logic (the hatch never opens)", () => {
    logicLess();
    place("cap", plusN(lock.hatch, lock.normal, -0.3));
    ticks(20, () => input("cap", { dx: lock.normal[0], dy: lock.normal[1] }));
    expect(ctx.db.evaBody.characterId.find("cap")).toBeUndefined();
    suitUp("cap");
    expect(
      tryStepOut(ctx, ctx.db.character.id.find("cap"), { dx: 1, dy: 0 }),
    ).toBe(false);
  });

  it("a carried-over spacewalker gets back in with E at the hatch, unsuited", () => {
    logicLess();
    carriedOver(plusN(lock.hatch, lock.normal, 1.5));
    ticks(5);
    expect(ctx.db.evaBody.characterId.find("cap")).toBeDefined();
    cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id });
    expect(ctx.db.evaBody.characterId.find("cap")).toBeUndefined();
    expect(ctx.db.evaSuit.characterId.find("cap")).toBeUndefined();
    expect(
      ctx.db.constructionLocation.characterId.find("cap")?.instanceId,
    ).toBe("wren");
    const c = ctx.db.character.id.find("cap");
    expect(
      Math.hypot(c.localX - lock.inside[0], c.localY - lock.inside[1]),
    ).toBeLessThan(2.3);
  });

  it("the legacy way in keeps the entry gate: reach and owned access", () => {
    logicLess();
    carriedOver([40, 40]);
    expect(() =>
      cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id }),
    ).toThrow("closer");
    addShip("kite", other, "x");
    addCharacter("x", other, "kite", [0, 0]);
    ctx.db.authSession.insert({ connectionId: "c2", owner: other, game: true });
    ctx.db.constructionLocation.characterId.delete("x");
    const cap = ctx.db.evaBody.characterId.find("cap");
    const near = plusN(lock.hatch, lock.normal, 1.5);
    ctx.db.evaBody.insert({
      ...cap,
      characterId: "x",
      owner: other,
      x: near[0],
      y: near[1],
      ...cell(near[0], near[1]),
    });
    expect(() =>
      cycleAirlock(as(other), { shipId: "wren", airlockId: lock.id }),
    ).toThrow("does not open for you");
  });
});

describe("legacy rows and removed milestone-1 actions", () => {
  it("a milestone-1 maglocked body on the roof is pushed off the hull without damage", () => {
    const body = goOutside();
    ctx.db.evaBody.characterId.update({
      ...body,
      phase: "maglocked",
      localX: 0,
      localY: 0,
    });
    tick();
    const after = ctx.db.evaBody.characterId.find("cap");
    expect(after.phase).toBe("local");
    expect(Math.hypot(after.localX, after.localY)).toBeGreaterThan(1);
    expect(ctx.db.characterVitals.characterId.find("cap")?.health ?? 100).toBe(
      100,
    );
  });
  it("the teleport cycle and the hull maglock are gone; stale cycle rows are cleared", () => {
    expect(() =>
      cycleAirlock(ctx, { shipId: "wren", airlockId: lock.id }),
    ).toThrow("wall buttons");
    goOutside();
    expect(() => toggleMaglock(ctx)).toThrow("inside a ship");
    ctx.db.evaAirlockCycle.insert({
      characterId: "cap",
      lockKey: "wren/airlock",
      shipId: "wren",
    });
    tick();
    expect(ctx.db.evaAirlockCycle.rows.size).toBe(0);
  });
});

describe("death, respawn and stranding in EVA", () => {
  it("respawns a character killed in EVA aboard the own ship", () => {
    goOutside();
    damageCharacter(ctx, "cap", 500);
    expect(isDead(ctx, "cap")).toBe(true);
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
      phase: "free",
      anchorShipId: "",
      x: 5000,
      ...cell(5000, body.y),
    });
    expect(ownEvaBody(ctx)[0].stranded).toBe(true);
    emergencyReturn(ctx);
    now += EVA.emergencyReturnMicros;
    tick();
    expect(ctx.db.evaBody.characterId.find("cap")).toBeUndefined();
    expect(ctx.db.constructionLocation.characterId.find("cap")).toBeDefined();
  });

  it("a home ship without an EVA door counts as stranded", () => {
    goOutside();
    const instance = ctx.db.constructionInstance.id.find("wren");
    const { logic: _logic, ...legacy } = wren;
    ctx.db.constructionInstance.id.update({
      ...instance,
      revision: 2n,
      documentJson: JSON.stringify({
        prefab: {
          document: { ...legacy, revision: 5 },
          catalog: catalog.revision,
        },
      }),
    });
    expect(ownEvaBody(ctx)[0].stranded).toBe(true);
  });
});

describe("combat and visibility in EVA", () => {
  it("EVA beams hit other EVA bodies, never crew aboard", () => {
    goOutside();
    const a = ctx.db.evaBody.characterId.find("cap");
    addShip("kite", other, "mate");
    addCharacter("mate", other, "kite", [0, 0]);
    ctx.db.constructionLocation.characterId.delete("mate");
    ctx.db.evaBody.insert({
      ...a,
      characterId: "mate",
      owner: other,
      x: a.x + 5,
      ...cell(a.x + 5, a.y),
    });
    const hit = resolveEvaShot(ctx, a, Math.PI / 2, 60);
    expect(hit).toMatchObject({ kind: "character", targetId: "mate" });
    expect(resolveEvaShot(ctx, a, -Math.PI / 2, 60).kind).toBe("none");
    expect(characterTargets(ctx, { id: "cap", shipId: "wren" })).toEqual([]);
  });

  it("shows EVA bodies within discovery, with cosmetic columns only", () => {
    goOutside();
    const rows = visibleEvaBodies(ctx);
    expect(rows.map((r) => r.characterId)).toEqual(["cap"]);
    const row = rows[0] as Record<string, unknown>;
    expect(row.phase).toBe("local");
    for (const secret of [
      "health",
      "refVx",
      "returnEndsMicros",
      "owner",
      "endsMicros",
    ])
      expect(row[secret]).toBeUndefined();
  });

  it("derives the entries from the live instance document", () => {
    expect(evaModelFor(ctx.db, "wren")?.entries.map((a) => a.id)).toEqual([
      "airlock",
    ]);
  });
});
