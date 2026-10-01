/** Pure matching rules. Registrations are arguments, never environment/debug overrides. */
export interface NavigationOperatorRegistration {
  profileId: string;
  certificateSha256: string;
  proofSha256: string;
  manifestSha256: string;
  compilerSha256: string;
  geometrySha256: string;
  navigationSha256: string;
  prefabId: string;
  blueprintSha256: string;
  catalogId: string;
  catalogRevision: number;
  catalogSha256: string;
  mountSourceId: string;
  stationX: number;
  stationY: number;
}

/** Values must come from the current compiler-admitted source and restored identity map. */
export interface AdmittedNavigationContext {
  prefabId: string;
  blueprintSha256: string;
  catalogId: string;
  catalogRevision: number;
  catalogSha256: string;
  mountSourceId: string;
  storedMappingAgrees: boolean;
  internalQuarterTurns: number;
  artQuarterTurns: number;
  deckElevationM: number;
  floorElevationM: number;
  stationX: number;
  stationY: number;
}

export interface AcceptedOperatorTuple {
  characterId: string;
  instanceId: string;
  deckId: string;
  visitId: string;
  stationId: string;
  seatPlacedObjectId: string;
  consolePlacedObjectId: string;
  instanceRevision: string;
  locationRevision: string;
  bindingRevision: string;
  mappingRevision: string;
  seatRevision: string;
  seatInstanceRevision: string;
  bindingInstanceRevision: string;
  lifecycle: string;
  connected: boolean;
  dead: boolean;
  recoveryRequested: boolean;
  operational: boolean;
  occupantId: string;
  acceptedX: number;
  acceptedY: number;
  standingElevationM: number;
}

const hash = (value: string) => /^[a-f0-9]{64}$/.test(value);
const id = (value: string) =>
  typeof value === "string" && value.length > 0 && value.length <= 160;
const revision = (value: string) => /^[1-9][0-9]*$/.test(value);
const close = (a: number, b: number) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-5;

/** EMPTY is an unconditional early return: neither admission nor resolution runs. */
export function registeredNavigationContext(
  registrations: readonly NavigationOperatorRegistration[],
  readAdmitted: () => AdmittedNavigationContext | null,
) {
  if (registrations.length === 0) return null;
  if (registrations.length > 16) return null;
  let context: AdmittedNavigationContext | null;
  try {
    context = readAdmitted();
  } catch {
    return null;
  }
  if (
    !context ||
    !context.storedMappingAgrees ||
    context.internalQuarterTurns !== 0 ||
    context.artQuarterTurns !== 2 ||
    context.deckElevationM !== 0 ||
    !close(context.floorElevationM, 0.1875)
  )
    return null;
  const matches = registrations.filter(
    (entry) =>
      [
        entry.certificateSha256,
        entry.proofSha256,
        entry.manifestSha256,
        entry.compilerSha256,
        entry.geometrySha256,
        entry.navigationSha256,
        entry.blueprintSha256,
        entry.catalogSha256,
      ].every(hash) &&
      id(entry.profileId) &&
      entry.prefabId === context.prefabId &&
      entry.blueprintSha256 === context.blueprintSha256 &&
      entry.catalogId === context.catalogId &&
      Number.isSafeInteger(entry.catalogRevision) &&
      entry.catalogRevision > 0 &&
      entry.catalogRevision === context.catalogRevision &&
      entry.catalogSha256 === context.catalogSha256 &&
      entry.mountSourceId === context.mountSourceId &&
      close(entry.stationX, context.stationX) &&
      close(entry.stationY, context.stationY),
  );
  return matches.length === 1 ? { context, registration: matches[0] } : null;
}

/** Check current accepted rows; none of these values is a client-authored transform. */
export function acceptedNavigationOperator(
  matched: NonNullable<ReturnType<typeof registeredNavigationContext>>,
  tuple: AcceptedOperatorTuple,
) {
  if (
    ![
      tuple.characterId,
      tuple.instanceId,
      tuple.deckId,
      tuple.visitId,
      tuple.stationId,
      tuple.seatPlacedObjectId,
      tuple.consolePlacedObjectId,
    ].every(id) ||
    ![
      tuple.instanceRevision,
      tuple.locationRevision,
      tuple.bindingRevision,
      tuple.mappingRevision,
      tuple.seatRevision,
    ].every(revision) ||
    tuple.bindingInstanceRevision !== tuple.instanceRevision ||
    tuple.seatInstanceRevision !== tuple.instanceRevision ||
    tuple.lifecycle !== "active" ||
    !tuple.connected ||
    tuple.dead ||
    tuple.recoveryRequested ||
    !tuple.operational ||
    tuple.occupantId !== tuple.characterId ||
    !close(tuple.acceptedX, matched.context.stationX) ||
    !close(tuple.acceptedY, matched.context.stationY) ||
    !close(tuple.standingElevationM, matched.context.floorElevationM)
  )
    return null;
  return { ...matched, tuple };
}
