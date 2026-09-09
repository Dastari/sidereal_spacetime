import {
  qualifyPilotGeometry,
  canApproachPilot,
  pilotRecoveryPoint,
  QUALIFIED_PILOT_POSITION,
  type PilotGeometry,
} from "../../sim/src/construction-pilot";
export interface PilotActor {
  id: string;
  ownerId: string;
  connected: boolean;
  shipId: string;
  deckId: string;
  x: number;
  y: number;
  height: number;
  standing: boolean;
}
export interface PilotStation {
  id: string;
  shipId: string;
  deckId: string;
  occupantId?: string;
  operational: boolean;
  instanceRevision: bigint;
  revision: bigint;
}
export interface PilotSeat {
  characterId: string;
  stationId: string;
  shipId: string;
  deckId: string;
  instanceRevision: bigint;
  revision: bigint;
  recoveryRequested: boolean;
  recoveryReason: string;
}
export interface PilotAction {
  stationId: string;
  expectedStationRevision: bigint;
  operationId: string;
}
export interface PilotReceipt {
  id: string;
  requestJson: string;
  stationId: string;
  revision: bigint;
}
export interface PilotRepository {
  principalId: string;
  requireLiveGame(): void;
  actor(): PilotActor | undefined;
  station(id: string): PilotStation | undefined;
  seat(characterId: string): PilotSeat | undefined;
  /** Server-side live review/boarding grant and accepted location, never a supplied role. */
  hasCurrentAccess(actor: PilotActor, station: PilotStation): boolean;
  /** Must call consumeInputControl(ctx,actorId) against the current connection lease. */
  hasInputLease(characterId: string): boolean;
  /** Exact active bound definition and powered installed flight computer. */
  hasOperationalFlight(shipId: string): boolean;
  geometry(station: PilotStation): PilotGeometry;
  nearbyActors(
    station: PilotStation,
  ): readonly { id: string; x: number; y: number }[];
  receipt(id: string): PilotReceipt | undefined;
  storeReceipt(r: PilotReceipt): void;
  insertSeat(s: PilotSeat): void;
  updateSeat(s: PilotSeat): void;
  deleteSeat(characterId: string): void;
  updateStation(s: PilotStation): void;
  setActorPose(
    characterId: string,
    pose: { x: number; y: number; height: number },
  ): void;
  clearInputAndAim(characterId: string): void;
}
const inScope = (a: PilotActor, s: PilotStation) =>
  a.shipId === s.shipId && a.deckId === s.deckId;
export function enterConstructionPilot(db: PilotRepository, args: PilotAction) {
  db.requireLiveGame();
  if (!args.operationId || args.operationId.length > 160)
    throw Error("Pilot operation identity required");
  const a = db.actor(),
    s = db.station(args.stationId);
  if (
    !a?.connected ||
    a.ownerId !== db.principalId ||
    !s ||
    !inScope(a, s) ||
    !db.hasCurrentAccess(a, s)
  )
    throw Error("Current pilot instance/deck permission required");
  if (
    !s.operational ||
    !db.hasOperationalFlight(s.shipId) ||
    !db.hasInputLease(a.id)
  )
    throw Error("Operational flight and current input lease required");
  const seat = db.seat(a.id),
    key = JSON.stringify([db.principalId, args.operationId]),
    requestJson = JSON.stringify({
      kind: "pilot-enter",
      stationId: args.stationId,
      expectedStationRevision: args.expectedStationRevision.toString(),
    });
  const old = db.receipt(key);
  if (old) {
    if (old.requestJson !== requestJson)
      throw Error("Pilot operation payload conflict");
    return old;
  }
  if (s.revision !== args.expectedStationRevision)
    throw Error("Pilot station revision conflict");
  if (seat || s.occupantId || !a.standing)
    throw Error("Unoccupied station and standing actor required");
  const geometry = db.geometry(s),
    q = qualifyPilotGeometry(geometry);
  if (
    !canApproachPilot(q.frame, a.x, a.y) ||
    Math.abs(a.height - q.approachHeight) > 0.05
  )
    throw Error("Move to supported pilot approach");
  const nearby = db.nearbyActors(s);
  if (nearby.length > 128) throw Error("Pilot occupancy budget exceeded");
  if (
    nearby.some(
      (other) =>
        other.id !== a.id &&
        Math.hypot(
          other.x - QUALIFIED_PILOT_POSITION[0],
          other.y - QUALIFIED_PILOT_POSITION[1],
        ) < 0.6,
    )
  )
    throw Error("Pilot seat space occupied");
  const revision = s.revision + 1n;
  db.insertSeat({
    characterId: a.id,
    stationId: s.id,
    shipId: s.shipId,
    deckId: s.deckId,
    instanceRevision: s.instanceRevision,
    revision: 1n,
    recoveryRequested: false,
    recoveryReason: "",
  });
  db.updateStation({ ...s, occupantId: a.id, revision });
  db.setActorPose(a.id, {
    x: QUALIFIED_PILOT_POSITION[0],
    y: QUALIFIED_PILOT_POSITION[1],
    height: q.seatHeight,
  });
  db.clearInputAndAim(a.id);
  const receipt = { id: key, requestJson, stationId: s.id, revision };
  db.storeReceipt(receipt);
  return receipt;
}
/** Called at command consumption, including held-input keepalive. No geometry
 * reconstruction or writes on a valid idle lease. Membership alone grants nothing. */
