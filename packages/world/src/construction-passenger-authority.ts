import { acceptedPassengerAccess } from "./construction-passenger-access";
import type { Infer, InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import type { constructionPassengerVisit } from "./construction-passenger-tables";
import { requireGame } from "./auth";
import { clearAim } from "./combat";
import { ownedGameShipAccess } from "./game-ship-access-authority";
import { gameShipAccess } from "../../sim/src/game-ship-access";
import { isQualifiedWayfarerBlueprint } from "../../sim/src/wayfarer-walking-bindings";
import { canOccupyDeck } from "../../sim/src/construction-collision";
import { constructionCollision } from "./construction-doors";
import { createConstructionStandingSupport } from "./construction-standing-support";
import { commitFlightCharacter } from "./construction-flight-dirty";
import { compileShipFlight } from "./construction-flight-compilation";
import { readConstructionFlightInput } from "./construction-flight-input";
type Context = ReducerCtx<InferSchema<typeof world>>;
type Visit = Infer<typeof constructionPassengerVisit.rowType>;
const standingSupport = createConstructionStandingSupport();
const encode = (x: unknown) =>
  JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v));
function operation(ctx: Context, operationId: string, payload: unknown) {
  if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(operationId))
    throw Error("Bounded passenger operation identity required");
  const id = JSON.stringify([ctx.sender.toHexString(), operationId]),
    requestJson = encode(payload);
  const old = ctx.db.constructionPassengerReceipt.id.find(id);
  if (
    old &&
    (!old.owner.isEqual(ctx.sender) || old.requestJson !== requestJson)
  )
    throw Error("Passenger operation payload conflict");
  return { id, requestJson, old };
}
function receipt(
  ctx: Context,
  op: ReturnType<typeof operation>,
  resultId: string,
  revision: bigint,
) {
  ctx.db.constructionPassengerReceipt.insert({
    id: op.id,
    owner: ctx.sender,
    requestJson: op.requestJson,
    resultId,
    revision,
  });
}
function actor(ctx: Context) {
  requireGame(ctx);
  let found;
  for (const a of ctx.db.character.by_owner.filter(ctx.sender)) {
    if (found) throw Error("Single current character required");
    found = a;
  }
  if (!found?.connected || !found.owner.isEqual(ctx.sender))
    throw Error("Connected owned character required");
  return found;
}
function requireStanding(ctx: Context, characterId: string, shipId: string) {
  if (
    ctx.db.couchSeat.characterId.find(characterId) ||
    ctx.db.constructionPilotSeat.characterId.find(characterId) ||
    ctx.db.constructionStairWalk.characterId.find(characterId) ||
    ctx.db.constructionTraversal.characterId.find(characterId) ||
    ctx.db.constructionFlightReview.characterId.find(characterId) ||
    ctx.db.constructionReviewOrigin.characterId.find(characterId) ||
    ctx.db.station.shipId.find(shipId)?.occupantId === characterId
  )
    throw Error(
      "Stand on the admitted deck and end other visits before passenger transit",
    );
}
function clearControls(ctx: Context, characterId: string) {
  const input = ctx.db.input.characterId.find(characterId);
  if (input)
    ctx.db.input.characterId.update({
      ...input,
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
  clearAim(ctx, characterId);
}
function availablePoint(
  ctx: Context,
  shipId: string,
  deckId: string,
  characterId: string,
  x: number,
  y: number,
) {
  let count = 0;
  for (const l of ctx.db.constructionLocation.by_instance.filter(shipId)) {
    if (++count > 256) return false;
    if (l.characterId === characterId || l.deckId !== deckId) continue;
    const a = ctx.db.character.id.find(l.characterId);
    if (
      a &&
      a.shipId === shipId &&
      Math.hypot(a.localX - x, a.localY - y) < 0.65
    )
      return false;
  }
  return true;
}
/** The owner approves whole interior geometry and walking on the entry deck.
 * The grantee must separately consent by boarding; no pilot capability is added. */
export function grantShipPassenger(
  ctx: Context,
  args: {
    shipId: string;
    granteeId: string;
    expectedInstanceRevision: bigint;
    expectedFlightRevision: bigint;
    durationSeconds: number;
    operationId: string;
  },
) {
  requireGame(ctx);
  const op = operation(ctx, args.operationId, {
    kind: "grant-passenger",
    ...args,
  });
  if (op.old) return;
  const i = ctx.db.constructionInstance.id.find(args.shipId),
    b = ctx.db.constructionFlightBinding.shipId.find(args.shipId),
    s = ctx.db.ship.id.find(args.shipId),
    g = ctx.db.character.id.find(args.granteeId);
  if (
    !i ||
    !b ||
    !s ||
    !g ||
    !i.owner.isEqual(ctx.sender) ||
    !b.owner.isEqual(ctx.sender) ||
    !s.owner.isEqual(ctx.sender) ||
    g.owner.isEqual(ctx.sender)
  )
    throw Error("Owned ship and distinct passenger required");
  if (
    i.revision !== args.expectedInstanceRevision ||
    b.revision !== args.expectedFlightRevision ||
    b.instanceRevision !== i.revision ||
    b.blueprintSha256 !== i.blueprintSha256 ||
    b.instanceId !== i.id ||
    b.lifecycle !== "active" ||
    !isQualifiedWayfarerBlueprint(i.blueprintSha256) ||
    b.deckId !== i.spawnDeckId
  )
    throw Error("Current active qualified flight revision required");
  if (
    !Number.isInteger(args.durationSeconds) ||
    args.durationSeconds < 1 ||
    args.durationSeconds > 3600
  )
    throw Error("Passenger admission duration must be 1–3600 seconds");
  if (ctx.db.constructionPassengerGrant.count() >= 256n)
    throw Error("Passenger admission capacity reached");
  let count = 0;
  for (const old of ctx.db.constructionPassengerGrant.by_ship.filter(
    args.shipId,
  )) {
    if (++count >= 8) throw Error("Ship passenger admission capacity reached");
    if (old.granteeId === g.id)
      throw Error("Revoke the existing passenger admission first");
  }
  const id = ctx.newUuidV4().toString();
  ctx.db.constructionPassengerGrant.insert({
    id,
    shipId: i.id,
    owner: ctx.sender,
    granteeId: g.id,
    granteeOwner: g.owner,
    deckId: b.deckId,
    instanceRevision: i.revision,
    expiresMicros:
      ctx.timestamp.microsSinceUnixEpoch +
      BigInt(args.durationSeconds) * 1_000_000n,
    revision: 1n,
  });
  receipt(ctx, op, id, 1n);
}
export function boardShipPassenger(
  ctx: Context,
  args: {
    grantId: string;
    expectedGrantRevision: bigint;
    expectedVisitId: string;
    expectedLocationRevision: bigint;
    expectedAdmissionRevision: bigint;
    operationId: string;
  },
) {
  const a = actor(ctx),
    op = operation(ctx, args.operationId, { kind: "board-passenger", ...args });
  if (op.old) return;
  const g = ctx.db.constructionPassengerGrant.id.find(args.grantId),
    source = ctx.db.constructionLocation.characterId.find(a.id),
    m = ctx.db.worldAdmission.characterId.find(a.id);
  if (
    !g ||
    !g.granteeOwner.isEqual(ctx.sender) ||
    g.granteeId !== a.id ||
    g.revision !== args.expectedGrantRevision ||
    g.expiresMicros <= ctx.timestamp.microsSinceUnixEpoch
  )
    throw Error("Current explicit passenger admission required");
  if (
    !source ||
    !m ||
    source.visitId !== args.expectedVisitId ||
    source.revision !== args.expectedLocationRevision ||
    m.revision !== args.expectedAdmissionRevision ||
    source.returnShipId ||
    ctx.db.constructionPassengerVisit.characterId.find(a.id)
  )
    throw Error("Current original visit and admission required");
  if (
    !ownedGameShipAccess(
      ctx,
      a.shipId,
      source.deckId,
      ctx.timestamp.microsSinceUnixEpoch,
    ).walkDeck
  )
    throw Error("Original owned deck admission required");
  requireStanding(ctx, a.id, a.shipId);
  const origin = ctx.db.constructionInstance.id.find(a.shipId)!,
    i = ctx.db.constructionInstance.id.find(g.shipId),
    b = ctx.db.constructionFlightBinding.shipId.find(g.shipId),
    ship = ctx.db.ship.id.find(g.shipId),
    deck = ctx.db.constructionDeck.id.find(g.deckId);
  const sm = ctx.db.shipWorldMotion.shipId.find(a.shipId),
    tm = ctx.db.shipWorldMotion.shipId.find(g.shipId);
  if (
    !i ||
    !b ||
    !ship ||
    !deck ||
    !i.owner.isEqual(g.owner) ||
    !b.owner.isEqual(g.owner) ||
    !ship.owner.isEqual(g.owner) ||
    i.revision !== g.instanceRevision ||
    b.instanceRevision !== i.revision ||
    b.blueprintSha256 !== i.blueprintSha256 ||
    b.instanceId !== i.id ||
    b.deckId !== g.deckId ||
    i.spawnDeckId !== g.deckId ||
    deck.instanceId !== i.id ||
    b.lifecycle !== "active" ||
    !isQualifiedWayfarerBlueprint(i.blueprintSha256)
  )
    throw Error("Passenger destination changed");
  // Bounded explicit local boarding, not arbitrary inter-system teleportation.
  if (
    !sm ||
    !tm ||
    sm.systemId !== tm.systemId ||
    sm.systemId !== m.systemId ||
    ![
      sm.vx,
      sm.vy,
      sm.omega,
      tm.vx,
      tm.vy,
      tm.omega,
      sm.x,
      sm.y,
      tm.x,
      tm.y,
    ].every(Number.isFinite) ||
    Math.hypot(sm.vx, sm.vy) > 0.01 ||
    Math.hypot(tm.vx, tm.vy) > 0.01 ||
    Math.abs(sm.omega) > 0.001 ||
    Math.abs(tm.omega) > 0.001 ||
    Math.hypot(sm.x - tm.x, sm.y - tm.y) > 50
  )
    throw Error("Boarding requires nearby stationary ships in the same system");
  const sourceFrame = constructionCollision(ctx, origin, source.deckId);
  if (
    !canOccupyDeck(
      sourceFrame,
      {
        shipId: origin.id,
        deckId: source.deckId,
        position: [a.localX, a.localY],
      },
      0.3,
    )
  )
    throw Error("Supported original boarding position required");
  const frame = constructionCollision(ctx, i, g.deckId);
  let point: [number, number] | undefined;
  // Fixed deterministic entry search around the authored spawn, with current
  // collision, standing support and all retained crew considered.
  for (let ring = 0; ring <= 3 && !point; ring++)
    for (let n = 0; n < (ring ? 8 : 1); n++) {
      const x = i.spawnX + ring * 0.75 * Math.cos((n * Math.PI) / 4),
        y = i.spawnY + ring * 0.75 * Math.sin((n * Math.PI) / 4);
      if (
        !canOccupyDeck(
          frame,
          { shipId: i.id, deckId: g.deckId, position: [x, y] },
          0.3,
        ) ||
        !availablePoint(ctx, i.id, g.deckId, a.id, x, y)
      )
        continue;
      standingSupport({
        actor: { ...a, shipId: i.id, localX: x, localY: y },
        location: { characterId: a.id, instanceId: i.id, deckId: g.deckId },
        instance: i,
        deck,
      });
      point = [x, y];
      break;
    }
  if (!point) throw Error("Passenger entry is blocked");
  if (ctx.db.constructionPassengerVisit.count() >= 128n)
    throw Error("Passenger visit capacity reached");
  compileShipFlight(ctx.db, i.id, (id) => readConstructionFlightInput(ctx, id));
  if (ctx.db.constructionFlightCompiled.shipId.find(i.id)?.status !== "ready")
    throw Error("Passenger destination flight definition is invalid");
  const visitId = ctx.newUuidV4().toString();
  ctx.db.constructionPassengerVisit.insert({
    characterId: a.id,
    owner: ctx.sender,
    shipId: i.id,
    deckId: g.deckId,
    grantId: g.id,
    grantRevision: g.revision,
    visitId,
    admissionRevision: m.revision + 1n,
    sourceShipId: a.shipId,
    sourceDeckId: source.deckId,
    sourceVisitId: source.visitId,
    sourceLocationRevision: source.revision,
    sourceInstanceRevision: origin.revision,
    sourceSha256: origin.blueprintSha256,
    sourceSystemId: sm.systemId,
    sourceX: a.localX,
    sourceY: a.localY,
    revision: 1n,
    recoveryReason: "",
    retryAfterMicros: 0n,
  });
  ctx.db.constructionLocation.characterId.update({
    ...source,
    instanceId: i.id,
    deckId: g.deckId,
    visitId,
    revision: source.revision + 1n,
  });
  ctx.db.worldAdmission.characterId.update({
    ...m,
    shipId: i.id,
    systemId: tm.systemId,
    revision: m.revision + 1n,
  });
  commitFlightCharacter(
    ctx,
    {
      ...a,
      shipId: i.id,
      localX: point[0],
      localY: point[1],
      sprinting: false,
    },
    (row) => ctx.db.character.id.update(row),
  );
  clearControls(ctx, a.id);
  receipt(ctx, op, visitId, 1n);
}
/** Recovery validates current original ownership, native pins, support and
 * occupancy. It never rewinds world motion, inventory or revision counters. */
function preparePassengerReturn(ctx: Context, v: Visit) {
  const a = ctx.db.character.id.find(v.characterId),
    l = ctx.db.constructionLocation.characterId.find(v.characterId),
    m = ctx.db.worldAdmission.characterId.find(v.characterId),
    i = ctx.db.constructionInstance.id.find(v.sourceShipId),
    s = ctx.db.ship.id.find(v.sourceShipId),
    b = ctx.db.gameShipAccess.shipId.find(v.sourceShipId),
    d = ctx.db.constructionDeck.id.find(v.sourceDeckId),
    motion = ctx.db.shipWorldMotion.shipId.find(v.sourceShipId);
  if (
    !a ||
    !l ||
    !m ||
    !i ||
    !s ||
    !b ||
    !d ||
    !motion ||
    !a.owner.isEqual(v.owner) ||
    !m.owner.isEqual(v.owner) ||
    a.shipId !== v.shipId ||
    l.instanceId !== v.shipId ||
    l.visitId !== v.visitId ||
    m.shipId !== v.shipId ||
    m.revision !== v.admissionRevision ||
    i.revision !== v.sourceInstanceRevision ||
    i.blueprintSha256 !== v.sourceSha256 ||
    motion.systemId !== v.sourceSystemId
  )
    throw Error("Original passenger return relation changed");
  requireStanding(ctx, a.id, a.shipId);
  const location = {
    ...l,
    instanceId: i.id,
    deckId: d.id,
    visitId: v.sourceVisitId,
    revision: l.revision + 1n,
  };
  const admission = {
    ...m,
    shipId: i.id,
    systemId: motion.systemId,
    revision: m.revision + 1n,
  };
  const candidate = {
    ...a,
    shipId: i.id,
    localX: v.sourceX,
    localY: v.sourceY,
    sprinting: false,
  };
  if (
    !gameShipAccess({
      principalId: v.owner.toHexString(),
      liveGame: true,
      actor: { ...candidate, ownerId: a.owner.toHexString() },
      ship: { ...s, ownerId: s.owner.toHexString() },
      binding: {
        ...b,
        ownerId: b.owner.toHexString(),
        lifecycle: b.lifecycle as "active" | "suspended",
      },
      instance: { ...i, ownerId: i.owner.toHexString() },
      deck: d,
      location,
      admission,
      motion,
    }).walkDeck
  )
    throw Error("Original passenger return access changed");
  const frame = constructionCollision(ctx, i, d.id);
  if (
    !canOccupyDeck(
      frame,
      { shipId: i.id, deckId: d.id, position: [v.sourceX, v.sourceY] },
      0.3,
    ) ||
    !availablePoint(ctx, i.id, d.id, a.id, v.sourceX, v.sourceY)
  )
    throw Error("Original passenger return position is obstructed");
  standingSupport({ actor: candidate, location, instance: i, deck: d });
  return () => {
    ctx.db.constructionLocation.characterId.update(location);
    ctx.db.worldAdmission.characterId.update(admission);
    commitFlightCharacter(ctx, candidate, (row) =>
      ctx.db.character.id.update(row),
    );
    clearControls(ctx, a.id);
    ctx.db.constructionPassengerVisit.characterId.delete(a.id);
  };
}
export function returnShipPassenger(
  ctx: Context,
  args: {
    expectedVisitId: string;
    expectedRevision: bigint;
    operationId: string;
  },
) {
  const a = actor(ctx),
    op = operation(ctx, args.operationId, {
      kind: "return-passenger",
      ...args,
    });
  if (op.old) return;
  const v = ctx.db.constructionPassengerVisit.characterId.find(a.id);
  if (
    !v ||
    !v.owner.isEqual(ctx.sender) ||
    v.visitId !== args.expectedVisitId ||
    v.revision !== args.expectedRevision
  )
    throw Error("Current passenger visit revision required");
  preparePassengerReturn(ctx, v)();
  receipt(ctx, op, v.visitId, v.revision + 1n);
}
function recover(ctx: Context, v: Visit) {
  let commit: () => void;
  try {
    commit = preparePassengerReturn(ctx, v);
  } catch (e) {
    clearControls(ctx, v.characterId);
    const reason = (
      e instanceof Error ? e.message : "Passenger return unavailable"
    ).slice(0, 512);
    ctx.db.constructionPassengerVisit.characterId.update({
      ...v,
      recoveryReason: reason,
      retryAfterMicros: ctx.timestamp.microsSinceUnixEpoch + 500_000n,
      revision: v.revision + (v.recoveryReason === reason ? 0n : 1n),
    });
    return;
  }
  // Mutation failures propagate so the reducer transaction rolls back.
  commit();
}
export function revokeShipPassenger(
  ctx: Context,
  args: { grantId: string; expectedRevision: bigint; operationId: string },
) {
  requireGame(ctx);
  const op = operation(ctx, args.operationId, {
    kind: "revoke-passenger",
    ...args,
  });
  if (op.old) return;
  const g = ctx.db.constructionPassengerGrant.id.find(args.grantId),
    s = g && ctx.db.ship.id.find(g.shipId);
  if (
    !g ||
    !s?.owner.isEqual(ctx.sender) ||
    !g.owner.isEqual(ctx.sender) ||
    g.revision !== args.expectedRevision
  )
    throw Error("Current owned passenger admission revision required");
  ctx.db.constructionPassengerGrant.id.delete(g.id);
  const v = ctx.db.constructionPassengerVisit.characterId.find(g.granteeId);
  if (v?.grantId === g.id) recover(ctx, v);
  receipt(ctx, op, g.id, g.revision + 1n);
}
/** At most 256 active grants and 128 visits exist; recover at most eight bodies
 * per tick. Revocation denies access immediately even when recovery is blocked. */
export function expireShipPassengers(ctx: Context) {
  if (!ctx.sender.isEqual(ctx.databaseIdentity))
    throw Error("Server passenger expiry only");
  const now = ctx.timestamp.microsSinceUnixEpoch;
  for (const g of ctx.db.constructionPassengerGrant.iter())
    if (g.expiresMicros <= now)
      ctx.db.constructionPassengerGrant.id.delete(g.id);
  let attempts = 0;
  for (const v of ctx.db.constructionPassengerVisit.iter()) {
    const g = ctx.db.constructionPassengerGrant.id.find(v.grantId);
    if (
      (!g ||
        g.revision !== v.grantRevision ||
        v.recoveryReason ||
        !acceptedPassengerAccess(
          { ...ctx, sender: v.owner },
          v.characterId,
          now,
        ).walkDeck) &&
      v.retryAfterMicros <= now
    ) {
      recover(ctx, v);
      if (++attempts === 8) break;
    }
  }
}
