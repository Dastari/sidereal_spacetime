import type { Identity } from "spacetimedb";
import type { ConstructionDocument } from "@sidereal/content/construction";
import {
  nativeTraversalRoomInstallation,
  compileNativeTraversalRoom,
} from "@sidereal/sim/construction-traversal-document";
import {
  SenderError,
  t,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import type world from "./index";
import * as auth from "./auth";
import { clearAim } from "./combat";
import { operation, receipt, requireGrant } from "./construction";
import {
  beginTraversal as beginPure,
  stepTraversal as stepPure,
  traversalPlacement,
  TRAVERSAL_LIMITS,
  type createNativeTraversalCompiler,
  type TraversalInstallation,
  type CompiledTraversalLink,
  type TraversalState,
  type TraversalReservation,
  type BeginTraversalRequest,
} from "@sidereal/sim/construction-traversal";
import type {
  TraversalBounds3,
  TraversalPoint3,
} from "@sidereal/content/construction-traversal";

export const TRAVERSAL_AUTHORITY_LIMITS = Object.freeze({
  links: 128,
  active: 64,
  auditsPerOwner: 512,
  occupants: 256,
  bytes: 65536,
});
const CLOCK = "construction-traversal-fixed-v1";
const BODY = Object.freeze({ radiusM: 0.3, heightM: 1.8 });
const EPS = 1e-8;
const encode = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
function demand(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new SenderError("Construction traversal authority: " + reason);
}
const sameOwner = (a: Identity, b: Identity) => a.isEqual(b);

export interface TraversalLinkRow {
  id: string;
  owner: Identity;
  instanceId: string;
  sourceLinkId: string;
  lowerDeckId: string;
  upperDeckId: string;
  instanceRevision: bigint;
  revision: bigint;
  adapterId: string;
  adapterRevision: string;
  auditSha256: string;
  installationJson: string;
  contractJson: string;
  fingerprint: string;
}
export interface TraversalRow {
  locationRevision: bigint;
  characterId: string;
  id: string;
  owner: Identity;
  instanceId: string;
  linkId: string;
  visitId: string;
  sourceDeckId: string;
  destinationDeckId: string;
  instanceRevision: bigint;
  linkRevision: bigint;
  revision: bigint;
  stateJson: string;
  acceptedX: number;
  acceptedY: number;
  acceptedZ: number;
  phase: string;
  interruption: string;
  lastTick: bigint;
}
export interface TraversalReservationRow {
  linkId: string;
  instanceId: string;
  owner: Identity;
  traversalId: string;
  characterId: string;
  sourceDeckId: string;
  destinationDeckId: string;
  reservationJson: string;
}
export interface TraversalAuditRow {
  id: string;
  owner: Identity;
  characterId: string;
  instanceId: string;
  linkId: string;
  visitId: string;
  sourceDeckId: string;
  destinationDeckId: string;
  outcome: string;
  interruption: string;
  revision: bigint;
  completedTick: bigint;
}
interface Store<Row> {
  iter(): IterableIterator<Row>;
  insert(row: Row): unknown;
}
interface Key<Row> {
  find(id: string): Row | null | undefined;
  update(row: Row): unknown;
  delete(id: string): unknown;
}
interface Index<Row, Value> {
  filter(value: Value): IterableIterator<Row>;
}
export interface TraversalTables {
  constructionTraversalLink: Store<TraversalLinkRow> & {
    id: Key<TraversalLinkRow>;
    by_owner: Index<TraversalLinkRow, Identity>;
    by_instance: Index<TraversalLinkRow, string>;
  };
  constructionTraversal: Store<TraversalRow> & {
    characterId: Key<TraversalRow>;
    by_owner: Index<TraversalRow, Identity>;
    by_instance: Index<TraversalRow, string>;
  };
  constructionTraversalReservation: Store<TraversalReservationRow> & {
    linkId: Key<TraversalReservationRow>;
    by_instance: Index<TraversalReservationRow, string>;
  };
  constructionTraversalClock: Store<{
    id: string;
    tick: bigint;
    lastScheduleMicros: bigint;
  }> & { id: Key<{ id: string; tick: bigint; lastScheduleMicros: bigint }> };
  constructionTraversalAudit: Store<TraversalAuditRow> & {
    id: Key<TraversalAuditRow>;
    by_owner: Index<TraversalAuditRow, Identity>;
  };
}
type BaseContext = ReducerCtx<InferSchema<typeof world>>;
export type TraversalContext = Omit<BaseContext, "db"> & {
  db: BaseContext["db"] & TraversalTables;
};
type TraversalReadTables = {
  [Table in keyof TraversalTables]: {
    [
      Field in keyof TraversalTables[Table] as Field extends "insert"
        ? never
        : Field
    ]: TraversalTables[Table][Field] extends Key<infer Row>
      ? Pick<Key<Row>, "find">
      : TraversalTables[Table][Field];
  };
};
export type TraversalReadContext = Pick<
  ViewCtx<InferSchema<typeof world>>,
  "sender" | "db"
> & { db: TraversalReadTables };
/** Trusted server registry only; deliberately no default entry until real native
 * delivery is qualified. Compiler closures validate exact audit/source bytes. */
export interface NativeTraversalAdapter {
  adapterId: string;
  revision: string;
  auditSha256: string;
  compile: ReturnType<typeof createNativeTraversalCompiler>;
}
export type TraversalRegistry = ReadonlyMap<string, NativeTraversalAdapter>;
export const traversalAdapterKey = (id: string, revision: string) =>
  JSON.stringify([id, revision]);
function installation(json: string): TraversalInstallation {
  const value = JSON.parse(json) as TraversalInstallation;
  return {
    ...value,
    instanceRevision: BigInt(value.instanceRevision),
    linkRevision: BigInt(value.linkRevision),
  };
}
function state(row: TraversalRow): TraversalState {
  const value = JSON.parse(row.stateJson) as TraversalState;
  return {
    ...value,
    startedTick: BigInt(value.startedTick),
    lastTick: BigInt(value.lastTick),
    revision: BigInt(value.revision),
  };
}
function compiled(
  row: TraversalLinkRow,
  registry: TraversalRegistry,
): CompiledTraversalLink {
  const adapter = registry.get(
    traversalAdapterKey(row.adapterId, row.adapterRevision),
  );
  demand(
    adapter && adapter.auditSha256 === row.auditSha256,
    "qualified native adapter unavailable",
  );
  const link = adapter.compile(installation(row.installationJson));
  demand(
    link.id === row.id &&
      link.instanceId === row.instanceId &&
      link.revision === row.revision &&
      link.instanceRevision === row.instanceRevision &&
      link.proofHash === row.fingerprint &&
      encode(link) === row.contractJson,
    "stored native installation differs",
  );
  return link;
}
function liveInstallation(ctx: TraversalReadContext, row: TraversalLinkRow) {
  try {
    const instance = ctx.db.constructionInstance.id.find(row.instanceId);
    if (
      !instance ||
      !sameOwner(instance.owner, row.owner) ||
      instance.revision !== row.instanceRevision
    )
      return false;
    // Rebuild from the complete current authoritative document, including actual
    // native IDs, floor coverage, shaft openings and the pinned movement policy.
    // A persisted older contract never certifies an altered live document.
    const document = JSON.parse(instance.documentJson) as ConstructionDocument;
    const actual = nativeTraversalRoomInstallation(
      document,
      instance.revision,
      row.revision,
    );
    const link = compileNativeTraversalRoom(actual);
    if (
      link.instanceId !== instance.id ||
      link.id !== row.id ||
      link.proofHash !== row.fingerprint ||
      encode(link) !== row.contractJson
    )
      return false;
    for (const side of ["lower", "upper"] as const) {
      const deck = ctx.db.constructionDeck.id.find(actual[side].deckId);
      if (
        !deck ||
        deck.instanceId !== instance.id ||
        deck.elevation !== actual[side].originZ ||
        deck.ceiling !==
          document.layout.decks.find((d) => d.id === deck.id)!.ceiling / 32 ||
        actual[side].walkingZ !== deck.elevation + 6 / 32
      )
        return false;
    }
    const mapping = JSON.parse(instance.idMapJson) as {
      traversalLinks?: { sourceId: string; instanceId: string }[];
      nativeParts?: { sourceId: string; instanceId: string }[];
      traversalApertures?: { sourceId: string; instanceId: string }[];
    };
    const exactIds = (
      rows: { instanceId: string }[] | undefined,
      ids: string[],
    ) =>
      !!rows &&
      encode(rows.map((r) => r.instanceId).sort()) === encode([...ids].sort());
    return (
      mapping.traversalLinks?.filter(
        (m) => m.sourceId === row.sourceLinkId && m.instanceId === row.id,
      ).length === 1 &&
      exactIds(
        mapping.nativeParts,
        actual.parts.map((p) => p.id),
      ) &&
      exactIds(
        mapping.traversalApertures,
        actual.apertures.map((p) => p.id),
      )
    );
  } catch {
    return false;
  }
}
/** Server spawn hook only. The caller passes the exhaustive actual installation,
 * never authored client transforms or a native-ready boolean. UUID mapping and
 * actual deck rows must already exist in this same atomic spawn transaction. */
export function installTraversalLink(
  ctx: TraversalContext,
  input: {
    sourceLinkId: string;
    adapterId: string;
    adapterRevision: string;
    installation: TraversalInstallation;
  },
  registry: TraversalRegistry,
) {
  const native = registry.get(
    traversalAdapterKey(input.adapterId, input.adapterRevision),
  );
  demand(native, "qualified native adapter unavailable");
  const link = native.compile(input.installation),
    instance = ctx.db.constructionInstance.id.find(link.instanceId);
  demand(
    instance && sameOwner(instance.owner, ctx.sender),
    "owned installed instance required",
  );
  demand(
    link.body.radiusM === BODY.radiusM && link.body.heightM === BODY.heightM,
    "native actor capsule differs from current authority policy",
  );
  const row: TraversalLinkRow = {
    id: link.id,
    owner: instance.owner,
    instanceId: instance.id,
    sourceLinkId: input.sourceLinkId,
    lowerDeckId: link.lower.deckId,
    upperDeckId: link.upper.deckId,
    instanceRevision: link.instanceRevision,
    revision: link.revision,
    adapterId: input.adapterId,
    adapterRevision: input.adapterRevision,
    auditSha256: link.auditSha256,
    installationJson: encode(input.installation),
    contractJson: encode(link),
    fingerprint: link.proofHash,
  };
  demand(
    row.installationJson.length + row.contractJson.length <=
      TRAVERSAL_AUTHORITY_LIMITS.bytes,
    "native contract budget exceeded",
  );
  demand(
    liveInstallation(ctx, row),
    "installed deck or source-link mapping mismatch",
  );
  const prior = ctx.db.constructionTraversalLink.id.find(row.id);
  if (prior) {
    demand(
      sameOwner(prior.owner, row.owner) &&
        prior.contractJson === row.contractJson &&
        prior.installationJson === row.installationJson &&
        prior.sourceLinkId === row.sourceLinkId &&
        prior.adapterId === row.adapterId &&
        prior.adapterRevision === row.adapterRevision,
      "installation replay conflicts",
    );
    return prior;
  }
  demand(
    [...ctx.db.constructionTraversalLink.iter()].length <
      TRAVERSAL_AUTHORITY_LIMITS.links,
    "installed link admission budget exhausted",
  );
  ctx.db.constructionTraversalLink.insert(row);
  return row;
}
function actorAndVisit(ctx: TraversalContext, characterId: string) {
  const actor = ctx.db.character.id.find(characterId),
    visit = ctx.db.constructionLocation.characterId.find(characterId);
  demand(
    actor &&
      sameOwner(actor.owner, ctx.sender) &&
      visit &&
      actor.shipId === visit.instanceId,
    "owned actor and current construction visit required",
  );
  const instance = ctx.db.constructionInstance.id.find(visit.instanceId);
  demand(
    instance && sameOwner(instance.owner, ctx.sender),
    "owned review instance required",
  );
  return { actor, visit, instance };
}
function clearInputs(ctx: TraversalContext, characterId: string) {
  const input = ctx.db.input.characterId.find(characterId);
  if (
    input &&
    (input.dx !== 0 ||
      input.dy !== 0 ||
      input.throttle !== 0 ||
      input.turn !== 0 ||
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
  clearAim(ctx, characterId);
  const actor = ctx.db.character.id.find(characterId);
  if (actor?.sprinting)
    ctx.db.character.id.update({ ...actor, sprinting: false });
}
function reservation(row: TraversalReservationRow): TraversalReservation {
  return JSON.parse(row.reservationJson) as TraversalReservation;
}
const overlap = (a: TraversalBounds3, b: TraversalBounds3) =>
  a.min.every((n, i) => n < b.max[i] - EPS && a.max[i] > b.min[i] + EPS);
function body(point: TraversalPoint3): TraversalBounds3 {
  return {
    min: [point[0] - BODY.radiusM, point[1] - BODY.radiusM, point[2]],
    max: [
      point[0] + BODY.radiusM,
      point[1] + BODY.radiusM,
      point[2] + BODY.heightM,
    ],
  };
}
/** Active actors use persisted accepted 3D placement, never the source deck's
 * stale planar character anchor. Disconnected bodies continue to reserve space. */
function occupants(
  ctx: TraversalReadContext,
  instanceId: string,
  except: string,
): TraversalBounds3[] {
  const result: TraversalBounds3[] = [];
  for (const visit of ctx.db.constructionLocation.by_instance.filter(
    instanceId,
  )) {
    if (visit.instanceId !== instanceId || visit.characterId === except)
      continue;
    demand(
      result.length < TRAVERSAL_AUTHORITY_LIMITS.occupants,
      "occupant work budget exceeded",
    );
    const actor = ctx.db.character.id.find(visit.characterId);
    if (!actor || actor.shipId !== instanceId) continue;
    const active = ctx.db.constructionTraversal.characterId.find(actor.id);
    const deck = ctx.db.constructionDeck.id.find(visit.deckId);
    demand(deck && deck.instanceId === instanceId, "occupant deck missing");
    const point: TraversalPoint3 = active
      ? [active.acceptedX, active.acceptedY, active.acceptedZ]
      : [actor.localX, actor.localY, deck.elevation + 6 / 32];
    demand(point.every(Number.isFinite), "occupant position invalid");
    result.push(body(point));
  }
  return result;
}
const clear = (
  bounds: readonly TraversalBounds3[],
  bodies: readonly TraversalBounds3[],
) => !bounds.some((a) => bodies.some((b) => overlap(a, b)));
function activeRow(
  row: TraversalRow,
  next: TraversalState,
  link: CompiledTraversalLink,
): TraversalRow {
  const p = traversalPlacement(link, next).positionM;
  return {
    ...row,
    stateJson: encode(next),
    revision: next.revision,
    lastTick: next.lastTick,
    phase: next.phase,
    interruption: next.interruption,
    acceptedX: p[0],
    acceptedY: p[1],
    acceptedZ: p[2],
  };
}
/** Root supplies its existing server-selected actor. Actor/owner/visit permission
 * is rechecked here; public arguments contain no actor/deck/position/duration. */
export function beginConstructionTraversal(
  ctx: TraversalContext,
  characterId: string,
  args: BeginTraversalRequest,
  registry: TraversalRegistry,
) {
  auth.requireGame(ctx);
  const { actor, visit, instance } = actorAndVisit(ctx, characterId);
  requireGrant(ctx, instance.workspaceId, "instance.spawn");
  demand(
    actor.connected && visit.visitId === args.expectedVisitId,
    "connected current visit required",
  );
  const row = ctx.db.constructionTraversalLink.id.find(args.linkId);
  demand(
    row && row.instanceId === instance.id && sameOwner(row.owner, ctx.sender),
    "owned installed link required",
  );
  const op = operation(
    ctx,
    args.operationId,
    {
      kind: "begin-traversal",
      characterId,
      ...args,
      expectedLocationRevision: String(args.expectedLocationRevision),
      expectedInstanceRevision: String(args.expectedInstanceRevision),
      expectedLinkRevision: String(args.expectedLinkRevision),
    },
    args.expectedLocationRevision,
    visit.revision,
  );
  if (op.replay) return;
  demand(liveInstallation(ctx, row), "native installation changed");
  demand(
    !ctx.db.constructionTraversal.characterId.find(characterId),
    "actor already traversing",
  );
  demand(
    !ctx.db.couchSeat.characterId.find(characterId) &&
      ctx.db.station.shipId.find(actor.shipId)?.occupantId !== actor.id,
    "standing actor required",
  );
  const link = compiled(row, registry),
    deck = ctx.db.constructionDeck.id.find(visit.deckId);
  demand(deck && deck.instanceId === instance.id, "occupied deck missing");
  const active = [...ctx.db.constructionTraversal.iter()];
  demand(
    active.length < TRAVERSAL_AUTHORITY_LIMITS.active,
    "active traversal budget exhausted",
  );
  demand(
    [...ctx.db.constructionTraversalAudit.by_owner.filter(ctx.sender)].length +
      active.filter((a) => sameOwner(a.owner, ctx.sender)).length <
      TRAVERSAL_AUTHORITY_LIMITS.auditsPerOwner,
    "terminal audit admission budget exhausted",
  );
  const bodies = occupants(ctx, instance.id, characterId);
  demand(
    clear(
      [
        link.lower.freeBoundsM,
        link.upper.freeBoundsM,
        ...link.corridorFreeBoundsM,
      ],
      bodies,
    ),
    "protected ladder corridor or landing occupied",
  );
  const tick = ctx.db.constructionTraversalClock.id.find(CLOCK)?.tick ?? 0n;
  const started = beginPure(
    link,
    {
      id: actor.id,
      instanceId: instance.id,
      deckId: visit.deckId,
      visitId: visit.visitId,
      locationRevision: visit.revision,
      positionM: [actor.localX, actor.localY, deck.elevation + 6 / 32],
      admitted: true,
      connected: actor.connected,
      mayTraverse: true,
      standing: true,
    },
    args,
    {
      tick,
      reservations: [...ctx.db.constructionTraversalReservation.iter()].map(
        reservation,
      ),
      allocateTraversalId: () => ctx.newUuidV4().toString(),
    },
  );
  demand(!started.replay, "unexpected pure replay");
  const s = started.state;
  const activeState = activeRow(
    {
      characterId: actor.id,
      id: s.id,
      owner: actor.owner,
      instanceId: instance.id,
      linkId: link.id,
      visitId: visit.visitId,
      locationRevision: visit.revision,
      sourceDeckId: s.sourceDeckId,
      destinationDeckId: s.destinationDeckId,
      instanceRevision: link.instanceRevision,
      linkRevision: link.revision,
      revision: s.revision,
      stateJson: "",
      acceptedX: actor.localX,
      acceptedY: actor.localY,
      acceptedZ: deck.elevation + 6 / 32,
      phase: s.phase,
      interruption: s.interruption,
      lastTick: tick,
    },
    s,
    link,
  );
  ctx.db.constructionTraversalReservation.insert({
    linkId: link.id,
    instanceId: instance.id,
    owner: actor.owner,
    traversalId: s.id,
    characterId: actor.id,
    sourceDeckId: s.sourceDeckId,
    destinationDeckId: s.destinationDeckId,
    reservationJson: encode(started.reservation),
  });
  ctx.db.constructionTraversal.insert(activeState);
  clearInputs(ctx, actor.id);
  receipt(ctx, op.key, op.request, s.id, s.revision);
}
/** These narrow guards belong before replay acceptance in reach, inventory,
 * seating, review-exit, identity-migration and instance-edit adapters. */
export function requireStandingConstructionActor(
  ctx: TraversalReadContext,
  characterId: string,
) {
  demand(
    !ctx.db.constructionTraversal.characterId.find(characterId),
    "actor is traversing",
  );
}
export function requireUnreservedConstructionInstance(
  ctx: TraversalReadContext,
  instanceId: string,
) {
  demand(
    ![...ctx.db.constructionTraversalReservation.by_instance.filter(instanceId)]
      .length &&
      ![...ctx.db.constructionTraversal.by_instance.filter(instanceId)].length,
    "instance has a reserved traversal",
  );
}
/** Planar movement candidates must not enter another actor's reserved 3D
 * landing/corridor. Root still runs its normal deck-circle collision first. */
export function constructionTraversalPositionAllowed(
  ctx: TraversalReadContext,
  characterId: string,
  instanceId: string,
  deckId: string,
  x: number,
  y: number,
) {
  if (ctx.db.constructionTraversal.characterId.find(characterId)) return false;
  const deck = ctx.db.constructionDeck.id.find(deckId);
  if (!deck || deck.instanceId !== instanceId || ![x, y].every(Number.isFinite))
    return false;
  const actor = ctx.db.character.id.find(characterId);
  if (
    !actor ||
    actor.shipId !== instanceId ||
    ![actor.localX, actor.localY].every(Number.isFinite)
  )
    return false;
  const candidate: TraversalBounds3 = {
    min: [
      Math.min(actor.localX, x) - BODY.radiusM,
      Math.min(actor.localY, y) - BODY.radiusM,
      deck.elevation + 6 / 32,
    ],
    max: [
      Math.max(actor.localX, x) + BODY.radiusM,
      Math.max(actor.localY, y) + BODY.radiusM,
      deck.elevation + 6 / 32 + BODY.heightM,
    ],
  };
  return ![
    ...ctx.db.constructionTraversalReservation.by_instance.filter(instanceId),
  ].some(
    (r) =>
      r.characterId !== characterId &&
      reservation(r).boundsM.some((b) => overlap(candidate, b)),
  );
}
function requestReturn(
  ctx: TraversalContext,
  row: TraversalRow,
  reason: TraversalState["interruption"],
) {
  const prior = state(row);
  if (prior.mode === "returning") return;
  const next: TraversalState = {
    ...prior,
    mode: "returning",
    phase: prior.phase === "blocked" ? "blocked" : "returning",
    interruption: reason,
    revision: prior.revision + 1n,
  };
  ctx.db.constructionTraversal.characterId.update({
    ...row,
    stateJson: encode(next),
    revision: next.revision,
    phase: next.phase,
    interruption: reason,
  });
  clearInputs(ctx, row.characterId);
}
export function cancelConstructionTraversal(
  ctx: TraversalContext,
  characterId: string,
  args: {
    traversalId: string;
    expectedVisitId: string;
    expectedRevision: bigint;
    operationId: string;
  },
) {
  auth.requireGame(ctx);
  const { actor, visit, instance } = actorAndVisit(ctx, characterId);
  requireGrant(ctx, instance.workspaceId, "instance.spawn");
  demand(
    actor.connected && visit.visitId === args.expectedVisitId,
    "connected current visit required",
  );
  const row = ctx.db.constructionTraversal.characterId.find(characterId);
  // Cancellation requests a safe return; it never writes a client progress value.
  // A revision observed before several 50 ms ticks is valid for this immutable
  // journey. A later journey or a future/zero revision is never accepted.
  const terminal = row
    ? undefined
    : ctx.db.constructionTraversalAudit.id.find(args.traversalId);
  demand(
    row
      ? row.id === args.traversalId && row.visitId === visit.visitId
      : terminal &&
          terminal.characterId === characterId &&
          sameOwner(terminal.owner, ctx.sender) &&
          terminal.visitId === visit.visitId,
    "current traversal required",
  );
  demand(
    args.expectedRevision > 0n &&
      args.expectedRevision <= (row?.revision ?? terminal!.revision),
    "observed traversal revision invalid",
  );
  const op = operation(
    ctx,
    args.operationId,
    {
      kind: "cancel-traversal",
      characterId,
      ...args,
      expectedRevision: String(args.expectedRevision),
    },
    0n,
    0n,
  );
  if (op.replay) return;
  demand(
    row && row.id === args.traversalId && row.visitId === visit.visitId,
    "current traversal required",
  );
  requestReturn(ctx, row, "cancelled");
  receipt(
    ctx,
    op.key,
    op.request,
    row.id,
    ctx.db.constructionTraversal.characterId.find(characterId)!.revision,
  );
}
/** Invoke on last disconnect/admission loss. It preserves exact accepted position
 * immediately, and reversal continues at fixed ticks even without a socket. */
export function interruptConstructionTraversalOwner(
  ctx: TraversalContext,
  owner: Identity,
) {
  for (const row of ctx.db.constructionTraversal.by_owner.filter(owner))
    requestReturn(ctx, row, "disconnected");
}
function sweptBounds(
  link: CompiledTraversalLink,
  s: TraversalState,
  toDistance: number,
): TraversalBounds3 {
  const points = [
    s.startPositionM,
    ...(s.sourceDeckId === link.lower.deckId
      ? link.pathM
      : [...link.pathM].reverse()),
  ];
  const a = Math.min(s.distanceM, toDistance),
    b = Math.max(s.distanceM, toDistance);
  const positions = [
    traversalPlacement(link, s).positionM,
    traversalPlacement(link, { ...s, phase: "blocked", distanceM: toDistance })
      .positionM,
  ];
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += Math.hypot(...points[i].map((v, k) => v - points[i - 1][k]));
    if (d > a && d < b) positions.push(points[i]);
  }
  return {
    min: [
      Math.min(...positions.map((p) => p[0])) - BODY.radiusM,
      Math.min(...positions.map((p) => p[1])) - BODY.radiusM,
      Math.min(...positions.map((p) => p[2])),
    ],
    max: [
      Math.max(...positions.map((p) => p[0])) + BODY.radiusM,
      Math.max(...positions.map((p) => p[1])) + BODY.radiusM,
      Math.max(...positions.map((p) => p[2])) + BODY.heightM,
    ],
  };
}
function pathLength(link: CompiledTraversalLink, s: TraversalState) {
  const points = [
    s.startPositionM,
    ...(s.sourceDeckId === link.lower.deckId
      ? link.pathM
      : [...link.pathM].reverse()),
  ];
  return points
    .slice(1)
    .reduce(
      (sum, p, i) => sum + Math.hypot(...p.map((v, k) => v - points[i][k])),
      0,
    );
}
/** Internal fixed-schedule hook. At most one 50 ms simulation step per accepted
 * delivery; duplicate/older/substep callbacks and restart gaps never catch up. */
export function stepConstructionTraversals(
  ctx: TraversalContext,
  registry: TraversalRegistry,
) {
  const rows = [...ctx.db.constructionTraversal.iter()];
  if (rows.length === 0) return false;
  const now = ctx.timestamp.microsSinceUnixEpoch,
    clock = ctx.db.constructionTraversalClock.id.find(CLOCK);
  if (
    clock &&
    (now <= clock.lastScheduleMicros ||
      now - clock.lastScheduleMicros <
        BigInt(TRAVERSAL_LIMITS.fixedSeconds * 1e6))
  )
    return false;
  const tick = (clock?.tick ?? 0n) + 1n;
  demand(
    rows.length <= TRAVERSAL_AUTHORITY_LIMITS.active,
    "active work budget exceeded",
  );
  for (const row of rows) {
    const stored = ctx.db.constructionTraversalLink.id.find(row.linkId);
    let link: CompiledTraversalLink;
    try {
      demand(stored, "installed link missing");
      link = compiled(stored, registry);
    } catch {
      ctx.db.constructionTraversal.characterId.update({
        ...row,
        phase: "blocked",
        interruption: "geometry-changed",
        revision: row.revision + 1n,
        lastTick: tick,
        stateJson: encode({
          ...state(row),
          phase: "blocked",
          interruption: "geometry-changed",
          revision: row.revision + 1n,
          lastTick: tick,
        }),
      });
      continue;
    }
    const prior = state(row),
      actor = ctx.db.character.id.find(row.characterId),
      visit = ctx.db.constructionLocation.characterId.find(row.characterId),
      instance = ctx.db.constructionInstance.id.find(row.instanceId);
    let allowed = false;
    try {
      if (instance && sameOwner(instance.owner, row.owner)) {
        requireGrant(
          { ...ctx, sender: row.owner },
          instance.workspaceId,
          "instance.spawn",
        );
        allowed = auth.canConsume(ctx, row.owner);
      }
    } catch {
      /* Reversal, never a permission bypass. */
    }
    const validActor =
      !!actor &&
      sameOwner(actor.owner, row.owner) &&
      actor.shipId === row.instanceId &&
      !!visit &&
      visit.instanceId === row.instanceId &&
      visit.visitId === row.visitId &&
      visit.deckId === row.sourceDeckId &&
      visit.revision === row.locationRevision &&
      actor.localX === prior.startPositionM[0] &&
      actor.localY === prior.startPositionM[1] &&
      !ctx.db.couchSeat.characterId.find(row.characterId) &&
      ctx.db.station.shipId.find(row.instanceId)?.occupantId !==
        row.characterId;
    const held = ctx.db.constructionTraversalReservation.linkId.find(
      row.linkId,
    );
    const reserved =
      held &&
      held.traversalId === row.id &&
      held.characterId === row.characterId &&
      held.instanceId === row.instanceId &&
      sameOwner(held.owner, row.owner)
        ? reservation(held)
        : null;
    const bodies = occupants(ctx, row.instanceId, row.characterId),
      step = link.metresPerSecond * TRAVERSAL_LIMITS.fixedSeconds,
      total = pathLength(link, prior);
    const destination =
      prior.sourceDeckId === link.lower.deckId ? link.upper : link.lower;
    const next = stepPure(link, prior, tick, {
      actorPresent: validActor,
      connected: actor?.connected ?? false,
      mayTraverse: allowed,
      cancelRequested: prior.interruption === "cancelled",
      instanceRevision:
        stored && liveInstallation(ctx, stored) ? instance!.revision : 0n,
      linkRevision: stored?.revision ?? 0n,
      reservation: reserved,
      forwardClear: clear(
        [sweptBounds(link, prior, Math.min(total, prior.distanceM + step))],
        bodies,
      ),
      reverseClear: clear(
        [sweptBounds(link, prior, Math.max(0, prior.distanceM - step))],
        bodies,
      ),
      destinationClear: clear([body(destination.anchorM)], bodies),
      sourceClear: validActor && clear([body(prior.startPositionM)], bodies),
    });
    const updated = activeRow(row, next, link),
      placement = traversalPlacement(link, next);
    if (placement.releaseReservation) {
      demand(validActor && actor && visit, "terminal actor/location missing");
      ctx.db.character.id.update({
        ...actor,
        localX: placement.positionM[0],
        localY: placement.positionM[1],
        sprinting: false,
      });
      ctx.db.constructionLocation.characterId.update({
        ...visit,
        deckId: placement.deckId,
        revision: visit.revision + 1n,
      });
      ctx.db.constructionTraversalAudit.insert({
        id: row.id,
        owner: row.owner,
        characterId: row.characterId,
        instanceId: row.instanceId,
        linkId: row.linkId,
        visitId: row.visitId,
        sourceDeckId: row.sourceDeckId,
        destinationDeckId: row.destinationDeckId,
        outcome: next.phase,
        interruption: next.interruption,
        revision: next.revision,
        completedTick: tick,
      });
      ctx.db.constructionTraversal.characterId.delete(row.characterId);
      ctx.db.constructionTraversalReservation.linkId.delete(row.linkId);
      clearInputs(ctx, row.characterId);
    } else {
      ctx.db.constructionTraversal.characterId.update(updated);
      clearInputs(ctx, row.characterId);
    }
  }
  const nextClock = { id: CLOCK, tick, lastScheduleMicros: now };
  if (clock) ctx.db.constructionTraversalClock.id.update(nextClock);
  else ctx.db.constructionTraversalClock.insert(nextClock);
  return true;
}
export const traversalProjection = t.row("ConstructionTraversalStatus", {
  characterId: t.string().primaryKey(),
  traversalId: t.string(),
  instanceId: t.string(),
  linkId: t.string(),
  sourceDeckId: t.string(),
  destinationDeckId: t.string(),
  phase: t.string(),
  interruption: t.string(),
  revision: t.u64(),
  x: t.f64(),
  y: t.f64(),
  z: t.f64(),
});
/** gameView wrapper adds connection admission; no installation hashes, source
 * inventory, paths or other owners' occupants are exposed with this projection. */
/** Own accepted position remains available during a forced return after workspace
 * grant loss. This exposes no construction path or other actor state; gameView
 * still gates admission, and link discovery/commands keep their grant checks. */
export function ownConstructionTraversals(ctx: TraversalReadContext) {
  return [...ctx.db.constructionTraversal.by_owner.filter(ctx.sender)].flatMap(
    (row) => {
      const instance = ctx.db.constructionInstance.id.find(row.instanceId),
        actor = ctx.db.character.id.find(row.characterId),
        visit = ctx.db.constructionLocation.characterId.find(row.characterId);
      return instance &&
        sameOwner(instance.owner, ctx.sender) &&
        actor &&
        sameOwner(actor.owner, ctx.sender) &&
        actor.shipId === row.instanceId &&
        visit?.instanceId === row.instanceId &&
        visit.visitId === row.visitId
        ? [
            {
              characterId: row.characterId,
              traversalId: row.id,
              instanceId: row.instanceId,
              linkId: row.linkId,
              sourceDeckId: row.sourceDeckId,
              destinationDeckId: row.destinationDeckId,
              phase: row.phase,
              interruption: row.interruption,
              revision: row.revision,
              x: row.acceptedX,
              y: row.acceptedY,
              z: row.acceptedZ,
            },
          ]
        : [];
    },
  );
}

export const traversalLinkProjection = t.row(
  "ConstructionTraversalLinkIntent",
  {
    id: t.string().primaryKey(),
    characterId: t.string(),
    instanceId: t.string(),
    linkId: t.string(),
    visitId: t.string(),
    sourceDeckId: t.string(),
    destinationDeckId: t.string(),
    locationRevision: t.u64(),
    instanceRevision: t.u64(),
    linkRevision: t.u64(),
    atLanding: t.bool(),
    x: t.f64(),
    y: t.f64(),
    z: t.f64(),
  },
);
/** Only links on the owner's currently occupied review deck are discoverable.
 * Landings expose an intent target; clients still cannot submit its position. */
export function ownConstructionTraversalLinks(ctx: TraversalReadContext) {
  const workspaces = new Set(
    [...ctx.db.constructionGrant.by_principal.filter(ctx.sender)]
      .filter((g) => !g.revoked && g.capability === "draft.read")
      .map((g) => g.workspaceId),
  );
  return [...ctx.db.character.by_owner.filter(ctx.sender)].flatMap((actor) => {
    const visit = ctx.db.constructionLocation.characterId.find(actor.id);
    if (!visit || actor.shipId !== visit.instanceId) return [];
    const instance = ctx.db.constructionInstance.id.find(visit.instanceId);
    if (
      !instance ||
      !sameOwner(instance.owner, ctx.sender) ||
      !workspaces.has(instance.workspaceId)
    )
      return [];
    return [
      ...ctx.db.constructionTraversalLink.by_instance.filter(instance.id),
    ].flatMap((row) => {
      if (!sameOwner(row.owner, ctx.sender) || !liveInstallation(ctx, row))
        return [];
      const side =
        visit.deckId === row.lowerDeckId
          ? "lower"
          : visit.deckId === row.upperDeckId
            ? "upper"
            : null;
      if (!side) return [];
      const link = JSON.parse(row.contractJson) as CompiledTraversalLink,
        source = link[side],
        destination = link[side === "lower" ? "upper" : "lower"],
        capsule = body([actor.localX, actor.localY, source.walkingZ]);
      return [
        {
          id: JSON.stringify([actor.id, row.id]),
          characterId: actor.id,
          instanceId: instance.id,
          linkId: row.id,
          visitId: visit.visitId,
          sourceDeckId: source.deckId,
          destinationDeckId: destination.deckId,
          locationRevision: visit.revision,
          instanceRevision: row.instanceRevision,
          linkRevision: row.revision,
          atLanding:
            [actor.localX, actor.localY].every(Number.isFinite) &&
            capsule.min.every(
              (n, k) =>
                n >= source.freeBoundsM.min[k] - EPS &&
                capsule.max[k] <= source.freeBoundsM.max[k] + EPS,
            ),
          x: source.anchorM[0],
          y: source.anchorM[1],
          z: source.anchorM[2],
        },
      ];
    });
  });
}
