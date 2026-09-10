import { test, expect, vi } from "vitest";
import { Identity } from "spacetimedb";
vi.mock("spacetimedb/server", () => ({
  table: () => ({}),
  SenderError: class extends Error {},
  Range: class {},
  t: new Proxy(
    {},
    { get: () => () => ({ primaryKey: () => ({}), unique: () => ({}) }) },
  ),
}));
vi.mock("./auth", () => ({
  requireGame: () => ({ kind: "oidc" }),
  canReadGame: () => true,
}));
vi.mock("./combat", () => ({ clearAim: vi.fn() }));
import {
  spawnBlueprint,
  ownInstances,
  ownDecks,
  enterReview,
  leaveReview,
  stepActor,
  ownLocation,
} from "./construction-instances";
import { emptyLayout, stampTile } from "../../content/src/ship-layout";
import { bindConstructionLayout } from "../../sim/src/construction-layout";
import { compileConstruction } from "../../sim/src/construction-transactions";
import { CONSTRUCTION_BOUNDARY_PIN } from "@sidereal/content/construction-boundary";
import {
  requestDoor,
  stepDoors,
  ownDoors,
  constructionCollision,
} from "./construction-doors";
import { canOccupyDeck } from "@sidereal/sim/construction-collision";
function table(indexes: Record<string, string> = {}, primary = "id") {
  const rows: any[] = [];
  const result: any = {
    rows,
    iter: () => rows.values(),
    insert: (r: any) => {
      if (rows.some((x) => x[primary] === r[primary])) throw Error("duplicate");
      rows.push(r);
      return r;
    },
  };
  result[primary] = {
    find: (id: string) => rows.find((r) => r[primary] === id),
    update: (r: any) => {
      const i = rows.findIndex((x) => x[primary] === r[primary]);
      if (i < 0) throw Error("missing");
      rows[i] = r;
    },
    delete: (id: string) => {
      const i = rows.findIndex((r) => r[primary] === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
  for (const [name, key] of Object.entries(indexes))
    result[name] = {
      filter: (v: any) => rows.filter((r) => String(r[key]) === String(v)),
      find: (v: any) => rows.find((r) => String(r[key]) === String(v)),
    };
  return result;
}

function fixture() {
  const owner = Identity.fromString("1".repeat(64)),
    other = Identity.fromString("2".repeat(64));
  const layout = emptyLayout("template", "deck");
  layout.tiles.push(stampTile("f", "deck", "rectangle", [0, 0]));
  const snapshot = compileConstruction(
    JSON.stringify(bindConstructionLayout(layout).document),
  );
  const db: any = {
    constructionCargoAssembly: table(
      { by_instance: "instanceId" },
      "containerId",
    ),
    wayfarerRefitAttachment: table({ by_instance: "instanceId" }),
    constructionPilotSeat: table({}, "characterId"),
    constructionFlightReview: table({}, "characterId"),
    constructionStairLink: table({
      by_instance: "instanceId",
      by_owner: "owner",
    }),
    constructionStairWalk: table(
      { by_owner: "owner", by_instance: "instanceId" },
      "characterId",
    ),
    constructionStairReservation: table(
      { by_instance: "instanceId" },
      "stairId",
    ),
    constructionStairAudit: table({ by_owner: "owner" }),
    constructionBlueprint: table(),
    constructionGrant: table({ by_principal: "principal" }),
    constructionReceipt: table({ by_principal: "principal" }),
    constructionInstance: table({ by_owner: "owner" }),
    constructionDeck: table({ by_instance: "instanceId" }),
    constructionLocation: table({ by_instance: "instanceId" }, "characterId"),
    constructionNativePressure: table({ by_owner: "owner", by_door: "doorId" }),
    constructionAtmosphere: table({ by_owner: "owner" }),
    constructionAtmosphereClock: table(),
    constructionTraversalLink: table({
      by_owner: "owner",
      by_instance: "instanceId",
    }),
    constructionTraversal: table(
      { by_owner: "owner", by_instance: "instanceId" },
      "characterId",
    ),
    constructionTraversalReservation: table(
      { by_instance: "instanceId" },
      "linkId",
    ),
    constructionTraversalClock: table(),
    constructionTraversalAudit: table({ by_owner: "owner" }),
    constructionReviewOrigin: table({}, "characterId"),
    constructionAirlock: table({ by_owner: "owner", by_active: "active" }),
    constructionDoor: table({
      by_instance: "instanceId",
      by_deck: "deckId",
      by_moving: "moving",
    }),
    character: table({ by_owner: "owner" }),
    ship: table(),
    station: table({ shipId: "shipId" }),
    couchSeat: table({ objectId: "objectId" }, "characterId"),
    interactionObject: table({ by_ship: "shipId" }),
    interactionReceipt: table({ by_character: "characterId" }),
    constructionInteractionBinding: table(
      {
        by_instance: "instanceId",
        by_recovery: "recoveryRequested",
        placedObjectId: "placedObjectId",
      },
      "objectId",
    ),
    input: table({}, "characterId"),
    inventoryItem: table({ by_character: "characterId" }),
    inventoryContainer: table({ by_character: "characterId" }),
    inventoryContainerScope: table({}, "containerId"),
    instanceInventoryBinding: table(
      { by_instance: "instanceId" },
      "placedObjectId",
    ),
  };
  db.constructionBlueprint.insert({
    id: "blueprint",
    workspaceId: "w",
    sourceRevision: 1n,
    ...snapshot,
  });
  for (const capability of ["draft.read", "instance.spawn"])
    db.constructionGrant.insert({
      id: capability,
      principal: owner,
      workspaceId: "w",
      capability,
      expiresMicros: 100n,
      revoked: false,
    });
  let n = 0;
  const ctx: any = {
    db,
    sender: owner,
    timestamp: { microsSinceUnixEpoch: 10n },
    newUuidV4: () => ({
      toString: () =>
        `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`,
    }),
  };
  return {
    ctx,
    other,
    args: {
      blueprintId: "blueprint",
      expectedSha256: snapshot.sha256,
      sourceDeckId: "deck",
      operationId: "spawn-1",
    },
  };
}
test("two server spawns are independent, replay-safe and scoped to their owner", () => {
  const { ctx, other, args } = fixture();
  spawnBlueprint(ctx, args);
  spawnBlueprint(ctx, args);
  expect(ownInstances(ctx)).toHaveLength(1);
  spawnBlueprint(ctx, { ...args, operationId: "spawn-2" });
  const rows = ownInstances(ctx);
  expect(rows).toHaveLength(2);
  expect(rows[0].id).not.toBe(rows[1].id);
  const a = JSON.parse(rows[0].documentJson),
    b = JSON.parse(rows[1].documentJson);
  expect(a.floors[0].id).not.toBe(b.floors[0].id);
  expect(a.floors[0].id).toBe(a.layout.tiles[0].id);
  expect(ownDecks(ctx)).toHaveLength(2);
  expect(ownInstances({ ...ctx, sender: other })).toEqual([]);
  expect(ownDecks({ ...ctx, sender: other })).toEqual([]);
  expect(ctx.db.constructionBlueprint.rows[0].canonical).not.toContain(
    rows[0].id,
  );
});
test("wrong revision, missing grant and expired replay cannot create instances", () => {
  const { ctx, other, args } = fixture();
  expect(() =>
    spawnBlueprint(ctx, { ...args, expectedSha256: "0".repeat(64) }),
  ).toThrow("SHA");
  expect(() => spawnBlueprint({ ...ctx, sender: other }, args)).toThrow(
    "grant",
  );
  expect(ctx.db.constructionInstance.rows).toEqual([]);
  spawnBlueprint(ctx, args);
  ctx.timestamp.microsSinceUnixEpoch = 100n;
  expect(() => spawnBlueprint(ctx, args)).toThrow("grant");
  expect(ownInstances(ctx)).toHaveLength(1);
});
test("unknown deck fails before inserting live state", () => {
  const { ctx, args } = fixture();
  expect(() =>
    spawnBlueprint(ctx, { ...args, sourceDeckId: "missing" }),
  ).toThrow("deck");
  expect(ctx.db.constructionInstance.rows).toEqual([]);
  expect(ctx.db.constructionDeck.rows).toEqual([]);
});

test("review walking uses authored perimeter, clears controls and rejects stale return from an earlier visit", () => {
  const { ctx, args } = fixture();
  spawnBlueprint(ctx, args);
  const instance = ownInstances(ctx)[0];
  ctx.db.character.insert({
    id: "actor",
    owner: ctx.sender,
    shipId: "legacy",
    localX: 8,
    localY: 9,
    connected: true,
    sprinting: false,
  });
  ctx.db.ship.insert({ id: "legacy" });
  ctx.db.input.insert({
    characterId: "actor",
    sequence: 9n,
    dx: 1,
    dy: 1,
    throttle: 1,
    turn: 1,
    sprint: true,
  });
  enterReview(ctx, {
    instanceId: instance.id,
    expectedShipId: "legacy",
    operationId: "enter-1",
  });
  const first = ownLocation(ctx)[0];
  expect(ctx.db.input.characterId.find("actor")).toMatchObject({
    sequence: 9n,
    dx: 0,
    dy: 0,
    throttle: 0,
    turn: 0,
  });
  for (let i = 0; i < 80; i++)
    stepActor(
      ctx,
      ctx.db.character.id.find("actor"),
      {
        dx: 1,
        dy: 0,
        sprint: true,
      },
      ordinaryHooks,
    );
  expect(ctx.db.character.id.find("actor").localX).toBeLessThanOrEqual(
    1.7000001,
  );
  expect(ctx.db.character.id.find("actor").localX).toBeGreaterThan(1.69);
  const atWall = ctx.db.character.id.find("actor");
  const updateActor = vi.spyOn(ctx.db.character.id, "update");
  for (let i = 0; i < 20; i++)
    stepActor(
      ctx,
      ctx.db.character.id.find("actor"),
      {
        dx: 1,
        dy: 0,
        sprint: true,
      },
      ordinaryHooks,
    );
  expect(ctx.db.character.id.find("actor")).toEqual(atWall);
  expect(updateActor).not.toHaveBeenCalled();
  updateActor.mockRestore();
  leaveReview(ctx, {
    expectedVisitId: first.visitId,
    expectedRevision: first.revision,
    operationId: "leave-1",
  });
  expect(ctx.db.character.id.find("actor")).toMatchObject({
    shipId: "legacy",
    localX: 8,
    localY: 9,
  });
  enterReview(ctx, {
    instanceId: instance.id,
    expectedShipId: "legacy",
    operationId: "enter-2",
  });
  expect(ownLocation(ctx)[0].visitId).not.toBe(first.visitId);
  expect(() =>
    leaveReview(ctx, {
      expectedVisitId: first.visitId,
      expectedRevision: 1n,
      operationId: "delayed-leave",
    }),
  ).toThrow("return");
  ctx.timestamp.microsSinceUnixEpoch = 100n;
  const current = ownLocation(ctx)[0];
  leaveReview(ctx, {
    expectedVisitId: current.visitId,
    expectedRevision: current.revision,
    operationId: "leave-after-expiry",
  });
  expect(ownLocation(ctx)).toEqual([]);
});
test("review entry denies seating and stale source frame without mutating character", () => {
  const { ctx, args } = fixture();
  spawnBlueprint(ctx, args);
  const instance = ownInstances(ctx)[0];
  ctx.db.character.insert({
    id: "actor",
    owner: ctx.sender,
    shipId: "legacy",
    connected: true,
  });
  ctx.db.ship.insert({ id: "legacy" });
  ctx.db.station.insert({ id: "helm", shipId: "legacy", occupantId: "actor" });
  expect(() =>
    enterReview(ctx, {
      instanceId: instance.id,
      expectedShipId: "legacy",
      operationId: "seat",
    }),
  ).toThrow("Stand up");
  expect(ownLocation(ctx)).toEqual([]);
  ctx.db.station.id.update({ id: "helm", shipId: "legacy" });
  expect(() =>
    enterReview(ctx, {
      instanceId: instance.id,
      expectedShipId: "stale",
      operationId: "frame",
    }),
  ).toThrow("location");
});

function doorFixture() {
  const f = fixture(),
    layout = emptyLayout("door-template", "deck");
  for (let x = 0; x < 2; x++)
    for (let y = 0; y < 2; y++)
      layout.tiles.push(
        stampTile(`f-${x}-${y}`, "deck", "rectangle", [x * 64, y * 64]),
      );
  layout.partitions.push({
    id: "partition",
    deckId: "deck",
    a: [64, 0],
    b: [64, 128],
    seal: "design-sealed",
  });
  layout.openings.push({
    id: "door",
    deckId: "deck",
    partitionId: "partition",
    a: [64, 12],
    b: [64, 52],
    kind: "door",
    clearance: 16,
    sill: 0,
  });
  const document = bindConstructionLayout(layout).document;
  document.boundaryKit = { ...CONSTRUCTION_BOUNDARY_PIN };
  const snapshot = compileConstruction(JSON.stringify(document));
  f.ctx.db.constructionBlueprint.id.update({
    id: "blueprint",
    workspaceId: "w",
    sourceRevision: 1n,
    ...snapshot,
  });
  let n = 1000;
  f.ctx.newUuidV4 = () => ({
    toString: () =>
      `00000000-0000-4000-8000-${(++n).toString().padStart(12, "0")}`,
  });
  f.args.expectedSha256 = snapshot.sha256;
  spawnBlueprint(f.ctx, f.args);
  const instance = ownInstances(f.ctx)[0];
  f.ctx.db.character.insert({
    id: "door-actor",
    owner: f.ctx.sender,
    shipId: "legacy",
    localX: 8,
    localY: 9,
    connected: true,
  });
  f.ctx.db.ship.insert({ id: "legacy" });
  enterReview(f.ctx, {
    instanceId: instance.id,
    expectedShipId: "legacy",
    operationId: "enter-door",
  });
  const actor = f.ctx.db.character.id.find("door-actor");
  f.ctx.db.character.id.update({ ...actor, localX: 1, localY: 1 });
  return {
    ...f,
    instance,
    door: ownDoors(f.ctx)[0],
    visit: ownLocation(f.ctx)[0],
  };
}
test("native door motion, passability and physical open leaf are authoritative and instance scoped", () => {
  const { ctx, other, instance, door, visit, args } = doorFixture();
  const command = {
    openingId: door.id,
    expectedVisitId: visit.visitId,
    expectedRevision: door.revision,
    open: true,
    operationId: "open",
  };
  expect(ownDoors({ ...ctx, sender: other })).toEqual([]);
  expect(() => requestDoor({ ...ctx, sender: other }, command)).toThrow();
  requestDoor(ctx, command);
  requestDoor(ctx, command);
  expect(ownDoors(ctx)[0].revision).toBe(2n);
  for (let i = 0; i < 10; i++) stepDoors(ctx);
  expect(ownDoors(ctx)[0].fraction).toBeCloseTo(0.5);
  const location = {
    shipId: instance.id,
    deckId: visit.deckId,
    position: [2, 1] as [number, number],
  };
  expect(
    canOccupyDeck(
      constructionCollision(
        ctx,
        ctx.db.constructionInstance.id.find(instance.id),
        visit.deckId,
      ),
      location,
      0.3,
    ),
  ).toBe(false);
  for (let i = 0; i < 10; i++) stepDoors(ctx);
  expect(ownDoors(ctx)[0].fraction).toBe(1);
  const frame = constructionCollision(
    ctx,
    ctx.db.constructionInstance.id.find(instance.id),
    visit.deckId,
  );
  expect(canOccupyDeck(frame, location, 0.3)).toBe(true);
  expect(
    canOccupyDeck(frame, { ...location, position: [2.8, 0.35] }, 0.3),
  ).toBe(false);
  spawnBlueprint(ctx, { ...args, operationId: "second-native" });
  const doors = ownDoors(ctx);
  expect(doors).toHaveLength(2);
  expect(doors[1].id).not.toBe(doors[0].id);
  expect(doors[1].fraction).toBe(0);
  expect(() =>
    requestDoor(ctx, {
      ...command,
      openingId: doors[1].id,
      operationId: "remote",
    }),
  ).toThrow("instance");
});
test("door obstruction retains state until clear, with stale visit/revision and remote reach rejected", () => {
  const { ctx, door, visit } = doorFixture();
  let actor = ctx.db.character.id.find("door-actor");
  const command = {
    openingId: door.id,
    expectedVisitId: visit.visitId,
    expectedRevision: door.revision,
    open: true,
    operationId: "open",
  };
  expect(() =>
    requestDoor(ctx, { ...command, expectedVisitId: "old" }),
  ).toThrow();
  expect(() => requestDoor(ctx, { ...command, expectedRevision: 99n })).toThrow(
    "revision",
  );
  ctx.db.character.id.update({ ...actor, localX: 0.5, localY: 3.5 });
  expect(() => requestDoor(ctx, command)).toThrow("reach");
  ctx.db.character.id.update(actor);
  requestDoor(ctx, command);
  ctx.db.character.id.update({ ...actor, localX: 2.8, localY: 1 });
  stepDoors(ctx);
  expect(ownDoors(ctx)[0]).toMatchObject({
    fraction: 0,
    blocked: true,
    moving: true,
  });
  ctx.db.character.id.update(actor);
  for (let i = 0; i < 20; i++) stepDoors(ctx);
  expect(ownDoors(ctx)[0]).toMatchObject({
    fraction: 1,
    blocked: false,
    moving: false,
  });
});

const ordinaryHooks = {
  mayConsumeMovement: () => false,
  mayEnter: () => true,
  incompatibleActivity: () => false,
  clearControls: () => {},
  suspendCombat: () => {},
  completeSafeEgress: () => {},
  otherAcceptedPosition: () => undefined,
};

import { readFileSync } from "node:fs";
import { WAYFARER_CONVERSION_PIN } from "../../content/src/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "../../sim/src/wayfarer-conversion-candidate";
test("trusted full Wayfarer spawn retains qualified collision after UUID remap and reload", () => {
  const f = fixture(),
    c = createWayfarerConversionCandidate(
      Object.fromEntries(
        Object.keys(WAYFARER_CONVERSION_PIN.sources).map((p) => [
          p,
          readFileSync(p, "utf8"),
        ]),
      ) as WayfarerPinnedInputs,
    );
  let qualifiedId = 0;
  f.ctx.newUuidV4 = () => ({
    toString: () =>
      `11111111-0000-4000-8000-${(++qualifiedId).toString().padStart(12, "0")}`,
  });
  f.ctx.db.constructionBlueprint.id.update({
    ...f.ctx.db.constructionBlueprint.id.find("blueprint"),
    ...c.snapshot,
  });
  const args = {
    ...f.args,
    expectedSha256: c.snapshot.sha256,
    sourceDeckId: WAYFARER_CONVERSION_PIN.deckId,
  };
  spawnBlueprint(f.ctx, args);
  spawnBlueprint(f.ctx, { ...args, operationId: "second-qualified" });
  const instances = f.ctx.db.constructionInstance.rows;
  expect(instances).toHaveLength(2);
  for (const instance of instances) {
    const frame = constructionCollision(f.ctx, instance, instance.spawnDeckId);
    expect(frame.obstacles).toHaveLength(99);
    expect(
      canOccupyDeck(
        frame,
        {
          shipId: instance.id,
          deckId: instance.spawnDeckId,
          position: [-1.8, 8.8],
        },
        0.3,
      ),
    ).toBe(false);
    expect(
      canOccupyDeck(
        frame,
        { shipId: instance.id, deckId: instance.spawnDeckId, position: [0, 0] },
        0.3,
      ),
    ).toBe(true);
  }
  expect(JSON.parse(instances[0].idMapJson).objects).toHaveLength(211);
});

test("ordinary Wayfarer intent crosses the sill, retains stopped support without writes and preserves safe grant-loss return", () => {
  const f = fixture(),
    c = createWayfarerConversionCandidate(
      Object.fromEntries(
        Object.keys(WAYFARER_CONVERSION_PIN.sources).map((p) => [
          p,
          readFileSync(p, "utf8"),
        ]),
      ) as WayfarerPinnedInputs,
    );
  let allocated = 0;
  f.ctx.newUuidV4 = () => ({
    toString: () =>
      `22222222-0000-4000-8000-${(++allocated).toString().padStart(12, "0")}`,
  });
  f.ctx.db.constructionBlueprint.id.update({
    ...f.ctx.db.constructionBlueprint.id.find("blueprint"),
    ...c.snapshot,
  });
  spawnBlueprint(f.ctx, {
    ...f.args,
    expectedSha256: c.snapshot.sha256,
    sourceDeckId: WAYFARER_CONVERSION_PIN.deckId,
  });
  const instance = f.ctx.db.constructionInstance.rows[0];
  f.ctx.db.ship.insert({ id: "original-ship" });
  f.ctx.db.character.insert({
    id: "actor",
    owner: f.ctx.sender,
    shipId: "original-ship",
    localX: 0,
    localY: 10.25,
    connected: true,
    sprinting: false,
  });
  enterReview(f.ctx, {
    instanceId: instance.id,
    expectedShipId: "original-ship",
    operationId: "enter-threshold",
  });
  // Accepted supported fixture start; every subsequent crossing is normal intent.
  f.ctx.db.character.id.update({
    ...f.ctx.db.character.id.find("actor"),
    localX: 0,
    localY: 8.55,
  });
  const move = (dy: number, allowed = true) =>
    stepActor(
      f.ctx,
      f.ctx.db.character.id.find("actor"),
      { dx: 0, dy, sprint: false },
      { ...ordinaryHooks, mayEnter: () => allowed },
    );
  move(1);
  move(1);
  expect(ownLocation(f.ctx)[0].standingElevationM).toBeCloseTo(0.21875);
  move(1);
  move(0.52);
  expect(f.ctx.db.character.id.find("actor").localY).toBeCloseTo(8.99);
  expect(ownLocation(f.ctx)[0].standingElevationM).toBeCloseTo(0.2375);
  const actorUpdate = vi.spyOn(f.ctx.db.character.id, "update"),
    locationUpdate = vi.spyOn(
      f.ctx.db.constructionLocation.characterId,
      "update",
    );
  for (let i = 0; i < 20; i++) move(0);
  expect(actorUpdate).not.toHaveBeenCalled();
  expect(locationUpdate).not.toHaveBeenCalled();
  move(1, false);
  expect(actorUpdate).not.toHaveBeenCalled();
  expect(ownLocation(f.ctx)[0].standingElevationM).toBeCloseTo(0.2375);
  actorUpdate.mockRestore();
  locationUpdate.mockRestore();
  move(-1);
  expect(ownLocation(f.ctx)[0].standingElevationM).toBeCloseTo(0.21875);
  for (let i = 0; i < 3; i++) move(-1);
  expect(ownLocation(f.ctx)[0].standingElevationM).toBe(0.1875);
  for (let i = 0; i < 6; i++) move(1);
  move(0.88);
  expect(f.ctx.db.character.id.find("actor").localY).toBeCloseTo(9.35);
  expect(ownLocation(f.ctx)[0].standingElevationM).toBe(0.1875);
  for (let i = 0; i < 20; i++) move(1);
  expect(f.ctx.db.character.id.find("actor").localY).toBeLessThan(10.25);
  for (const grant of f.ctx.db.constructionGrant.rows) grant.revoked = true;
  expect(ownInstances(f.ctx)).toEqual([]);
  expect(ownDecks(f.ctx)).toEqual([]);
  const visit = ownLocation(f.ctx)[0];
  expect(Object.keys(visit).sort()).toEqual(
    [
      "characterId",
      "deckId",
      "instanceId",
      "revision",
      "standingElevationM",
      "visitId",
    ].sort(),
  );
  leaveReview(f.ctx, {
    expectedVisitId: visit.visitId,
    expectedRevision: visit.revision,
    operationId: "leave-threshold",
  });
  expect(f.ctx.db.character.id.find("actor")).toMatchObject({
    id: "actor",
    shipId: "original-ship",
    localX: 0,
    localY: 10.25,
  });
  expect(ownLocation(f.ctx)).toEqual([]);
});
