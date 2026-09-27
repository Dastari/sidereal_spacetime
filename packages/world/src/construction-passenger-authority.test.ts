import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({
  Range: class {},
  t: {
    row: () => ({}),
    string: () => ({ primaryKey: () => ({}) }),
    u64: () => ({}),
    f64: () => ({}),
    bool: () => ({}),
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
import { acceptedPassengerAccess } from "./construction-passenger-access";
import {
  ownedGameShipAccess,
  GAME_OWNED_TEMPLATE_NAMESPACE,
} from "./game-ship-access-authority";
import { WAYFARER_REBUILD_SHA256 } from "@sidereal/sim/wayfarer-rebuild-contract";
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
  const db: any = {};
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
      revision: 1n,
      blueprintSha256: WAYFARER_REBUILD_SHA256,
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
      blueprintSha256: WAYFARER_REBUILD_SHA256,
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
      templateSha256: WAYFARER_REBUILD_SHA256,
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
test("two identities explicitly grant and consent; boarding changes only membership/body and dirties both ships", () => {
  const f = fixture();
  expect(
    acceptedPassengerAccess(f.pctx, "passenger", 1_000_000n).readInterior,
  ).toBe(false);
  grantShipPassenger(f.ctx, f.grant);
  grantShipPassenger(f.ctx, f.grant);
  expect(f.db.constructionPassengerGrant.rows.size).toBe(1);
  const motion = JSON.stringify([...f.db.shipWorldMotion.rows.values()]);
  boardShipPassenger(f.pctx, f.board);
  boardShipPassenger(f.pctx, f.board);
  expect(f.db.character.id.find("passenger")).toMatchObject({
    shipId: "captain-ship",
    localX: 0.75,
    localY: 0,
  });
  expect(
    acceptedPassengerAccess(f.pctx, "passenger", 1_000_000n).walkDeck,
  ).toBe(true);
  expect(
    ownedGameShipAccess(f.pctx, "captain-ship", "captain-deck", 1_000_000n)
      .useObjects,
  ).toBe(false);
  expect(f.db.gameShipAccess.shipId.find("captain-ship").characterId).toBe(
    "captain",
  );
  expect(JSON.stringify([...f.db.shipWorldMotion.rows.values()])).toBe(motion);
  expect(f.db.input.characterId.find("passenger")).toMatchObject({
    throttle: 0,
    turn: 0,
    dx: 0,
    dy: 0,
    sprint: false,
  });
  expect([...f.db.constructionFlightDirty.rows.keys()].sort()).toEqual([
    "captain-ship",
    "passenger-ship",
  ]);
});
test("foreign grants, stale revisions, conflicting replay and unconsented boarding are rejected", () => {
  const f = fixture();
  expect(() => grantShipPassenger(f.pctx, f.grant)).toThrow("Owned ship");
  expect(() =>
    grantShipPassenger(f.ctx, { ...f.grant, expectedFlightRevision: 2n }),
  ).toThrow("revision");
  expect(() =>
    grantShipPassenger(f.ctx, { ...f.grant, durationSeconds: 3601 }),
  ).toThrow("duration");
  grantShipPassenger(f.ctx, f.grant);
  expect(() =>
    grantShipPassenger(f.ctx, { ...f.grant, durationSeconds: 30 }),
  ).toThrow("payload conflict");
  expect(() => boardShipPassenger(f.ctx, f.board)).toThrow("admission");
  expect(() =>
    boardShipPassenger(f.pctx, { ...f.board, expectedLocationRevision: 2n }),
  ).toThrow("visit");
  expect(f.db.character.id.find("passenger").shipId).toBe("passenger-ship");
});
test("boarding rejects movement, distance, invalid compilation and changed destinations", () => {
  for (const kind of ["moving", "distant", "invalid", "refit"]) {
    const f = fixture();
    grantShipPassenger(f.ctx, f.grant);
    if (kind === "moving" || kind === "distant")
      f.db.shipWorldMotion.shipId.update({
        ...f.db.shipWorldMotion.shipId.find("captain-ship"),
        [kind === "moving" ? "vx" : "x"]: 100,
      });
    if (kind === "invalid")
      f.db.constructionFlightCompiled.shipId.update({
        shipId: "captain-ship",
        status: "rejected",
      });
    if (kind === "refit")
      f.db.constructionInstance.id.update({
        ...f.db.constructionInstance.id.find("captain-ship"),
        revision: 2n,
      });
    expect(() => boardShipPassenger(f.pctx, f.board), kind).toThrow();
    expect(f.db.constructionPassengerVisit.rows.size).toBe(0);
  }
});
test("return preserves current ship motion and increments location/admission revisions", () => {
  const f = fixture();
  grantShipPassenger(f.ctx, f.grant);
  boardShipPassenger(f.pctx, f.board);
  const motion = f.db.shipWorldMotion.shipId.find("passenger-ship");
  f.db.shipWorldMotion.shipId.update({ ...motion, x: 42 });
  const args = {
    expectedVisitId: "uuid-2",
    expectedRevision: 1n,
    operationId: "return",
  };
  returnShipPassenger(f.pctx, args);
  returnShipPassenger(f.pctx, args);
  expect(f.db.character.id.find("passenger")).toMatchObject({
    shipId: "passenger-ship",
    localX: 0,
    localY: 0,
  });
  expect(f.db.constructionLocation.characterId.find("passenger")).toMatchObject(
    { visitId: "passenger-visit", revision: 3n },
  );
  expect(f.db.worldAdmission.characterId.find("passenger")).toMatchObject({
    shipId: "passenger-ship",
    revision: 3n,
  });
  expect(f.db.shipWorldMotion.shipId.find("passenger-ship").x).toBe(42);
  expect(f.db.constructionPassengerVisit.rows.size).toBe(0);
});
test("revocation immediately removes access even when return is blocked; bounded recovery later restores the retained body", () => {
  const f = fixture();
  grantShipPassenger(f.ctx, f.grant);
  boardShipPassenger(f.pctx, f.board);
  f.db.character.insert({
    id: "blocker",
    shipId: "passenger-ship",
    localX: 0,
    localY: 0,
  });
  f.db.constructionLocation.insert({
    characterId: "blocker",
    instanceId: "passenger-ship",
    deckId: "passenger-deck",
  });
  const revoke = {
    grantId: "uuid-1",
    expectedRevision: 1n,
    operationId: "revoke",
  };
  revokeShipPassenger(f.ctx, revoke);
  revokeShipPassenger(f.ctx, revoke);
  expect(
    acceptedPassengerAccess(f.pctx, "passenger", 1_000_000n).walkDeck,
  ).toBe(false);
  expect(
    f.db.constructionPassengerVisit.characterId.find("passenger")
      .recoveryReason,
  ).toMatch(/obstructed/);
  expect(f.db.character.id.find("passenger").shipId).toBe("captain-ship");
  f.db.character.id.delete("blocker");
  f.db.constructionLocation.characterId.delete("blocker");
  f.sctx.timestamp = { microsSinceUnixEpoch: 1_500_000n };
  expireShipPassengers(f.sctx);
  expect(f.db.character.id.find("passenger").shipId).toBe("passenger-ship");
});
test("expiry is server-only, materializes view revocation, and cannot replay an old grant into existence", () => {
  const f = fixture();
  grantShipPassenger(f.ctx, { ...f.grant, durationSeconds: 1 });
  boardShipPassenger(f.pctx, f.board);
  expect(() => expireShipPassengers(f.pctx)).toThrow("Server");
  f.sctx.timestamp = { microsSinceUnixEpoch: 2_000_000n };
  expireShipPassengers(f.sctx);
  expect(f.db.constructionPassengerGrant.rows.size).toBe(0);
  expect(f.db.character.id.find("passenger").shipId).toBe("passenger-ship");
  grantShipPassenger(f.ctx, { ...f.grant, durationSeconds: 1 });
  expect(f.db.constructionPassengerGrant.rows.size).toBe(0);
});

test("passenger projections reveal current admitted interior and crew without owner identity or ratings", () => {
  const f = fixture();
  expect(currentPassengerInterior(f.pctx)).toEqual([]);
  expect(currentInteriorCrew(f.pctx).map((r) => r.characterId)).toEqual([
    "passenger",
  ]);
  grantShipPassenger(f.ctx, f.grant);
  expect(ownPassengerGrants(f.pctx)[0]).toMatchObject({
    granteeId: "passenger",
    issuedByYou: false,
  });
  expect(ownPassengerGrants(f.ctx)[0].issuedByYou).toBe(true);
  expect(ownPassengerGrants({ ...f.pctx, sender: f.sctx.sender })).toEqual([]);
  boardShipPassenger(f.pctx, f.board);
  expect(ownPassengerVisit(f.pctx)[0].admitted).toBe(true);
  const interior = currentPassengerInterior(f.pctx)[0];
  expect(Object.keys(interior).sort()).toEqual([
    "characterId",
    "deckId",
    "flightReason",
    "flightStatus",
    "instanceId",
    "instanceRevision",
    "name",
    "shipId",
  ]);
  expect(
    currentInteriorCrew(f.pctx)
      .map((r) => r.characterId)
      .sort(),
  ).toEqual(["captain", "passenger"]);
  expect(Object.keys(currentInteriorCrew(f.pctx)[0]).sort()).toEqual([
    "characterId",
    "connected",
    "deckId",
    "localX",
    "localY",
    "name",
    "shipId",
    "sprinting",
    "standingElevationM",
  ]);
  revokeShipPassenger(f.ctx, {
    grantId: "uuid-1",
    expectedRevision: 1n,
    operationId: "revoke",
  });
  expect(currentPassengerInterior(f.pctx)).toEqual([]);
  expect(currentInteriorCrew(f.pctx).map((r) => r.characterId)).toEqual([
    "passenger",
  ]);
});
