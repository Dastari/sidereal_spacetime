import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({
  Range: class {},
  t: {
    row: () => ({}),
    string: () => ({ primaryKey: () => ({}) }),
    u64: () => ({}),
    f64: () => ({}),
    bool: () => ({}),
    option: () => ({}),
  },
}));
vi.mock("./auth", () => ({
  requireGame: (ctx: { live: boolean }) => {
    if (!ctx.live) throw Error("Live game required");
  },
}));
vi.mock("./combat", () => ({ clearAim: () => {} }));
vi.mock("./construction-doors", () => ({ constructionCollision: () => ({}) }));
vi.mock("../../sim/src/construction-collision", () => ({
  canOccupyDeck: () => true,
}));
vi.mock("./construction-standing-support", () => ({
  createConstructionStandingSupport: () => () => 0,
}));
vi.mock("./construction-flight-input", () => ({
  readConstructionFlightInput: () => ({}),
}));
vi.mock("./construction-flight-compilation", () => ({
  compileShipFlight: () => {},
  markFlightDirty: (db: any, shipId: string) => {
    if (!db.constructionFlightDirty.shipId.find(shipId))
      db.constructionFlightDirty.insert({ shipId });
  },
}));
import { itemDefinitionTestTables } from "./lifecycle-test-tables";
import { Identity } from "spacetimedb";
import {
  grantShipPassenger,
  boardShipPassenger,
  revokeShipPassenger,
  returnShipPassenger,
  expireShipPassengers,
} from "./construction-passenger-authority";
import {
  ownPassengerGrants,
  ownPassengerVisit,
  currentPassengerInterior,
  currentInteriorCrew,
} from "./construction-passenger-views";
import { visibleCrewPresentation } from "./crew-presentation";
import * as operatorPresentation from "./navigation-operator-presentation";
import { acceptedPassengerAccess } from "./construction-passenger-access";
import {
  ownedGameShipAccess,
  GAME_OWNED_TEMPLATE_NAMESPACE,
} from "./game-ship-access-authority";
import { TRUSTED_PREFAB_BLUEPRINT_PREFIX } from "@sidereal/sim/game-ship-access";
/** Both characters own an active trusted prefab ship (passengers are not qualified for it). */
const PREFAB_SHA = "b".repeat(64);
function table(key = "id") {
  const rows = new Map<any, any>();
  const equal = (a: any, b: any) => (a?.isEqual ? a.isEqual(b) : a === b);
  const t: any = {
    rows,
    iter: () => rows.values(),
    count: () => BigInt(rows.size),
    insert: (r: any) => {
      if (rows.has(r[key])) throw Error("duplicate");
      rows.set(r[key], r);
    },
    [key]: {
      find: (id: any) => rows.get(id),
      update: (r: any) => {
        if (!rows.has(r[key])) throw Error("missing");
        rows.set(r[key], r);
      },
      delete: (id: any) => rows.delete(id),
    },
  };
  for (const [index, field] of Object.entries({
    by_owner: "owner",
    by_grantee: "granteeOwner",
    by_ship: "shipId",
    by_instance: "instanceId",
    by_character: "characterId",
  }))
    t[index] = {
      filter: (v: any) => [...rows.values()].filter((r) => equal(r[field], v)),
    };
  return t;
}
function fixture() {
  const captain = Identity.fromString("1".repeat(64)),
    passenger = Identity.fromString("2".repeat(64)),
    server = Identity.fromString("3".repeat(64));
  const db: any = { ...itemDefinitionTestTables() };
  for (const [name, key] of Object.entries({
    character: "id",
    ship: "id",
    constructionInstance: "id",
    constructionDeck: "id",
    constructionFlightBinding: "shipId",
    constructionFlightCompiled: "shipId",
    constructionFlightDirty: "shipId",
    gameShipAccess: "shipId",
    constructionLocation: "characterId",
    worldAdmission: "characterId",
    shipWorldMotion: "shipId",
    constructionPassengerGrant: "id",
    constructionPassengerVisit: "characterId",
    constructionPassengerReceipt: "id",
    retiredIdentity: "source",
    authSession: "id",
    couchSeat: "characterId",
    constructionPilotSeat: "characterId",
    constructionStairWalk: "characterId",
    constructionTraversal: "characterId",
    constructionFlightReview: "characterId",
    constructionReviewOrigin: "characterId",
    station: "shipId",
    input: "characterId",
    inventoryItem: "id",
    characterAppearance: "characterId",
    characterVitals: "characterId",
    combatAim: "characterId",
    combatImpact: "characterId",
  }))
    db[name] = table(key);
  for (const [id, owner, x] of [
    ["captain", captain, 0],
    ["passenger", passenger, 30],
  ] as const) {
    const shipId = id + "-ship",
      deckId = id + "-deck";
    db.character.insert({
      id,
      owner,
      shipId,
      name: id,
      connected: true,
      sprinting: false,
      localX: 0,
      localY: 0,
    });
    db.ship.insert({ id: shipId, owner, name: shipId });
    db.constructionInstance.insert({
      id: shipId,
      owner,
      workspaceId: GAME_OWNED_TEMPLATE_NAMESPACE,
      blueprintId: TRUSTED_PREFAB_BLUEPRINT_PREFIX + "fed.s.wren:r5",
      revision: 1n,
      blueprintSha256: PREFAB_SHA,
      spawnDeckId: deckId,
      spawnX: 0,
      spawnY: 0,
      documentJson: "{}",
      idMapJson: "{}",
    });
    db.constructionDeck.insert({
      id: deckId,
      instanceId: shipId,
      elevation: 0,
    });
    db.constructionFlightBinding.insert({
      shipId,
      instanceId: shipId,
      owner,
      deckId,
      instanceRevision: 1n,
      blueprintSha256: PREFAB_SHA,
      revision: 1n,
      lifecycle: "active",
    });
    db.constructionFlightCompiled.insert({ shipId, status: "ready" });
    db.gameShipAccess.insert({
      shipId,
      instanceId: shipId,
      owner,
      characterId: id,
      deckId,
      instanceRevision: 1n,
      templateSha256: PREFAB_SHA,
      lifecycle: "active",
    });
    db.constructionLocation.insert({
      characterId: id,
      instanceId: shipId,
      deckId,
      visitId: id + "-visit",
      revision: 1n,
      returnShipId: "",
      returnX: 0,
      returnY: 0,
    });
    db.worldAdmission.insert({
      characterId: id,
      owner,
      shipId,
      systemId: "system",
      revision: 1n,
    });
    db.shipWorldMotion.insert({
      shipId,
      systemId: "system",
      x,
      y: 0,
      vx: 0,
      vy: 0,
      omega: 0,
    });
    db.authSession.insert({
      id,
      owner,
      game: true,
      expiresMicros: 10_000_000_000n,
    });
    db.input.insert({
      characterId: id,
      throttle: 1,
      turn: 1,
      dx: 1,
      dy: 1,
      sprint: true,
    });
  }
  let uuid = 0;
  const ctx: any = {
    db,
    sender: captain,
    databaseIdentity: server,
    live: true,
    timestamp: { microsSinceUnixEpoch: 1_000_000n },
    newUuidV4: () => ({ toString: () => `uuid-${++uuid}` }),
  };
  const pctx = { ...ctx, sender: passenger },
    sctx = { ...ctx, sender: server };
  const grant = {
    shipId: "captain-ship",
    granteeId: "passenger",
    expectedInstanceRevision: 1n,
    expectedFlightRevision: 1n,
    durationSeconds: 60,
    operationId: "grant",
  };
  const board = {
    grantId: "uuid-1",
    expectedGrantRevision: 1n,
    expectedVisitId: "passenger-visit",
    expectedLocationRevision: 1n,
    expectedAdmissionRevision: 1n,
    operationId: "board",
  };
  return { ctx, pctx, sctx, db, grant, board, passenger, captain };
}
test("passenger admission fails closed for unqualified prefab ships; nothing is granted or moved", () => {
  const f = fixture(),
    before = JSON.stringify([...f.db.character.rows.values()], (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  expect(() => grantShipPassenger(f.pctx, f.grant)).toThrow("Owned ship");
  expect(() => grantShipPassenger(f.ctx, f.grant)).toThrow(
    "Current active qualified flight revision required",
  );
  expect(f.db.constructionPassengerGrant.rows.size).toBe(0);
  expect(f.db.constructionPassengerReceipt.rows.size).toBe(0);
  expect(() => boardShipPassenger(f.pctx, f.board)).toThrow("admission");
  expect(f.db.constructionPassengerVisit.rows.size).toBe(0);
  expect(
    JSON.stringify([...f.db.character.rows.values()], (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  ).toBe(before);
  expect(
    acceptedPassengerAccess(f.pctx, "passenger", 1_000_000n).readInterior,
  ).toBe(false);
});

test("passenger projections stay empty without admission; owners still see their own interior crew", () => {
  const f = fixture();
  expect(currentPassengerInterior(f.pctx)).toEqual([]);
  expect(ownPassengerGrants(f.pctx)).toEqual([]);
  expect(ownPassengerVisit(f.pctx)).toEqual([]);
  expect(currentInteriorCrew(f.pctx).map((r) => r.characterId)).toEqual([
    "passenger",
  ]);
  expect(Object.keys(currentInteriorCrew(f.ctx)[0]).sort()).toEqual([
    "characterId",
    "connected",
    "dead",
    "deckId",
    "localX",
    "localY",
    "locationRevision",
    "name",
    "operatorPoseState",
    "operatorSnapshot",
    "shipId",
    "sprinting",
    "standingElevationM",
    "visitId",
  ]);
  expect(
    ownedGameShipAccess(f.ctx, "captain-ship", "captain-deck", 1_000_000n)
      .walkDeck,
  ).toBe(true);
});

test("NULL operator rows still carry only the body's same filtered accepted visit and exact integer revision", () => {
  const f = fixture();
  const location = f.db.constructionLocation.characterId.find("captain");
  f.db.constructionLocation.characterId.update({
    ...location,
    visitId: "new-current-visit",
    revision: 9007199254740993n,
  });
  const row = currentInteriorCrew(f.ctx)[0];
  expect(row).toMatchObject({
    characterId: "captain",
    visitId: "new-current-visit",
    locationRevision: "9007199254740993",
    operatorSnapshot: undefined,
  });
  expect(JSON.stringify(row)).not.toContain("grantId");
  expect(
    currentInteriorCrew(f.pctx).some((body) => body.characterId === "captain"),
  ).toBe(false);
});

test("coherent outer life/pose keeps a retained body and accepted recovery XY with NULL snapshot", () => {
  const f = fixture();
  f.db.constructionPilotSeat.insert({
    characterId: "captain",
    recoveryRequested: false,
  });
  expect(currentInteriorCrew(f.ctx)[0]).toMatchObject({
    characterId: "captain",
    dead: false,
    operatorPoseState: "occupied",
    operatorSnapshot: undefined,
    localX: 0,
    localY: 0,
  });
  f.db.characterVitals.insert({ characterId: "captain", state: "dead" });
  expect(currentInteriorCrew(f.ctx)[0]).toMatchObject({
    dead: true,
    operatorPoseState: "recovering",
    localX: 0,
    localY: 0,
  });
  f.db.constructionPilotSeat.characterId.delete("captain");
  f.db.character.id.update({
    ...f.db.character.id.find("captain"),
    localX: 0.75,
    localY: 1.25,
  });
  expect(currentInteriorCrew(f.ctx)[0]).toMatchObject({
    dead: true,
    operatorPoseState: "none",
    operatorSnapshot: undefined,
    localX: 0.75,
    localY: 1.25,
  });
});

test.each(["factory", "body"])(
  "operator helper %s failure preserves the existing filtered body relation",
  (where) => {
    const f = fixture();
    const spy = vi
      .spyOn(operatorPresentation, "currentNavigationOperatorSnapshots")
      .mockImplementation(() => {
        if (where === "factory")
          throw Error("unavailable registration adapter");
        return () => {
          throw Error("bad body visual snapshot");
        };
      });
    try {
      expect(currentInteriorCrew(f.ctx)).toHaveLength(1);
      expect(currentInteriorCrew(f.ctx)[0]).toMatchObject({
        characterId: "captain",
        operatorSnapshot: undefined,
        localX: 0,
        localY: 0,
      });
    } finally {
      spy.mockRestore();
    }
  },
);

// ------------------------------------------------------------ crew presentation (remote crew)
/** Another character's retained body on the captain's deck (the placement boarding used to
 * produce). Passenger admission is not qualified for prefab ships, so the rows are written. */
function placeOnCaptainDeck(f: ReturnType<typeof fixture>) {
  f.db.character.id.update({
    ...f.db.character.id.find("passenger"),
    shipId: "captain-ship",
    localX: 0.75,
    localY: 0,
  });
  f.db.constructionLocation.characterId.update({
    ...f.db.constructionLocation.characterId.find("passenger"),
    instanceId: "captain-ship",
    deckId: "captain-deck",
  });
}
function crewOnOneDeck() {
  const f = fixture();
  placeOnCaptainDeck(f);
  f.db.characterAppearance.insert({
    characterId: "passenger",
    revision: 3n,
    appearanceJson: '{"bodyType":"female","hairStyle":"swept"}',
  });
  for (const [id, definitionId, equipmentSlot, containerId] of [
    ["item-uuid-carbine", "carbine", "hand", ""],
    ["item-uuid-helmet", "crew-medic-helmet", "helmet", ""],
    // Worn in the wrong slot: not a visual.
    ["item-uuid-misfit", "carbine", "back", ""],
    // Carried, not worn: never projected.
    ["item-uuid-cargo", "compact-pistol", "", "pockets"],
  ] as const)
    f.db.inventoryItem.insert({
      id,
      characterId: "passenger",
      definitionId,
      equipmentSlot,
      containerId,
      x: 0,
      y: 0,
      rotated: false,
    });
  return f;
}
test("crew presentation shows only other bodies on the viewer's own admitted deck", () => {
  const f = fixture();
  // Separate ships: neither sees the other, and a viewer never receives its own row.
  expect(visibleCrewPresentation(f.ctx)).toEqual([]);
  expect(visibleCrewPresentation(f.pctx)).toEqual([]);
  // A connection without a character sees nothing.
  expect(visibleCrewPresentation(f.sctx)).toEqual([]);
  const home = {
    character: f.db.character.id.find("passenger"),
    location: f.db.constructionLocation.characterId.find("passenger"),
  };
  placeOnCaptainDeck(f);
  expect(visibleCrewPresentation(f.ctx).map((r) => r.characterId)).toEqual([
    "passenger",
  ]);
  // A body aboard a foreign ship without passenger admission sees nothing.
  expect(visibleCrewPresentation(f.pctx)).toEqual([]);
  // Exactly the bodies current_interior_crew shows, minus the viewer.
  expect(visibleCrewPresentation(f.ctx).map((r) => r.characterId)).toEqual(
    currentInteriorCrew(f.ctx)
      .map((r) => r.characterId)
      .filter((id) => id !== "captain"),
  );
  // Another deck of the same ship hides the body.
  f.db.constructionDeck.insert({
    id: "captain-deck-2",
    instanceId: "captain-ship",
    elevation: 3,
  });
  const location = f.db.constructionLocation.characterId.find("passenger");
  f.db.constructionLocation.characterId.update({
    ...location,
    deckId: "captain-deck-2",
  });
  expect(visibleCrewPresentation(f.ctx)).toEqual([]);
  f.db.constructionLocation.characterId.update(location);
  // A body on a stair or ladder is owned by those projections, not this one.
  f.db.constructionStairWalk.insert({ characterId: "passenger" });
  expect(visibleCrewPresentation(f.ctx)).toEqual([]);
  f.db.constructionStairWalk.characterId.delete("passenger");
  expect(visibleCrewPresentation(f.ctx)).toHaveLength(1);
  // Back home: visibility ends for both.
  f.db.character.id.update(home.character);
  f.db.constructionLocation.characterId.update(home.location);
  expect(visibleCrewPresentation(f.ctx)).toEqual([]);
  expect(visibleCrewPresentation(f.pctx)).toEqual([]);
});
test("crew presentation columns carry looks and pose only: no identity, item UUIDs, inventory or health", () => {
  const f = crewOnOneDeck();
  f.db.characterVitals.insert({
    characterId: "passenger",
    health: 42,
    maxHealth: 100,
    state: "active",
    hitSequence: 7n,
  });
  const [row] = visibleCrewPresentation(f.ctx);
  expect(Object.keys(row).sort()).toEqual([
    "aimActive",
    "aimAngle",
    "appearanceJson",
    "characterId",
    "dead",
    "deckId",
    "equipmentJson",
    "seated",
    "shipId",
    "shotSequence",
    "shotStruck",
    "shotX",
    "shotY",
  ]);
  expect(row).toMatchObject({
    shipId: "captain-ship",
    deckId: "captain-deck",
    appearanceJson: '{"bodyType":"female","hairStyle":"swept"}',
    dead: false,
    seated: false,
    aimActive: false,
    shotSequence: 0n,
  });
  expect(JSON.parse(row.equipmentJson)).toEqual({
    hand: "carbine",
    helmet: "crew-medic-helmet",
  });
  const text = JSON.stringify(row, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  for (const secret of ["item-uuid", "pockets", "compact-pistol", "42", "1111"])
    expect(text).not.toContain(secret);
  // A character with no appearance row projects an empty look.
  f.db.characterAppearance.characterId.delete("passenger");
  expect(visibleCrewPresentation(f.ctx)[0].appearanceJson).toBe("{}");
});
test("crew presentation pose: aim, seat, death and the latest shot on this ship", () => {
  const f = crewOnOneDeck();
  f.db.combatAim.insert({
    characterId: "passenger",
    active: true,
    angle: 1.25,
    updatedMicros: 1n,
  });
  f.db.combatImpact.insert({
    characterId: "passenger",
    itemId: "item-uuid-carbine",
    shotSequence: 4n,
    shipId: "captain-ship",
    x: 2.5,
    y: -1,
    distanceM: 3,
    kind: "character",
    targetId: "",
    damage: 7,
    targetState: "dead",
    targetHp: 0,
    targetMaxHp: 0,
    createdMicros: 1n,
  });
  let [row] = visibleCrewPresentation(f.ctx);
  expect(row).toMatchObject({
    aimActive: true,
    aimAngle: 1.25,
    shotSequence: 4n,
    shotX: 2.5,
    shotY: -1,
    shotStruck: true,
  });
  // Damage, target and the shooter's item never leave the private impact row.
  expect(JSON.stringify(Object.keys(row))).not.toMatch(/damage|target|item/i);
  // A miss (range ran out) is still a shot, but nothing was struck.
  f.db.combatImpact.characterId.update({
    ...f.db.combatImpact.characterId.find("passenger"),
    kind: "none",
  });
  expect(visibleCrewPresentation(f.ctx)[0].shotStruck).toBe(false);
  // An impact recorded aboard another ship is not in this deck's frame.
  f.db.combatImpact.characterId.update({
    ...f.db.combatImpact.characterId.find("passenger"),
    shipId: "passenger-ship",
  });
  [row] = visibleCrewPresentation(f.ctx);
  expect(row).toMatchObject({ shotSequence: 0n, shotX: 0, shotY: 0 });
  // Seated bodies do not aim.
  f.db.couchSeat.insert({ characterId: "passenger", objectId: "couch" });
  [row] = visibleCrewPresentation(f.ctx);
  expect(row).toMatchObject({ seated: true, aimActive: false, aimAngle: 0 });
  f.db.couchSeat.characterId.delete("passenger");
  f.db.constructionPilotSeat.insert({ characterId: "passenger" });
  expect(visibleCrewPresentation(f.ctx)[0].seated).toBe(true);
  f.db.constructionPilotSeat.characterId.delete("passenger");
  // Dead (and legacy "downed") bodies stay visible, marked dead, and never aim.
  for (const state of ["dead", "downed"]) {
    f.db.characterVitals.characterId.delete("passenger");
    f.db.characterVitals.insert({ characterId: "passenger", state });
    [row] = visibleCrewPresentation(f.ctx);
    expect(row).toMatchObject({ dead: true, aimActive: false, aimAngle: 0 });
  }
  // Disconnected bodies remain physically present, like current_interior_crew.
  f.db.character.id.update({
    ...f.db.character.id.find("passenger"),
    connected: false,
  });
  expect(visibleCrewPresentation(f.ctx).map((r) => r.characterId)).toEqual([
    "passenger",
  ]);
});
