import { describe, expect, it, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ SenderError: class extends Error {} }));
import { Identity } from "spacetimedb";
import {
  ensureCanonicalSystem,
  joinSharedSystem,
  type SharedJoinContext,
} from "./shared-world";
import {
  SHARED_SYSTEM_SEED,
  SHARED_SYSTEM_SEED_SHA256,
} from "@sidereal/content/shared-system";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { fixture, owner, other } from "./shared-world-test-fixture";
describe("canonical shared-system seed and explicit admission", () => {
  it("pins the exact independent canonical descriptors and stable body UUIDs", () => {
    expect(constructionHash(JSON.stringify(SHARED_SYSTEM_SEED))).toBe(
      SHARED_SYSTEM_SEED_SHA256,
    );
    const { db, writes } = fixture();
    ensureCanonicalSystem(db);
    const before = writes();
    expect(db.worldSystem.rows.size).toBe(1);
    expect(db.systemBody.rows.size).toBe(16);
    const rock = SHARED_SYSTEM_SEED.bodies[0];
    const motion = db.bodyWorldMotion.bodyId.find(rock.id);
    db.bodyWorldMotion.bodyId.update({ ...motion, x: 7, serverTick: 12n });
    const moved = writes();
    ensureCanonicalSystem(db);
    expect(writes()).toBe(moved);
    expect(db.bodyWorldMotion.bodyId.find(rock.id).x).toBe(7);
    expect(moved).toBe(before + 1);
  });
  it("two accounts join the same bodies at different server-reserved berths", () => {
    const { db, args, ctx } = fixture();
    joinSharedSystem(ctx(), args());
    joinSharedSystem(ctx(2, other), args(2));
    expect(db.worldSystem.rows.size).toBe(1);
    expect(db.systemBody.rows.size).toBe(16);
    const a = db.shipWorldMotion.shipId.find("ship1"),
      b = db.shipWorldMotion.shipId.find("ship2");
    expect(a.systemId).toBe(b.systemId);
    expect(a).toMatchObject({ x: 0, y: 0 });
    expect(b).toMatchObject({ x: 50, y: 0 });
    expect(a.cellX).toBe(0n);
    expect(db.worldAdmission.rows.size).toBe(2);
    expect(db.legacyBodyAlias.rows.size).toBe(32);
  });
  it("preserves ship/character UUIDs, appearance references, local coordinates, legacy momentum and old body snapshots", () => {
    const { db, args, ctx } = fixture();
    const actorBefore = db.character.id.find("actor1");
    const bodiesBefore = [...db.spaceBody.rows.values()];
    joinSharedSystem(ctx(), args());
    expect(db.character.id.find("actor1")).toBe(actorBefore);
    expect([...db.spaceBody.rows.values()]).toEqual(bodiesBefore);
    expect(db.ship.id.find("ship1")).toMatchObject({
      id: "ship1",
      owner,
      revision: 2n,
      vx: 3,
      vy: -2,
      heading: 0.2,
      omega: 0.01,
      tick: 7n,
    });
    const alias = db.legacyBodyAlias.legacyBodyId.find("legacy1-approach-rock");
    expect(alias.canonicalBodyId).toBe(SHARED_SYSTEM_SEED.bodies[0].id);
    expect(JSON.parse(alias.legacySnapshotJson)).toMatchObject({
      id: "legacy1-approach-rock",
      vx: 8,
      tick: "37",
    });
    const receipt = [...db.worldJoinReceipt.rows.values()][0] as any;
    expect(JSON.parse(receipt.oldMotionJson)).toMatchObject({
      x: 100,
      y: 500,
      vx: 3,
      serverTick: "7",
    });
    expect(db.input.characterId.find("actor1")).toMatchObject({
      sequence: 77n,
      dx: 0,
      throttle: 0,
      sprint: false,
      updatedMicros: 0n,
    });
  });
  it("same operation is a write-free replay but changed request and new reset requests fail", () => {
    const { db, args, ctx, writes } = fixture();
    joinSharedSystem(ctx(), args());
    const before = writes();
    joinSharedSystem(ctx(), args());
    expect(writes()).toBe(before);
    expect(() =>
      joinSharedSystem(ctx(), { ...args(), expectedShipRevision: 2n }),
    ).toThrow(/reused/);
    expect(() =>
      joinSharedSystem(ctx(), {
        ...args(),
        operationId: "00000000-0000-4000-8000-000000000099",
        expectedShipRevision: 2n,
        expectedAdmissionRevision: 1n,
      }),
    ).toThrow(/already admitted/);
    expect(db.shipWorldMotion.rows.size).toBe(1);
  });
  it("checks actor, live connection and revision before migration or receipt replay", () => {
    const { db, args, ctx, writes } = fixture();
    const before = writes();
    expect(() => joinSharedSystem(ctx(2, other), args())).toThrow(/Owned/);
    expect(() =>
      joinSharedSystem(ctx(), { ...args(), expectedShipRevision: 99n }),
    ).toThrow(/revision/);
    expect(writes()).toBe(before);
    joinSharedSystem(ctx(), args());
    db.authSession.connectionId.update({
      ...db.authSession.connectionId.find("c1"),
      expiresMicros: 99n,
    });
    expect(() => joinSharedSystem(ctx(), args())).toThrow(/Live game/);
  });
  it("rejects construction visitors and unmapped old bodies without editing them", () => {
    const { db, args, ctx } = fixture();
    db.constructionLocation.insert({
      characterId: "actor1",
      instanceId: "review",
    });
    expect(() => joinSharedSystem(ctx(), args())).toThrow(/construction/);
    db.constructionLocation.rows.clear();
    db.spaceBody.insert({
      id: "unmapped",
      shipId: "ship1",
      key: "unknown-rock",
      kind: "asteroid",
    });
    expect(() => joinSharedSystem(ctx(), args())).toThrow(/mapping/);
    expect(db.worldSystem.rows.size).toBe(0);
    expect(db.ship.id.find("ship1").revision).toBe(1n);
  });
  it("detects partial seed corruption and explicit revision mismatches without reseeding", () => {
    const { db } = fixture();
    ensureCanonicalSystem(db);
    db.bodyWorldMotion.rows.delete(SHARED_SYSTEM_SEED.bodies[0].id);
    expect(() => ensureCanonicalSystem(db)).toThrow(/incomplete/);
    db.worldSystem.id.update({
      ...db.worldSystem.id.find(SHARED_SYSTEM_SEED.systemId),
      seedRevision: 2n,
    });
    expect(() => ensureCanonicalSystem(db)).toThrow(/migration/);
  });
  it("refuses island overcapacity, invalid operation IDs and unsafe coordinates", () => {
    const { db, args, ctx } = fixture();
    ensureCanonicalSystem(db);
    for (let i = 0; i < 60; i++)
      db.shipWorldMotion.insert({
        shipId: `crowd${i}`,
        systemId: SHARED_SYSTEM_SEED.systemId,
        x: 10000 + i * 50,
        y: 10000,
      });
    expect(() => joinSharedSystem(ctx(), args())).toThrow(/full/);
    expect(db.worldAdmission.rows.size).toBe(0);
    expect(() =>
      joinSharedSystem(ctx(), { ...args(), operationId: "bad" }),
    ).toThrow(/UUID/);
    db.ship.id.update({ ...db.ship.id.find("ship1"), x: 1e9 + 1 });
    expect(() => joinSharedSystem(ctx(), args())).toThrow(/coordinate/);
  });
});
