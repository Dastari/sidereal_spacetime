import { NATIVE_STAIR_ROOM_PIN } from "@sidereal/content/construction-stairs-room";
import type { Identity } from "spacetimedb";
import { SenderError, t } from "spacetimedb/server";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  nativeStairRoomInstallation,
  compileNativeStairRoom,
  type NativeStairRoomDocument,
} from "@sidereal/sim/construction-stairs-document";
import {
  beginStairWalk,
  stepStairWalk,
  STAIR_LIMITS,
  type StairWalkState,
  type CompiledStairWalkSurface,
  type StairReservation,
} from "@sidereal/sim/construction-stairs";
import type {
  TraversalPoint3,
  TraversalBounds3,
} from "@sidereal/content/construction-traversal";

export const STAIR_AUTHORITY_LIMITS = Object.freeze({
  links: 128,
  active: 64,
  occupants: 64,
  auditsPerOwner: 512,
  documentBytes: 262144,
  stateBytes: 8192,
});
interface Key<R> {
  find(id: string): R | null | undefined;
  update(row: R): unknown;
  delete(id: string): unknown;
}
interface Store<R> {
  iter(): Iterable<R>;
  insert(row: R): unknown;
}
interface Filter<R, V> {
  filter(value: V): Iterable<R>;
}
export interface StairLinkRow {
  id: string;
  owner: Identity;
  instanceId: string;
  instanceRevision: bigint;
  revision: bigint;
  documentSha256: string;
  proofHash: string;
  lowerDeckId: string;
  upperDeckId: string;
}
export interface StairWalkRow {
  characterId: string;
  id: string;
  owner: Identity;
  instanceId: string;
  stairId: string;
  visitId: string;
  locationRevision: bigint;
  sourceDeckId: string;
  anchorX: number;
  anchorY: number;
  stateJson: string;
  revision: bigint;
  acceptedX: number;
  acceptedY: number;
  acceptedZ: number;
  phase: string;
  egressOnly: boolean;
  interruption: string;
}
export interface StairReservationRow {
  stairId: string;
  instanceId: string;
  characterId: string;
  walkId: string;
  visitId: string;
  proofHash: string;
  boundsJson: string;
}
export interface StairAuditRow {
  id: string;
  owner: Identity;
  characterId: string;
  instanceId: string;
  stairId: string;
  visitId: string;
  sourceDeckId: string;
  destinationDeckId: string;
  outcome: string;
  interruption: string;
  revision: bigint;
  completedMicros: bigint;
}
interface Actor {
  id: string;
  owner: Identity;
  shipId: string;
  localX: number;
  localY: number;
  connected: boolean;
  sprinting: boolean;
}
interface Location {
  characterId: string;
  instanceId: string;
  deckId: string;
  visitId: string;
  revision: bigint;
}
interface Instance {
  id: string;
  owner: Identity;
  workspaceId: string;
  documentJson: string;
  revision: bigint;
}
interface Motion {
  characterId: string;
  sequence: bigint;
  dx: number;
  dy: number;
  updatedMicros: bigint;
}
/** Structural context can be staged without registering new schema tables. Hooks
 * are trusted server adapters, never reducer arguments or client-supplied booleans. */
