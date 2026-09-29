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
// Deck occupancy for respawn placement: every spot is free unless a test blocks it.
const occupancy = vi.hoisted(() => ({
  blocked: (_x: number, _y: number): boolean => false,
}));
vi.mock("./construction-doors", () => ({
  constructionCollision: () => ({ stub: true }),
}));
vi.mock("@sidereal/sim/construction-collision", () => ({
  canOccupyDeck: (_frame: unknown, at: { position: [number, number] }) =>
    !occupancy.blocked(at.position[0], at.position[1]),
}));
import {
  applyShotDamage,
  characterTargets,
  componentDamageView,
  damageComponent,
  isDead,
  requireAlive,
  stepDamage,
  vitalsView,
} from "./combat-damage";
import {
  releaseForDeath,
  respawnCharacter,
  stepRespawns,
} from "./character-death";
import { consumeFlightDamage } from "./construction-flight-availability";
// Frozen Wren r2 document (catalogue @1), so later Wren layout revisions do not move these ids.
import WREN_R2 from "./fixtures/fed-s-wren-r2.prefab.json";
import {
  CHARACTER_MAX_HEALTH,
  RESPAWN_MICROS,
} from "@sidereal/sim/combat-damage";
import { lifecycleEvents, lifecycleTestTables } from "./lifecycle-test-tables";

/** Minimal in-memory table: primary key accessor, optional btree indexes by column. */
function table(
  primary: string,
  indexes: Record<string, string> = {},
  unique: string[] = [],
) {
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
  return t;
}

const owner = Identity.fromString("1".repeat(64));
const crew = Identity.fromString("3".repeat(64));
const server = Identity.fromString("2".repeat(64));

