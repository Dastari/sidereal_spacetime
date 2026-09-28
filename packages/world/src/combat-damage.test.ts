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
import {
  applyShotDamage,
  characterTargets,
  componentDamageView,
  damageComponent,
  isDowned,
  stepDamage,
  vitalsView,
} from "./combat-damage";
import { consumeFlightDamage } from "./construction-flight-availability";
// Frozen Wren r2 document (catalogue @1), so later Wren layout revisions do not move these ids.
import WREN_R2 from "./fixtures/fed-s-wren-r2.prefab.json";
import { DOWNED_MICROS, RECOVER_HEALTH } from "@sidereal/sim/combat-damage";

/** Minimal in-memory table: primary key accessor, optional btree indexes by column. */
function table(primary: string, indexes: Record<string, string> = {}) {
  const rows = new Map<string, any>();
  const t: any = {
    rows,
    count: () => BigInt(rows.size),
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
    by_created: {
      filter: () =>
        [...rows.values()].sort((a, b) =>
          Number(a.createdMicros - b.createdMicros),
        ),
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

const owner = Identity.fromString("1".repeat(64));
const crew = Identity.fromString("3".repeat(64));
const server = Identity.fromString("2".repeat(64));

function fixture() {
  const db: any = {
    character: table("id", { by_ship: "shipId", by_owner: "owner" }),
    ship: table("id", { by_owner: "owner" }),
    characterVitals: table("characterId"),
    shipComponentDamage: table("id", { by_ship: "shipId" }),
    constructionInstance: table("id"),
    constructionLocation: table("characterId"),
    constructionTraversal: table("characterId"),
    constructionStairWalk: table("characterId"),
    combatAim: table("characterId"),
    input: table("characterId"),
    constructionFlightFitting: table("id", { by_ship: "shipId" }),
    constructionFlightDamageEvent: table("id"),
    constructionFlightReceipt: table("id"),
    constructionFlightBinding: table("shipId"),
    constructionFlightDirty: table("shipId"),
  };
  db.ship.insert({ id: "wren", owner });
  db.constructionInstance.insert({
    id: "wren",
    revision: 1n,
    documentJson: JSON.stringify({
      prefab: { document: WREN_R2, catalog: "ship-components-v1@1" },
    }),
  });
  db.constructionFlightBinding.insert({
    shipId: "wren",
    instanceId: "wren",
    owner,
    stationId: "seat",
    revision: 1n,
  });
  for (const [id, source, kind] of [
    ["core-fit", "mount-core", "computer"],
    ["rcs-fore", "mount-rcs-s#fore", "actuator"],
    ["rcs-aft", "mount-rcs-s#aft", "actuator"],
    ["drive", "mount-main-s", "actuator"],
  ])
    db.constructionFlightFitting.insert({
      id,
      shipId: "wren",
      placedObjectId: "wren:" + source,
      sourceDeviceId: source,
      kind,
      installed: true,
      powered: true,
      availability: 1,
      revision: 1n,
    });
  const person = (id: string, who: Identity, x: number, y: number) => {
    db.character.insert({
      id,
      owner: who,
      shipId: "wren",
      localX: x,
      localY: y,
      connected: true,
      sprinting: true,
    });
    db.constructionLocation.insert({
      characterId: id,
      instanceId: "wren",
      deckId: "deck",
    });
    db.input.insert({
      characterId: id,
      throttle: 1,
      turn: 0,
      dx: 1,
      dy: 0,
      sprint: true,
    });
    db.combatAim.insert({ characterId: id, active: true, angle: 0 });
  };
  person("pilot", owner, 0, 0);
  person("mate", crew, 0, 3);
  const ctx: any = {
    db,
    sender: server,
    databaseIdentity: server,
    timestamp: { microsSinceUnixEpoch: 1_000_000n },
  };
  const at = (micros: bigint) =>
    (ctx.timestamp = { microsSinceUnixEpoch: micros });
  return { db, ctx, at };
}

test("friendly fire: a crewmate on the same deck takes damage and goes down", () => {
  const { db, ctx } = fixture();
  expect(characterTargets(ctx, { id: "pilot", shipId: "wren" })).toEqual([
    { id: "mate", x: 0, y: 3 },
  ]);
  const shooter = db.character.id.find("pilot");
  for (let i = 0; i < 6; i++)
    expect(
      applyShotDamage(ctx, shooter, { kind: "character", targetId: "mate" }, 15)
        .damage,
    ).toBe(15);
  expect(db.characterVitals.characterId.find("mate")).toMatchObject({
    health: 10,
    state: "active",
    hitSequence: 6n,
  });
  const last = applyShotDamage(
    ctx,
    shooter,
    { kind: "character", targetId: "mate" },
    15,
  );
  expect(last).toMatchObject({ damage: 10, targetState: "downed" });
  expect(isDowned(ctx, "mate")).toBe(true);
  // Downed: aim cleared, stale input zeroed, not a target any more.
  expect(db.combatAim.characterId.find("mate").active).toBe(false);
  expect(db.input.characterId.find("mate")).toMatchObject({
    throttle: 0,
    dx: 0,
    sprint: false,
  });
  expect(db.character.id.find("mate").sprinting).toBe(false);
  expect(characterTargets(ctx, shooter)).toEqual([]);
  // The victim sees their own health; the shooter's own row is untouched.
  expect(vitalsView({ db, sender: crew } as any)[0]).toMatchObject({
    characterId: "mate",
    health: 0,
    state: "downed",
  });
  expect(vitalsView({ db, sender: owner } as any)[0]).toMatchObject({
    characterId: "pilot",
    health: 100,
    state: "active",
  });
});

test("only characters on the same ship and deck, standing, connected, are targets", () => {
  const { db, ctx } = fixture();
  const other = (id: string, patch: any = {}, location: any = {}) => {
    db.character.insert({
      id,
      owner: crew,
      shipId: "wren",
      localX: 1,
      localY: 1,
      connected: true,
      ...patch,
    });
    db.constructionLocation.insert({
      characterId: id,
      instanceId: "wren",
      deckId: "deck",
      ...location,
    });
  };
  other("offline", { connected: false });
  other("elsewhere", { shipId: "other" });
  other("upstairs", {}, { deckId: "deck-2" });
  other("stairs");
  db.constructionStairWalk.insert({ characterId: "stairs" });
  expect(
    characterTargets(ctx, { id: "pilot", shipId: "wren" }).map((t) => t.id),
  ).toEqual(["mate"]);
});

test("downed characters stand up on their own and then regenerate", () => {
  const { db, ctx, at } = fixture();
  applyShotDamage(
    ctx,
    db.character.id.find("pilot"),
    { kind: "character", targetId: "mate" },
    500,
  );
  at(1_000_000n + DOWNED_MICROS - 1n);
  stepDamage(ctx);
  expect(isDowned(ctx, "mate")).toBe(true);
  at(1_000_000n + DOWNED_MICROS);
  stepDamage(ctx);
  expect(db.characterVitals.characterId.find("mate")).toMatchObject({
    state: "active",
    health: RECOVER_HEALTH,
  });
  at(1_000_000n + DOWNED_MICROS + 15_000_000n);
  stepDamage(ctx);
  expect(db.characterVitals.characterId.find("mate").health).toBe(
    RECOVER_HEALTH + 20,
  );
});

test("own-ship components take catalogue hp minus armour and report catalogue damage states", () => {
  const { db, ctx } = fixture();
  const shooter = db.character.id.find("pilot");
  // computer-core.sm: 80 hp, armour 3.
  const first = applyShotDamage(
    ctx,
    shooter,
    { kind: "object", targetId: "mount:core" },
    15,
  );
  expect(first).toEqual({
    damage: 12,
    targetState: "pristine",
    targetHp: 68,
    targetMaxHp: 80,
  });
  for (let i = 0; i < 3; i++)
    applyShotDamage(
      ctx,
      shooter,
      { kind: "object", targetId: "mount:core" },
      15,
    );
  expect(db.shipComponentDamage.id.find("wren|mount:core")).toMatchObject({
    hp: 32,
    state: "damaged",
    performance: 0.5,
    componentId: "computer-core.sm",
    revision: 4n,
  });
  // A passenger (not the owner) learns only the damage dealt.
  expect(damageComponent(ctx, "wren", "mount:core", 15, false)).toEqual({
    damage: 12,
    targetState: "",
    targetHp: 0,
    targetMaxHp: 0,
  });
  // Furniture sockets, doors, walls and unknown mounts take no component damage.
  for (const targetId of ["socket:hold:0", "mount:nope", "door:d-hold"])
    expect(
      applyShotDamage(ctx, shooter, { kind: "object", targetId }, 15).damage,
    ).toBe(0);
  expect(
    applyShotDamage(ctx, shooter, { kind: "hull", targetId: "hull-wall-1" }, 15)
      .damage,
  ).toBe(0);
  // The owner's view lists the damaged component; the crewmate's does not.
  expect(componentDamageView({ db, sender: owner } as any)).toHaveLength(1);
  expect(componentDamageView({ db, sender: crew } as any)).toHaveLength(0);
});

test("component damage reaches flight fittings through the server damage producer", () => {
  const { db, ctx } = fixture();
  const shooter = db.character.id.find("pilot");
  // Damaged (performance 0.5): the flight computer keeps half availability.
  for (let i = 0; i < 5; i++)
    applyShotDamage(
      ctx,
      shooter,
      { kind: "object", targetId: "mount:core" },
      15,
    );
  stepDamage(ctx);
  stepDamage(ctx); // idempotent while queued
  expect(db.constructionFlightDamageEvent.count()).toBe(1n);
  consumeFlightDamage(ctx);
  expect(db.constructionFlightFitting.id.find("core-fit")).toMatchObject({
    availability: 0.5,
    revision: 2n,
  });
  expect(db.constructionFlightDirty.shipId.find("wren")).toBeTruthy();
  // Destroyed: availability drops to zero; nothing more is queued afterwards.
  for (let i = 0; i < 3; i++)
    applyShotDamage(
      ctx,
      shooter,
      { kind: "object", targetId: "mount:core" },
      15,
    );
  expect(db.shipComponentDamage.id.find("wren|mount:core")).toMatchObject({
    hp: 0,
    state: "destroyed",
    performance: 0,
  });
  stepDamage(ctx);
  consumeFlightDamage(ctx);
  expect(db.constructionFlightFitting.id.find("core-fit").availability).toBe(0);
  stepDamage(ctx);
  expect(db.constructionFlightDamageEvent.count()).toBe(0n);
  // Every nozzle of a damaged RCS cluster loses availability; other drives are untouched.
  damageComponent(ctx, "wren", "mount:rcs-s", 1000, true);
  stepDamage(ctx);
  consumeFlightDamage(ctx);
  expect(db.constructionFlightFitting.id.find("rcs-fore").availability).toBe(0);
  expect(db.constructionFlightFitting.id.find("rcs-aft").availability).toBe(0);
  expect(db.constructionFlightFitting.id.find("drive").availability).toBe(1);
});

test("a destroyed reactor browns out every flight fitting", () => {
  const { db, ctx } = fixture();
  // reactor.md: 650 hp, armour 8; damaged at under half (performance 0.5).
  damageComponent(ctx, "wren", "mount:reactor", 400, true);
  expect(db.shipComponentDamage.id.find("wren|mount:reactor")).toMatchObject({
    hp: 258,
    state: "damaged",
  });
  for (let i = 0; i < 4; i++) {
    stepDamage(ctx);
    consumeFlightDamage(ctx);
  }
  // Wren r2's half-rated 350 kW still covers its fitted draw (two medium ion drives, 260 kW).
  expect(db.constructionFlightFitting.id.find("drive").availability).toBe(1);
  damageComponent(ctx, "wren", "mount:reactor", 400, true);
  for (let i = 0; i < 4; i++) {
    stepDamage(ctx);
    consumeFlightDamage(ctx);
  }
  for (const id of ["drive", "rcs-fore", "rcs-aft", "core-fit"])
    expect(db.constructionFlightFitting.id.find(id).availability).toBe(0);
});
