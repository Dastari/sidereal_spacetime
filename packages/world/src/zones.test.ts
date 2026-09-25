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
import { publishZones, stepZones, ownShipZones } from "./zones";
import { newSystemMap } from "@sidereal/content/system-map";
import { newMapZone } from "@sidereal/content/zones";
function table(key: string, indexes: Record<string, string> = {}) {
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
            [...rows.values()].filter((r) => r[field] === value),
        },
      ]),
    ),
  };
}
function fixture() {
  const owner = Identity.fromString("1".repeat(64)),
    db: any = {
      systemZone: table("id", { by_system: "systemId" }),
      shipZoneState: table("shipId", { by_system: "systemId" }),
      shipWorldMotion: table("shipId", { by_system: "systemId" }),
      worldSystem: table("id"),
      systemMapDefinition: table("id"),
      systemBody: table("id", { by_system: "systemId" }),
      bodyWorldMotion: table("bodyId"),
      worldAdmission: table("characterId", { by_owner: "owner" }),
      character: table("id"),
      authSession: table("id", { by_owner: "owner" }),
      retiredIdentity: table("source"),
      constructionLocation: table("characterId"),
    };
  const ship = {
      shipId: "ship",
      systemId: "system",
      x: -100,
      y: 0,
      vx: 0,
      vy: 0,
      heading: 0,
      omega: 0,
      serverTick: 0n,
      cellX: 0n,
      cellY: 0n,
    },
    doc = newSystemMap("system");
  doc.zones = [{ ...newMapZone("thin"), width: 1, length: 100 }];
  db.shipWorldMotion.insert(ship);
  db.worldSystem.insert({ id: "system" });
  db.authSession.insert({ id: "session", owner, game: true });
  db.character.insert({ id: "actor", owner, connected: true, shipId: "ship" });
  db.worldAdmission.insert({
    characterId: "actor",
    owner,
    shipId: "ship",
    systemId: "system",
    revision: 1n,
  });
  const ctx: any = {
    db,
    sender: owner,
    timestamp: { microsSinceUnixEpoch: 50000n },
  };
  return { ctx, db, ship, doc };
}
const forward = {
  bodyId: "ship",
  from: { x: -100, y: 0 },
  to: { x: 100, y: 0 },
  kind: "drift" as const,
};
test("accepted out-and-back traces persist transitions despite identical endpoint state", () => {
  const { ctx, db, ship, doc } = fixture();
  publishZones(ctx, doc, 1n);
  expect(
    stepZones(
      ctx,
      doc.id,
      [ship],
      [forward, { ...forward, from: forward.to, to: forward.from }],
      2n,
    ),
  ).toBe(true);
  const state = db.shipZoneState.shipId.find("ship");
  expect(JSON.parse(state.activeJson)).toEqual(["system"]);
  expect(state.sequence).toBe(4n);
  expect(JSON.parse(state.transitionsJson).map((e: any) => e.entered)).toEqual([
    true,
    false,
    true,
    false,
  ]);
  expect(JSON.parse(state.transitionsJson).map((e: any) => e.segment)).toEqual([
    1, 1, 2, 2,
  ]);
});
test("physics correction reclassifies only endpoint, without swept travel", () => {
  const { ctx, db, ship, doc } = fixture();
  publishZones(ctx, doc, 1n);
  stepZones(ctx, doc.id, [ship], [{ ...forward, kind: "correction" }], 2n);
  expect(db.shipZoneState.shipId.find("ship").sequence).toBe(0n);
});
test("map edits remove occupied children before parents and metadata changes do not invent movement", () => {
  const { ctx, db, ship, doc } = fixture();
  ship.x = 0;
  doc.zones = [
    { ...newMapZone("a-parent") },
    { ...newMapZone("z-child"), parentId: "a-parent" },
  ];
  publishZones(ctx, doc, 1n);
  doc.zones[0].name = "Renamed";
  publishZones(ctx, doc, 2n);
  expect(db.shipZoneState.shipId.find("ship").sequence).toBe(0n);
  doc.zones = [];
  publishZones(ctx, doc, 3n);
  const events = JSON.parse(
    db.shipZoneState.shipId.find("ship").transitionsJson,
  );
  expect(events.map((e: any) => e.zoneId)).toEqual(["z-child", "a-parent"]);
  expect(events.every((e: any) => e.reason === "map-edit" && !e.entered)).toBe(
    true,
  );
});
test("bounded transition history retains monotonically sequenced tail and reconnect does not synthesize travel", () => {
  const { ctx, db, ship, doc } = fixture();
  publishZones(ctx, doc, 1n);
  const trace = Array.from({ length: 40 }, () => [
    forward,
    { ...forward, from: forward.to, to: forward.from },
  ]).flat();
  stepZones(ctx, doc.id, [ship], trace, 2n);
  const state = db.shipZoneState.shipId.find("ship");
  expect(state.sequence).toBe(160n);
  expect(state.earliestSequence).toBe(33n);
  expect(JSON.parse(state.transitionsJson)).toHaveLength(128);
  expect(stepZones(ctx, doc.id, [ship], [], 3n)).toBe(false);
  expect(ownShipZones(ctx)[0].sequence).toBe(160n);
});
test("filtered zone state requires connected authenticated admitted actor and matching ship scope", () => {
  const { ctx, db, doc } = fixture();
  publishZones(ctx, doc, 1n);
  expect(ownShipZones(ctx)).toHaveLength(1);
  ctx.sender = Identity.fromString("2".repeat(64));
  expect(ownShipZones(ctx)).toEqual([]);
  ctx.sender = db.character.id.find("actor").owner;
  db.character.id.update({
    ...db.character.id.find("actor"),
    connected: false,
  });
  expect(ownShipZones(ctx)).toEqual([]);
  db.character.id.update({
    ...db.character.id.find("actor"),
    connected: true,
    shipId: "other",
  });
  expect(ownShipZones(ctx)).toEqual([]);
  db.character.id.update({ ...db.character.id.find("actor"), shipId: "ship" });
  db.shipWorldMotion.shipId.update({
    ...db.shipWorldMotion.shipId.find("ship"),
    systemId: "foreign",
  });
  expect(ownShipZones(ctx)).toEqual([]);
});
test("legacy scopes without saved map receive an implicit root snapshot", () => {
  const { ctx, db, ship } = fixture();
  stepZones(ctx, "system", [ship], [], 1n);
  expect([...db.systemZone.iter()]).toHaveLength(1);
  expect(JSON.parse(db.shipZoneState.shipId.find("ship").activeJson)).toEqual([
    "system",
  ]);
  expect(db.shipZoneState.shipId.find("ship").sequence).toBe(0n);
});
test("invalid zone edits fail before definitions or membership are changed", () => {
  const { ctx, db, doc } = fixture();
  publishZones(ctx, doc, 1n);
  const before = JSON.stringify([...db.systemZone.iter()], (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  doc.zones![0].parentId = "";
  expect(() => publishZones(ctx, doc, 2n)).toThrow(/parent/);
  expect(
    JSON.stringify([...db.systemZone.iter()], (_, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  ).toBe(before);
});

test("tangent at a solver segment join is coalesced but final boundary membership remains closed", () => {
  const { ctx, db, ship, doc } = fixture();
  ship.x = -1;
  ship.y = 1;
  doc.zones = [
    {
      ...newMapZone("round"),
      shape: "ellipsoid",
      width: 2,
      length: 2,
      depth: 2,
    },
  ];
  publishZones(ctx, doc, 1n);
  const first = {
      bodyId: "ship",
      from: { x: -1, y: 1 },
      to: { x: 0, y: 1 },
      kind: "drift" as const,
    },
    second = { ...first, from: first.to, to: { x: 1, y: 1 } };
  stepZones(ctx, doc.id, [ship], [first, second], 2n);
  expect(db.shipZoneState.shipId.find("ship").sequence).toBe(0n);
  stepZones(ctx, doc.id, [ship], [first], 3n);
  expect(JSON.parse(db.shipZoneState.shipId.find("ship").activeJson)).toContain(
    "round",
  );
  expect(db.shipZoneState.shipId.find("ship").sequence).toBe(1n);
});
