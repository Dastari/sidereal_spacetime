/**
 * Visibility leak smoke (wiki `Architecture/Visibility and Interest Management`, hard rules 2 and
 * 6), run by scripts/smoke.ts against the isolated -smoke database over real websockets.
 *
 * An observer (B) whose ship is parked 50 m from the owner's ship (A) subscribes to EVERY public
 * view of the module. It must see A's exterior (pose, published hull id) through the exterior
 * views only, with exact column allowlists, and no row of any view may carry an identifier of A's
 * interior: A's character (crew position inside), deck, instance, containers, items, fittings or
 * stations. Direct subscriptions to the private base tables behind those views are rejected.
 */
import assert from "node:assert/strict";
import { DbConnection, tables } from "../packages/net/src/generated";
import { prefabExteriorAssetId } from "../packages/sim/src/ship-exterior";

/** Public views allowed to name another player's ship, with their exact columns. */
const EXTERIOR_VIEWS: Record<string, readonly string[]> = {
  visibleShipMotion: [
    "cellX",
    "cellY",
    "heading",
    "omega",
    "serverTick",
    "shipId",
    "systemId",
    "vx",
    "vy",
    "x",
    "y",
  ],
  visibleShipDescriptions: [
    "appearanceRevision",
    "displayName",
    "publishedExteriorAssetId",
    "shipId",
  ],
  visibleShipSystemEffects: ["power", "shipId"],
  visibleActuatorExhaust: ["key", "shipId", "sourceId", "throttle"],
};
/** Blueprint-derived flight source ids (never fitting UUIDs). */
const PREFAB_SOURCE = /^mount-[A-Za-z0-9][A-Za-z0-9._-]*(#[A-Za-z0-9._-]+)?$/;
/** Private base tables behind the interior and exterior views; never directly subscribable. */
const PRIVATE_TABLES = [
  "ship",
  "character",
  "construction_instance",
  "construction_deck",
  "construction_location",
  "game_ship_access",
  "inventory_item",
  "inventory_container",
  "ship_world_motion",
  "construction_flight_fitting",
  "station",
];

type Db = Record<
  string,
  { iter(): Iterable<Record<string, unknown>> } | undefined
>;
const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));

/** Identifier-like strings in every `own_*` row a connection holds. */
function ownIdentifiers(c: DbConnection): Set<string> {
  const db = c.db as unknown as Db;
  const out = new Set<string>();
  for (const key of Object.keys(tables)) {
    if (!key.startsWith("own")) continue;
    for (const row of db[key]?.iter() ?? [])
      for (const [column, value] of Object.entries(row))
        if (
          typeof value === "string" &&
          value.length >= 8 &&
          (column === "id" ||
            /Id$/.test(column) ||
            /^[0-9a-f-]{32,}$/i.test(value))
        )
          out.add(value);
  }
  return out;
}