function fixture() {
  const db: any = {
    ...lifecycleTestTables(),
    character: table("id", { by_ship: "shipId", by_owner: "owner" }),
    ship: table("id", { by_owner: "owner" }),
    characterVitals: table("characterId"),
    shipComponentDamage: table("id", { by_ship: "shipId" }),
    constructionInstance: table("id"),
    constructionLocation: table("characterId", { by_instance: "instanceId" }),
    constructionPilotSeat: table("characterId"),
    constructionPassengerVisit: table("characterId"),
    couchSeat: table("characterId"),
    station: table("id", {}, ["shipId"]),
    gameShipAccess: table("shipId"),
    constructionDeck: table("id"),
    worldAdmission: table("characterId"),
    shipWorldMotion: table("shipId"),
    inventoryItem: table("id", { by_character: "characterId" }),
    constructionTraversal: table("characterId"),
    constructionStairWalk: table("characterId"),
    combatAim: table("characterId"),
    input: table("characterId"),
    constructionFlightFitting: table("id", { by_ship: "shipId" }),
    constructionFlightDamageEvent: table("id"),
    constructionFlightReceipt: table("id"),
    constructionFlightBinding: table("shipId"),
    constructionFlightDirty: table("shipId"),
    evaBody: table("characterId"),
    evaAirlockCycle: table("characterId"),
  };
  db.ship.insert({ id: "wren", owner, name: "Wren" });
  db.constructionInstance.insert({
    id: "wren",
    owner,
    revision: 1n,
    blueprintId: "trusted-prefab:fed.s.wren@3",
    blueprintSha256: "wren-sha",
    spawnDeckId: "deck",
    spawnX: 5,
    spawnY: -2,
    documentJson: JSON.stringify({
      prefab: { document: WREN_R2, catalog: "ship-components-v1@1" },
    }),
  });
  db.constructionDeck.insert({ id: "deck", instanceId: "wren", elevation: 0 });
  db.shipWorldMotion.insert({ shipId: "wren", systemId: "sol" });
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
      visitId: "visit-" + id,
      revision: 1n,
    });
    db.worldAdmission.insert({
      characterId: id,
      owner: who,
      shipId: "wren",
      systemId: "sol",
      revision: 1n,
    });
    db.inventoryItem.insert({
      id: "pistol-" + id,
      characterId: id,
      containerId: "hands-" + id,
      revision: 3n,
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
  // The pilot owns Wren: the owned game-ship access relation on its spawn deck.
  db.gameShipAccess.insert({
    shipId: "wren",
    instanceId: "wren",
    owner,
    characterId: "pilot",
    deckId: "deck",
    templateSha256: "wren-sha",
    instanceRevision: 1n,
    lifecycle: "active",
  });
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

test("friendly fire: a crewmate on the same deck takes damage and dies at zero health", () => {
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
  expect(last).toMatchObject({ damage: 10, targetState: "dead" });
  expect(isDead(ctx, "mate")).toBe(true);
  expect(db.characterVitals.characterId.find("mate")).toMatchObject({
    state: "dead",
    health: 0,
    downedUntilMicros: 1_000_000n + RESPAWN_MICROS,
  });
  // Dead: aim cleared, stale input zeroed, not a target any more, no further damage.
  expect(db.combatAim.characterId.find("mate").active).toBe(false);
  expect(db.input.characterId.find("mate")).toMatchObject({
    throttle: 0,
    dx: 0,
    sprint: false,
  });
  expect(db.character.id.find("mate").sprinting).toBe(false);
  expect(characterTargets(ctx, shooter)).toEqual([]);
  expect(
    applyShotDamage(ctx, shooter, { kind: "character", targetId: "mate" }, 15)
      .damage,
  ).toBe(0);
  // The victim sees their own health; the shooter's own row is untouched.
  expect(vitalsView({ db, sender: crew } as any)[0]).toMatchObject({
    characterId: "mate",
    health: 0,
    state: "dead",
    downedUntilMicros: 1_000_000n + RESPAWN_MICROS,
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

test("dead characters are refused every world action and release their seat", async () => {
  const { db, ctx } = fixture();
  const { setAim } = await import("./combat");
  db.station.insert({ id: "legacy-seat", shipId: "wren", occupantId: "mate" });
  const shooter = db.character.id.find("pilot");
  applyShotDamage(ctx, shooter, { kind: "character", targetId: "mate" }, 500);
  // Control released like a disconnect, but the session stays connected (death screen).
  expect(db.station.id.find("legacy-seat").occupantId).toBeUndefined();
  expect(db.character.id.find("mate")).toMatchObject({
    connected: true,
    sprinting: false,
  });
  expect(() => requireAlive({ db, sender: crew } as any)).toThrow(
    "You are dead",
  );
  expect(() =>
    setAim({ ...ctx, sender: crew } as any, { active: true, angle: 0 }),
  ).toThrow("You are dead");
  // The living shooter is unaffected.
  expect(() => requireAlive({ db, sender: owner } as any)).not.toThrow();
  // Idempotent: releasing again changes nothing.
  const before = JSON.stringify([...db.input.iter()], (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  releaseForDeath(ctx, "mate");
  expect(
    JSON.stringify([...db.input.iter()], (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  ).toBe(before);
});

test("the owner respawns aboard their own ship at its spawn point with full health and every item", () => {
  const { db, ctx, at } = fixture();
  const items = structuredClone([...db.inventoryItem.iter()]);
  applyShotDamage(
    ctx,
    db.character.id.find("mate"),
    { kind: "character", targetId: "pilot" },
    500,
  );
  expect(isDead(ctx, "pilot")).toBe(true);
  at(1_000_000n + RESPAWN_MICROS - 1n);
  stepRespawns(ctx);
  stepDamage(ctx);
  expect(db.characterVitals.characterId.find("pilot")).toMatchObject({
    state: "dead",
    health: 0,
  });
  at(1_000_000n + RESPAWN_MICROS);
  stepRespawns(ctx);
  expect(isDead(ctx, "pilot")).toBe(false);
  expect(db.characterVitals.characterId.find("pilot")).toMatchObject({
    state: "active",
    health: CHARACTER_MAX_HEALTH,
    downedUntilMicros: 0n,
  });
  expect(db.character.id.find("pilot")).toMatchObject({
    shipId: "wren",
    localX: 5,
    localY: -2,
    connected: true,
  });
  expect(db.constructionLocation.characterId.find("pilot")).toMatchObject({
    instanceId: "wren",
    deckId: "deck",
    visitId: "visit-pilot",
    revision: 2n,
  });
  // Nothing dropped or rewritten.
  expect([...db.inventoryItem.iter()]).toEqual(items);
  // Idempotent: a second tick or a repeated respawn does nothing.
  const vitals = { ...db.characterVitals.characterId.find("pilot") };
  stepRespawns(ctx);
  expect(respawnCharacter(ctx, "pilot")).toBe(false);
  expect(db.characterVitals.characterId.find("pilot")).toEqual(vitals);
  expect(db.constructionLocation.characterId.find("pilot").revision).toBe(2n);
  expect(() => requireAlive({ db, sender: owner } as any)).not.toThrow();
});

test("respawn searches rings around a blocked or occupied spawn point", () => {
  const { db, ctx, at } = fixture();
  occupancy.blocked = (x, y) => x === 5 && y === -2;
  try {
    applyShotDamage(
      ctx,
      db.character.id.find("mate"),
      { kind: "character", targetId: "pilot" },
      500,
    );
    at(1_000_000n + RESPAWN_MICROS);
    stepRespawns(ctx);
    expect(db.character.id.find("pilot")).toMatchObject({
      localX: 5.75,
      localY: -2,
    });
  } finally {
    occupancy.blocked = () => false;
  }
  // A crewmate standing on the spawn point also moves the respawn along the ring.
  const second = fixture();
  second.db.character.id.update({
    ...second.db.character.id.find("mate"),
    localX: 5,
    localY: -2,
  });
  applyShotDamage(
    second.ctx,
    second.db.character.id.find("mate"),
    { kind: "character", targetId: "pilot" },
    500,
  );
  second.at(1_000_000n + RESPAWN_MICROS);
  stepRespawns(second.ctx);
  expect(second.db.character.id.find("pilot")).toMatchObject({
    localX: 5.75,
    localY: -2,
  });
});

test("without owned access to the ship a character respawns in place, alive and whole", () => {
  const { db, ctx, at } = fixture();
  // The crewmate has no owned game-ship relation to Wren (it is the pilot's ship).
  applyShotDamage(
    ctx,
    db.character.id.find("pilot"),
    { kind: "character", targetId: "mate" },
    500,
  );
  at(1_000_000n + RESPAWN_MICROS);
  stepRespawns(ctx);
  expect(db.character.id.find("mate")).toMatchObject({
    shipId: "wren",
    localX: 0,
    localY: 3,
  });
  expect(db.characterVitals.characterId.find("mate")).toMatchObject({
    state: "active",
    health: CHARACTER_MAX_HEALTH,
  });
  expect(db.constructionLocation.characterId.find("mate").revision).toBe(1n);
  // A passenger visit and a character with no ship also respawn in place.
  const second = fixture();
  second.db.constructionPassengerVisit.insert({ characterId: "pilot" });
  second.db.character.insert({
    id: "shipless",
    owner: Identity.fromString("4".repeat(64)),
    shipId: "",
    localX: 1,
    localY: 1,
    connected: true,
  });
  for (const id of ["pilot", "shipless"])
    second.db.characterVitals.insert({
      characterId: id,
      health: 0,
      maxHealth: 100,
      state: "dead",
      lastDamageMicros: 0n,
      downedUntilMicros: 0n,
      checkpointMicros: 0n,
      hitSequence: 1n,
      lastHitDamage: 100,
    });
  stepRespawns(second.ctx);
  expect(second.db.character.id.find("pilot")).toMatchObject({
    localX: 0,
    localY: 0,
  });
  expect(second.db.character.id.find("shipless")).toMatchObject({
    shipId: "",
    localX: 1,
    localY: 1,
  });
  for (const id of ["pilot", "shipless"])
    expect(isDead(second.ctx, id)).toBe(false);
});

test("a disconnect while dead still respawns the retained body aboard the own ship", () => {
  const { db, ctx, at } = fixture();
  applyShotDamage(
    ctx,
    db.character.id.find("mate"),
    { kind: "character", targetId: "pilot" },
    500,
  );
  // Disconnect: the session ends while the body is dead.
  db.character.id.update({
    ...db.character.id.find("pilot"),
    connected: false,
  });
  at(1_000_000n + RESPAWN_MICROS + 30_000_000n);
  stepRespawns(ctx);
  expect(db.character.id.find("pilot")).toMatchObject({
    connected: false,
    localX: 5,
    localY: -2,
  });
  expect(db.characterVitals.characterId.find("pilot")).toMatchObject({
    state: "active",
    health: CHARACTER_MAX_HEALTH,
  });
  // The own view shows the living character on reconnect.
  expect(vitalsView({ db, sender: owner } as any)[0]).toMatchObject({
    state: "active",
    health: CHARACTER_MAX_HEALTH,
  });
});

test("rows stored by the earlier downed rule are dead and respawn", () => {
  const { db, ctx } = fixture();
  db.characterVitals.insert({
    characterId: "pilot",
    health: 0,
    maxHealth: 100,
    state: "downed",
    lastDamageMicros: 0n,
    downedUntilMicros: 500_000n,
    checkpointMicros: 0n,
    hitSequence: 1n,
    lastHitDamage: 30,
  });
  expect(isDead(ctx, "pilot")).toBe(true);
  expect(vitalsView({ db, sender: owner } as any)[0].state).toBe("dead");
  stepRespawns(ctx);
  expect(db.characterVitals.characterId.find("pilot")).toMatchObject({
    state: "active",
    health: 100,
  });
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

test("lifecycle: one event per applied hit, the killing hit is the death, respawn reactivates", () => {
  const { db, ctx, at } = fixture();
  const shooter = db.character.id.find("pilot");
  const cause = { causationId: "pilot:shot-1", actorId: "pilot" };
  for (let i = 0; i < 7; i++)
    applyShotDamage(
      ctx,
      shooter,
      { kind: "character", targetId: "mate" },
      15,
      cause,
    );
  // A shot at a dead body applies nothing and logs nothing.
  applyShotDamage(ctx, shooter, { kind: "character", targetId: "mate" }, 15);
  applyShotDamage(
    ctx,
    shooter,
    { kind: "object", targetId: "mount:core" },
    15,
    cause,
  );
  // Unknown mounts are not objects with a lifecycle.
  applyShotDamage(ctx, shooter, { kind: "object", targetId: "mount:nope" }, 15);
  at(1_000_000n + RESPAWN_MICROS + 1n);
  stepRespawns(ctx);
  const events = lifecycleEvents(db);
  expect(events.map((e) => [e.objectId, e.kind, e.sequence])).toEqual([
    ...[1n, 2n, 3n, 4n, 5n, 6n].map((s) => ["mate", "combat.after_damage", s]),
    ["mate", "combat.death", 7n],
    ["wren|mount:core", "combat.after_damage", 1n],
    ["mate", "object.activated", 8n],
  ]);
  expect(events[6]).toMatchObject({
    causationId: "pilot:shot-1",
    actorId: "pilot",
    frameId: "wren",
    payload: { damage: 10, health: 0 },
  });
  expect(events[7]).toMatchObject({
    objectKind: "component",
    frameId: "wren",
    payload: { damage: 12, hp: 68, maxHp: 80, state: "pristine" },
  });
  expect(events[8]!.actorId).toBe(""); // the respawn timer is system-origin
  expect(db.objectLifecycle.objectId.find("mate")).toMatchObject({
    state: "active",
    origin: "adopted",
  });
  expect(
    db.objectLifecycle.objectId.find("wren|mount:core").definitionRef,
  ).toBe("ship-components-v1@1/computer-core.sm");
  expect(db.lifecycleOutbox.id.find(0).rejectedEvents).toBe(0n);
});
