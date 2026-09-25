import { isQualifiedWayfarerBlueprint } from "@sidereal/sim/wayfarer-walking-bindings";
import { LAB_FLIGHT_ACTUATORS } from "@sidereal/content/flight";

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
/** The legacy effect mount names are presentation keys only. Keep UUIDs in
 * accepted telemetry/state and translate a complete qualified set for drawing.
 * Missing, duplicated, unknown or foreign mappings leave every exhaust dark. */
export function authoredExhaustTelemetry(
  shipId: string,
  fittings: readonly AuthoredFlightFitting[],
  outputs: readonly { shipId: string; actuatorId: string; throttle: number }[],
) {
  const actuators = fittings.filter(
    (f) => f.shipId === shipId && f.kind === "actuator",
  );
  const known = new Set(LAB_FLIGHT_ACTUATORS.map((device) => device.id));
  if (
    actuators.length !== known.size ||
    new Set(actuators.map((f) => f.id)).size !== known.size ||
    new Set(actuators.map((f) => f.placedObjectId)).size !== known.size ||
    new Set(actuators.map((f) => f.sourceDeviceId)).size !== known.size ||
    actuators.some(
      (f) => !f.id || !f.placedObjectId || !known.has(f.sourceDeviceId),
    )
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
