import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
vi.mock("spacetimedb/server", () => ({
  SenderError: class extends Error {},
  t: new Proxy(
    {},
    {
      get: () => () => ({
        primaryKey() {
          return this;
        },
      }),
    },
  ),
}));
vi.mock("./construction-pilot-authority", () => ({
  recoverConstructionPilotAuthority: vi.fn(),
}));
vi.mock("./combat", () => ({ clearAim: vi.fn() }));
vi.mock("./interactions", () => ({ leaveCouch: vi.fn() }));
import {
  registerSession,
  bindGameSession,
  requestIdentityLink,
  acceptIdentityLink,
  requireGame,
  canReadGame,
  expireSessions,
  previousReceipt,
} from "./auth";
import { GAME_AUTH_POLICY as policy } from "../../content/src/auth-policy";
function fixture() {
  const source = Identity.fromString("1".repeat(64)),
    target = Identity.fromString("2".repeat(64));
  function table(key: string, indexes: Record<string, string> = {}) {
    const rows: any[] = [];
    const result: any = {
      rows,
      iter: () => rows,
      insert: (row: any) => {
        rows.push(row);
        return row;
      },
    };
    result[key] = {
      find: (value: any) => rows.find((r) => String(r[key]) === String(value)),
      update: (row: any) => {
        const i = rows.findIndex((r) => String(r[key]) === String(row[key]));
        if (i < 0) throw Error("missing row");
        rows[i] = row;
      },
      delete: (value: any) => {
        const i = rows.findIndex((r) => String(r[key]) === String(value));
        if (i >= 0) rows.splice(i, 1);
      },
    };
    for (const [name, column] of Object.entries(indexes))
      result[name] = {
        filter: (value: any) =>
          rows.filter((r) => String(r[column]) === String(value)),
        find: (value: any) =>
          rows.find((r) => String(r[column]) === String(value)),
      };
    return result;
  }
  const db: any = {
    constructionPilotSeat: table("characterId", { by_owner: "owner" }),
    worldAdmission: table("characterId", { by_owner: "owner" }),
    constructionInstance: table("id", { by_owner: "owner" }),
    constructionGrant: table("id", { by_principal: "principal" }),
    constructionReceipt: table("id", { by_principal: "principal" }),
    authSession: table("connectionId", { by_owner: "owner" }),
    connectionPresence: table("connectionId", { by_owner: "owner" }),
    retiredIdentity: table("source", { by_target: "target" }),
    identityLink: table("id", {
      by_source: "source",
      by_target: "target",
      operationKey: "operationKey",
    }),
    character: table("id", { by_owner: "owner" }),
    ship: table("id", { by_owner: "owner" }),
    editReceipt: table("id", { by_owner: "owner" }),
    station: table("id", { shipId: "shipId" }),
    input: table("characterId"),
  };
  db.character.insert({
    id: "character",
    owner: source,
    shipId: "ship",
    name: "Original",
    connected: true,
    sprinting: true,
  });
  db.ship.insert({ id: "ship", owner: source, revision: 8n });
  db.station.insert({ id: "helm", shipId: "ship", occupantId: "character" });
  db.input.insert({
    characterId: "character",
    throttle: 1,
    turn: 1,
    dx: 1,
    dy: 1,
    sprint: true,
  });
  db.editReceipt.insert({
    id: source.toHexString() + ":original-edit",
    owner: source,
    shipId: "ship",
    revision: 8n,
  });
  const context = (owner: Identity, oidc: boolean) =>
    ({
      db,
      sender: owner,
      connectionId: {
        toHexString: () =>
          oidc ? owner.toHexString().slice(0, 32) : owner.toHexString(),
      },
      timestamp: { microsSinceUnixEpoch: 1000000000n },
      newUuidV4: () => ({
        toString: () => `link-${db.identityLink.rows.length}`,
      }),
      senderAuth: {
        jwt: {
          issuer: oidc ? policy.issuer : "localhost",
          subject: owner.toHexString(),
          audience: [oidc ? policy.gameAudience : "spacetimedb"],
          fullPayload: oidc ? { exp: 2000 } : {},
        },
      },
    }) as unknown as Parameters<typeof registerSession>[0];
  const a = context(source, false),
    b = context(target, true);
  registerSession(a);
  registerSession(b);
  db.connectionPresence.insert({
    connectionId: b.connectionId!.toHexString(),
    owner: target,
  });
  bindGameSession(b, { connectionId: b.connectionId!.toHexString() });
  return {
    a,
    b,
    db,
    source,
    target,
    request: () =>
      requestIdentityLink(a, {
        targetIdentity: target.toHexString(),
        expectedCharacterId: "character",
        operationId: "request",
      }),
  };
}
test("two verified sessions link the existing owner without touching inventory; retired source loses access", () => {
  const f = fixture();
  f.request();
  f.request();
  expect(f.db.identityLink.rows).toHaveLength(1);
  acceptIdentityLink(f.b, { requestId: "link-0", operationId: "accept" });
  acceptIdentityLink(f.b, { requestId: "link-0", operationId: "accept" });
  expect(f.db.character.rows[0]).toMatchObject({
    id: "character",
    owner: f.target,
    connected: true,
    sprinting: false,
  });
  expect(f.db.ship.rows[0]).toMatchObject({
    id: "ship",
    owner: f.target,
    revision: 8n,
  });
  expect(f.db.station.rows[0].occupantId).toBeUndefined();
  expect(f.db.input.rows[0].throttle).toBe(0);
  expect(previousReceipt(f.b, "original-edit")?.id).toBe(
    f.source.toHexString() + ":original-edit",
  );
  expect(f.db.identityLink.rows[0].receiptIdsJson).toContain("original-edit");
  expect(canReadGame(f.a)).toBe(false);
  expect(() => requireGame(f.a)).toThrow();
  expect(() => registerSession(f.a)).toThrow();
  expect(() =>
    acceptIdentityLink(f.b, { requestId: "link-0", operationId: "another" }),
  ).toThrow();
  // Inventory, appearance and storage tables are absent from this adapter fixture:
  // successful transfer cannot rewrite, replace or regrant those character-keyed rows.
});
test("link acceptance rejects wrong owner, stale request, disconnected source and occupied target before transfer", () => {
  for (const problem of ["wrong", "expired", "disconnected", "occupied"]) {
    const f = fixture();
    f.request();
    if (problem === "expired")
      Object.assign(f.b.timestamp, { microsSinceUnixEpoch: 1300000000n });
    if (problem === "disconnected")
      f.db.authSession.connectionId.delete(f.source.toHexString());
    if (problem === "occupied")
      f.db.character.insert({ id: "other", owner: f.target });
    expect(() =>
      acceptIdentityLink(problem === "wrong" ? f.a : f.b, {
        requestId: "link-0",
        operationId: "accept",
      }),
    ).toThrow();
    expect(f.db.character.rows[0].owner).toBe(f.source);
    expect(f.db.ship.rows[0].owner).toBe(f.source);
    expect(f.db.retiredIdentity.rows).toHaveLength(0);
  }
});
test("expiry removes view admission and active controls; dashboard audience never receives game access", () => {
  const f = fixture();
  f.request();
  acceptIdentityLink(f.b, { requestId: "link-0", operationId: "accept" });
  Object.assign(f.b.timestamp, { microsSinceUnixEpoch: 2000000000n });
  expect(() => requireGame(f.b)).toThrow();
  expireSessions(f.b);
  expect(canReadGame(f.b)).toBe(false);
  expect(f.db.character.rows[0].connected).toBe(false);
  const other = fixture();
  Object.assign(other.b.senderAuth.jwt!, {
    audience: [policy.dashboardAudience],
  });
  expect(() => registerSession(other.b)).toThrow();
  expect(() => requireGame(other.b)).toThrow();
});
test("construction state cannot be orphaned by a legacy identity link or merged into an occupied target", () => {
  for (const domain of [
    "constructionInstance",
    "constructionGrant",
    "constructionReceipt",
  ] as const) {
    const f = fixture(),
      row =
        domain === "constructionInstance"
          ? { id: "constructed", owner: f.source }
          : { id: "authoring", principal: f.source };
    f.db[domain].insert(row);
    expect(() => f.request()).toThrow("Construction");
    expect(f.db.character.rows[0].owner).toBe(f.source);
    const later = fixture();
    later.request();
    later.db[domain].insert(
      domain === "constructionInstance"
        ? { id: "constructed", owner: later.source }
        : { id: "authoring", principal: later.source },
    );
    expect(() =>
      acceptIdentityLink(later.b, {
        requestId: "link-0",
        operationId: "accept",
      }),
    ).toThrow("Construction");
    expect(later.db.retiredIdentity.rows).toEqual([]);
  }
  const target = fixture();
  target.request();
  target.db.constructionInstance.insert({
    id: "target-instance",
    owner: target.target,
  });
  expect(() =>
    acceptIdentityLink(target.b, {
      requestId: "link-0",
      operationId: "accept",
    }),
  ).toThrow("world state");
});

