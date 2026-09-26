import { SenderError, type Infer } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import {
  SHARED_SYSTEM_SEED,
  SHARED_SYSTEM_SEED_SHA256,
  SHARED_SYSTEM_MAX_SHIPS,
} from "@sidereal/content/shared-system";
import { LAB_HULL } from "@sidereal/content/space";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { spatialCell, validateSpacePoint } from "@sidereal/sim/spatial-cells";
import type * as tables from "./shared-world-tables";
export type SystemRow = Infer<typeof tables.worldSystem.rowType>;
export type ShipMotionRow = Infer<typeof tables.shipWorldMotion.rowType>;
export type BodyMotionRow = Infer<typeof tables.bodyWorldMotion.rowType>;
export type SystemBodyRow = Infer<typeof tables.systemBody.rowType>;
export type AdmissionRow = Infer<typeof tables.worldAdmission.rowType>;
export type JoinReceiptRow = Infer<typeof tables.worldJoinReceipt.rowType>;
export type LegacyAliasRow = Infer<typeof tables.legacyBodyAlias.rowType>;
interface Primary<R> {
  find(id: string): R | null | undefined;
  update(row: R): unknown;
}
type Table<R, K extends string> = Record<K, Primary<R>> & {
  insert(row: R): unknown;
};
interface BySystem<R> {
  by_system: { filter(systemId: string): Iterable<R> };
}
interface ByCell<R> {
  by_cell: { filter(key: readonly [string, bigint, bigint]): Iterable<R> };
}
export interface SharedWorldDatabase {
  worldSystem: Table<SystemRow, "id">;
  shipWorldMotion: Table<ShipMotionRow, "shipId"> &
    BySystem<ShipMotionRow> &
    ByCell<ShipMotionRow>;
  systemBody: Table<SystemBodyRow, "id"> & BySystem<SystemBodyRow>;
  bodyWorldMotion: Table<BodyMotionRow, "bodyId"> &
    BySystem<BodyMotionRow> &
    ByCell<BodyMotionRow>;
  worldAdmission: Table<AdmissionRow, "characterId"> &
    BySystem<AdmissionRow> & {
      by_owner: { filter(owner: Identity): Iterable<AdmissionRow> };
    };
  worldJoinReceipt: Table<JoinReceiptRow, "id"> & {
    by_owner: { filter(owner: Identity): Iterable<JoinReceiptRow> };
  };
  legacyBodyAlias: Table<LegacyAliasRow, "legacyBodyId"> & {
    by_ship: { filter(shipId: string): Iterable<LegacyAliasRow> };
  };
}
type ReadOnlyDatabase<T> = {
  [
    K in keyof T as K extends "insert" | "update" | "delete" ? never : K
  ]: T[K] extends (...args: never[]) => unknown ? T[K] : ReadOnlyDatabase<T[K]>;
};
export type SharedWorldReadDatabase = ReadOnlyDatabase<SharedWorldDatabase>;
interface Ship {
  id: string;
  owner: Identity;
  revision: bigint;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  omega: number;
  massKg: number;
  thrustN: number;
  turnAcceleration: number;
  tick: bigint;
}
interface Actor {
  id: string;
  owner: Identity;
  shipId: string;
  connected: boolean;
  localX: number;
  localY: number;
  sprinting: boolean;
  name: string;
}
interface LegacyBody {
  id: string;
  shipId: string;
  key: string;
  kind: string;
  appearance: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  omega: number;
  height: number;
  radius: number;
  massKg: number;
  seed: number;
  tick: bigint;
}
interface Input {
  characterId: string;
  sequence: bigint;
  throttle: number;
  turn: number;
  dx: number;
  dy: number;
  sprint: boolean;
  updatedMicros: bigint;
}
export interface SharedJoinContext {
  sender: Identity;
  connectionId: { toHexString(): string } | null;
  timestamp: { microsSinceUnixEpoch: bigint };
  db: SharedWorldDatabase & {
    ship: { id: Primary<Ship> };
    character: { id: Primary<Actor> };
    spaceBody: { by_ship: { filter(shipId: string): Iterable<LegacyBody> } };
    constructionLocation: { characterId: { find(id: string): unknown } };
    input: { characterId: Primary<Input> };
    retiredIdentity: { source: { find(owner: Identity): unknown } };
    connectionPresence: {
      connectionId: {
        find(id: string): { owner: Identity } | null | undefined;
      };
    };
    authSession: {
      connectionId: {
        find(
          id: string,
        ):
          | { owner: Identity; game: boolean; expiresMicros: bigint }
          | null
          | undefined;
      };
    };
  };
}
export interface JoinSharedSystemArgs {
  characterId: string;
  shipId: string;
  expectedShipRevision: bigint;
  expectedAdmissionRevision: bigint;
  operationId: string;
}
const bounded = <T>(rows: Iterable<T>, limit: number, label: string): T[] => {
  const result: T[] = [];
  for (const row of rows) {
    if (result.length === limit)
      throw new SenderError(`${label} limit exceeded`);
    result.push(row);
  }
  return result;
};
const snapshot = (value: unknown) =>
  JSON.stringify(value, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
const motionOf = (row: Ship) => ({
  x: row.x,
  y: row.y,
  vx: row.vx,
  vy: row.vy,
  heading: row.heading,
  omega: row.omega,
  serverTick: row.tick,
});
const cells = (point: { x: number; y: number }) => {
  const c = spatialCell(point);
  return { cellX: BigInt(c.cellX), cellY: BigInt(c.cellY) };
};
function descriptor(
  body: (typeof SHARED_SYSTEM_SEED.bodies)[number],
): SystemBodyRow {
  return {
    id: body.id,
    systemId: SHARED_SYSTEM_SEED.systemId,
    authoredKey: body.key,
    kind: body.kind,
    appearance: body.appearance,
    seed: body.seed,
    radius: body.radius,
    height: body.height,
    massKg: body.massKg,
    charted: body.kind !== "asteroid",
  };
}
/** Trusted pinned seed only. No account, caller coordinates, random or latest-art lookup.
 * Existing motion is never reset. Any partial/mismatched installation fails closed. */
export function ensureCanonicalSystem(db: SharedWorldDatabase): SystemRow {
  if (
    constructionHash(JSON.stringify(SHARED_SYSTEM_SEED)) !==
    SHARED_SYSTEM_SEED_SHA256
  )
    throw new SenderError("Canonical seed hash mismatch");
  const expected = {
    id: SHARED_SYSTEM_SEED.systemId,
    seedRevision: BigInt(SHARED_SYSTEM_SEED.revision),
    seedSha256: SHARED_SYSTEM_SEED_SHA256,
    migrationRevision: 1n,
    lastSimulationTick: 0n,
  };
  const existing = db.worldSystem.id.find(expected.id);
  if (
    existing &&
    (existing.id !== expected.id ||
      existing.seedRevision !== expected.seedRevision ||
      existing.seedSha256 !== expected.seedSha256 ||
      existing.migrationRevision !== expected.migrationRevision)
  )
    throw new SenderError("Explicit canonical seed migration required");
  for (const body of SHARED_SYSTEM_SEED.bodies) {
    const prior = db.systemBody.id.find(body.id),
      motion = db.bodyWorldMotion.bodyId.find(body.id);
    if (existing) {
      if (
        !prior ||
        snapshot(prior) !== snapshot(descriptor(body)) ||
        !motion ||
        motion.systemId !== expected.id
      )
        throw new SenderError("Canonical system installation incomplete");
    } else if (prior || motion)
      throw new SenderError("Orphaned canonical body requires recovery");
  }
  if (existing) return existing;
  db.worldSystem.insert(expected);
  for (const body of SHARED_SYSTEM_SEED.bodies) {
    db.systemBody.insert(descriptor(body));
    db.bodyWorldMotion.insert({
      bodyId: body.id,
      systemId: expected.id,
      x: body.x,
      y: body.y,
      vx: 0,
      vy: 0,
      heading: 0,
      omega: 0,
      serverTick: 0n,
      ...cells(body),
    });
  }
  return expected;
}
function caller(ctx: SharedJoinContext, args: JoinSharedSystemArgs) {
  const connectionId = ctx.connectionId?.toHexString();
  const session = connectionId
    ? ctx.db.authSession.connectionId.find(connectionId)
    : undefined;
  const presence = connectionId
    ? ctx.db.connectionPresence.connectionId.find(connectionId)
    : undefined;
  if (
    !session?.game ||
    !session.owner.isEqual(ctx.sender) ||
    session.expiresMicros <= ctx.timestamp.microsSinceUnixEpoch ||
    !presence?.owner.isEqual(ctx.sender) ||
    ctx.db.retiredIdentity.source.find(ctx.sender)
  )
    throw new SenderError("Live game connection required");
  const actor = ctx.db.character.id.find(args.characterId),
    ship = ctx.db.ship.id.find(args.shipId);
  if (
    !actor?.connected ||
    !actor.owner.isEqual(ctx.sender) ||
    !ship?.owner.isEqual(ctx.sender) ||
    actor.shipId !== ship.id
  )
    throw new SenderError("Owned active character and ship required");
  if (ctx.db.constructionLocation.characterId.find(actor.id))
    throw new SenderError(
      "Return from construction review before joining shared space",
    );
  return { actor, ship };
}
/** Deterministic server berth. Conservative hull bounding circles guarantee no
 * overlap without replacing the actual capsule contact representation. */
/** `ownRadiusM` lets larger prefab hulls reserve a wider berth; the default is the
 * existing Wayfarer lab hull, so current callers are unchanged. */
export function reserveBerth(
  db: SharedWorldDatabase,
  systemId: string,
  ownRadiusM?: number,
) {
  const ships = bounded(
    db.shipWorldMotion.by_system.filter(systemId),
    SHARED_SYSTEM_MAX_SHIPS,
    "Shared ship",
  );
  if (ships.length >= SHARED_SYSTEM_MAX_SHIPS)
    throw new SenderError("Shared contact island is full");
  const rockMotions = bounded(
    db.bodyWorldMotion.by_system.filter(systemId),
    32,
    "System body",
  );
  const radius =
    LAB_HULL.radius +
    LAB_HULL.halfLength +
    Math.abs(LAB_HULL.longitudinalOffset);
  const obstacles = [
    ...ships.map((s) => ({ x: s.x, y: s.y, radius })),
    ...rockMotions.flatMap((m) => {
      const b = db.systemBody.id.find(m.bodyId);
      return b?.kind === "asteroid"
        ? [{ x: m.x, y: m.y, radius: b.radius }]
        : [];
    }),
  ];
  for (const obstacle of obstacles) validateSpacePoint(obstacle);
  const axis = (n: number) =>
    n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 50;
  for (let i = 0; i < 256; i++) {
    const berth = { x: axis(i % 16), y: axis(Math.floor(i / 16)) };
    if (
      obstacles.every(
        (o) =>
          Math.hypot(berth.x - o.x, berth.y - o.y) >
          Math.max(radius, ownRadiusM ?? 0) + o.radius + 4,
      )
    )
      return berth;
  }
  throw new SenderError("No safe shared-system berth available");
}
/** Explicit authority migration; root reducer must additionally use auth.gameAction.
 * No implicit login migration or client transform is supported. Reducer atomicity
 * makes seed, membership, UUID aliases, old/new motion and receipt one operation. */
export function joinSharedSystem(
  ctx: SharedJoinContext,
  args: JoinSharedSystemArgs,
): void {
  const { actor, ship } = caller(ctx, args);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      args.operationId,
    )
  )
    throw new SenderError("UUID operation ID required");
  const key = `${ctx.sender.toHexString()}:${args.operationId}`,
    requestJson = snapshot({ kind: "join-shared-system-r001", ...args });
  const priorReceipt = ctx.db.worldJoinReceipt.id.find(key),
    admission = ctx.db.worldAdmission.characterId.find(actor.id);
  if (priorReceipt) {
    if (
      priorReceipt.requestJson !== requestJson ||
      !priorReceipt.owner.isEqual(ctx.sender)
    )
      throw new SenderError("Operation ID reused with different request");
    if (
      !admission ||
      admission.shipId !== ship.id ||
      admission.systemId !== priorReceipt.systemId ||
      admission.revision !== priorReceipt.revision ||
      !admission.owner.isEqual(ctx.sender)
    )
      throw new SenderError("Shared admission changed since operation");
    return;
  }
  if (
    ship.revision !== args.expectedShipRevision ||
    (admission?.revision ?? 0n) !== args.expectedAdmissionRevision
  )
    throw new SenderError("Shared join revision conflict");
  if (admission || ctx.db.shipWorldMotion.shipId.find(ship.id))
    throw new SenderError("Ship already admitted; explicit transfer required");
  if (
    bounded(
      ctx.db.worldJoinReceipt.by_owner.filter(ctx.sender),
      64,
      "Shared operation",
    ).length >= 64
  )
    throw new SenderError("Shared operation receipt limit reached");
  validateSpacePoint(ship);
  if (
    ![ship.vx, ship.vy, ship.heading, ship.omega].every(Number.isFinite) ||
    Math.max(Math.abs(ship.vx), Math.abs(ship.vy)) > 1e6 ||
    Math.abs(ship.omega) > 1e4
  )
    throw new SenderError("Invalid legacy ship motion");
  const legacy = bounded(
    ctx.db.spaceBody.by_ship.filter(ship.id),
    32,
    "Legacy body",
  );
  const aliases: LegacyAliasRow[] = legacy.map((body) => {
    const canonical = SHARED_SYSTEM_SEED.bodies.find(
      (candidate) => candidate.key === body.key,
    );
    if (!canonical || body.kind !== canonical.kind)
      throw new SenderError("Legacy body requires explicit canonical mapping");
    if (ctx.db.legacyBodyAlias.legacyBodyId.find(body.id))
      throw new SenderError("Legacy body already mapped");
    const legacySnapshotJson = snapshot(body);
    if (new TextEncoder().encode(legacySnapshotJson).length > 4096)
      throw new SenderError("Legacy body snapshot too large");
    return {
      legacyBodyId: body.id,
      owner: ctx.sender,
      shipId: ship.id,
      canonicalBodyId: canonical.id,
      systemId: SHARED_SYSTEM_SEED.systemId,
      legacySnapshotJson,
    };
  });
  const system = ensureCanonicalSystem(ctx.db),
    berth = reserveBerth(ctx.db, system.id);
  const next = {
    shipId: ship.id,
    systemId: system.id,
    ...motionOf(ship),
    serverTick: ctx.timestamp.microsSinceUnixEpoch / 50_000n,
    ...berth,
    ...cells(berth),
  };
  ctx.db.shipWorldMotion.insert(next);
  ctx.db.worldAdmission.insert({
    characterId: actor.id,
    owner: ctx.sender,
    shipId: ship.id,
    systemId: system.id,
    revision: 1n,
  });
  // Temporary own-ship compatibility mirror at migration only. Subsequent shared
  // physics writes the lean motion table; root ownShips projection overlays it.
  ctx.db.ship.id.update({ ...ship, ...berth, revision: ship.revision + 1n });
  for (const alias of aliases) ctx.db.legacyBodyAlias.insert(alias);
  const input = ctx.db.input.characterId.find(actor.id);
  if (
    input &&
    (input.dx ||
      input.dy ||
      input.throttle ||
      input.turn ||
      input.sprint ||
      input.updatedMicros !== 0n)
  )
    ctx.db.input.characterId.update({
      ...input,
      dx: 0,
      dy: 0,
      throttle: 0,
      turn: 0,
      sprint: false,
      updatedMicros: 0n,
    });
  ctx.db.worldJoinReceipt.insert({
    id: key,
    owner: ctx.sender,
    characterId: actor.id,
    shipId: ship.id,
    systemId: system.id,
    requestJson,
    revision: 1n,
    oldMotionJson: snapshot(motionOf(ship)),
    newMotionJson: snapshot(next),
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
