import { Identity } from "spacetimedb";
import { LEGACY_SYSTEM_SEED } from "@sidereal/content/shared-system";
import type { SharedJoinContext } from "./shared-world";
export const owner = Identity.fromString("1".repeat(64)),
  other = Identity.fromString("2".repeat(64));
const key = (value: any): string =>
  Array.isArray(value)
    ? value.map(key).join("|")
    : (value?.toHexString?.() ?? String(value));
function table(
  primary: string,
  indexes: Record<string, string | string[]> = {},
) {
  const rows = new Map<string, any>();
  let writes = 0;
  const result: any = {
    rows,
    queries: [],
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
      delete: (id: any) => {
        writes++;
        return rows.delete(key(id));
      },
      update: (row: any) => {
        if (!rows.has(key(row[primary]))) throw Error("missing");
        rows.set(key(row[primary]), row);
        writes++;
      },
    },
  };
  for (const [name, fields] of Object.entries(indexes))
    result[name] = {
      filter: (value: any) => {
        result.queries.push({ index: name, key: value });
        return [...rows.values()].filter(
          (row) =>
            key(
              Array.isArray(fields) ? fields.map((f) => row[f]) : row[fields],
            ) === key(value),
        );
      },
    };
  return result;
}
export function fixture() {
  const db: any = {
    constructionFlightReview: table("characterId"),
    constructionFlightBinding: table("shipId"),
    constructionInstance: table("id"),
    worldSystem: table("id"),
    celestialMigrationReceipt: table("id"),
    shipWorldMotion: table("shipId", {
      by_system: "systemId",
      by_cell: ["systemId", "cellX", "cellY"],
    }),
    systemBody: table("id", { by_system: "systemId" }),
    bodyWorldMotion: table("bodyId", {
      by_system: "systemId",
      by_cell: ["systemId", "cellX", "cellY"],
    }),
    worldAdmission: table("characterId", {
      by_owner: "owner",
      by_system: "systemId",
    }),
    worldJoinReceipt: table("id", { by_owner: "owner" }),
    legacyBodyAlias: table("legacyBodyId", { by_ship: "shipId" }),
    ship: table("id"),
    character: table("id", { by_owner: "owner" }),
    spaceBody: table("id", { by_ship: "shipId" }),
    constructionLocation: table("characterId"),
    input: table("characterId"),
    retiredIdentity: table("source"),
    connectionPresence: table("connectionId"),
    authSession: table("connectionId", { by_owner: "owner" }),
    inputControl: table("characterId", { by_connection: "connectionId" }),
    inputControlCursor: table("connectionId"),
    station: table("shipId"),
    actuatorOutput: table("id", { by_ship: "shipId" }),
  };
  const args = (n = 1) => ({
    characterId: `actor${n}`,
    shipId: `ship${n}`,
    expectedShipRevision: 1n,
    expectedAdmissionRevision: 0n,
    operationId: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  });
  function add(n: number, identity: Identity) {
    db.character.insert({
      id: `actor${n}`,
      owner: identity,
      name: `Actor${n}`,
      shipId: `ship${n}`,
      connected: true,
      localX: 4,
      localY: 8,
      sprinting: false,
    });
    db.ship.insert({
      id: `ship${n}`,
      owner: identity,
      name: "Wayfarer",
      revision: 1n,
      x: 100,
      y: 500,
      vx: 3,
      vy: -2,
      heading: 0.2,
      omega: 0.01,
      massKg: 1000,
      thrustN: 500,
      turnAcceleration: 1,
      tick: 7n,
    });
    db.input.insert({
      characterId: `actor${n}`,
      sequence: 77n,
      dx: 1,
      dy: 0,
      throttle: 1,
      turn: 0,
      sprint: true,
      updatedMicros: 50n,
    });
    db.connectionPresence.insert({ connectionId: `c${n}`, owner: identity });
    db.authSession.insert({
      connectionId: `c${n}`,
      owner: identity,
      game: true,
      expiresMicros: 1000000n,
    });
    for (const body of LEGACY_SYSTEM_SEED.bodies)
      db.spaceBody.insert({
        ...body,
        id: `legacy${n}-${body.key}`,
        shipId: `ship${n}`,
        vx: 8,
        vy: 1,
        heading: 0.3,
        omega: 0.2,
        tick: 37n,
      });
  }
  add(1, owner);
  add(2, other);
  const ctx = (n = 1, identity = owner): SharedJoinContext => ({
    db,
    sender: identity,
    connectionId: { toHexString: () => `c${n}` },
    timestamp: { microsSinceUnixEpoch: 100n },
  });
  const writes = () =>
    Object.values(db).reduce((total: number, t: any) => total + t.writes, 0);
  return { db, args, ctx, writes };
}
