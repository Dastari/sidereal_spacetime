import { Identity } from "spacetimedb";
import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ SenderError: class extends Error {} }));
import {
  claimInputControl,
  canRecordInput,
  recordInput,
  releaseInputControl,
  disconnectInputControl,
  consumeInputControl,
  type InputControlContext,
} from "./input-control";
const owner = Identity.fromString("1".repeat(64));
const other = Identity.fromString("2".repeat(64));
function table(primary: string, indexes: Record<string, string> = {}) {
  const rows = new Map<string, any>();
  let writes = 0;
  const key = (v: any) => v?.toHexString?.() ?? v;
  const result: any = {
    rows,
    get writes() {
      return writes;
    },
    insert(row: any) {
      if (rows.has(key(row[primary]))) throw Error("duplicate");
      rows.set(key(row[primary]), row);
      writes++;
    },
    [primary]: {
      find: (id: any) => rows.get(key(id)),
      update(row: any) {
        if (!rows.has(key(row[primary]))) throw Error("missing");
        rows.set(key(row[primary]), row);
        writes++;
      },
      delete(id: any) {
        writes++;
        return rows.delete(key(id));
      },
    },
  };
  for (const [accessor, field] of Object.entries(indexes))
    result[accessor] = {
      filter: (id: any) =>
        [...rows.values()].filter((row) => key(row[field]) === key(id)),
    };
  return result;
}
function fixture() {
  const db = {
    inputControl: table("characterId", { by_connection: "connectionId" }),
    inputControlCursor: table("connectionId"),
    character: table("id", { by_owner: "owner" }),
    input: table("characterId"),
    connectionPresence: table("connectionId"),
    authSession: table("connectionId"),
    retiredIdentity: table("source"),
  };
  db.character.insert({
    id: "actor",
    owner,
    connected: true,
    sprinting: true,
    localX: 4,
    localY: 5,
  });
  db.input.insert({
    characterId: "actor",
    sequence: 999n,
    throttle: 1,
    turn: 1,
    dx: 1,
    dy: 1,
    sprint: true,
    updatedMicros: 1n,
  });
  for (const connectionId of ["a", "b"]) {
    db.connectionPresence.insert({ connectionId, owner });
    db.authSession.insert({
      connectionId,
      owner,
      game: true,
      expiresMicros: 10000000n,
    });
  }
  const ctx = (
    connectionId = "a",
    sender = owner,
    now = 1000n,
  ): InputControlContext => ({
    db,
    sender,
    connectionId: { toHexString: () => connectionId },
    timestamp: { microsSinceUnixEpoch: now },
  });
  return { db, ctx };
}
test("explicit claim derives the actor, clears movement once and same-holder claim is idempotent", () => {
  const { db, ctx } = fixture();
  const lease = claimInputControl(ctx());
  expect(lease.sequence).toBe(0n);
  expect(db.input.characterId.find("actor")).toMatchObject({
    sequence: 0n,
    throttle: 0,
    turn: 0,
    dx: 0,
    dy: 0,
    sprint: false,
  });
  expect(db.character.id.find("actor")).toMatchObject({
    localX: 4,
    localY: 5,
    sprinting: false,
  });
  expect(recordInput(ctx(), "actor", 1n)).toBe(true);
  const counts = [
    db.input.writes,
    db.character.writes,
    db.inputControl.writes,
    db.inputControlCursor.writes,
  ];
  expect(claimInputControl(ctx()).sequence).toBe(1n);
  expect([
    db.input.writes,
    db.character.writes,
    db.inputControl.writes,
    db.inputControlCursor.writes,
  ]).toEqual(counts);
});
test("idle packets do not acquire control; old holder's delayed zero cannot clear another tab", () => {
  const { db, ctx } = fixture();
  expect(recordInput(ctx(), "actor", 1n)).toBe(false);
  expect(db.inputControl.rows.size).toBe(0);
  claimInputControl(ctx("a"));
  expect(recordInput(ctx("a"), "actor", 50n)).toBe(true);
  claimInputControl(ctx("b"));
  expect(recordInput(ctx("b"), "actor", 1n)).toBe(true);
  const before = db.inputControl.characterId.find("actor");
  expect(recordInput(ctx("a"), "actor", 51n)).toBe(false);
  expect(db.inputControl.characterId.find("actor")).toEqual(before);
  expect(releaseInputControl(ctx("a"))).toBe(0);
  expect(db.inputControl.characterId.find("actor")).toEqual(before);
});
test("connection-local sequence floor survives A to B to A and explicit release", () => {
  const { ctx } = fixture();
  claimInputControl(ctx("a"));
  recordInput(ctx("a"), "actor", 50n);
  claimInputControl(ctx("b"));
  recordInput(ctx("b"), "actor", 1n);
  expect(claimInputControl(ctx("a")).sequence).toBe(50n);
  expect(recordInput(ctx("a"), "actor", 50n)).toBe(false);
  expect(recordInput(ctx("a"), "actor", 49n)).toBe(false);
  expect(recordInput(ctx("a"), "actor", 51n)).toBe(true);
  expect(releaseInputControl(ctx("a"))).toBe(1);
  expect(claimInputControl(ctx("a")).sequence).toBe(51n);
  expect(recordInput(ctx("a"), "actor", 1n)).toBe(false);
});
test("old socket disconnect only removes its cursor, never clears the new holder", () => {
  const { db, ctx } = fixture();
  claimInputControl(ctx("a"));
  claimInputControl(ctx("b"));
  recordInput(ctx("b"), "actor", 3n);
  const writes = db.input.writes;
  expect(disconnectInputControl(ctx("a"))).toBe(0);
  expect(db.input.writes).toBe(writes);
  expect(db.inputControlCursor.connectionId.find("a")).toBeUndefined();
  expect(db.inputControl.characterId.find("actor").connectionId).toBe("b");
  expect(disconnectInputControl(ctx("b"))).toBe(1);
  expect(db.inputControl.rows.size).toBe(0);
  expect(db.inputControlCursor.rows.size).toBe(0);
});
test("current socket authentication loss stops consumption even while sibling stays admitted", () => {
  for (const kind of [
    "expired",
    "missing-session",
    "missing-presence",
    "wrong-owner",
    "audience",
    "retired",
  ] as const) {
    const { db, ctx } = fixture();
    claimInputControl(ctx("a"));
    const motion = db.input.characterId.find("actor");
    db.input.characterId.update({ ...motion, dx: 1 });
    const session = db.authSession.connectionId.find("a");
    if (kind === "expired")
      db.authSession.connectionId.update({ ...session, expiresMicros: 1000n });
    if (kind === "missing-session") db.authSession.connectionId.delete("a");
    if (kind === "missing-presence")
      db.connectionPresence.connectionId.delete("a");
    if (kind === "wrong-owner")
      db.authSession.connectionId.update({ ...session, owner: other });
    if (kind === "audience")
      db.authSession.connectionId.update({ ...session, game: false });
    if (kind === "retired") db.retiredIdentity.insert({ source: owner });
    expect(canRecordInput(ctx("a"), "actor", 1n)).toBe(false);
    expect(() => claimInputControl(ctx("a"))).toThrow(/Connected game/);
    expect(consumeInputControl(ctx("b"), "actor")).toBe(false);
    expect(db.input.characterId.find("actor").dx).toBe(0);
    expect(db.inputControl.rows.size).toBe(0);
  }
});
test("invalid, foreign or disconnected actors cannot claim or record; rejected sequence never writes", () => {
  const { db, ctx } = fixture();
  expect(() => claimInputControl(ctx("a", other))).toThrow();
  claimInputControl(ctx("a"));
  const before = db.inputControl.writes;
  for (const sequence of [0n, -1n, 18446744073709551616n])
    expect(recordInput(ctx("a"), "actor", sequence)).toBe(false);
  expect(recordInput(ctx("a"), "other-actor", 1n)).toBe(false);
  expect(db.inputControl.writes).toBe(before);
  db.character.id.update({
    ...db.character.id.find("actor"),
    connected: false,
  });
  expect(recordInput(ctx("a"), "actor", 1n)).toBe(false);
  expect(() => claimInputControl(ctx("a"))).toThrow();
});
