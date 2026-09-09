/** Pure ownership/admission transition for explicit construction FLIGHT REVIEW.
 * Not physical boarding and never called as an incidental install/login effect. */
export interface FlightReviewAdmission {
  characterId: string;
  ownerId: string;
  shipId: string;
  systemId: string;
  revision: bigint;
}
export interface FlightReviewVisit {
  characterId: string;
  visitId: string;
  instanceId: string;
  deckId: string;
  revision: bigint;
  returnShipId: string;
}
export interface FlightReviewActor {
  id: string;
  ownerId: string;
  shipId: string;
  connected: boolean;
  standing: boolean;
}
export interface FlightReviewShip {
  id: string;
  ownerId: string;
  systemId: string;
  stationOccupied: boolean;
}
export interface FlightReviewState {
  characterId: string;
  visitId: string;
  instanceId: string;
  deckId: string;
  originalShipId: string;
  originalSystemId: string;
  originalAdmissionRevision: bigint;
  reviewAdmissionRevision: bigint;
}
export interface FlightReviewRequest {
  expectedVisitId: string;
  expectedVisitRevision: bigint;
  expectedAdmissionRevision: bigint;
  operationId: string;
}
export function planFlightReviewAdmission(
  input: {
    principalId: string;
    actor: FlightReviewActor;
    visit: FlightReviewVisit;
    admission: FlightReviewAdmission;
    source: FlightReviewShip;
    target: FlightReviewShip;
    targetDeckId: string;
    targetActive: boolean;
    hasCurrentGrant: boolean;
  },
  request: FlightReviewRequest,
) {
  const {
    principalId,
    actor: a,
    visit: v,
    admission: m,
    source,
    target,
  } = input;
  if (
    !a.connected ||
    a.ownerId !== principalId ||
    m.ownerId !== principalId ||
    source.ownerId !== principalId ||
    target.ownerId !== principalId ||
    !input.hasCurrentGrant
  )
    throw Error("Current owned flight review access required");
  if (
    v.characterId !== a.id ||
    m.characterId !== a.id ||
    v.visitId !== request.expectedVisitId ||
    v.revision !== request.expectedVisitRevision ||
    a.shipId !== v.instanceId ||
    target.id !== v.instanceId ||
    v.deckId !== input.targetDeckId
  )
    throw Error("Accepted flight review visit/deck required");
  if (
    !a.standing ||
    source.stationOccupied ||
    target.stationOccupied ||
    !input.targetActive
  )
    throw Error("Standing actor and empty active pilot installation required");
  if (
    m.revision !== request.expectedAdmissionRevision ||
    m.shipId !== v.returnShipId ||
    source.id !== v.returnShipId ||
    source.id === target.id ||
    source.systemId !== m.systemId ||
    target.systemId !== m.systemId
  )
    throw Error("Unchanged original admission in the same system required");
  const state: FlightReviewState = {
    characterId: a.id,
    visitId: v.visitId,
    instanceId: target.id,
    deckId: v.deckId,
    originalShipId: source.id,
    originalSystemId: m.systemId,
    originalAdmissionRevision: m.revision,
    reviewAdmissionRevision: m.revision + 1n,
  };
  return {
    state,
    admission: { ...m, shipId: target.id, revision: m.revision + 1n },
  };
}
export function planFlightReviewRestore(
  input: {
    principalId: string;
    actor: FlightReviewActor;
    visit: FlightReviewVisit;
    admission: FlightReviewAdmission;
    state: FlightReviewState;
    source: FlightReviewShip;
    targetStationOccupied: boolean;
  },
  request: FlightReviewRequest,
) {
  const { actor: a, visit: v, admission: m, state: s, source } = input;
  if (
    !a.connected ||
    a.ownerId !== input.principalId ||
    m.ownerId !== input.principalId ||
    source.ownerId !== input.principalId
  )
    throw Error("Current owner and preserved return ship required");
  if (!a.standing || input.targetStationOccupied || source.stationOccupied)
    throw Error("Recover pilot seat before returning");
  if (
    a.id !== s.characterId ||
    m.characterId !== a.id ||
    v.characterId !== a.id ||
    v.visitId !== s.visitId ||
    v.visitId !== request.expectedVisitId ||
    v.revision !== request.expectedVisitRevision ||
    v.instanceId !== s.instanceId ||
    a.shipId !== s.instanceId ||
    v.deckId !== s.deckId ||
    v.returnShipId !== s.originalShipId
  )
    throw Error("Exact saved flight review visit required");
  if (
    m.shipId !== s.instanceId ||
    m.systemId !== s.originalSystemId ||
    m.revision !== s.reviewAdmissionRevision ||
    m.revision !== request.expectedAdmissionRevision ||
    source.id !== s.originalShipId ||
    source.systemId !== s.originalSystemId
  )
    throw Error("Flight review admission changed; explicit recovery required");
  // Restore membership, not historical revision or either ship's old transform.
  return {
    ...m,
    shipId: s.originalShipId,
    systemId: s.originalSystemId,
    revision: m.revision + 1n,
  };
}