export async function visibilityLeakSmoke(options: {
  host: string;
  database: string;
  /** The owner whose interior must not leak (A). */
  owner: DbConnection;
  /** The observer's own connection (B), used to exclude identifiers both legitimately share. */
  observer: DbConnection;
  observerToken: string;
  wait: (fn: () => boolean, label: string) => Promise<void>;
}) {
  const { owner, observer, wait } = options;
  const ownShip = [...owner.db.ownShips.iter()][0]!;
  const actor = [...owner.db.ownCharacters.iter()][0]!;
  const access = [...owner.db.ownGameShipAccess.iter()].find(
    (a) => a.shipId === ownShip.id,
  );
  assert(access, "the owner's prefab ship has game-ship access");
  const shared = ownIdentifiers(observer);
  const secrets = [...ownIdentifiers(owner)].filter(
    (v) => v !== ownShip.id && !shared.has(v),
  );
  // The owner's interior identifiers the observer must never receive.
  for (const required of [actor.id, access.deckId])
    assert(
      secrets.includes(required),
      `interior identifier tracked: ${required}`,
    );
  assert(
    secrets.length >= 4,
    `owner interior identifiers collected (${secrets.length})`,
  );

  // A separate observer session subscribed to every public view of the module.
  let applied = false;
  let failure: string | undefined;
  const spy = DbConnection.builder()
    .withUri(options.host)
    .withDatabaseName(options.database)
    .withToken(options.observerToken)
    .onConnect((c) => {
      c.subscriptionBuilder()
        .onApplied(() => (applied = true))
        .onError((ctx) => (failure = String(ctx.event ?? "error")))
        .subscribe(Object.values(tables) as never);
    })
    .build();
  try {
    await wait(() => applied || !!failure, "observer subscribed to every view");
    assert(!failure, `every public view is subscribable: ${failure}`);
    const db = spy.db as unknown as Db;
    await wait(
      () =>
        !!spy.db.visibleShipMotion.shipId.find(ownShip.id) &&
        !!spy.db.visibleShipDescriptions.shipId.find(ownShip.id),
      "the owner's ship exterior is perceived",
    );
    // Exterior visible: pose and published hull, exact columns.
    const motion = spy.db.visibleShipMotion.shipId.find(ownShip.id)!;
    assert(
      Math.hypot(motion.x - ownShip.x, motion.y - ownShip.y) < 5,
      "exterior pose matches the owner's ship",
    );
    const description = spy.db.visibleShipDescriptions.shipId.find(ownShip.id)!;
    assert.equal(
      description.publishedExteriorAssetId,
      prefabExteriorAssetId("fed.s.wren"),
      "the hull is named by its published prefab exterior",
    );
    assert(description.appearanceRevision > 0n, "prefab revision named");
    // Rows AND columns: every view, every row.
    const checked: Record<string, number> = {};
    for (const key of Object.keys(tables)) {
      const rows = [...(db[key]?.iter() ?? [])];
      checked[key] = rows.length;
      for (const row of rows) {
        const text = json(row);
        for (const secret of secrets)
          assert(
            !text.includes(secret),
            `${key} leaks an interior identifier of another player's ship: ${text}`,
          );
        if (!text.includes(ownShip.id)) continue;
        const columns = EXTERIOR_VIEWS[key];
        assert(
          columns,
          `${key} names another player's ship outside the exterior views: ${text}`,
        );
        assert.deepEqual(
          Object.keys(row).sort(),
          [...columns],
          `${key} exposes only its exterior columns`,
        );
      }
    }
    for (const key of [
      "currentInteriorCrew",
      "visibleCrewPresentation",
      "visibleEvaBodies",
    ])
      assert(
        ![...(db[key]?.iter() ?? [])].some((r) => json(r).includes(actor.id)),
        `${key}: no crew body from inside another player's ship`,
      );
    // Ship logic (doors, buttons, airlock phase) and suit state: the observer's own only.
    const observerShip = [...observer.db.ownShips.iter()][0]!.id;
    const observerActor = [...observer.db.ownCharacters.iter()][0]!.id;
    const logic = [...spy.db.visibleShipLogic.iter()];
    assert(
      logic.every((r) => r.shipId === observerShip),
      "visible_ship_logic: only the ship the observer is aboard",
    );
    assert(
      [...spy.db.ownEvaSuit.iter()].every(
        (r) => r.characterId === observerActor,
      ),
      "own_eva_suit: only the observer's own suit",
    );
    // Private base tables stay unreachable.
    const rejected: string[] = [];
    for (const name of PRIVATE_TABLES) {
      let denied = false;
      spy
        .subscriptionBuilder()
        .onError(() => (denied = true))
        .subscribe(`SELECT * FROM ${name}`);
      await wait(() => denied, `private table ${name} rejected`);
      rejected.push(name);
    }
    return {
      views: Object.keys(checked).length,
      rows: Object.values(checked).reduce((a, b) => a + b, 0),
      interiorIdentifiersTracked: secrets.length,
      ownShipLogicRows: logic.length,
      exterior: {
        publishedExteriorAssetId: description.publishedExteriorAssetId,
        appearanceRevision: description.appearanceRevision.toString(),
      },
      privateTablesRejected: rejected,
    };
  } finally {
    spy.disconnect();
  }
}

/**
 * Remote plumes: while the owner (A) flies, the observer (B) receives A's firing thrusters through
 * `visible_actuator_exhaust` only: exact columns, blueprint source ids, coarse throttle, and no
 * fitting UUID or other interior identifier. Start before A thrusts; `finish` after.
 */
export async function watchRemoteExhaust(options: {
  host: string;
  database: string;
  owner: DbConnection;
  observer: DbConnection;
  observerToken: string;
  wait: (fn: () => boolean, label: string) => Promise<void>;
}) {
  const { owner, observer, wait } = options;
  const shipId = [...owner.db.ownShips.iter()][0]!.id;
  const shared = ownIdentifiers(observer);
  const secrets = [...ownIdentifiers(owner)].filter(
    (v) => v !== shipId && !shared.has(v),
  );
  const seen: Record<string, unknown>[] = [];
  let applied = false;
  const watcher = DbConnection.builder()
    .withUri(options.host)
    .withDatabaseName(options.database)
    .withToken(options.observerToken)
    .onConnect((c) => {
      const record = (_ctx: unknown, row: Record<string, unknown>) =>
        seen.push({ ...row });
      c.db.visibleActuatorExhaust.onInsert(record as never);
      c.db.visibleActuatorExhaust.onUpdate(((
        _ctx: unknown,
        _old: unknown,
        row: Record<string, unknown>,
      ) => seen.push({ ...row })) as never);
      c.subscriptionBuilder()
        .onApplied(() => (applied = true))
        .subscribe([tables.visibleActuatorExhaust]);
    })
    .build();
  await wait(() => applied, "observer subscribed to remote exhaust");
  return {
    async finish() {
      try {
        const theirs = seen.filter((r) => r.shipId === shipId);
        assert(
          theirs.length > 0,
          "the observer saw the owner's thrusters fire",
        );
        for (const row of seen) {
          assert.deepEqual(
            Object.keys(row).sort(),
            EXTERIOR_VIEWS.visibleActuatorExhaust,
            "visible_actuator_exhaust exposes only its exterior columns",
          );
          assert(
            PREFAB_SOURCE.test(String(row.sourceId)),
            `blueprint source id, never a fitting UUID: ${json(row)}`,
          );
          const throttle = Number(row.throttle);
          assert(
            throttle > 0 && throttle <= 1 && Number.isInteger(throttle * 16),
            `coarse throttle: ${throttle}`,
          );
          const text = json(row);
          for (const secret of secrets)
            assert(!text.includes(secret), `exhaust leaks ${secret}`);
        }
        return {
          rowsSeen: seen.length,
          ownerJets: [...new Set(theirs.map((r) => String(r.sourceId)))].sort(),
        };
      } finally {
        watcher.disconnect();
      }
    },
  };
}
