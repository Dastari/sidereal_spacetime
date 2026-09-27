import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
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
vi.mock("./auth", () => ({
  requireGame: (ctx: { live: boolean }) => {
    if (!ctx.live) throw Error("Live game required");
  },
  canReadGame: (ctx: { live: boolean }) => ctx.live,
}));
import {
  createWayfarerStarterAuthority,
  type WayfarerStarterContext,
} from "./wayfarer-starter-authority";

type Row = Record<string, any>;
function fixture() {
  const tables = new Map<string, Row[]>();
  const primary: Record<string, string> = {
    personalStarterReceipt: "owner",
    gameShipAccess: "shipId",
    shipWorldMotion: "shipId",
    bodyWorldMotion: "bodyId",
    worldAdmission: "characterId",
    constructionFlightBinding: "shipId",
    constructionFlightCompiled: "shipId",
    constructionFlightDirty: "shipId",
    constructionFlightStation: "stationId",
    constructionLocation: "characterId",
    input: "characterId",
    inventoryState: "characterId",
    inventoryContainerScope: "containerId",
    inventoryItemMembership: "itemId",
    instanceInventoryBinding: "placedObjectId",
    constructionInteractionBinding: "objectId",
  };
  const field: Record<string, string> = {
    by_root: "rootContainerId",
    by_owner: "owner",
    by_system: "systemId",
    by_ship: "shipId",
    by_deck: "deckId",
    by_instance: "instanceId",
    by_character: "characterId",
    by_principal: "principal",
  };
  const key = (v: unknown) => String(v);
  const db = new Proxy({} as Record<string, any>, {
    get(target, name: string) {
      if (target[name]) return target[name];
      const rows: Row[] = [];
      tables.set(name, rows);
      const pk = primary[name] ?? "id";
      target[name] = new Proxy(
        {
          rows,
          iter: () => rows.values(),
          insert: (row: Row) => {
            if (rows.some((r) => key(r[pk]) === key(row[pk])))
              throw Error("Duplicate row:" + name);
            rows.push({ ...row });
            return row;
          },
        },
        {
          get(t, index: string) {
            if (index in t) return (t as any)[index];
            const column = field[index] ?? index;
            return {
              find: (value: unknown) =>
                rows.find((r) => key(r[column]) === key(value)),
              filter: (value: unknown) =>
                rows.filter((r) => key(r[column]) === key(value)),
              update: (row: Row) => {
                const at = rows.findIndex((r) => key(r[pk]) === key(row[pk]));
                if (at < 0) throw Error("Missing row");
                rows[at] = { ...row };
              },
              delete: (value: unknown) => {
                const at = rows.findIndex((r) => key(r[column]) === key(value));
                if (at >= 0) rows.splice(at, 1);
              },
            };
          },
        },
      );
      return target[name];
    },
  });
  let sequence = 1;
  const owner = Identity.fromString("04".repeat(32));
  const raw = {
    db,
    sender: owner,
    live: true,
    timestamp: { microsSinceUnixEpoch: 123000000n },
    newUuidV4: () => ({
      toString: () =>
        `44444444-4444-4444-8444-${(sequence++).toString(16).padStart(12, "0")}`,
    }),
  };
  db.authSession.insert({
    id: "session",
    owner,
    game: true,
    expiresMicros: 999999999999n,
  });
  const ctx = raw as unknown as WayfarerStarterContext;
  const snapshot = () =>
    JSON.stringify(
      [...tables].filter(([, rows]) => rows.length > 0),
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
    );
  return { ctx, raw, db, tables, snapshot };
}

