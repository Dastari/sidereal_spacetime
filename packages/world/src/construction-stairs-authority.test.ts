import { stepActor, ownInstances, ownDecks } from "./construction-instances";
import {
  createConstructionStairWorldHooks,
  admittedStairEgressGeometry,
  admittedStairWalks,
} from "./construction-stairs-world-hooks";
import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
vi.mock("spacetimedb/server", () => ({
  SenderError: class extends Error {},
  table: () => ({}),
  t: new Proxy({}, { get: () => () => ({ primaryKey: () => ({}), unique: () => ({}) }) }),
}));
import {
  createNativeStairRoomDocument,
  remapNativeStairRoomBinding,
} from "@sidereal/sim/construction-stairs-document";
import {
  installConstructionStair,
  tryEnterConstructionStair,
  stepConstructionStairs,
  ownConstructionStairWalks,
  ownConstructionStairEgressGeometry,
  constructionStairPositionAllowed,
  requireNoConstructionStair,
  requireNoReservedStairInstance,
  type StairAuthorityHooks,
} from "./construction-stairs-authority";
const owner = Identity.fromString("1".repeat(64)),
  other = Identity.fromString("2".repeat(64));
function table(primary = "id", indexes: Record<string, string> = {}) {
  const rows = new Map<string, any>();
  let writes = 0;
  const t: any = {
    iter: () => rows.values(),
    writes: () => writes,
    insert: (r: any) => {
      if (rows.has(r[primary])) throw Error("duplicate");
      rows.set(r[primary], r);
      writes++;
    },
    [primary]: {
      find: (id: string) => rows.get(id),
      update: (r: any) => {
        if (!rows.has(r[primary])) throw Error("missing");
        rows.set(r[primary], r);
        writes++;
      },
      delete: (id: string) => {
        writes++;
        return rows.delete(id);
      },
    },
  };
  for (const [name, key] of Object.entries(indexes))
    t[name] = {
      filter: function* (v: any) {
        for (const r of rows.values())
          if (v?.isEqual ? v.isEqual(r[key]) : v === r[key]) yield r;
      },
    };
  return t;
}
function fixture() {
  let serial = 0,
    permission = true,
    admitted = true,
    incompatible = false,
    egress = 0,
    combat = 0;
  const db: any = {
    constructionStairLink: table("id", {
      by_instance: "instanceId",
      by_owner: "owner",
    }),
    constructionStairWalk: table("characterId", {
      by_instance: "instanceId",
      by_owner: "owner",
    }),
    constructionStairReservation: table("stairId", {
      by_instance: "instanceId",
    }),
    constructionStairAudit: table("id", { by_owner: "owner" }),
    constructionInstance: table(),
    constructionLocation: table("characterId", { by_instance: "instanceId" }),
    constructionDeck: table(),
    character: table(),
    input: table("characterId"),
  };
  const ctx: any = {
    db,
    sender: owner,
    timestamp: { microsSinceUnixEpoch: 100000n },
    newUuidV4: () => ({ toString: () => `walk-${++serial}` }),
  };
  const hooks: StairAuthorityHooks = {
    mayConsumeMovement: (p) => admitted && p.isEqual(owner),
    mayEnter: () => permission,
    incompatibleActivity: () => incompatible,
    suspendCombat: () => {
      combat++;
    },
    clearControls: (id) => {
      const i = db.input.characterId.find(id);
      if (i)
        db.input.characterId.update({ ...i, dx: 0, dy: 0, updatedMicros: 0n });
    },
    completeSafeEgress: () => {
      egress++;
    },
    otherAcceptedPosition: () => undefined,
  };
  function prepare(id = "instance") {
    const d = createNativeStairRoomDocument(),
      r = d.stairRoom;
    const ids = [
      d.layout.id,
      ...d.layout.decks.map((p) => p.id),
      ...d.layout.decks.flatMap((p) => p.holes.map((h) => h.id)),
      ...d.layout.tiles.map((p) => p.id),
      r.stairId,
      ...r.parts.map((p) => p.id),
      ...r.apertures.map((p) => p.id),
      ...r.supports.map((p) => p.id),
    ];
    const map = new Map(ids.map((s) => [s, `${id}:${s}`]));
    map.set(d.layout.id, id);
    d.stairRoom = remapNativeStairRoomBinding(r, map);
    d.layout.id = id;
    d.layout.playableDeckId = map.get(d.layout.playableDeckId)!;
    d.layout.decks.forEach((p) => {
      p.id = map.get(p.id)!;
      p.holes.forEach((h) => (h.id = map.get(h.id)!));
      db.constructionDeck.insert({
        id: p.id,
        instanceId: id,
        elevation: p.elevation / 32,
      });
    });
    d.layout.tiles.forEach((p) => {
      p.id = map.get(p.id)!;
      p.deckId = map.get(p.deckId)!;
    });
    d.floors.forEach((p) => {
      p.id = map.get(p.id)!;
      p.deckId = map.get(p.deckId)!;
    });
    db.constructionInstance.insert({
      id,
      owner,
      workspaceId: "workspace",
      documentJson: JSON.stringify(d),
      revision: 1n,
    });
    installConstructionStair(ctx, id);
    return d;
  }
  const d = prepare();
  function actor(
    id = "actor",
    instanceId = "instance",
    deckId = d.stairRoom.lowerDeckId,
    x = 3,
    y = 2.75,
  ) {
    db.character.insert({
      id,
      owner,
      shipId: instanceId,
      localX: x,
      localY: y,
      connected: true,
      sprinting: false,
    });
    db.constructionLocation.insert({
      characterId: id,
      instanceId,
      deckId,
      visitId: `visit-${id}`,
      revision: 1n,
    });
    db.input.insert({
      characterId: id,
      sequence: 1n,
      dx: 0,
      dy: 1,
      updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  }
  actor();
  const row = (id = "actor") => db.constructionStairWalk.characterId.find(id);
  const state = (id = "actor") =>
    row(id) ? JSON.parse(row(id).stateJson) : undefined;
  const command = (dx: number, dy: number, id = "actor") => {
    const i = db.input.characterId.find(id);
    db.input.characterId.update({
      ...i,
      sequence: i.sequence + 1n,
      dx,
      dy,
      updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  };
  const move = (dx: number, dy: number, id = "actor") => {
    ctx.timestamp.microsSinceUnixEpoch += 50000n;
    command(dx, dy, id);
    return stepConstructionStairs(ctx, hooks);
  };
  const enter = () => tryEnterConstructionStair(ctx, hooks, "actor");
  const until = (
    predicate: () => boolean,
    dx: number,
    dy: number,
    max = 600,
  ) => {
    for (let n = 0; n < max && !predicate(); n++) move(dx, dy);
    expect(predicate()).toBe(true);
  };
  const mid = () =>
    until(() => state()?.supportId.endsWith("midlanding"), 0, 1);
  const completeUp = () => {
    mid();
    until(() => row().acceptedY >= 7, 0, 1, 50);
    until(() => row().acceptedX >= 5 - 1e-8, 1, 0, 50);
    until(() => !row(), 0, -1);
  };
  return {
    ctx,
    db,
    hooks,
    d,
    prepare,
    actor,
    row,
    state,
    command,
    move,
    enter,
    until,
    mid,
    completeUp,
    setPermission: (v: boolean) => (permission = v),
    setAdmission: (v: boolean) => (admitted = v),
    setIncompatible: (v: boolean) => (incompatible = v),
    egress: () => egress,
    combat: () => combat,
  };
}

test("ordinary accepted intent climbs17 physical risers, changes deck only on landing and then walks back down", () => {
  const f = fixture();
  expect(f.enter()).toBe(true);
  expect(f.combat()).toBe(1);
  const anchor = { ...f.db.character.id.find("actor") };
  f.mid();
  expect(f.db.constructionLocation.characterId.find("actor").deckId).toBe(
    f.d.stairRoom.lowerDeckId,
  );
  expect(f.db.character.id.find("actor")).toEqual(anchor);
  expect(f.row().acceptedZ).toBe(1.875);
  f.until(() => f.row().acceptedY >= 7, 0, 1, 50);
  f.until(() => f.row().acceptedX >= 5 - 1e-8, 1, 0, 50);
  f.until(() => !f.row(), 0, -1);
  expect(f.db.constructionLocation.characterId.find("actor").deckId).toBe(
    f.d.stairRoom.upperDeckId,
  );
  expect(f.db.constructionLocation.characterId.find("actor").revision).toBe(2n);
  expect([...f.db.constructionStairReservation.iter()]).toEqual([]);
  f.command(0, -1);
  expect(f.enter()).toBe(false); // outward egress never immediately re-enters
  f.command(0, 1);
  expect(f.enter()).toBe(true);
  f.mid();
  f.until(() => f.row().acceptedY >= 7, 0, 1, 50);
  f.until(() => f.row().acceptedX <= 3 + 1e-8, -1, 0, 50);
  f.until(() => !f.row(), 0, -1);
  expect(f.db.constructionLocation.characterId.find("actor").deckId).toBe(
    f.d.stairRoom.lowerDeckId,
  );
  expect([...f.db.constructionStairAudit.iter()]).toHaveLength(2);
});

test("empty worlds and supported idle stairs perform no clock or repeated row writes", () => {
  const f = fixture();
  expect(stepConstructionStairs(f.ctx, f.hooks)).toBe(0);
  f.enter();
  f.mid();
  f.move(0, 0);
  // Allow intent to become stale without changing its sequence/receipt.
  f.ctx.timestamp.microsSinceUnixEpoch += 1000000n;
  stepConstructionStairs(f.ctx, f.hooks);
  const before = f.db.constructionStairWalk.writes();
  for (let n = 0; n < 100; n++) {
    f.ctx.timestamp.microsSinceUnixEpoch += 50000n;
    expect(stepConstructionStairs(f.ctx, f.hooks)).toBe(0);
  }
  expect(f.db.constructionStairWalk.writes()).toBe(before);
});

test.each([
  "permission",
  "admission",
  "incompatible",
  "stale",
  "foreign",
  "not-landing",
] as const)("new entry rejects %s", (kind) => {
  const f = fixture();
  if (kind === "permission") f.setPermission(false);
  if (kind === "admission") f.setAdmission(false);
  if (kind === "incompatible") f.setIncompatible(true);
  if (kind === "stale") f.ctx.timestamp.microsSinceUnixEpoch += 1000000n;
  if (kind === "foreign")
    f.db.character.id.update({
      ...f.db.character.id.find("actor"),
      owner: other,
    });
  if (kind === "not-landing")
    f.db.character.id.update({ ...f.db.character.id.find("actor"), localX: 7 });
  expect(f.enter()).toBe(false);
  expect(f.row()).toBeUndefined();
});

test("disconnect during a riser physically returns only that step, retains support/reservation and resumes after reconnect", () => {
  const f = fixture();
  f.enter();
  f.until(
    () => !!f.state()?.pending && f.state().pending.distanceM > 0.08,
    0,
    1,
  );
  const before = f.row(),
    launch = f.state().pending.launchM;
  f.db.character.id.update({
    ...f.db.character.id.find("actor"),
    connected: false,
  });
  f.ctx.timestamp.microsSinceUnixEpoch += 9000000000n;
  stepConstructionStairs(f.ctx, f.hooks);
  expect(
    Math.hypot(
      f.row().acceptedX - before.acceptedX,
      f.row().acceptedY - before.acceptedY,
      f.row().acceptedZ - before.acceptedZ,
    ),
  ).toBeLessThanOrEqual(0.1000001);
  f.until(() => !f.state()?.pending, 0, 0, 30);
  expect([f.row().acceptedX, f.row().acceptedY, f.row().acceptedZ]).toEqual(
    launch,
  );
  expect([...f.db.constructionStairReservation.iter()]).toHaveLength(1);
  f.db.character.id.update({
    ...f.db.character.id.find("actor"),
    connected: true,
  });
  f.completeUp();
  expect(f.egress()).toBe(0);
});

test.each(["mid-riser", "supported"] as const)(
  "grant loss at %s allows only qualified egress and no reentry",
  (where) => {
    const f = fixture();
    f.enter();
    if (where === "mid-riser")
      f.until(
        () => !!f.state()?.pending && f.state().pending.distanceM > 0.08,
        0,
        1,
      );
    else f.mid();
    f.setPermission(false);
    f.move(0, 1);
    expect(f.row().egressOnly).toBe(true);
    expect(ownConstructionStairWalks(f.ctx)).toHaveLength(1);
    f.until(() => !f.state()?.pending, 0, 0, 30);
    f.completeUp();
    expect(f.egress()).toBe(1);
    expect(f.db.constructionLocation.characterId.find("actor").deckId).toBe(
      f.d.stairRoom.upperDeckId,
    );
    f.command(0, 1);
    expect(f.enter()).toBe(false);
    expect(ownConstructionStairWalks(f.ctx)).toEqual([]);
  },
);

test("admission/input lease loss stops despite workspace permission and same-sequence cleared motion recovers safely", () => {
  const f = fixture();
  f.enter();
  f.mid();
  f.setAdmission(false);
  f.move(0, 1);
  const p = [f.row().acceptedX, f.row().acceptedY, f.row().acceptedZ];
  for (let n = 0; n < 5; n++) f.move(1, 0);
  expect([f.row().acceptedX, f.row().acceptedY, f.row().acceptedZ]).toEqual(p);
  f.setAdmission(true);
  const input = f.db.input.characterId.find("actor");
  f.db.input.characterId.update({ ...input, dx: 0, dy: 0, updatedMicros: 0n });
  f.ctx.timestamp.microsSinceUnixEpoch += 50000n;
  stepConstructionStairs(f.ctx, f.hooks);
  expect(f.row().phase).not.toBe("blocked");
  f.completeUp();
});

test("foreign projection is empty; reservation blocks full swept crossing and actor/instance actions", () => {
  const f = fixture();
  f.enter();
  f.actor("other", "instance", f.d.stairRoom.lowerDeckId, 0.5, 2.75);
  expect(
    constructionStairPositionAllowed(
      f.ctx,
      "other",
      "instance",
      f.d.stairRoom.lowerDeckId,
      7,
      2.75,
    ),
  ).toBe(false);
  expect(
    constructionStairPositionAllowed(
      f.ctx,
      "other",
      "instance",
      f.d.stairRoom.lowerDeckId,
      0.5,
      1,
    ),
  ).toBe(true);
  expect(() => requireNoConstructionStair(f.ctx, "actor")).toThrow();
  expect(() => requireNoReservedStairInstance(f.ctx, "instance")).toThrow();
  f.ctx.sender = other;
  expect(ownConstructionStairWalks(f.ctx)).toEqual([]);
});

test("occupied destination or disconnected body prevents new admission without overlap", () => {
  const f = fixture();
  f.actor("other", "instance", f.d.stairRoom.upperDeckId, 5, 2.75);
  f.db.character.id.update({
    ...f.db.character.id.find("other"),
    connected: false,
  });
  expect(f.enter()).toBe(true);
  expect(f.row()).toBeUndefined();
  expect([...f.db.constructionStairReservation.iter()]).toEqual([]);
});

test("changed geometry holds only its stair, preserves accepted position and does not rewrite the same error", () => {
  const f = fixture(),
    b = f.prepare("second");
  f.actor("second-actor", "second", b.stairRoom.lowerDeckId);
  f.enter();
  tryEnterConstructionStair(f.ctx, f.hooks, "second-actor");
  const before = f.row(),
    i = f.db.constructionInstance.id.find("instance");
  f.db.constructionInstance.id.update({
    ...i,
    documentJson: i.documentJson + " ",
  });
  f.move(0, 1, "second-actor");
  expect(f.row().phase).toBe("blocked");
  expect(f.row().acceptedZ).toBe(before.acceptedZ);
  const rev = f.row().revision;
  f.move(0, 1, "second-actor");
  expect(f.row().revision).toBe(rev);
  expect(f.row("second-actor").acceptedY).toBeGreaterThan(2.75);
});

test("serialized active rows resume without replaying historical time or changing character identity", () => {
  const f = fixture();
  f.enter();
  f.mid();
  const original = f.row();
  f.db.constructionStairWalk.characterId.update({
    ...original,
    stateJson: JSON.stringify(JSON.parse(original.stateJson)),
  });
  f.ctx.timestamp.microsSinceUnixEpoch += 9000000000n;
  f.command(1, 0);
  stepConstructionStairs(f.ctx, f.hooks);
  expect(f.row().characterId).toBe("actor");
  expect(f.row().visitId).toBe("visit-actor");
  expect(f.row().acceptedX - original.acceptedX).toBeLessThanOrEqual(0.0500001);
});

test("reversing away before the first riser releases the already-safe landing without trapping the actor", () => {
  const f = fixture();
  f.enter();
  f.move(0, -1);
  expect(f.row()).toBeUndefined();
  expect([...f.db.constructionStairReservation.iter()]).toEqual([]);
  expect(f.db.constructionLocation.characterId.find("actor").deckId).toBe(
    f.d.stairRoom.lowerDeckId,
  );
});

test("storage or safe-egress-hook failure propagates for transaction rollback rather than being swallowed as a blocked actor", () => {
  const f = fixture();
  f.enter();
  f.setPermission(false);
  f.hooks.completeSafeEgress = () => {
    throw Error("injected exit failure");
  };
  expect(() => f.move(0, 0)).toThrow("injected exit failure");
  // In-memory fake deliberately has no transaction rollback; actual SpacetimeDB
  // must roll back all writes. This test proves the adapter does not swallow it.
});

function bindRealWorldHooks(f: ReturnType<typeof fixture>) {
  const db = f.db;
  db.character.by_owner = {
    filter: function* (owner: Identity) {
      for (const actor of db.character.iter())
        if (actor.owner.isEqual(owner)) yield actor;
    },
  };
  db.authSession = table("connectionId", { by_owner: "owner" });
  db.connectionPresence = table("connectionId");
  db.inputControl = table("characterId");
  db.retiredIdentity = table("source");
  db.couchSeat = table("characterId");
  db.station = table("shipId");
  db.combatAim = table("characterId");
  db.constructionTraversal = table("characterId", { by_owner: "owner" });
  db.constructionReceipt = table("id", { by_principal: "principal" });
  db.constructionGrant = table("id", { by_principal: "principal" });
  db.ship = table();
  db.authSession.insert({
    connectionId: "live",
    owner,
    game: true,
    expiresMicros: 999999999999n,
    kind: "oidc",
  });
  db.connectionPresence.insert({ connectionId: "live", owner });
  db.inputControl.insert({
    characterId: "actor",
    owner,
    connectionId: "live",
    sequence: 1n,
  });
  db.constructionGrant.insert({
    id: "spawn",
    principal: owner,
    workspaceId: "workspace",
    capability: "instance.spawn",
    expiresMicros: 999999999999n,
    revoked: false,
    revision: 1n,
  });
  db.constructionGrant.insert({ ...db.constructionGrant.id.find("spawn"), id: "read", capability: "draft.read" });
  db.ship.insert({ id: "safe-return-ship", owner });
  const visit = db.constructionLocation.characterId.find("actor");
  db.constructionLocation.characterId.update({
    ...visit,
    returnShipId: "safe-return-ship",
    returnX: 1.25,
    returnY: 2.5,
  });
  db.combatAim.insert({ characterId: "actor", active: true });
  f.ctx.connectionId = { toHexString: () => "live" };
  Object.assign(f.hooks, createConstructionStairWorldHooks(f.ctx));
}

test("minimum egress projection exposes only exact pinned geometry identity after grant loss", () => {
  const f = fixture();
  bindRealWorldHooks(f);
  f.enter();
  f.mid();
  expect(admittedStairEgressGeometry(f.ctx)).toEqual([]);
  f.db.constructionGrant.id.update({
    ...f.db.constructionGrant.id.find("spawn"),
    revoked: true,
  });
  f.move(0, 0);
  const [v] = admittedStairEgressGeometry(f.ctx);
  expect(v).toBeDefined();
  expect(Object.keys(v).sort()).toEqual(
    [
      "characterId",
      "instanceId",
      "stairId",
      "visitId",
      "lowerDeckId",
      "upperDeckId",
      "sourceDeckId",
      "adapterId",
      "adapterRevision",
      "auditSha256",
      "proofHash",
    ].sort(),
  );
  expect(v.auditSha256).toBe(
    "8df56649474fa8379af3a2c678716fc1f80406e9f9457e85498598f6a0be9831",
  );
  expect(v.visitId).toBe("visit-actor");
  expect(v.proofHash).toBe(f.state().proofHash);
  const serialized = JSON.stringify(v);
  for (const forbidden of [
    "documentJson",
    "inventory",
    "returnShipId",
    "safe-return-ship",
    "returnX",
    "workspace",
    "fittings",
    "parts",
    "supports",
  ])
    expect(serialized).not.toContain(forbidden);
  expect(admittedStairWalks(f.ctx)[0].visitId).toBe("visit-actor");
  const sessions = f.db.authSession.connectionId.find("live");
  f.db.authSession.connectionId.update({ ...sessions, game: false });
  expect(admittedStairEgressGeometry(f.ctx)).toEqual([]);
  expect(admittedStairWalks(f.ctx)).toEqual([]);
});

test.each(["foreign", "visit", "proof", "reservation", "instance"] as const)(
  "minimum egress geometry fails closed for changed %s",
  (kind) => {
    const f = fixture();
    bindRealWorldHooks(f);
    f.enter();
    f.mid();
    f.db.constructionGrant.id.update({
      ...f.db.constructionGrant.id.find("spawn"),
      revoked: true,
    });
    f.move(0, 0);
    expect(ownConstructionStairEgressGeometry(f.ctx)).toHaveLength(1);
    if (kind === "foreign") f.ctx.sender = other;
    if (kind === "visit")
      f.db.constructionLocation.characterId.update({
        ...f.db.constructionLocation.characterId.find("actor"),
        visitId: "new-visit",
      });
    if (kind === "proof") {
      const state = f.state();
      state.proofHash = "fake";
      f.db.constructionStairWalk.characterId.update({
        ...f.row(),
        stateJson: JSON.stringify(state),
      });
    }
    if (kind === "reservation")
      f.db.constructionStairReservation.stairId.delete(f.row().stairId);
    if (kind === "instance") {
      const i = f.db.constructionInstance.id.find("instance");
      f.db.constructionInstance.id.update({ ...i, revision: 2n });
    }
    expect(ownConstructionStairEgressGeometry(f.ctx)).toEqual([]);
  },
);

test("actual world hooks use admitted input holder and leaveReview receipt/return location on grant-loss landing", () => {
  const f = fixture();
  bindRealWorldHooks(f);
  f.enter();
  expect(f.db.combatAim.characterId.find("actor").active).toBe(false);
  f.mid();
  f.db.constructionGrant.id.update({
    ...f.db.constructionGrant.id.find("spawn"),
    revoked: true,
  });
  f.move(0, 0);
  expect(f.row().egressOnly).toBe(true);
  const actorId = f.db.character.id.find("actor").id,
    walkId = f.row().id;
  f.completeUp();
  const actor = f.db.character.id.find("actor");
  expect(actor.id).toBe(actorId);
  expect(actor.shipId).toBe("safe-return-ship");
  expect([actor.localX, actor.localY]).toEqual([1.25, 2.5]);
  expect(f.db.constructionLocation.characterId.find("actor")).toBeUndefined();
  expect(
    f.db.constructionStairReservation.stairId.find(f.d.stairRoom.stairId),
  ).toBeUndefined();
  const receipts = [...f.db.constructionReceipt.iter()] as any[];
  expect(receipts).toHaveLength(1);
  expect(receipts[0].id).toBe(owner.toHexString() + ":stair-egress:" + walkId);
  expect(receipts[0].resultId).toBe("safe-return-ship");
  expect(f.db.constructionStairAudit.id.find(walkId).outcome).toBe(
    "egress-exited",
  );
  expect(admittedStairEgressGeometry(f.ctx)).toEqual([]);
  expect(f.enter()).toBe(false);
});

test("actual input lease revocation prevents stair motion even when another game session remains", () => {
  const f = fixture();
  bindRealWorldHooks(f);
  f.enter();
  f.mid();
  const prior = f.row();
  f.db.authSession.insert({
    connectionId: "other-tab",
    owner,
    game: true,
    expiresMicros: 999999999999n,
    kind: "oidc",
  });
  f.db.connectionPresence.connectionId.delete("live");
  f.move(1, 0);
  expect(f.db.inputControl.characterId.find("actor")).toBeUndefined();
  expect([f.row().acceptedX, f.row().acceptedY, f.row().acceptedZ]).toEqual([
    prior.acceptedX,
    prior.acceptedY,
    prior.acceptedZ,
  ]);
});

test("simultaneous grant/admission loss on the source landing holds safely without failing the world tick", () => {
  const f = fixture();
  bindRealWorldHooks(f);
  f.enter();
  f.db.constructionGrant.id.update({
    ...f.db.constructionGrant.id.find("spawn"),
    revoked: true,
  });
  f.db.authSession.connectionId.update({
    ...f.db.authSession.connectionId.find("live"),
    game: false,
  });
  for (let n = 0; n < 5; n++) expect(() => f.move(0, 0)).not.toThrow();
  expect(f.row().phase).toBe("stopped");
  expect(f.row().egressOnly).toBe(true);
  expect([...f.db.constructionStairReservation.iter()]).toHaveLength(1);
  expect(f.db.character.id.find("actor").shipId).toBe("instance");
  f.db.authSession.connectionId.update({
    ...f.db.authSession.connectionId.find("live"),
    game: true,
  });
  if (!f.db.inputControl.characterId.find("actor"))
    f.db.inputControl.insert({
      characterId: "actor",
      owner,
      connectionId: "live",
      sequence: 1n,
    });
  f.move(0, 0);
  expect(f.row()).toBeUndefined();
  expect(f.db.character.id.find("actor").shipId).toBe("safe-return-ship");
});

test("missing safe return ship holds the supported landing instead of repeatedly throwing the global tick", () => {
  const f = fixture();
  bindRealWorldHooks(f);
  f.enter();
  f.db.constructionGrant.id.update({
    ...f.db.constructionGrant.id.find("spawn"),
    revoked: true,
  });
  f.db.ship.id.delete("safe-return-ship");
  for (let n = 0; n < 4; n++) expect(() => f.move(0, 0)).not.toThrow();
  expect(f.row().phase).toBe("blocked");
  expect(f.row().interruption).toBe("safe-egress-unavailable");
  expect(f.db.constructionLocation.characterId.find("actor").revision).toBe(1n);
  f.db.ship.insert({ id: "safe-return-ship", owner });
  f.move(0, 0);
  expect(f.db.character.id.find("actor").shipId).toBe("safe-return-ship");
});

test("integrated ordinary walking enters native stairs, suppresses source-anchor motion and uses native wall collision", () => {
  const f = fixture();
  bindRealWorldHooks(f);
  f.db.constructionDoor = table("id", { by_deck: "deckId" });
  const actor = () => f.db.character.id.find("actor");
  const input = () => f.db.input.characterId.find("actor");
  expect(stepActor(f.ctx, actor(), input(), f.hooks)).toBe(true);
  expect(f.row()).toBeDefined();
  const start = { ...actor() };
  expect(
    stepActor(f.ctx, actor(), { dx: 1, dy: 1, sprint: true }, f.hooks),
  ).toBe(true);
  expect(actor()).toEqual(start);
});

test("grant revocation suppresses full instance and deck documents while own accepted stair pose remains", () => {
  const f = fixture();
  bindRealWorldHooks(f);
  f.db.constructionInstance.by_owner = {
    filter: function* (p: Identity) {
      for (const row of f.db.constructionInstance.iter())
        if (row.owner.isEqual(p)) yield row;
    },
  };
  f.db.constructionDeck.by_instance = {
    filter: function* (id: string) {
      for (const row of f.db.constructionDeck.iter())
        if (row.instanceId === id) yield row;
    },
  };
  expect(ownInstances(f.ctx)).toHaveLength(1);
  expect(ownDecks(f.ctx)).toHaveLength(2);
  expect(tryEnterConstructionStair(f.ctx, f.hooks, "actor")).toBe(true);
  f.db.constructionGrant.id.update({
    ...f.db.constructionGrant.id.find("read"),
    revoked: true,
  });
  expect(ownInstances(f.ctx)).toHaveLength(0);
  expect(ownDecks(f.ctx)).toHaveLength(0);
  expect(admittedStairWalks(f.ctx)).toHaveLength(1);
});

test("reconnected input lease can resume using sequence one without waiting for the previous tab cursor", () => {
  const f = fixture();
  bindRealWorldHooks(f);
  expect(f.enter()).toBe(true);
  f.mid();
  const supported = f.row().acceptedY;
  expect(f.state().inputSequence).not.toBe("0");
  const lease = f.db.inputControl.characterId.find("actor");
  f.db.connectionPresence.insert({ connectionId: "replacement", owner });
  f.db.authSession.insert({
    connectionId: "replacement",
    owner,
    game: true,
    expiresMicros: 999999999999n,
  });
  f.db.inputControl.characterId.update({
    ...lease,
    connectionId: "replacement",
    sequence: 1n,
  });
  f.db.input.characterId.update({
    ...f.db.input.characterId.find("actor"),
    sequence: 1n,
    dx: 0,
    dy: 1,
    updatedMicros: f.ctx.timestamp.microsSinceUnixEpoch,
  });
  f.ctx.timestamp.microsSinceUnixEpoch += 50000n;
  stepConstructionStairs(f.ctx, f.hooks);
  expect(f.row().acceptedY).toBeGreaterThan(supported);
  expect(JSON.parse(f.row().stateJson).inputConnectionId).toBe("replacement");
});

test("supported grant-loss egress does not rewrite its pose for idle input keepalives", () => {
  const f = fixture();
  bindRealWorldHooks(f);
  expect(f.enter()).toBe(true);
  f.mid();
  f.db.constructionGrant.id.update({
    ...f.db.constructionGrant.id.find("spawn"),
    revoked: true,
  });
  f.move(0, 0);
  const position = [f.row().acceptedX, f.row().acceptedY, f.row().acceptedZ];
  const writes = f.db.constructionStairWalk.writes();
  for (let n = 0; n < 20; n++) {
    f.ctx.timestamp.microsSinceUnixEpoch += 950000n;
    f.move(0, 0);
  }
  expect([f.row().acceptedX, f.row().acceptedY, f.row().acceptedZ]).toEqual(
    position,
  );
  expect(f.db.constructionStairWalk.writes()).toBe(writes);
  f.move(0, 1);
  expect(f.row().acceptedY).toBeGreaterThan(position[1]);
});


test("read-only grant loss denies ordinary walking while spawn permission survives", () => {
  const f = fixture();
  bindRealWorldHooks(f);
  expect(f.hooks.mayEnter(owner, "workspace")).toBe(true);
  f.db.constructionGrant.id.update({ ...f.db.constructionGrant.id.find("read"), revoked: true });
  expect(f.db.constructionGrant.id.find("spawn").revoked).toBe(false);
  expect(f.hooks.mayEnter(owner, "workspace")).toBe(false);
  const before = { ...f.db.character.id.find("actor") };
  expect(stepActor(f.ctx, before, { dx: 0, dy: 1, sprint: false }, f.hooks)).toBe(true);
  expect(f.db.character.id.find("actor")).toEqual(before);
});
