/**
 * Handling envelope of a prefab ship, measured by flying its compiled IFCS definition through the
 * same pilot guidance and allocator the world uses (60 Hz substeps). Pure and deterministic.
 *
 * Owner direction (2026-09-29): starter-size ships must feel snappy to move around: responsive
 * acceleration, turning and stopping. `prefab-handling.test.ts` asserts the S-class envelope and
 * that M/L hulls stay heavier.
 */
import { WAYFARER_FLIGHT_SPEED } from "@sidereal/content/physical-definitions";
import type {
  PrefabComponentCatalog,
  ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { DT } from "./index";
import { compileFlightDefinition } from "./flight-definition";
import {
  pilotDesiredMotion,
  solveFlight,
  type FlightEnvelope,
  type FlightProfile,
} from "./ifcs";
import {
  PREFAB_FLIGHT_PROFILE,
  prefabFlightInput,
  prefabFlightModel,
} from "./prefab-flight";

export interface PrefabHandling {
  massKg: number;
  envelope: FlightEnvelope;
  profile: FlightProfile;
  /** Full throttle from rest to 95 % of the forward speed limit (s). */
  zeroToCruiseS: number;
  /** Keys released at the forward speed limit until below 0.5 m/s (s, m). */
  stopS: number;
  stopDistanceM: number;
  /** Full turn input from rest until the heading has changed by 90 degrees (s). */
  turn90S: number;
  /** Peak yaw rate from rest under full turn input (rad/s). */
  yawRateRadS: number;
  /** Yaw rate after 3 s of full throttle and full turn from cruise (rad/s): turning while moving. */
  cruiseTurnRadS: number;
}

export function compilePrefabFlight(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
) {
  const model = prefabFlightModel(doc, catalog);
  const identity = (s: string) => `${doc.id}:${s}`;
  const compiled = compileFlightDefinition(
    prefabFlightInput(model, identity, {
      fittings: model.fittings.map((f) => ({
        id: `fit:${f.sourceId}`,
        placedObjectId: identity(f.sourceId),
        definitionId: f.definitionId,
        definitionRevision: f.definitionRevision,
        installed: true,
        powered: true,
        availability: 1,
      })),
    }),
  );
  if (compiled.status !== "ready") throw Error(compiled.reason);
  return compiled;
}

export function prefabHandling(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  speed = WAYFARER_FLIGHT_SPEED,
): PrefabHandling {
  const compiled = compilePrefabFlight(doc, catalog);
  const { mass, actuators, envelope } = compiled;
  const profile = PREFAB_FLIGHT_PROFILE;
  const step = (
    s: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      heading: number;
      omega: number;
    },
    throttle: number,
    turn: number,
  ) =>
    solveFlight(
      s,
      pilotDesiredMotion(
        s,
        { throttle, turn },
        speed.forward,
        speed.reverse,
        profile.maxAngularSpeed,
      ),
      mass,
      actuators,
      true,
      profile,
      envelope,
    ).motion;
  const rest = { x: 0, y: 0, vx: 0, vy: 0, heading: 0, omega: 0 };
  const limit = 240 / DT;
  const v = (s: typeof rest) => Math.hypot(s.vx, s.vy);

  let s = rest,
    n = 0;
  while (v(s) < speed.forward * 0.95 && n < limit) ((s = step(s, 1, 0)), n++);
  const zeroToCruiseS = n >= limit ? Infinity : n * DT;
  // Settle at cruise, then release every key.
  for (let i = 0; i < 5 / DT; i++) s = step(s, 1, 0);
  const x0 = s.x,
    y0 = s.y;
  n = 0;
  while (v(s) > 0.5 && n < limit) ((s = step(s, 0, 0)), n++);
  const stopS = n >= limit ? Infinity : n * DT;
  const stopDistanceM = Math.hypot(s.x - x0, s.y - y0);

  s = rest;
  n = 0;
  let yawRateRadS = 0;
  while (Math.abs(s.heading) < Math.PI / 2 && n < limit) {
    s = step(s, 0, 1);
    yawRateRadS = Math.max(yawRateRadS, Math.abs(s.omega));
    n++;
  }
  const turn90S = n >= limit ? Infinity : n * DT;

  s = rest;
  for (let i = 0; i < 60 / DT && v(s) < speed.forward * 0.95; i++)
    s = step(s, 1, 0);
  for (let i = 0; i < 3 / DT; i++) s = step(s, 1, 1);
  return {
    massKg: mass.massKg,
    envelope,
    profile,
    zeroToCruiseS,
    stopS,
    stopDistanceM,
    turn90S,
    yawRateRadS,
    cruiseTurnRadS: Math.abs(s.omega),
  };
}
