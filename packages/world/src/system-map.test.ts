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
import {
  applySystemMap,
  ownMaps,
  ownMapShips,
  nearbyFieldAsteroids,
} from "./system-map";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import {
  newAsteroidField,
  newSystemMap,
  MAP_WORKSPACE,
} from "@sidereal/content/system-map";
function fixture() {
  const owner = Identity.fromString("1".repeat(64));
  const table = (
    key: string,
    indexes: Record<string, string | string[]> = {},
  ) => {
    const rows = new Map<string, any>();
    return {
      iter: () => rows.values(),
      insert: (r: any) => {
        if (rows.has(r[key])) throw Error("duplicate");
        rows.set(r[key], r);
      },
      [key]: {
        find: (id: any) => rows.get(id),
        update: (r: any) => rows.set(r[key], r),
        delete: (id: any) => rows.delete(id),
      },
      ...Object.fromEntries(
        Object.entries(indexes).map(([name, field]) => [
          name,
          {
            filter: (value: any) =>
              [...rows.values()].filter((r) =>
                Array.isArray(field)
                  ? field.every((f, i) => r[f] === value[i])
                  : r[field] === value,
              ),
          },
        ]),
      ),
    };
  };
  const db: any = {
    worldSystem: table("id"),
    systemMapDefinition: table("id"),
    systemMapEdit: table("id", { by_system: "systemId" }),
    systemBody: table("id", { by_system: "systemId" }),
    bodyWorldMotion: table("bodyId"),
    shipWorldMotion: table("shipId", { by_system: "systemId" }),
    ship: table("id"),
    fieldAsteroid: table("id", {
      by_system: "systemId",
      by_cell: ["systemId", "cellX", "cellY"],
    }),
    constructionGrant: table("id", { by_principal: "principal" }),
    constructionReceipt: table("id", { by_principal: "principal" }),
    worldAdmission: table("characterId", { by_owner: "owner" }),
    character: table("id"),
  };
  for (const capability of ["draft.read", "draft.write"])
    db.constructionGrant.insert({
      id: capability,
      workspaceId: MAP_WORKSPACE,
      principal: owner,
      capability,
      revoked: false,
      expiresMicros: 10000n,
    });
  const ctx: any = {
    db,
    sender: owner,
    timestamp: { microsSinceUnixEpoch: 1n },
  };
  const doc = newSystemMap("system");
  doc.fields = [newAsteroidField("field", 2000, 0)];
  const args = {
    documentJson: JSON.stringify(doc),
    expectedRevision: 0n,
    sourceFingerprint: constructionHash("[]"),
    operationId: "first",
  };
  return { ctx, db, doc, args };
}
test("apply creates a persistent system/population; exact retry does not duplicate; foreign reads empty", () => {
  const f = fixture();
  applySystemMap(f.ctx, f.args);
  expect([...f.db.fieldAsteroid.iter()]).toHaveLength(26);
  expect(ownMaps(f.ctx)).toHaveLength(1);
  expect([...f.db.systemMapEdit.iter()][0].beforeJson).toBe("");
  expect(
    JSON.parse([...f.db.systemMapEdit.iter()][0].afterJson).fields,
  ).toHaveLength(1);
  applySystemMap(f.ctx, f.args);
  expect([...f.db.constructionReceipt.iter()]).toHaveLength(1);
  expect(() =>
    applySystemMap(f.ctx, {
      ...f.args,
      documentJson: JSON.stringify({ ...f.doc, name: "Changed" }),
    }),
  ).toThrow("reused");
  f.ctx.sender = Identity.fromString("2".repeat(64));
  expect(ownMaps(f.ctx)).toEqual([]);
  expect(ownMapShips(f.ctx)).toEqual([]);
  expect(() =>
    applySystemMap(f.ctx, { ...f.args, operationId: "foreign" }),
  ).toThrow("grant");
});
test("stale revisions, changed source and revoked/expired access fail before writes", () => {
  const f = fixture();
  expect(() =>
    applySystemMap(f.ctx, { ...f.args, sourceFingerprint: "stale" }),
  ).toThrow("changed");
  expect([...f.db.worldSystem.iter()]).toHaveLength(0);
  applySystemMap(f.ctx, f.args);
  expect(() =>
    applySystemMap(f.ctx, { ...f.args, operationId: "stale" }),
  ).toThrow("revision");
  f.db.constructionGrant.id.update({
    ...f.db.constructionGrant.id.find("draft.write"),
    revoked: true,
  });
  expect(() => applySystemMap(f.ctx, f.args)).toThrow("grant");
  f.db.constructionGrant.id.update({
    ...f.db.constructionGrant.id.find("draft.write"),
    revoked: false,
  });
  f.ctx.timestamp.microsSinceUnixEpoch = 10001n;
  expect(() => applySystemMap(f.ctx, f.args)).toThrow("grant");
});
test("celestial edits preserve ships and update authoritative cell/height; mismatched body identities fail", () => {
  const f = fixture();
  f.db.worldSystem.insert({ id: "system" });
  const b = {
    id: "planet",
    systemId: "system",
    authoredKey: "Planet",
    kind: "planet",
    radius: 20,
    height: -100,
    appearance: "kept",
  };
  f.db.systemBody.insert(b);
  f.db.bodyWorldMotion.insert({
    bodyId: b.id,
    systemId: "system",
    x: 200,
    y: 200,
    cellX: 0n,
    cellY: 0n,
  });
  const ship = {
    shipId: "ship",
    systemId: "system",
    x: 0,
    y: 0,
    heading: 0,
    serverTick: 1n,
  };
  f.db.shipWorldMotion.insert(ship);
  f.db.ship.insert({ id: "ship", name: "Live ship", owner: "private" });
  const view = ownMaps(f.ctx)[0];
  const doc = JSON.parse(view.documentJson);
  doc.bodies[0].x = 1500;
  doc.bodies[0].height = -300;
  applySystemMap(f.ctx, {
    ...f.args,
    documentJson: JSON.stringify(doc),
    sourceFingerprint: view.sourceFingerprint,
  });
  expect(f.db.bodyWorldMotion.bodyId.find("planet").cellX).toBe(3n);
  expect(f.db.systemBody.id.find("planet").height).toBe(-300);
  expect(f.db.systemBody.id.find("planet").appearance).toBe("kept");
  expect(f.db.shipWorldMotion.shipId.find("ship")).toEqual(ship);
  expect(ownMapShips(f.ctx)[0]).not.toHaveProperty("owner");
  doc.bodies = [];
  expect(() =>
    applySystemMap(f.ctx, {
      ...f.args,
      documentJson: JSON.stringify(doc),
      expectedRevision: 1n,
      operationId: "identity",
      sourceFingerprint: ownMaps(f.ctx)[0].sourceFingerprint,
    }),
  ).toThrow("identity");
});
test("population safety rejection leaves no changes; nearby view redacts resources", () => {
  const f = fixture();
  f.db.shipWorldMotion.insert({
    shipId: "ship",
    systemId: "system",
    x: 2000,
    y: 0,
  });
  f.doc.fields[0].width = 100;
  f.doc.fields[0].length = 100;
  f.doc.fields[0].depth = 100;
  f.doc.fields[0].density = 1000;
  expect(() =>
    applySystemMap(f.ctx, { ...f.args, documentJson: JSON.stringify(f.doc) }),
  ).toThrow("safety");
  expect([...f.db.worldSystem.iter()]).toHaveLength(0);
  expect([...f.db.fieldAsteroid.iter()]).toHaveLength(0);
  f.db.worldAdmission.insert({
    characterId: "actor",
    owner: f.ctx.sender,
    shipId: "ship",
    systemId: "system",
  });
  f.db.character.insert({
    id: "actor",
    owner: f.ctx.sender,
    connected: true,
    shipId: "ship",
  });
  f.db.fieldAsteroid.insert({
    id: "rock",
    systemId: "system",
    x: 2001,
    y: 0,
    height: 0,
    seed: 1,
    radius: 2,
    cellX: 5n,
    cellY: 0n,
    resourcesJson: '["uranium"]',
  });
  expect(nearbyFieldAsteroids(f.ctx)).toHaveLength(1);
  expect(nearbyFieldAsteroids(f.ctx)[0]).not.toHaveProperty("resourcesJson");
  f.db.character.id.update({
    id: "actor",
    owner: f.ctx.sender,
    connected: false,
    shipId: "ship",
  });
  expect(nearbyFieldAsteroids(f.ctx)).toEqual([]);
});