export interface StairAuthorityContext {
  sender: Identity;
  timestamp: { microsSinceUnixEpoch: bigint };
  newUuidV4(): { toString(): string };
  db: {
    constructionStairLink: Store<StairLinkRow> & {
      id: Key<StairLinkRow>;
      by_instance: Filter<StairLinkRow, string>;
      by_owner: Filter<StairLinkRow, Identity>;
    };
    constructionStairWalk: Store<StairWalkRow> & {
      characterId: Key<StairWalkRow>;
      by_instance: Filter<StairWalkRow, string>;
      by_owner: Filter<StairWalkRow, Identity>;
    };
    constructionStairReservation: Store<StairReservationRow> & {
      stairId: Key<StairReservationRow>;
      by_instance: Filter<StairReservationRow, string>;
    };
    constructionStairAudit: Store<StairAuditRow> & {
      id: Key<StairAuditRow>;
      by_owner: Filter<StairAuditRow, Identity>;
    };
    constructionInstance: { id: Pick<Key<Instance>, "find"> };
    constructionLocation: {
      characterId: Pick<Key<Location>, "find" | "update">;
      by_instance: Filter<Location, string>;
    };
    constructionDeck: {
      id: {
        find(
          id: string,
        ):
          | { id: string; instanceId: string; elevation: number }
          | null
          | undefined;
      };
    };
    character: { id: Pick<Key<Actor>, "find" | "update"> };
    input: { characterId: Pick<Key<Motion>, "find"> };
  };
}
/** Read-only shape used by gameView after the new tables are registered. */
type StairReadTables = {
  [Table in keyof StairAuthorityContext["db"]]: {
    [
      Field in keyof StairAuthorityContext["db"][Table] as Field extends "insert"
        ? never
        : Field
    ]: StairAuthorityContext["db"][Table][Field] extends {
      find(id: string): infer Result;
    }
      ? { find(id: string): Result }
      : StairAuthorityContext["db"][Table][Field];
  };
};
export interface StairReadContext {
  sender: Identity;
  db: StairReadTables;
}
export interface StairAuthorityHooks {
  /** Auth admission AND a currently valid input-control lease at consumption. */
  mayConsumeMovement(owner: Identity, characterId: string): boolean;
  /** Server-held input connection epoch; client sequences restart on a new lease. */
  inputConnectionId?(characterId: string): string | undefined;
  /** Current authoritative workspace grant; initial entry requires it. */
  mayEnter(owner: Identity, workspaceId: string): boolean;
  /** Couch/station/ladder/other incompatible activity; active stair is checked here. */
  incompatibleActivity(characterId: string): boolean;
  /** Clear combat/sprinting and planar motion at entry/exit/interruption. Do not clear every active tick. */
  clearControls(characterId: string): void;
  /** Disable aim/combat without consuming the held walking intent. */
  suspendCombat(characterId: string): void;
  /** Existing access-loss exit path after a grant-loss landing commit. */
  completeSafeEgress(characterId: string, walkId: string): void;
  /** Preflight bounded receipt capacity and stored safe return before committing. */
  mayCompleteSafeEgress?(characterId: string): boolean;
  /** Other vertical controller's actual accepted position, or undefined for ordinary deck actor. */
  otherAcceptedPosition(characterId: string): TraversalPoint3 | undefined;
}
const sameOwner = (a: Identity, b: Identity) => a.isEqual(b);
const encode = (v: unknown) =>
  JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x));