import {
  offerWayfarerRebuildRefit,
  refitWayfarerRebuild,
  type WayfarerRebuildRefitHooks,
} from "./wayfarer-rebuild-refit";
import { readConstructionDraft } from "@sidereal/sim/construction-transactions";
import { WAYFARER_REBUILD_SOURCE } from "@sidereal/sim/wayfarer-rebuild-contract";
function prepared() {
  const f = fixture();
  const created = createWayfarerStarterAuthority(
    f.ctx,
    "Refit review",
    WAYFARER_STARTER,
  );
  const actor = created.actor;
  const instance = f.db.constructionInstance.id.find(actor.shipId);
  const mappings = JSON.parse(instance.idMapJson);
  const target = readConstructionDraft(JSON.stringify(WAYFARER_REBUILD_SOURCE));
  const retained = new Set(
    WAYFARER_REBUILD_SOURCE.layout.assembly?.parts.map((p) => p.id),
  );
  const hooks: WayfarerRebuildRefitHooks = {
    target: {
      canonical: target.canonical,
      sha256: target.sha256,
      blueprintId: "wayfarer-r002",
      removableStructuralSourceIds: mappings.objects
        .filter((m: any) => !retained.has(m.sourceId))
        .map((m: any) => m.sourceId),
    },
    qualify: vi.fn((_document, state) => ({
      definitionId: "qualified-review-definition",
      definitionSha256: "b".repeat(64),
      doors: state.doors,
    })),
  };
  const ctx = f.ctx as unknown as Parameters<typeof refitWayfarerRebuild>[0];
  const offer = () => offerWayfarerRebuildRefit(ctx, actor.shipId, hooks);
  const request = () => ({ ...offer(), operationId: "refit-1" });
  // Simulate host transaction rollback; the adapter must let every write error escape.
  function transaction<T>(run: () => T): T {
    const before = new Map(
      [...f.tables].map(([key, rows]) => [key, rows.map((r) => ({ ...r }))]),
    );
    try {
      return run();
    } catch (error) {
      for (const [key, rows] of f.tables) {
        rows.splice(0, rows.length, ...(before.get(key) ?? []));
      }
      throw error;
    }
  }
  return { ...f, ctx, actor, instance, hooks, offer, request, transaction };
}
test("read-only offer and actual adapter conserve current UUIDs, inventory, liquid and motion", () => {
  const f = prepared();
  const before = f.snapshot();
  const args = f.request();
  expect(f.snapshot()).toBe(before);
  const preserved = [
    "inventoryItem",
    "inventoryContainer",
    "inventoryHotbar",
    "inventoryState",
    "inventoryItemMembership",
    "instanceInventoryBinding",
    "constructionLocation",
    "character",
    "shipWorldMotion",
    "station",
    "constructionFlightStation",
    "constructionFlightFitting",
    "worldAdmission",
    "storageBinding",
    "interactionObject",
  ];
  const snapshots = Object.fromEntries(
    preserved.map((name) => [
      name,
      JSON.stringify(f.db[name].rows, (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
    ]),
  );
  const result = f.transaction(() =>
    refitWayfarerRebuild(f.ctx, args, f.hooks),
  );
  expect(result.revision).toBe(2n);
  for (const name of preserved)
    expect(
      JSON.stringify(f.db[name].rows, (_, v) =>
        typeof v === "bigint" ? v.toString() : v,
      ),
      name,
    ).toBe(snapshots[name]);
  expect(f.db.gameShipAccess.shipId.find(f.actor.shipId).instanceRevision).toBe(
    2n,
  );
  expect(
    f.db.constructionFlightBinding.shipId.find(f.actor.shipId).instanceRevision,
  ).toBe(2n);
  expect(
    f.db.inventoryContainerScope.rows
      .filter((s: any) => s.instanceId === f.actor.shipId)
      .every((s: any) => s.instanceRevision === 2n),
  ).toBe(true);
  expect(
    f.db.constructionInteractionBinding.rows.every(
      (s: any) => s.instanceRevision === 2n,
    ),
  ).toBe(true);
  expect(
    JSON.parse(f.db.constructionReceipt.rows[0].request).audit
      .removedStructuralIdentities.length,
  ).toBeGreaterThan(0);
});
test("exact replay returns prior result without reapplying state, altered operation fails", () => {
  const f = prepared(),
    args = f.request();
  refitWayfarerRebuild(f.ctx, args, f.hooks);
  const before = f.snapshot();
  expect(refitWayfarerRebuild(f.ctx, args, f.hooks).replayed).toBe(true);
  expect(f.snapshot()).toBe(before);
  expect(() =>
    refitWayfarerRebuild(
      f.ctx,
      { ...args, expectedShipRevision: 99n },
      f.hooks,
    ),
  ).toThrow("reused");
});
test("stale revision, changed storage and unauthorized sender reject without writes", () => {
  const f = prepared(),
    args = f.request();
  let before = f.snapshot();
  expect(() =>
    refitWayfarerRebuild(
      f.ctx,
      { ...args, expectedInstanceRevision: 2n },
      f.hooks,
    ),
  ).toThrow("Revision");
  expect(f.snapshot()).toBe(before);
  f.db.inventoryContainer.rows[0].amountLitres += 1;
  before = f.snapshot();
  expect(() => refitWayfarerRebuild(f.ctx, args, f.hooks)).toThrow(
    "offer changed",
  );
  expect(f.snapshot()).toBe(before);
  f.raw.sender = Identity.fromString("05".repeat(32));
  before = f.snapshot();
  expect(() => refitWayfarerRebuild(f.ctx, args, f.hooks)).toThrow("owner");
  expect(f.snapshot()).toBe(before);
});
test("unqualified geometry and occupied actors stop before writes", () => {
  const f = prepared(),
    args = f.request();
  const before = f.snapshot();
  f.hooks.qualify = () => {
    throw Error("No exact collision proof");
  };
  expect(() => refitWayfarerRebuild(f.ctx, args, f.hooks)).toThrow(
    "collision proof",
  );
  expect(f.snapshot()).toBe(before);
  f.db.station.rows[0].occupantId = f.actor.id;
  expect(() => f.offer()).toThrow("controls");
});
test("late receipt failure rolls back every write under host transaction", () => {
  const f = prepared(),
    args = f.request(),
    before = f.snapshot();
  f.db.constructionReceipt.insert = () => {
    throw Error("receipt storage failed");
  };
  expect(() =>
    f.transaction(() => refitWayfarerRebuild(f.ctx, args, f.hooks)),
  ).toThrow("receipt storage failed");
  expect(f.snapshot()).toBe(before);
});

test("standing gate covers other aboard actors and disconnected owner cannot replay", () => {
  const f = prepared();
  const visitor = {
    ...f.actor,
    id: "55555555-5555-4555-8555-555555555555",
    owner: Identity.fromString("06".repeat(32)),
    connected: true,
  };
  f.db.character.insert(visitor);
  f.db.constructionLocation.insert({
    ...f.db.constructionLocation.characterId.find(f.actor.id),
    characterId: visitor.id,
    visitId: "visitor-visit",
  });
  f.db.couchSeat.insert({
    id: "visitor-seat",
    objectId: "occupied-couch",
    characterId: visitor.id,
  });
  expect(() => f.offer()).toThrow("stand");
  f.db.couchSeat.rows.splice(0);
  const args = f.request();
  refitWayfarerRebuild(f.ctx, args, f.hooks);
  f.db.character.id.update({
    ...f.db.character.id.find(f.actor.id),
    connected: false,
  });
  expect(() => refitWayfarerRebuild(f.ctx, args, f.hooks)).toThrow("owner");
});

test("clears stale actuator and aim commands while preserving their identities", () => {
  const f = prepared();
  f.db.actuatorOutput.insert({
    id: "retained-output",
    shipId: f.actor.shipId,
    actuatorId: "retained-actuator",
    throttle: 0.7,
    tick: 8n,
  });
  f.db.combatAim.insert({
    id: "aim",
    characterId: f.actor.id,
    active: true,
    angle: 1.2,
    updatedMicros: 100n,
  });
  const args = f.request();
  refitWayfarerRebuild(f.ctx, args, f.hooks);
  expect(f.db.actuatorOutput.id.find("retained-output")).toMatchObject({
    actuatorId: "retained-actuator",
    throttle: 0,
    tick: 8n,
  });
  expect(f.db.combatAim.characterId.find(f.actor.id)).toMatchObject({
    active: false,
    angle: 1.2,
  });
});

test("offer uses only read context and still rejects revoked game admission", () => {
  const f = prepared();
  const readContext = { db: f.ctx.db, sender: f.ctx.sender };
  expect(
    offerWayfarerRebuildRefit(readContext, f.actor.shipId, f.hooks).shipId,
  ).toBe(f.actor.shipId);
  f.db.authSession.rows[0].game = false;
  expect(() =>
    offerWayfarerRebuildRefit(readContext, f.actor.shipId, f.hooks),
  ).toThrow("admission");
});

test("mutation requires live connection admission and current unexpired game access", () => {
  const f = prepared(),
    args = f.request();
  f.raw.live = false;
  expect(() => refitWayfarerRebuild(f.ctx, args, f.hooks)).toThrow("Live game");
  f.raw.live = true;
  f.db.authSession.rows[0].expiresMicros = 1n;
  expect(() => refitWayfarerRebuild(f.ctx, args, f.hooks)).toThrow("admission");
});

import { qualifiedWayfarerRebuildHooks } from "./wayfarer-rebuild-installation";

test("actual qualified native collision/flight hooks conserve the starter and support exact replay", () => {
  const f = prepared(),
    hooks = qualifiedWayfarerRebuildHooks();
  f.db.character.id.update({
    ...f.db.character.id.find(f.actor.id),
    localX: 0,
    localY: -2,
  });
  const preserved = [
    "inventoryItem",
    "inventoryContainer",
    "inventoryHotbar",
    "inventoryState",
    "inventoryItemMembership",
    "instanceInventoryBinding",
    "constructionLocation",
    "character",
    "shipWorldMotion",
    "station",
    "constructionFlightStation",
    "constructionFlightFitting",
    "worldAdmission",
    "storageBinding",
    "interactionObject",
  ];
  const snapshot = (name: string) =>
    JSON.stringify(f.db[name].rows, (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
  const before = Object.fromEntries(
    preserved.map((name) => [name, snapshot(name)]),
  );
  const read = { db: f.ctx.db, sender: f.ctx.sender };
  const offer = offerWayfarerRebuildRefit(read, f.actor.shipId, hooks);
  expect(offer.serverQualificationAccepted).toBe(true);
  expect(f.db.constructionDoor.rows).toHaveLength(0);
  const args = {
    shipId: offer.shipId,
    expectedInstanceRevision: offer.expectedInstanceRevision,
    expectedShipRevision: offer.expectedShipRevision,
    fingerprint: offer.fingerprint,
    operationId: "qualified-refit",
  };
  expect(
    f.transaction(() => refitWayfarerRebuild(f.ctx, args, hooks)),
  ).toMatchObject({ revision: 2n, replayed: false });
  for (const name of preserved) expect(snapshot(name), name).toBe(before[name]);
  const after = f.snapshot();
  expect(refitWayfarerRebuild(f.ctx, args, hooks).replayed).toBe(true);
  expect(f.snapshot()).toBe(after);
});

test("real native wall collision rejects an actor at a new partition before allocation or writes", () => {
  const f = prepared(),
    hooks = qualifiedWayfarerRebuildHooks();
  f.db.character.id.update({
    ...f.db.character.id.find(f.actor.id),
    localX: 0,
    localY: -2,
  });
  const offer = offerWayfarerRebuildRefit(
    { db: f.ctx.db, sender: f.ctx.sender },
    f.actor.shipId,
    hooks,
  );
  f.db.character.id.update({
    ...f.db.character.id.find(f.actor.id),
    localX: -2,
    localY: -2,
  });
  const before = f.snapshot();
  expect(() =>
    offerWayfarerRebuildRefit(
      { db: f.ctx.db, sender: f.ctx.sender },
      f.actor.shipId,
      hooks,
    ),
  ).toThrow("clear retained floor");
  expect(f.snapshot()).toBe(before);
  expect(() =>
    refitWayfarerRebuild(
      f.ctx,
      {
        shipId: offer.shipId,
        expectedInstanceRevision: offer.expectedInstanceRevision,
        expectedShipRevision: offer.expectedShipRevision,
        fingerprint: offer.fingerprint,
        operationId: "blocked-refit",
      },
      hooks,
    ),
  ).toThrow("offer changed");
  expect(f.snapshot()).toBe(before);
});

import { REFIT_FUEL_ATTACHMENT } from "@sidereal/sim/wayfarer-refit-audit";
test("real qualification conserves an exact attached legacy fuel tank, contents and binding UUIDs", () => {
  const f = prepared(),
    hooks = qualifiedWayfarerRebuildHooks(),
    deckId = f.instance.spawnDeckId;
  f.db.character.id.update({
    ...f.db.character.id.find(f.actor.id),
    localX: 0,
    localY: -2,
  });
  const id = "55555555-5555-4555-8555-555555555551",
    containerId = "55555555-5555-4555-8555-555555555552";
  f.db.inventoryContainer.insert({
    id: containerId,
    characterId: f.actor.id,
    parentItemId: "",
    kind: "liquid",
    name: "Preserved engineering fuel",
    width: 0,
    height: 0,
    maxMassKg: 80,
    capacityLitres: 100,
    amountLitres: 37.5,
    liquidType: "fuel",
    shipId: f.actor.shipId,
    localX: -3,
    localY: 7,
    carried: false,
  });
  f.db.wayfarerRefitAttachment.insert({
    id,
    instanceId: f.actor.shipId,
    deckId,
    containerId,
    assetId: REFIT_FUEL_ATTACHMENT.assetId,
    assetSha256: REFIT_FUEL_ATTACHMENT.glbSha256,
    x: -3,
    y: 7,
    z: 0.1875,
    revision: 1n,
  });
  f.db.instanceInventoryBinding.insert({
    placedObjectId: id,
    containerId,
    instanceId: f.actor.shipId,
    deckId,
    definitionRevision: "preserved-fuel-floor-mount-v1",
  });
  f.db.inventoryContainerScope.insert({
    containerId,
    rootContainerId: containerId,
    revision: 5n,
    rootKind: "instance",
    rootCharacterId: "",
    instanceId: f.actor.shipId,
    deckId,
    placedObjectId: id,
    instanceRevision: 1n,
    definitionRevision: "preserved-fuel-floor-mount-v1",
    accessX: -1.875,
    accessY: 7,
    accessZ: 0.1875,
    lifecycle: "active",
  });
  const beforeContainer = { ...f.db.inventoryContainer.id.find(containerId) },
    beforeAttachment = { ...f.db.wayfarerRefitAttachment.id.find(id) },
    beforeBinding = {
      ...f.db.instanceInventoryBinding.placedObjectId.find(id),
    };
  const offer = offerWayfarerRebuildRefit(
    { db: f.ctx.db, sender: f.ctx.sender },
    f.actor.shipId,
    hooks,
  );
  refitWayfarerRebuild(
    f.ctx,
    {
      shipId: offer.shipId,
      expectedInstanceRevision: offer.expectedInstanceRevision,
      expectedShipRevision: offer.expectedShipRevision,
      fingerprint: offer.fingerprint,
      operationId: "fuel-refit",
    },
    hooks,
  );
  expect(f.db.inventoryContainer.id.find(containerId)).toEqual(beforeContainer);
  expect(f.db.wayfarerRefitAttachment.id.find(id)).toEqual(beforeAttachment);
  expect(f.db.instanceInventoryBinding.placedObjectId.find(id)).toEqual(
    beforeBinding,
  );
  expect(
    f.db.inventoryContainerScope.containerId.find(containerId),
  ).toMatchObject({
    placedObjectId: id,
    containerId,
    instanceRevision: 2n,
    revision: 6n,
    accessX: -1.875,
    accessY: 7,
  });
});

test("zero-input heartbeats and already-cleared aim do not invalidate the conservation offer", () => {
  const f = prepared();
  f.db.combatAim.insert({
    id: "aim",
    characterId: f.actor.id,
    active: true,
    angle: 0.4,
    updatedMicros: 100n,
  });
  const args = f.request();
  const input = f.db.input.characterId.find(f.actor.id);
  f.db.input.characterId.update({
    ...input,
    sequence: input.sequence + 8n,
    updatedMicros: input.updatedMicros + 200000n,
  });
  f.db.combatAim.characterId.update({
    ...f.db.combatAim.characterId.find(f.actor.id),
    active: false,
    angle: 1.7,
    updatedMicros: 200n,
  });
  expect(f.offer().fingerprint).toBe(args.fingerprint);
  refitWayfarerRebuild(f.ctx, args, f.hooks);
  expect(f.db.input.characterId.find(f.actor.id).sequence).toBe(
    input.sequence + 8n,
  );
  expect(f.db.combatAim.characterId.find(f.actor.id)).toMatchObject({
    active: false,
    angle: 1.7,
    updatedMicros: 200n,
  });
});

test("active movement remains forbidden even though input consumption metadata is excluded", () => {
  const f = prepared(),
    args = f.request(),
    input = f.db.input.characterId.find(f.actor.id);
  for (const command of [
    { dx: 1 },
    { dy: -1 },
    { throttle: 0.1 },
    { turn: 0.1 },
    { sprint: true },
  ]) {
    f.db.input.characterId.update({
      ...input,
      ...command,
      sequence: input.sequence + 1n,
    });
    const before = f.snapshot();
    expect(() => refitWayfarerRebuild(f.ctx, args, f.hooks)).toThrow(
      "Stop all actor input",
    );
    expect(f.snapshot()).toBe(before);
  }
});

test("substantive actor and ship motion changes still invalidate idle-input offers", () => {
  for (const edit of [
    (f: ReturnType<typeof prepared>) =>
      f.db.character.id.update({
        ...f.db.character.id.find(f.actor.id),
        localX: 0.125,
      }),
    (f: ReturnType<typeof prepared>) =>
      f.db.shipWorldMotion.shipId.update({
        ...f.db.shipWorldMotion.shipId.find(f.actor.shipId),
        vx: 0.125,
      }),
  ]) {
    const f = prepared(),
      args = f.request();
    edit(f);
    const before = f.snapshot();
    expect(() => refitWayfarerRebuild(f.ctx, args, f.hooks)).toThrow(
      "offer changed",
    );
    expect(f.snapshot()).toBe(before);
  }
});

test("real qualification tolerates idle input row arrival/removal without restoring old intent", () => {
  for (const change of ["arrive", "remove"] as const) {
    const f = prepared(),
      hooks = qualifiedWayfarerRebuildHooks();
    f.db.character.id.update({
      ...f.db.character.id.find(f.actor.id),
      localX: 0,
      localY: -2,
    });
    const originalInput = { ...f.db.input.characterId.find(f.actor.id) };
    if (change === "arrive") f.db.input.characterId.delete(f.actor.id);
    const read = { db: f.ctx.db, sender: f.ctx.sender };
    const offer = offerWayfarerRebuildRefit(read, f.actor.shipId, hooks);
    if (change === "arrive")
      f.db.input.insert({
        ...originalInput,
        sequence: 55n,
        updatedMicros: 999n,
      });
    else f.db.input.characterId.delete(f.actor.id);
    f.db.combatAim.insert({
      id: "late-idle-aim",
      characterId: f.actor.id,
      active: false,
      angle: 2.2,
      updatedMicros: 999n,
    });
    expect(
      offerWayfarerRebuildRefit(read, f.actor.shipId, hooks).fingerprint,
    ).toBe(offer.fingerprint);
    refitWayfarerRebuild(
      f.ctx,
      {
        shipId: offer.shipId,
        expectedInstanceRevision: offer.expectedInstanceRevision,
        expectedShipRevision: offer.expectedShipRevision,
        fingerprint: offer.fingerprint,
        operationId: "idle-" + change,
      },
      hooks,
    );
    if (change === "arrive")
      expect(f.db.input.characterId.find(f.actor.id)).toMatchObject({
        sequence: 55n,
        dx: 0,
        dy: 0,
      });
    else expect(f.db.input.characterId.find(f.actor.id)).toBeUndefined();
    expect(f.db.combatAim.characterId.find(f.actor.id)).toMatchObject({
      angle: 2.2,
      active: false,
    });
  }
});