test("authorized background projection contains only presentation geometry and disappears on disconnect", async () => {
  const { admittedSystemScapes } = await import("./system-map");
  const f = fixture();
  f.doc.fields[0].backgroundId = "orion-veil";
  applySystemMap(f.ctx, { ...f.args, documentJson: JSON.stringify(f.doc) });
  f.db.worldAdmission.insert({
    characterId: "c",
    owner: f.ctx.sender,
    shipId: "ship",
    systemId: "system",
  });
  f.db.character.insert({
    id: "c",
    owner: f.ctx.sender,
    shipId: "ship",
    connected: true,
  });
  f.db.shipWorldMotion.insert({
    shipId: "ship",
    systemId: "system",
    x: 0,
    y: 0,
  });
  const rows = admittedSystemScapes(f.ctx);
  expect(rows).toHaveLength(1);
  const region = JSON.parse(rows[0].regionsJson);
  expect(region.fields).toHaveLength(1);
  expect(region.fields[0]).not.toHaveProperty("resources");
  expect(region.fields[0]).not.toHaveProperty("seed");
  expect(region).not.toHaveProperty("bodies");
  f.db.character.id.update({
    ...f.db.character.id.find("c"),
    connected: false,
  });
  expect(admittedSystemScapes(f.ctx)).toEqual([]);
});