export function constructionPilotCanControl(
  db: PilotRepository,
  characterId: string,
) {
  const a = db.actor(),
    seat = db.seat(characterId),
    s = seat && db.station(seat.stationId);
  return !!(
    a?.id === characterId &&
    a.connected &&
    a.ownerId === db.principalId &&
    seat &&
    !seat.recoveryRequested &&
    s?.operational &&
    s.occupantId === a.id &&
    inScope(a, s) &&
    seat.shipId === s.shipId &&
    seat.deckId === s.deckId &&
    seat.instanceRevision === s.instanceRevision &&
    Math.hypot(
      a.x - QUALIFIED_PILOT_POSITION[0],
      a.y - QUALIFIED_PILOT_POSITION[1],
    ) < 1e-5 &&
    db.hasCurrentAccess(a, s) &&
    db.hasOperationalFlight(s.shipId) &&
    db.hasInputLease(a.id)
  );
}
/** Server exit/disconnect/revocation recovery deliberately does not require the
 * lost grant. Keep the unique seat reservation while all safe exits are occupied;
 * pending state denies control immediately and retries only indexed pending rows. */
export function recoverConstructionPilot(
  db: PilotRepository,
  characterId: string,
  reason: string,
) {
  const seat = db.seat(characterId);
  if (!seat) return "absent" as const;
  const s = db.station(seat.stationId);
  if (!s || s.occupantId !== characterId)
    throw Error("Pilot seat/station association mismatch");
  const actor = db.actor();
  if (!actor || actor.id !== characterId || !inScope(actor, s)) {
    db.clearInputAndAim(characterId);
    if (!seat.recoveryRequested || seat.recoveryReason !== "detached-location")
      db.updateSeat({
        ...seat,
        recoveryRequested: true,
        recoveryReason: "detached-location",
        revision: seat.revision + 1n,
      });
    return "pending" as const;
  }
  // All fallible geometry work is read-only and finishes before any mutation.
  // A refit/deleted support can hold the reservation safely for later repair.
  let point: { x: number; y: number; height: number } | undefined;
  try {
    point = pilotRecoveryPoint(db.geometry(s), db.nearbyActors(s), characterId);
  } catch {
    reason = "invalid-geometry";
  }
  db.clearInputAndAim(characterId);
  if (!point) {
    if (!seat.recoveryRequested || seat.recoveryReason !== reason)
      db.updateSeat({
        ...seat,
        recoveryRequested: true,
        recoveryReason: reason,
        revision: seat.revision + 1n,
      });
    return "pending" as const;
  }
  db.setActorPose(characterId, point);
  db.updateStation({ ...s, occupantId: undefined, revision: s.revision + 1n });
  db.deleteSeat(characterId);
  return "recovered" as const;
}
