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
vi.mock("./auth", () => ({ requireGame: () => {} }));
// An open deck: no structure, so only character bodies stop a ray.
vi.mock("./construction-doors", () => ({
  constructionCollision: () => ({ segments: [] }),
}));
import {
  fire,
  reload,
  setAim,
  stepCombat,
  visibleCombatActions,
} from "./combat";
import { LAB_WEAPONS } from "@sidereal/content/weapons";
import { blastDamage } from "@sidereal/sim/combat";
import { lifecycleTestTables } from "./lifecycle-test-tables";

function table(primary: string, indexes: Record<string, string> = {}) {
  const rows = new Map<string, any>();
  const t: any = {
    rows,
    iter: () => [...rows.values()],
    insert: (r: any) => {
      if (rows.has(r[primary])) throw Error("duplicate " + r[primary]);
      rows.set(r[primary], r);
      return r;
    },
    [primary]: {
      find: (id: string) => rows.get(id),
      update: (r: any) => {
        if (!rows.has(r[primary])) throw Error("missing");
        rows.set(r[primary], r);
      },
      delete: (id: string) => rows.delete(id),
    },
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
  return t;
}

const shooterId = Identity.fromString("1".repeat(64));
const mateId = Identity.fromString("3".repeat(64));

function fixture(weapon: string, mateAt: [number, number] = [0, 3]) {
  const db: any = {
    ...lifecycleTestTables(),
    character: table("id", { by_ship: "shipId", by_owner: "owner" }),
    ship: table("id", { by_owner: "owner" }),
    characterVitals: table("characterId"),
    constructionInstance: table("id"),
    constructionLocation: table("characterId"),
    couchSeat: table("characterId"),
    station: table("shipId"),
    inventoryItem: table("id", { by_character: "characterId" }),
    constructionTraversal: table("characterId"),
    constructionStairWalk: table("characterId"),
    combatAim: table("characterId"),
    weaponEnergy: table("itemId"),
    combatImpact: table("characterId"),
    combatReceipt: table("id", { by_character: "characterId" }),
    combatAction: table("characterId"),
    evaBody: table("characterId"),
    evaAirlockCycle: table("characterId"),
  };
  db.ship.insert({ id: "ship", owner: shooterId, x: 0, y: 0, heading: 0 });
  db.constructionInstance.insert({
    id: "ship",
    revision: 1n,
    documentJson: "{}",
  });
  const person = (
    id: string,
    owner: Identity,
    [x, y]: [number, number],
    held: string,
  ) => {
    db.character.insert({
      id,
      owner,
      shipId: "ship",
      localX: x,
      localY: y,
      connected: true,
    });
    db.constructionLocation.insert({
      characterId: id,
      instanceId: "ship",
      deckId: "deck",
    });
    db.inventoryItem.insert({
      id: "item-" + id,
      characterId: id,
      definitionId: held,
      containerId: "",
      equipmentSlot: "hand",
    });
  };
  person("shooter", shooterId, [0, 0], weapon);
  person("mate", mateId, mateAt, "pistol");
  const ctx: any = {
    db,
    sender: shooterId,
    timestamp: { microsSinceUnixEpoch: 10_000_000n },
  };
  const at = (micros: bigint) =>
    (ctx.timestamp = { microsSinceUnixEpoch: micros });
  const as = (sender: Identity) => ({ ...ctx, sender });
  let op = 0;
  const shoot = (who = shooterId, item = "item-shooter", angle = 0) => {
    setAim(as(who), { active: true, angle });
    const revision = db.weaponEnergy.itemId.find(item)?.revision ?? 0n;
    fire(as(who), {
      itemId: item,
      expectedRevision: revision,
      operationId: "op" + ++op,
    });
  };
  const health = (id: string) =>
    db.characterVitals.characterId.find(id)?.health ?? 100;
  return { db, ctx, at, as, shoot, health };
}

test("the shotgun fires eight spread pellets; those that reach a body each deal pellet damage", () => {
  const { db, shoot, health } = fixture("shotgun");
  shoot();
  const action = db.combatAction.characterId.find("shooter");
  expect(action).toMatchObject({
    mode: "pellets",
    definitionId: "shotgun",
    shotSequence: 1n,
  });
  const points = JSON.parse(action.pointsJson) as [number, number, number][];
  expect(points).toHaveLength(8);
  // The body (radius 0.3 m at 3 m) subtends +-0.1 rad: the four middle pellets of the 0.35 rad cone.
  const struck = points.filter((p) => p[2] === 1);
  expect(struck).toHaveLength(4);
  expect(100 - health("mate")).toBe(4 * LAB_WEAPONS.shotgun.damage);
  const impact = db.combatImpact.characterId.find("shooter");
  expect(impact).toMatchObject({ kind: "character", targetId: "", damage: 28 });
  // Misses run out at the shotgun's 18 m range.
  expect(Math.hypot(points[0][0], points[0][1])).toBeCloseTo(18);
});

test("the stun gun stuns the struck character: no aiming or firing until it wears off", () => {
  const { db, at, as, shoot, health } = fixture("stun-gun");
  shoot();
  expect(100 - health("mate")).toBe(LAB_WEAPONS["stun-gun"].damage);
  const until = db.combatAction.characterId.find("mate").stunnedUntilMicros;
  expect(until).toBe(10_000_000n + 2_500_000n);
  expect(() => setAim(as(mateId), { active: true, angle: Math.PI })).toThrow(
    "You are stunned",
  );
  at(12_000_000n);
  expect(() => shoot(mateId, "item-mate", Math.PI)).toThrow("You are stunned");
  at(12_600_000n);
  shoot(mateId, "item-mate", Math.PI);
  // the stunned body's own shot comes back at the shooter
  expect(health("shooter")).toBeLessThan(100);
});

test("the baton only reaches 1.8 m, then hits and briefly stuns", () => {
  const far = fixture("baton");
  far.shoot();
  expect(far.db.combatImpact.characterId.find("shooter")).toMatchObject({
    kind: "none",
    distanceM: 1.8,
  });
  expect(far.health("mate")).toBe(100);
  const near = fixture("baton", [0, 1.2]);
  near.shoot();
  expect(100 - near.health("mate")).toBe(LAB_WEAPONS.baton.damage);
  expect(near.db.combatAction.characterId.find("mate").stunnedUntilMicros).toBe(
    11_000_000n,
  );
  expect(near.db.combatAction.characterId.find("shooter").mode).toBe("melee");
});

test("a grenade lands short of the first body, detonates after its fuse and hurts everyone in range", () => {
  const { db, at, shoot, health } = fixture("grenade");
  shoot();
  const action = db.combatAction.characterId.find("shooter");
  expect(action).toMatchObject({
    mode: "thrown",
    detonated: false,
    blastRadiusM: 3.5,
  });
  expect(action.detonateMicros).toBe(10_000_000n + 1_200_000n);
  // lands 0.3 m before the body's surface (2.7 m): at 2.4 m
  expect(action.landY).toBeCloseTo(2.4, 5);
  expect(db.combatImpact.characterId.find("shooter")).toMatchObject({
    kind: "thrown",
    damage: 0,
  });
  // nothing yet
  at(11_000_000n);
  stepCombat({
    ...(db && { db }),
    timestamp: { microsSinceUnixEpoch: 11_000_000n },
  } as any);
  expect(health("mate")).toBe(100);
  at(11_300_000n);
  stepCombat({ db, timestamp: { microsSinceUnixEpoch: 11_300_000n } } as any);
  expect(db.combatAction.characterId.find("shooter").detonated).toBe(true);
  const mateLoss = blastDamage(70, 0.6, 3.5, 0.35);
  const selfLoss = blastDamage(70, 2.4, 3.5, 0.35);
  expect(100 - health("mate")).toBeCloseTo(mateLoss, 5);
  expect(100 - health("shooter")).toBeCloseTo(selfLoss, 5); // friendly fire includes the thrower
  expect(db.combatImpact.characterId.find("shooter")).toMatchObject({
    kind: "blast",
  });
  expect(db.combatImpact.characterId.find("shooter").damage).toBeCloseTo(
    mateLoss + selfLoss,
    5,
  );
  // resolved once
  stepCombat({ db, timestamp: { microsSinceUnixEpoch: 12_000_000n } } as any);
  expect(100 - health("mate")).toBeCloseTo(mateLoss, 5);
});

test("reload refills after its time, refuses fire meanwhile and is a replay-safe intent", () => {
  const { db, ctx, at, shoot } = fixture("rifle", [5, 0]);
  for (let i = 0; i < 3; i++) {
    at(10_000_000n + BigInt(i) * 300_000n);
    shoot();
  }
  const energy = db.weaponEnergy.itemId.find("item-shooter");
  expect(energy.energy).toBe(120 - 3 * 10);
  const args = {
    itemId: "item-shooter",
    expectedRevision: energy.revision,
    operationId: "reload-1",
  };
  at(11_000_000n);
  reload(ctx, args);
  reload(ctx, args); // replay: no-op
  const row = db.weaponEnergy.itemId.find("item-shooter");
  expect(row).toMatchObject({ energy: 120, checkpointMicros: 13_000_000n });
  expect(row.revision).toBe(energy.revision + 1n);
  expect(db.combatAction.characterId.find("shooter")).toMatchObject({
    reloadSequence: 1n,
    reloadItemId: "item-shooter",
    reloadUntilMicros: 13_000_000n,
  });
  expect(() => shoot()).toThrow("Reloading");
  expect(() =>
    reload(ctx, {
      ...args,
      expectedRevision: row.revision,
      operationId: "reload-2",
    }),
  ).toThrow("Reloading");
  at(13_000_001n);
  shoot();
  expect(db.weaponEnergy.itemId.find("item-shooter").energy).toBe(110);
  // full weapons and weapons without a reload refuse it
  expect(() =>
    reload(ctx, {
      itemId: "item-shooter",
      expectedRevision: db.weaponEnergy.itemId.find("item-shooter").revision,
      operationId: "reload-3",
    }),
  ).not.toThrow();
  const baton = fixture("baton");
  expect(() =>
    reload(baton.ctx, {
      itemId: "item-shooter",
      expectedRevision: 0n,
      operationId: "reload-x",
    }),
  ).toThrow("no reload");
  const full = fixture("pistol");
  expect(() =>
    reload(full.ctx, {
      itemId: "item-shooter",
      expectedRevision: 0n,
      operationId: "reload-y",
    }),
  ).toThrow("full");
});

test("tools and other non-weapons never fire", () => {
  for (const held of ["repair-tool", "medgun", "scanner", "grapple"]) {
    const { shoot } = fixture(held);
    expect(() => shoot(), held).toThrow("Equip a supported weapon");
  }
});

test("visible combat actions carry catalogue ids and rays, never item UUIDs or damage", () => {
  const { db, shoot } = fixture("smg");
  shoot();
  const rows = visibleCombatActions({ db, sender: mateId } as any, {
    actor: { id: "mate" },
    bodies: [
      { body: db.character.id.find("shooter") },
      { body: db.character.id.find("mate") },
    ],
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    characterId: "shooter",
    definitionId: "smg",
    mode: "beam",
  });
  expect(
    JSON.stringify(rows, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
  ).not.toMatch(/item-|damage/);
  // an action recorded aboard another ship is not in this deck's frame
  db.character.id.update({
    ...db.character.id.find("shooter"),
    shipId: "elsewhere",
  });
  const moved = visibleCombatActions({ db } as any, {
    actor: { id: "mate" },
    bodies: [{ body: db.character.id.find("shooter") }],
  });
  expect(moved[0]).toMatchObject({ shotSequence: 0n, pointsJson: "[]" });
});

test("a grenade cannot be thrown in EVA (no deck to land on); nothing is spent", () => {
  const { db, shoot } = fixture("grenade");
  db.evaBody.insert({ characterId: "shooter", systemId: "sol", x: 0, y: 0 });
  expect(() => shoot()).toThrow("Nothing to throw at in EVA");
  expect(db.weaponEnergy.itemId.find("item-shooter")).toBeUndefined();
});
