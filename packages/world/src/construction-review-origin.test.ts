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
import { ownedGameShipAccess } from "./game-ship-access-authority";
import {
  issueWayfarerPersonalKit,
  preserveWayfarerStarterKit,
} from "./wayfarer-personal-kit";

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
    constructionReviewOrigin: "characterId",
    constructionPilotSeat: "characterId",
    constructionFlightReview: "characterId",
    constructionTraversal: "characterId",
    constructionStairWalk: "characterId",
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
      [...tables].filter(([, rows]) => rows.length),
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
    );
  return { ctx, raw, db, tables, snapshot };
}

import {
  saveNativeReviewOrigin,
  restoreNativeReviewOrigin,
} from "./construction-review-origin";
function review() {
  const f = fixture(),
    made = createWayfarerStarterAuthority(f.ctx, "Review origin"),
    actor = f.db.character.id.find(made.actor.id);
  const original = { ...f.db.constructionLocation.characterId.find(actor.id) };
  const ctx = f.raw as any;
  const depart = () => {
    expect(saveNativeReviewOrigin(ctx, actor.id, "review-instance")).toBe(true);
    f.db.character.id.update({
      ...actor,
      shipId: "review-instance",
      localX: 1,
      localY: 1,
    });
    f.db.constructionLocation.characterId.update({
      ...original,
      instanceId: "review-instance",
      deckId: "review-deck",
      visitId: "review-visit",
      returnShipId: actor.shipId,
    });
  };
  return { ...f, actor, original, ctx, depart };
}
test("native review returns original visit/deck/character and kit without rolling ship motion or grants back", () => {
  const f = review();
  const inventory = JSON.stringify(f.db.inventoryItem.rows);
  f.depart();
  const motion = f.db.shipWorldMotion.shipId.find(f.actor.shipId);
  f.db.shipWorldMotion.shipId.update({ ...motion, x: 123, y: 456 });
  f.db.constructionGrant.insert({
    id: "revoked",
    principal: f.raw.sender,
    workspaceId: "review",
    capability: "instance.spawn",
    revoked: true,
  });
  expect(restoreNativeReviewOrigin(f.ctx, f.actor.id)).toBe(true);
  expect(f.db.constructionLocation.characterId.find(f.actor.id)).toEqual(
    f.original,
  );
  expect(f.db.character.id.find(f.actor.id)).toEqual({
    ...f.actor,
    sprinting: false,
  });
  expect(f.db.shipWorldMotion.shipId.find(f.actor.shipId)).toMatchObject({
    x: 123,
    y: 456,
  });
  expect(JSON.stringify(f.db.inventoryItem.rows)).toBe(inventory);
  expect(
    f.db.constructionReviewOrigin.characterId.find(f.actor.id),
  ).toBeUndefined();
});
test("recursive entry and pilot/flight departure are rejected before location mutation", () => {
  for (const table of [
    "constructionPilotSeat",
    "constructionFlightReview",
    "constructionTraversal",
    "constructionStairWalk",
  ]) {
    const f = review();
    f.db[table].insert({ characterId: f.actor.id });
    const before = f.snapshot();
    expect(() => saveNativeReviewOrigin(f.ctx, f.actor.id, "review")).toThrow();
    expect(f.snapshot()).toBe(before);
  }
  const f = review();
  f.depart();
  expect(() =>
    saveNativeReviewOrigin(f.ctx, f.actor.id, "recursive"),
  ).toThrow();
});
test("disconnect preserves saved visit and reconnect permits supported return after review grant loss", () => {
  const f = review();
  f.depart();
  f.db.character.id.update({
    ...f.db.character.id.find(f.actor.id),
    connected: false,
  });
  expect(() => restoreNativeReviewOrigin(f.ctx, f.actor.id)).toThrow();
  expect(
    f.db.constructionReviewOrigin.characterId.find(f.actor.id),
  ).toBeTruthy();
  f.db.character.id.update({
    ...f.db.character.id.find(f.actor.id),
    connected: true,
  });
  expect(restoreNativeReviewOrigin(f.ctx, f.actor.id)).toBe(true);
});
test("changed source/access/admission, unsupported origin and occupied return fail closed in current review", () => {
  for (const mutate of [
    (f: any) => {
      const i = f.db.constructionInstance.id.find(f.actor.shipId);
      f.db.constructionInstance.id.update({ ...i, revision: i.revision + 1n });
    },
    (f: any) => {
      const b = f.db.gameShipAccess.shipId.find(f.actor.shipId);
      f.db.gameShipAccess.shipId.update({ ...b, lifecycle: "suspended" });
    },
    (f: any) => {
      f.db.worldAdmission.characterId.delete(f.actor.id);
    },
    (f: any) => {
      const s = f.db.constructionReviewOrigin.characterId.find(f.actor.id);
      f.db.constructionReviewOrigin.characterId.update({
        ...s,
        x: 100,
        y: 100,
      });
    },
    (f: any) => {
      f.db.character.insert({ ...f.actor, id: "other" });
      f.db.constructionLocation.insert({ ...f.original, characterId: "other" });
    },
  ]) {
    const f = review();
    f.depart();
    mutate(f);
    const before = f.snapshot();
    expect(() => restoreNativeReviewOrigin(f.ctx, f.actor.id)).toThrow();
    expect(f.snapshot()).toBe(before);
    expect(f.db.character.id.find(f.actor.id).shipId).toBe("review-instance");
  }
});