const digest = (v: string) => bytesToHex(sha256(new TextEncoder().encode(v)));
function demand(ok: unknown, message: string): asserts ok {
  if (!ok) throw new SenderError("Construction stair authority: " + message);
}
function bounded<T>(iter: Iterable<T>, limit: number): T[] {
  const out: T[] = [];
  for (const row of iter) {
    demand(out.length < limit, "work budget exceeded");
    out.push(row);
  }
  return out;
}
type AuthorityStairState = StairWalkState & { inputConnectionId?: string };
function decode(row: StairWalkRow): AuthorityStairState {
  demand(
    new TextEncoder().encode(row.stateJson).length <=
      STAIR_AUTHORITY_LIMITS.stateBytes,
    "state byte cap",
  );
  const s = JSON.parse(row.stateJson) as AuthorityStairState;
  return {
    ...s,
    inputSequence: BigInt(s.inputSequence),
    lastTick: BigInt(s.lastTick),
    revision: BigInt(s.revision),
    input: s.input
      ? { ...s.input, receivedMicros: BigInt(s.input.receivedMicros) }
      : null,
  };
}
function compile(
  ctx: StairReadContext,
  link: StairLinkRow,
): CompiledStairWalkSurface {
  const instance = ctx.db.constructionInstance.id.find(link.instanceId);
  demand(
    instance &&
      sameOwner(instance.owner, link.owner) &&
      instance.revision === link.instanceRevision,
    "installation owner/revision changed",
  );
  demand(
    new TextEncoder().encode(instance.documentJson).length <=
      STAIR_AUTHORITY_LIMITS.documentBytes &&
      digest(instance.documentJson) === link.documentSha256,
    "installation document changed",
  );
  const surface = compileNativeStairRoom(
    nativeStairRoomInstallation(
      JSON.parse(instance.documentJson) as NativeStairRoomDocument,
      instance.revision,
      link.revision,
    ),
  );
  demand(
    surface.instanceId === link.instanceId &&
      surface.stairId === link.id &&
      surface.proofHash === link.proofHash &&
      surface.lowerDeckId === link.lowerDeckId &&
      surface.upperDeckId === link.upperDeckId,
    "native proof differs",
  );
  for (const [id, z] of [
    [surface.lowerDeckId, 0],
    [surface.upperDeckId, 3.1875],
  ] as const) {
    const deck = ctx.db.constructionDeck.id.find(id);
    demand(
      deck && deck.instanceId === instance.id && deck.elevation === z,
      "actual deck differs",
    );
  }
  return surface;
}
/** Validated spawn calls this internal function after actual deck rows exist. */
export function installConstructionStair(
  ctx: StairAuthorityContext,
  instanceId: string,
) {
  const instance = ctx.db.constructionInstance.id.find(instanceId);
  demand(
    instance && sameOwner(instance.owner, ctx.sender),
    "owned installed instance required",
  );
  demand(
    new TextEncoder().encode(instance.documentJson).length <=
      STAIR_AUTHORITY_LIMITS.documentBytes,
    "document byte cap",
  );
  const s = compileNativeStairRoom(
    nativeStairRoomInstallation(
      JSON.parse(instance.documentJson) as NativeStairRoomDocument,
      instance.revision,
      1n,
    ),
  );
  const row: StairLinkRow = {
    id: s.stairId,
    owner: instance.owner,
    instanceId,
    instanceRevision: instance.revision,
    revision: 1n,
    documentSha256: digest(instance.documentJson),
    proofHash: s.proofHash,
    lowerDeckId: s.lowerDeckId,
    upperDeckId: s.upperDeckId,
  };
  compile(ctx, row);
  const old = ctx.db.constructionStairLink.id.find(row.id);
  if (old) {
    demand(encode(old) === encode(row), "conflicting installation replay");
    return old;
  }
  bounded(ctx.db.constructionStairLink.iter(), STAIR_AUTHORITY_LIMITS.links);
  demand(
    [...ctx.db.constructionStairLink.iter()].length <
      STAIR_AUTHORITY_LIMITS.links,
    "link admission cap",
  );
  ctx.db.constructionStairLink.insert(row);
  return row;
}
function body(p: TraversalPoint3): TraversalBounds3 {
  return {
    min: [p[0] - 0.3, p[1] - 0.3, p[2]],
    max: [p[0] + 0.3, p[1] + 0.3, p[2] + 1.8],
  };
}
const overlap = (a: TraversalBounds3, b: TraversalBounds3) =>
  a.min.every((x, i) => x < b.max[i] - 1e-8 && a.max[i] > b.min[i] + 1e-8);
function reservationBounds(s: CompiledStairWalkSurface): TraversalBounds3 {
  return {
    min: [
      Math.min(...s.supports.map((p) => p.boundsM.min[0])) - 0.3,
      Math.min(...s.supports.map((p) => p.boundsM.min[1])) - 0.3,
      Math.min(...s.supports.map((p) => p.topZM)),
    ],
    max: [
      Math.max(...s.supports.map((p) => p.boundsM.max[0])) + 0.3,
      Math.max(...s.supports.map((p) => p.boundsM.max[1])) + 0.3,
      Math.max(...s.supports.map((p) => p.topZM)) + 1.8,
    ],
  };
}
function occupants(
  ctx: StairAuthorityContext,
  h: StairAuthorityHooks,
  instanceId: string,
  except: string,
): TraversalBounds3[] {
  return bounded(
    ctx.db.constructionLocation.by_instance.filter(instanceId),
    STAIR_AUTHORITY_LIMITS.occupants,
  ).flatMap((v) => {
    if (v.characterId === except) return [];
    const a = ctx.db.character.id.find(v.characterId);
    if (!a || a.shipId !== instanceId) return [];
    const active = ctx.db.constructionStairWalk.characterId.find(a.id),
      deck = ctx.db.constructionDeck.id.find(v.deckId);
    demand(deck && deck.instanceId === instanceId, "occupant deck missing");
    const p: TraversalPoint3 = active
      ? [active.acceptedX, active.acceptedY, active.acceptedZ]
      : (h.otherAcceptedPosition(a.id) ?? [
          a.localX,
          a.localY,
          deck.elevation + 0.1875,
        ]);
    demand(p.every(Number.isFinite), "occupant placement invalid");
    return [body(p)];
  });
}
function rowState(row: StairWalkRow, s: AuthorityStairState): StairWalkRow {
  const json = encode(s);
  demand(
    new TextEncoder().encode(json).length <= STAIR_AUTHORITY_LIMITS.stateBytes,
    "state byte cap",
  );
  return {
    ...row,
    stateJson: json,
    revision: s.revision,
    acceptedX: s.positionM[0],
    acceptedY: s.positionM[1],
    acceptedZ: s.positionM[2],
    phase: s.phase,
  };
}
/** Internal movement adapter entry, not an exposed begin reducer. It reads the
 * already-authorized accepted actor/input and derives the stair/landing itself. */
