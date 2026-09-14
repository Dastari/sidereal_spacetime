import { isQualifiedWayfarerBlueprint } from "@sidereal/sim/wayfarer-walking-bindings";

/** Display allowlist only; authority independently validates the full source. */
export const QUALIFIED_FLIGHT_PREVIEW_SHA256 =
  "362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340";

/** Presentation only; game authority still checks the complete source and fittings. */
export const supportsAuthoredFlightPresentation = isQualifiedWayfarerBlueprint;

export interface AuthoredFlightStatus {
  shipId: string;
  stationId: string;
  stationRevision: bigint;
  deckId: string;
  lifecycle: string;
  revision: bigint;
  active: boolean;
  flightAdmitted: boolean;
  visitId: string;
  visitRevision: bigint;
  admissionRevision: bigint;
  seatState: string;
  seatRevision: bigint;
}
interface Visit {
  characterId: string;
  instanceId: string;
  deckId: string;
  visitId: string;
  revision?: bigint;
}
interface Admission {
  characterId: string;
  shipId: string;
  revision: bigint;
}
interface Motion {
  id: string;
  x: number;
  y: number;
  heading: number;
  vx: number;
  vy: number;
}
const stationary = { x: 0, y: 0, heading: 0, vx: 0, vy: 0 };

/** Join accepted rows by both identity and revision. A static walking review,
 * stale admission or revoked document must never animate from another ship. */
export function authoredFlightPresentation(
  actor: { id: string; shipId: string } | undefined,
  visit: Visit | undefined,
  documentAvailable: boolean,
  admissions: readonly Admission[],
  statuses: readonly AuthoredFlightStatus[],
  ship: Motion | undefined,
) {
  const status = statuses.find((row) => row.shipId === actor?.shipId);
  const admission = admissions.find((row) => row.characterId === actor?.id);
  const admitted = Boolean(
    actor &&
    visit &&
    documentAvailable &&
    ship &&
    status &&
    admission &&
    visit.characterId === actor.id &&
    visit.instanceId === actor.shipId &&
    ship.id === actor.shipId &&
    status.deckId === visit.deckId &&
    status.visitId === visit.visitId &&
    status.visitRevision === visit.revision &&
    status.active &&
    status.lifecycle === "active" &&
    status.flightAdmitted &&
    admission.shipId === actor.shipId &&
    status.admissionRevision === admission.revision &&
    [ship.x, ship.y, ship.heading, ship.vx, ship.vy].every(Number.isFinite),
  );
  return {
    status,
    admitted,
    motion:
      admitted && ship
        ? {
            x: ship.x,
            y: ship.y,
            heading: ship.heading,
            vx: ship.vx,
            vy: ship.vy,
          }
        : { ...stationary },
  };
}

export interface AuthoredFlightFitting {
  id: string;
  shipId: string;
  placedObjectId: string;
  sourceDeviceId: string;
  kind: string;
}
/** Object-detail labels join actual fitting IDs; plume geometry independently
 * consumes the compiled actuator projection. Removal is a valid smaller set. */
export function authoredExhaustTelemetry(
  shipId: string,
  fittings: readonly AuthoredFlightFitting[],
  outputs: readonly { shipId: string; actuatorId: string; throttle: number }[],
) {
  const actuators = fittings.filter(
    (f) => f.shipId === shipId && f.kind === "actuator",
  );
  const count = actuators.length;
  if (
    count > 256 ||
    new Set(actuators.map((f) => f.id)).size !== count ||
    new Set(actuators.map((f) => f.placedObjectId)).size !== count ||
    new Set(actuators.map((f) => f.sourceDeviceId)).size !== count ||
    actuators.some((f) => !f.id || !f.placedObjectId || !f.sourceDeviceId)
  )
    return [];
  return actuators.flatMap((f) => {
    const matches = outputs.filter(
      (o) => o.shipId === shipId && o.actuatorId === f.id,
    );
    if (matches.length !== 1 || !Number.isFinite(matches[0].throttle))
      return [];
    return [
      {
        actuatorId: f.sourceDeviceId,
        throttle: Math.max(0, Math.min(1, matches[0].throttle)),
      },
    ];
  });
}

/** Passenger motion requires the current narrow admission and exact interior
 * revision. This grants no pilot controls and supplies no owner-only telemetry. */
export function passengerFlightAdmitted(
  actor: { id: string; shipId: string } | undefined,
  location:
    | {
        characterId: string;
        instanceId: string;
        deckId: string;
        visitId: string;
      }
    | undefined,
  instance: { id: string; revision?: bigint } | undefined,
  passenger:
    | {
        characterId: string;
        shipId: string;
        deckId: string;
        visitId: string;
        admitted: boolean;
      }
    | undefined,
  interior:
    | {
        characterId: string;
        shipId: string;
        instanceId: string;
        instanceRevision: bigint;
        deckId: string;
      }
    | undefined,
  motion:
    | {
        shipId: string;
        x: number;
        y: number;
        vx: number;
        vy: number;
        heading: number;
      }
    | undefined,
) {
  return !!(
    actor &&
    location &&
    instance &&
    passenger?.admitted &&
    interior &&
    motion &&
    passenger.characterId === actor.id &&
    interior.characterId === actor.id &&
    location.characterId === actor.id &&
    passenger.shipId === actor.shipId &&
    interior.shipId === actor.shipId &&
    motion.shipId === actor.shipId &&
    location.instanceId === instance.id &&
    interior.instanceId === instance.id &&
    instance.id === actor.shipId &&
    interior.instanceRevision === instance.revision &&
    passenger.visitId === location.visitId &&
    passenger.deckId === location.deckId &&
    interior.deckId === location.deckId &&
    [motion.x, motion.y, motion.vx, motion.vy, motion.heading].every(
      Number.isFinite,
    )
  );
}