function bindingFixture() {
  const f = fixture();
  f.db.authSession.connectionId.delete(f.b.connectionId!.toHexString());
  f.db.connectionPresence.connectionId.delete(f.b.connectionId!.toHexString());
  const connectionId = "b".repeat(32);
  Object.assign(f.b, { connectionId: { toHexString: () => connectionId } });
  Object.assign(f.b.senderAuth.jwt!.fullPayload, {
    exp: 1060,
    hex_identity: f.target.toHexString(),
  });
  registerSession(f.b);
  f.db.connectionPresence.insert({ connectionId, owner: f.target });
  const http = {
    ...f.b,
    connectionId: { toHexString: () => "c".repeat(32) },
    senderAuth: {
      jwt: {
        ...f.b.senderAuth.jwt!,
        fullPayload: { exp: 1300 },
      },
    },
  } as unknown as Parameters<typeof bindGameSession>[0];
  return { ...f, connectionId, http };
}

test("original verified HTTP token binds exact socket past ticket expiry, not provider expiry", () => {
  const f = bindingFixture();
  bindGameSession(f.http, { connectionId: f.connectionId });
  expect(f.db.authSession.connectionId.find(f.connectionId).expiresMicros).toBe(
    1300000000n,
  );
  Object.assign(f.b.timestamp, { microsSinceUnixEpoch: 1070000000n });
  expireSessions(f.b);
  expect(requireGame(f.b).kind).toBe("oidc");
  Object.assign(f.b.timestamp, { microsSinceUnixEpoch: 1300000000n });
  expect(() => requireGame(f.b)).toThrow();
  expireSessions(f.b);
  expect(f.db.authSession.connectionId.find(f.connectionId)).toBeUndefined();
});