export function tryEnterConstructionStair(
  ctx: StairAuthorityContext,
  h: StairAuthorityHooks,
  characterId: string,
): boolean {
  if (ctx.db.constructionStairWalk.characterId.find(characterId)) return true;
  const a = ctx.db.character.id.find(characterId),
    v = ctx.db.constructionLocation.characterId.find(characterId),
    input = ctx.db.input.characterId.find(characterId);
  if (
    !a ||
    !v ||
    a.shipId !== v.instanceId ||
    !a.connected ||
    !input ||
    (!input.dx && !input.dy)
  )
    return false;
  const instance = ctx.db.constructionInstance.id.find(v.instanceId);
  if (
    !instance ||
    !sameOwner(instance.owner, a.owner) ||
    !h.mayConsumeMovement(a.owner, a.id) ||
    !h.mayEnter(a.owner, instance.workspaceId) ||
    h.incompatibleActivity(a.id)
  )
    return false;
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (
    input.updatedMicros > now ||
    now - input.updatedMicros > STAIR_LIMITS.maxIntentAgeMicros
  )
    return false;
  for (const link of bounded(
    ctx.db.constructionStairLink.by_instance.filter(instance.id),
    STAIR_AUTHORITY_LIMITS.links,
  )) {
    const s = compile(ctx, link),
      kind =
        v.deckId === s.lowerDeckId
          ? "lower-landing"
          : v.deckId === s.upperDeckId
            ? "upper-landing"
            : null;
    const landing = s.supports.find(
      (p) =>
        p.kind === kind &&
        a.localX >= p.boundsM.min[0] &&
        a.localX <= p.boundsM.max[0] &&
        a.localY >= p.boundsM.min[1] &&
        a.localY <= p.boundsM.max[1],
    );
    if (!landing) continue;
    // Enter only when heading toward the actual first/last riser. Walking outward
    // from a completed landing must remain ordinary deck movement, not re-enter.
    const edge = s.steps.find(
      (e) => e.fromSupportId === landing.id || e.toSupportId === landing.id,
    );
    demand(edge, "landing step missing");
    const sign = edge.fromSupportId === landing.id ? 1 : -1;
    if ((input.dx * edge.advanceM[0] + input.dy * edge.advanceM[1]) * sign <= 0)
      return false;
    if (ctx.db.constructionStairReservation.stairId.find(link.id)) return true;
    const bounds = reservationBounds(s);
    if (occupants(ctx, h, instance.id, a.id).some((p) => overlap(bounds, p)))
      return true;
    demand(
      bounded(
        ctx.db.constructionStairWalk.iter(),
        STAIR_AUTHORITY_LIMITS.active,
      ).length < STAIR_AUTHORITY_LIMITS.active,
      "active admission cap",
    );
    demand(
      bounded(
        ctx.db.constructionStairAudit.by_owner.filter(a.owner),
        STAIR_AUTHORITY_LIMITS.auditsPerOwner,
      ).length < STAIR_AUTHORITY_LIMITS.auditsPerOwner,
      "audit admission cap",
    );
    const id = ctx.newUuidV4().toString(),
      begin = beginStairWalk(
        s,
        {
          walkId: id,
          actorId: a.id,
          instanceId: instance.id,
          visitId: v.visitId,
          deckId: v.deckId,
          positionM: [a.localX, a.localY, landing.topZM],
          inputSequence: input.sequence,
          admitted: true,
          connected: true,
          standing: true,
        },
        now / 50000n,
      );
    const row: StairWalkRow = {
      characterId: a.id,
      id,
      owner: a.owner,
      instanceId: instance.id,
      stairId: link.id,
      visitId: v.visitId,
      locationRevision: v.revision,
      sourceDeckId: v.deckId,
      anchorX: a.localX,
      anchorY: a.localY,
      stateJson: "",
      revision: 1n,
      acceptedX: a.localX,
      acceptedY: a.localY,
      acceptedZ: landing.topZM,
      phase: "stopped",
      egressOnly: false,
      interruption: "",
    };
    ctx.db.constructionStairWalk.insert(
      rowState(row, {
        ...begin.state,
        inputConnectionId: h.inputConnectionId?.(a.id),
      }),
    );
    ctx.db.constructionStairReservation.insert({
      stairId: link.id,
      instanceId: instance.id,
      characterId: a.id,
      walkId: id,
      visitId: v.visitId,
      proofHash: s.proofHash,
      boundsJson: encode(bounds),
    });
    h.suspendCombat(a.id);
    // Preserve the accepted planar intent on entry; caller clears combat only and
    // suppresses sprint. Clearing dx/dy here would make a held key stop on entry.
    if (a.sprinting) ctx.db.character.id.update({ ...a, sprinting: false });
    return true;
  }
  return false;
}
function semantic(s: StairWalkState) {
  // Accepted input/cursor already lives in the authoritative input-control/input
  // rows. A supported or blocked pose need not repeat their heartbeat writes.
  const {
    lastTick: _t,
    revision: _r,
    inputSequence: _sequence,
    input: _input,
    ...rest
  } = s;
  return encode(rest);
}
function hold(ctx: StairAuthorityContext, row: StairWalkRow, reason: string) {
  if (row.phase === "blocked" && row.interruption === reason) return false;
  ctx.db.constructionStairWalk.characterId.update({
    ...row,
    phase: "blocked",
    interruption: reason,
    revision: row.revision + 1n,
  });
  return true;
}
function commitExit(
  ctx: StairAuthorityContext,
  h: StairAuthorityHooks,
  row: StairWalkRow,
  s: StairWalkState,
  deckId: string,
) {
  const a = ctx.db.character.id.find(row.characterId)!,
    v = ctx.db.constructionLocation.characterId.find(row.characterId)!;
  ctx.db.character.id.update({
    ...a,
    localX: s.positionM[0],
    localY: s.positionM[1],
    sprinting: false,
  });
  ctx.db.constructionLocation.characterId.update({
    ...v,
    deckId,
    revision: v.revision + 1n,
  });
  ctx.db.constructionStairAudit.insert({
    id: row.id,
    owner: row.owner,
    characterId: row.characterId,
    instanceId: row.instanceId,
    stairId: row.stairId,
    visitId: row.visitId,
    sourceDeckId: row.sourceDeckId,
    destinationDeckId: deckId,
    outcome: row.egressOnly ? "egress-exited" : "exited",
    interruption: row.interruption,
    revision: s.revision,
    completedMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
  ctx.db.constructionStairWalk.characterId.delete(row.characterId);
  ctx.db.constructionStairReservation.stairId.delete(row.stairId);
  h.clearControls(row.characterId);
  if (row.egressOnly) h.completeSafeEgress(row.characterId, row.id);
}
/** No global clock row and no idle writes. Each active walk advances at most one
 * fixed50 ms step; elapsed time after restart is never replayed as movement. */
export function stepConstructionStairs(
  ctx: StairAuthorityContext,
  h: StairAuthorityHooks,
): number {
  const rows = bounded(
      ctx.db.constructionStairWalk.iter(),
      STAIR_AUTHORITY_LIMITS.active,
    ),
    now = ctx.timestamp.microsSinceUnixEpoch,
    tick = now / 50000n;
  let writes = 0;
  for (const row of rows) {
    let terminal:
      { row: StairWalkRow; state: StairWalkState; deckId: string } | undefined;
    let pendingUpdate: StairWalkRow | undefined;
    try {
      const link = ctx.db.constructionStairLink.id.find(row.stairId);
      demand(link, "installed stair missing");
      const s = compile(ctx, link),
        prior = decode(row);
      const priorSemantic = semantic(prior);
      const a = ctx.db.character.id.find(row.characterId),
        v = ctx.db.constructionLocation.characterId.find(row.characterId),
        instance = ctx.db.constructionInstance.id.find(row.instanceId);
      demand(
        a &&
          sameOwner(a.owner, row.owner) &&
          a.shipId === row.instanceId &&
          v?.instanceId === row.instanceId &&
          v.visitId === row.visitId &&
          v.revision === row.locationRevision &&
          v.deckId === row.sourceDeckId &&
          a.localX === row.anchorX &&
          a.localY === row.anchorY &&
          !h.incompatibleActivity(a.id),
        "actor/location changed",
      );
      demand(
        prior.walkId === row.id &&
          prior.actorId === row.characterId &&
          prior.visitId === row.visitId &&
          prior.sourceDeckId === row.sourceDeckId &&
          prior.positionM[0] === row.acceptedX &&
          prior.positionM[1] === row.acceptedY &&
          prior.positionM[2] === row.acceptedZ,
        "persisted position differs",
      );
      const held = ctx.db.constructionStairReservation.stairId.find(
        row.stairId,
      );
      demand(
        held &&
          held.characterId === row.characterId &&
          held.walkId === row.id &&
          held.instanceId === row.instanceId &&
          held.visitId === row.visitId &&
          held.proofHash === s.proofHash &&
          held.boundsJson === encode(reservationBounds(s)),
        "reservation changed",
      );
      if (tick <= prior.lastTick) continue;
      const allowed = h.mayEnter(row.owner, instance!.workspaceId),
        movement = a.connected && h.mayConsumeMovement(row.owner, a.id),
        lostNow = !allowed && !row.egressOnly;
      const inputConnectionId = movement
        ? h.inputConnectionId?.(a.id)
        : undefined;
      if (inputConnectionId && inputConnectionId !== prior.inputConnectionId) {
        // The authenticated lease changed, so its sequence namespace starts anew.
        // Keep accepted geometry/support/pending recovery exactly as committed.
        prior.inputConnectionId = inputConnectionId;
        prior.inputSequence = 0n;
        prior.input = null;
      }
      const updated = {
        ...row,
        egressOnly: row.egressOnly || !allowed,
        interruption: !a.connected
          ? "disconnected"
          : !allowed
            ? "grant-lost"
            : row.interruption,
      };
      const input = ctx.db.input.characterId.find(a.id),
        recover = lostNow || !movement;
      // A grant-loss edge interrupts the unfinished riser once. Subsequent valid
      // intent is restricted egress inside this existing proof/reservation only.
      const inputConsistent =
        !prior.input ||
        !input ||
        input.sequence > prior.inputSequence ||
        (input.sequence === prior.inputSequence &&
          input.dx === prior.input.dx &&
          input.dy === prior.input.dy &&
          input.updatedMicros === prior.input.receivedMicros);
      const acceptedInput = inputConsistent ? input : undefined;
      const intent = acceptedInput
        ? {
            sequence: acceptedInput.sequence,
            dx: acceptedInput.dx,
            dy: acceptedInput.dy,
          }
        : {
            sequence: prior.inputSequence,
            dx: prior.input?.dx ?? 0,
            dy: prior.input?.dy ?? 0,
          };
      const reservation: StairReservation = {
        walkId: row.id,
        visitId: row.visitId,
        actorId: a.id,
        instanceId: row.instanceId,
        stairId: row.stairId,
        proofHash: s.proofHash,
      };
      const next = stepStairWalk(s, prior, intent, tick, {
        actorPresent: true,
        admitted: movement,
        connected: a.connected,
        mayWalk: !recover && inputConsistent,
        instanceRevision: link.instanceRevision,
        stairRevision: link.revision,
        nowMicros: now,
        receivedMicros:
          acceptedInput?.updatedMicros ?? prior.input?.receivedMicros ?? 0n,
        reservation,
        occupied: occupants(ctx, h, row.instanceId, a.id),
      });
      // Before the first riser, an outward/idle actor is already on a real exit
      // landing; release without manufacturing enteredFlight or moving it.
      const landing = s.supports.find((p) => p.id === next.state.supportId),
        margin = s.body.radiusM;
      const safeLanding =
        landing &&
        (landing.kind === "lower-landing" ||
          landing.kind === "upper-landing") &&
        !next.state.pending &&
        next.state.positionM
          .slice(0, 2)
          .every(
            (x, i) =>
              x >= landing.boundsM.min[i] + margin &&
              x <= landing.boundsM.max[i] - margin,
          );
      const landingEdge =
        landing &&
        s.steps.find(
          (e) => e.fromSupportId === landing.id || e.toSupportId === landing.id,
        );
      const towardsFlight = !!(
        landingEdge &&
        input &&
        (input.dx * landingEdge.advanceM[0] +
          input.dy * landingEdge.advanceM[1]) *
          (landingEdge.fromSupportId === landing!.id ? 1 : -1) >
          0
      );
      if (
        next.exit ||
        (safeLanding &&
          !next.state.enteredFlight &&
          (!movement || !allowed || !towardsFlight))
      ) {
        if (
          updated.egressOnly &&
          (!movement || h.mayCompleteSafeEgress?.(row.characterId) === false)
        ) {
          // Preserve supported reservation until game/input admission returns.
          // Calling leaveReview while disconnected would throw every world tick.
          next.state = {
            ...next.state,
            phase: movement ? "blocked" : "stopped",
          };
          if (movement) updated.interruption = "safe-egress-unavailable";
          next.exit = null;
          next.releaseReservation = false;
        } else {
          terminal = {
            row: updated,
            state: next.state,
            deckId: next.exit?.deckId ?? row.sourceDeckId,
          };
        }
      }
      if (
        !terminal &&
        (priorSemantic !== semantic(next.state) ||
          updated.egressOnly !== row.egressOnly ||
          updated.interruption !== row.interruption ||
          row.phase !== next.state.phase)
      ) {
        pendingUpdate = rowState(updated, {
          ...next.state,
          revision: row.revision + 1n,
        });
      }
    } catch (error) {
      // Validation faults hold this actor without committing physical movement.
      // Auth hooks may already have cleared a revoked input lease.
      writes += Number(
        hold(
          ctx,
          row,
          error instanceof Error ? error.message : "invalid stair state",
        ),
      );
      continue;
    }
    // Storage/exit-hook failures propagate for atomic rollback. Catching these
    // would incorrectly commit a partial transfer.
    if (terminal) {
      commitExit(ctx, h, terminal.row, terminal.state, terminal.deckId);
      writes++;
    } else if (pendingUpdate) {
      ctx.db.constructionStairWalk.characterId.update(pendingUpdate);
      writes++;
    }
  }
  return writes;
}
/** While a stair is occupied, reject another actor's full swept body envelope
 * crossing the reserved stair/landing volume, including disconnected occupants. */
export function constructionStairPositionAllowed(
  ctx: StairAuthorityContext,
  characterId: string,
  instanceId: string,
  deckId: string,
  x: number,
  y: number,
): boolean {
  const a = ctx.db.character.id.find(characterId),
    deck = ctx.db.constructionDeck.id.find(deckId);
  if (
    !a ||
    a.shipId !== instanceId ||
    !deck ||
    deck.instanceId !== instanceId ||
    ![x, y].every(Number.isFinite)
  )
    return false;
  const z = deck.elevation + 0.1875,
    start = body([a.localX, a.localY, z]),
    end = body([x, y, z]);
  const sweep: TraversalBounds3 = {
    min: start.min.map((n, i) => Math.min(n, end.min[i])) as TraversalPoint3,
    max: start.max.map((n, i) => Math.max(n, end.max[i])) as TraversalPoint3,
  };
  return bounded(
    ctx.db.constructionStairReservation.by_instance.filter(instanceId),
    STAIR_AUTHORITY_LIMITS.active,
  ).every(
    (r) =>
      r.characterId === characterId ||
      !overlap(sweep, JSON.parse(r.boundsJson)),
  );
}
export function requireNoConstructionStair(
  ctx: StairAuthorityContext,
  characterId: string,
) {
  demand(
    !ctx.db.constructionStairWalk.characterId.find(characterId),
    "finish stair movement first",
  );
}
export function requireNoReservedStairInstance(
  ctx: StairAuthorityContext,
  instanceId: string,
) {
  demand(
    !ctx.db.constructionStairReservation.by_instance
      .filter(instanceId)
      [Symbol.iterator]()
      .next().value,
    "occupied stair prevents structural edits",
  );
}
export const stairWalkProjection = t.row("ConstructionStairWalkStatus", {
  characterId: t.string().primaryKey(),
  walkId: t.string(),
  instanceId: t.string(),
  stairId: t.string(),
  sourceDeckId: t.string(),
  visitId: t.string(),
  phase: t.string(),
  egressOnly: t.bool(),
  interruption: t.string(),
  revision: t.u64(),
  x: t.f64(),
  y: t.f64(),
  z: t.f64(),
});
/** Caller MUST wrap with auth.gameView; own XYZ survives workspace grant loss so
 * restricted physical egress remains visible without revealing private topology. */
export function ownConstructionStairWalks(ctx: StairReadContext) {
  return bounded(
    ctx.db.constructionStairWalk.by_owner.filter(ctx.sender),
    STAIR_AUTHORITY_LIMITS.active,
  ).flatMap((r) => {
    const a = ctx.db.character.id.find(r.characterId),
      v = ctx.db.constructionLocation.characterId.find(r.characterId),
      i = ctx.db.constructionInstance.id.find(r.instanceId);
    return a &&
      sameOwner(a.owner, ctx.sender) &&
      i &&
      sameOwner(i.owner, ctx.sender) &&
      a.shipId === r.instanceId &&
      v?.instanceId === r.instanceId &&
      v.visitId === r.visitId
      ? [
          {
            characterId: r.characterId,
            walkId: r.id,
            instanceId: r.instanceId,
            stairId: r.stairId,
            sourceDeckId: r.sourceDeckId,
            visitId: r.visitId,
            phase: r.phase,
            egressOnly: r.egressOnly,
            interruption: r.interruption,
            revision: r.revision,
            x: r.acceptedX,
            y: r.acceptedY,
            z: r.acceptedZ,
          },
        ]
      : [];
  });
}

/** Minimal immutable rescue geometry contract. Public source pin selects only
 * the qualified stair and its two exit landings, never an instance document. */
export const stairEgressProjection = t.row("ConstructionStairEgressGeometry", {
  characterId: t.string().primaryKey(),
  instanceId: t.string(),
  stairId: t.string(),
  visitId: t.string(),
  lowerDeckId: t.string(),
  upperDeckId: t.string(),
  sourceDeckId: t.string(),
  adapterId: t.string(),
  adapterRevision: t.string(),
  auditSha256: t.string(),
  proofHash: t.string(),
});
/** Caller must apply gameView; no document, equipment, return location, grants,
 * inventory, full room layout or another owner's state is ever projected. */
export function ownConstructionStairEgressGeometry(ctx: StairReadContext) {
  return bounded(
    ctx.db.constructionStairWalk.by_owner.filter(ctx.sender),
    STAIR_AUTHORITY_LIMITS.active,
  ).flatMap((row) => {
    if (!row.egressOnly) return [];
    const actor = ctx.db.character.id.find(row.characterId),
      visit = ctx.db.constructionLocation.characterId.find(row.characterId),
      instance = ctx.db.constructionInstance.id.find(row.instanceId),
      link = ctx.db.constructionStairLink.id.find(row.stairId);
    if (
      !actor ||
      !sameOwner(actor.owner, ctx.sender) ||
      actor.shipId !== row.instanceId ||
      !visit ||
      visit.instanceId !== row.instanceId ||
      visit.visitId !== row.visitId ||
      visit.revision !== row.locationRevision ||
      !instance ||
      !sameOwner(instance.owner, ctx.sender) ||
      !link ||
      !sameOwner(link.owner, ctx.sender)
    )
      return [];
    try {
      const surface = compile(ctx, link),
        stored = decode(row),
        reservation = ctx.db.constructionStairReservation.stairId.find(
          row.stairId,
        );
      if (
        stored.proofHash !== surface.proofHash ||
        stored.walkId !== row.id ||
        stored.actorId !== row.characterId ||
        stored.visitId !== row.visitId ||
        !reservation ||
        reservation.characterId !== row.characterId ||
        reservation.walkId !== row.id ||
        reservation.visitId !== row.visitId ||
        reservation.proofHash !== surface.proofHash
      )
        return [];
      return [
        {
          characterId: row.characterId,
          instanceId: row.instanceId,
          stairId: row.stairId,
          visitId: row.visitId,
          lowerDeckId: surface.lowerDeckId,
          upperDeckId: surface.upperDeckId,
          sourceDeckId: row.sourceDeckId,
          adapterId: NATIVE_STAIR_ROOM_PIN.id,
          adapterRevision: NATIVE_STAIR_ROOM_PIN.revision,
          auditSha256:
            "8df56649474fa8379af3a2c678716fc1f80406e9f9457e85498598f6a0be9831",
          proofHash: surface.proofHash,
        },
      ];
    } catch {
      return [];
    }
  });
}
