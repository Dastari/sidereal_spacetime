/**
 * In-memory stand-ins for the lifecycle tables (and the shared `world_system` row the authority
 * tick reads) for world unit tests. Test support only: nothing in the module imports this file.
 */
type Row = Record<string, unknown>;
function keyed(primary: string, indexes: Record<string, string> = {}) {
  const rows = new Map<unknown, Row>();
  const t: Record<string, unknown> & { rows: Map<unknown, Row> } = {
    rows,
    count: () => BigInt(rows.size),
    iter: () => [...rows.values()],
    insert: (r: Row) => {
      if (rows.has(r[primary])) throw Error("duplicate " + String(r[primary]));
      rows.set(r[primary], r);
      return r;
    },
    [primary]: {
      find: (id: unknown) => rows.get(id),
      update: (r: Row) => {
        if (!rows.has(r[primary])) throw Error("missing " + String(r[primary]));
        rows.set(r[primary], r);
        return r;
      },
      delete: (id: unknown) => rows.delete(id),
    },
  };
  for (const [accessor, column] of Object.entries(indexes))
    t[accessor] = {
      filter: (v: unknown) => [...rows.values()].filter((r) => r[column] === v),
    };
  return t;
}
export function lifecycleTestTables() {
  return {
    objectLifecycle: keyed("objectId", {
      by_frame: "frameId",
      by_owner_ref: "ownerId",
    }),
    lifecycleEvent: keyed("eventId", { by_object: "objectId" }),
    lifecycleOutbox: keyed("id"),
    lifecycleCursor: keyed("consumerId"),
    worldSystem: keyed("id"),
  };
}
/** Empty definition registry and pin tables (X-2): with no rows every item resolves to the seed
 * (revision 1 = the code catalogue), exactly as on a database without the seed import. */
export function itemDefinitionTestTables() {
  return {
    inventoryItemPin: keyed("itemId"),
    combatActionPin: keyed("characterId"),
    contentDefinition: keyed("definitionRef", {
      by_kind: "kind",
      by_key: "definitionKey",
    }),
    contentDefinitionHead: keyed("definitionKey", { by_kind: "kind" }),
  };
}
type StoredEvent = {
  eventId: bigint;
  objectId: string;
  objectKind: string;
  kind: string;
  sequence: bigint;
  authorityTick: bigint;
  causationId: string;
  actorId: string;
  frameId: string;
  payloadJson: string;
  atMicros: bigint;
};
/** Events in commit order, parsed for assertions. */
export function lifecycleEvents(db: {
  lifecycleEvent: { iter(): Iterable<unknown> };
}) {
  return [...db.lifecycleEvent.iter()]
    .map((row) => row as StoredEvent)
    .sort((a, b) => (a.eventId < b.eventId ? -1 : 1))
    .map((row) => ({
      ...row,
      payload: JSON.parse(row.payloadJson) as Record<string, any>,
    }));
}