test("binding is idempotent and always uses this proof's exact verified expiry", () => {
  const f = bindingFixture();
  bindGameSession(f.http, { connectionId: f.connectionId });
  const first = f.db.authSession.connectionId.find(f.connectionId);
  bindGameSession(f.http, { connectionId: f.connectionId });
  expect(f.db.authSession.connectionId.find(f.connectionId)).toBe(first);
  Object.assign(f.http.senderAuth.jwt!.fullPayload, { exp: 1400 });
  bindGameSession(f.http, { connectionId: f.connectionId });
  Object.assign(f.http.senderAuth.jwt!.fullPayload, { exp: 1300 });
  bindGameSession(f.http, { connectionId: f.connectionId });
  expect(f.db.authSession.connectionId.find(f.connectionId).expiresMicros).toBe(
    1300000000n,
  );
});

test("near-expiry provider proof shortens a longer bootstrap ticket", () => {
  const f = bindingFixture();
  Object.assign(f.http.senderAuth.jwt!.fullPayload, { exp: 1010 });
  bindGameSession(f.http, { connectionId: f.connectionId });
  expect(f.db.authSession.connectionId.find(f.connectionId).expiresMicros).toBe(
    1010000000n,
  );
  Object.assign(f.b.timestamp, { microsSinceUnixEpoch: 1010000000n });
  expect(() => requireGame(f.b)).toThrow();
});

test("binding rejects other principals, closed sockets, host tickets, invalid claims and retired identities", () => {
  for (const issue of [
    "foreign",
    "closed",
    "socket",
    "audience",
    "issuer",
    "expired",
    "retired",
    "invalid-id",
  ]) {
    const f = bindingFixture();
    if (issue === "foreign") Object.assign(f.http, { sender: f.source });
    if (issue === "closed")
      f.db.connectionPresence.connectionId.delete(f.connectionId);
    if (issue === "audience")
      Object.assign(f.http.senderAuth.jwt!, {
        audience: [policy.dashboardAudience],
      });
    if (issue === "issuer")
      Object.assign(f.http.senderAuth.jwt!, {
        issuer: "https://untrusted.test",
      });
    if (issue === "expired")
      Object.assign(f.http.senderAuth.jwt!.fullPayload, { exp: 1000 });
    if (issue === "retired") f.db.retiredIdentity.insert({ source: f.target });
    expect(() =>
      bindGameSession(issue === "socket" ? f.b : f.http, {
        connectionId: issue === "invalid-id" ? "x" : f.connectionId,
      }),
    ).toThrow();
    expect(
      f.db.authSession.connectionId.find(f.connectionId).expiresMicros,
    ).toBe(1060000000n);
  }
});

test("OIDC bootstrap has no gameplay or view admission until original provider proof", () => {
  const f = bindingFixture();
  expect(f.db.authSession.connectionId.find(f.connectionId).game).toBe(false);
  expect(canReadGame(f.b)).toBe(false);
  expect(() => requireGame(f.b)).toThrow();
  bindGameSession(f.http, { connectionId: f.connectionId });
  expect(canReadGame(f.b)).toBe(true);
  expect(requireGame(f.b).kind).toBe("oidc");
});

test("expired preliminary admission can be restored only while the same owned socket remains present", () => {
  const f = bindingFixture();
  f.db.authSession.connectionId.delete(f.connectionId);
  bindGameSession(f.http, { connectionId: f.connectionId });
  expect(f.db.authSession.connectionId.find(f.connectionId).expiresMicros).toBe(
    1300000000n,
  );
  f.db.connectionPresence.connectionId.delete(f.connectionId);
  expect(() =>
    bindGameSession(f.http, { connectionId: f.connectionId }),
  ).toThrow();
});

test("identity migration cannot strand admitted shared-world ownership", () => {
  const f = fixture();
  f.db.worldAdmission.insert({ characterId: "character", owner: f.source });
  expect(() => f.request()).toThrow(/Shared-world membership/);
  const g = fixture();
  g.request();
  g.db.worldAdmission.insert({ characterId: "character", owner: g.source });
  expect(() =>
    acceptIdentityLink(g.b, { requestId: "link-0", operationId: "accept" }),
  ).toThrow(/Shared-world membership/);
});
