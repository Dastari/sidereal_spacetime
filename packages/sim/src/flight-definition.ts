import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  compileMass,
  deriveEnvelope,
  type Actuator,
  type MassElement,
  type MassProperties,
  type FlightEnvelope,
} from "./ifcs";

export type FlightPoint = readonly [number, number];
export interface PhysicalPartDefinition {
  id: string;
  revision: number;
  kind: string;
  massKg: number;
  centroid: FlightPoint;
  inertiaKgM2: number;
  /** Optional provenance checks used by the construction adapter, never geometry authority. */
  assetId?: string;
  visualRevisions?: readonly string[];
  nativeSha256?: string;
}
export interface ActuatorDefinition extends PhysicalPartDefinition {
  kind: "actuator";
  fittingDefinitionId: string;
  maxThrustN: number;
  forceAxis: FlightPoint;
  mountOffset: FlightPoint;
  nozzleOffset: FlightPoint;
  nozzleHeight: number;
}
export interface ComputerDefinition extends PhysicalPartDefinition {
  kind: "computer";
  fittingDefinitionId: string;
  requiredPowerW: number;
}
export type FlightPhysicalDefinition =
  PhysicalPartDefinition | ActuatorDefinition | ComputerDefinition;
export interface FlightDefinitionCatalog {
  id: string;
  revision: number;
  definitions: readonly FlightPhysicalDefinition[];
}
export interface FlightPlacedPart {
  id: string;
  definitionId: string;
  revision: number;
  position: readonly [number, number, number];
  rotation: number;
  flipped: boolean;
}
export interface FlightFitting {
  id: string;
  placedObjectId: string;
  definitionId: string;
  definitionRevision: number;
  installed: boolean;
  powered: boolean;
  availability: number;
  detached?: boolean;
}
export interface FlightCargoMass {
  containerId: string;
  massKg: number;
  position: FlightPoint;
  inertiaKgM2?: number;
}
export interface FlightCrewMass {
  characterId: string;
  massKg: number;
  position: FlightPoint;
  inertiaKgM2?: number;
}
export interface FlightHullDefinition {
  id: string;
  revision: number;
  radius: number;
  halfLength: number;
  /** Capsule midpoint in the unchanged authored frame. */
  center: FlightPoint;
}
export interface FlightDefinitionInput {
  parts: readonly FlightPlacedPart[];
  fittings: readonly FlightFitting[];
  cargo: readonly FlightCargoMass[];
  crew: readonly FlightCrewMass[];
  catalog: FlightDefinitionCatalog;
  hull: FlightHullDefinition;
  /** Missing entry means fully supplied; zero keeps mass but cuts actuation. */
  supply?: Readonly<Record<string, number>>;
}
export type CompiledFlightActuator = Actuator & {
  placedObjectId: string;
  definitionId: string;
  definitionRevision: number;
  nozzleX: number;
  nozzleY: number;
  height: number;
  exhaustX: number;
  exhaustY: number;
};
export interface CompiledFlightComputer {
  id: string;
  placedObjectId: string;
  definitionId: string;
  definitionRevision: number;
  installed: boolean;
  powered: boolean;
  requiredPowerW: number;
}
export interface CompiledFlightHull {
  id: string;
  revision: number;
  radius: number;
  halfLength: number;
  authoredMidpointX: number;
  authoredMidpointY: number;
  lateralOffset: number;
  longitudinalOffset: number;
}
export interface FlightMassContribution extends MassElement {
  source: "part" | "cargo" | "crew";
  sourceId: string;
  definitionId?: string;
  definitionRevision?: number;
}
export type CompiledFlightDefinition =
  | {
      status: "ready";
      inputHash: string;
      definitionHash: string;
      mass: MassProperties;
      actuators: CompiledFlightActuator[];
      computers: CompiledFlightComputer[];
      envelope: FlightEnvelope;
      hull: CompiledFlightHull;
      contributions: FlightMassContribution[];
    }
  | { status: "rejected"; reasons: string[]; reason: string };
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const identifier = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 256 &&
  !/[\u0000-\u001f]/.test(v);
const positiveRevision = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;
const nonnegative = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const point = (v: unknown, dimensions: number): v is number[] =>
  Array.isArray(v) &&
  v.length === dimensions &&
  v.every(
    (x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) <= 10000,
  );
function canonical(v: unknown): string {
  if (v === null || typeof v === "string" || typeof v === "boolean")
    return JSON.stringify(v);
  if (typeof v === "number" && Number.isFinite(v)) return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .sort(([a], [b]) => order(a, b))
        .map(([k, x]) => JSON.stringify(k) + ":" + canonical(x))
        .join(",") +
      "}"
    );
  throw Error("Non-canonical flight definition value");
}
export const flightDefinitionHash = (v: unknown): string =>
  bytesToHex(sha256(new TextEncoder().encode(canonical(v))));
const byId = <T extends { id: string }>(rows: readonly T[]) =>
  [...rows].sort((a, b) => order(a.id, b.id));
/** Mirror in part-local X, then rotate in east/north coordinates. Used for the
 * centroid, application point, nozzle and force together; translation applies only to points. */
export function transformFlightVector(
  v: FlightPoint,
  rotation: number,
  flipped: boolean,
): [number, number] {
  const x = flipped ? -v[0] : v[0],
    c = Math.cos(rotation),
    s = Math.sin(rotation);
  return [c * x - s * v[1], s * x + c * v[1]];
}
function located(v: FlightPoint, p: FlightPlacedPart): [number, number] {
  const r = transformFlightVector(v, p.rotation, p.flipped);
  return [p.position[0] + r[0], p.position[1] + r[1]];
}
function checkedDefinition(d: FlightPhysicalDefinition): boolean {
  if (
    !d ||
    !identifier(d.id) ||
    !positiveRevision(d.revision) ||
    !identifier(d.kind) ||
    !nonnegative(d.massKg) ||
    !nonnegative(d.inertiaKgM2) ||
    !point(d.centroid, 2)
  )
    return false;
  if (d.kind === "actuator") {
    const a = d as ActuatorDefinition;
    return (
      identifier(a.fittingDefinitionId) &&
      nonnegative(a.maxThrustN) &&
      a.maxThrustN > 0 &&
      point(a.forceAxis, 2) &&
      Math.abs(Math.hypot(...a.forceAxis) - 1) < 1e-10 &&
      point(a.mountOffset, 2) &&
      point(a.nozzleOffset, 2) &&
      Number.isFinite(a.nozzleHeight) &&
      Math.abs(a.nozzleHeight) <= 10000
    );
  }
  if (d.kind === "computer") {
    const c = d as ComputerDefinition;
    return (
      identifier(c.fittingDefinitionId) &&
      nonnegative(c.requiredPowerW) &&
      c.requiredPowerW > 0
    );
  }
  return true;
}
export function flightDefinitionCatalogHash(
  catalog: FlightDefinitionCatalog,
): string {
  return flightDefinitionHash({
    ...catalog,
    definitions: [...catalog.definitions].sort(
      (a, b) => order(a.id, b.id) || a.revision - b.revision,
    ),
  });
}
/** Hash-only entry point for authoritative dirty detection. This is not a
 * validator or permission grant; malformed inputs throw and must fail closed. */
export function flightDefinitionInputHash(
  input: FlightDefinitionInput,
): string {
  return flightDefinitionHash({
    parts: byId(input.parts),
    fittings: byId(input.fittings),
    cargo: [...input.cargo].sort((a, b) => order(a.containerId, b.containerId)),
    crew: [...input.crew].sort((a, b) => order(a.characterId, b.characterId)),
    supply: input.supply ?? {},
    hull: input.hull,
    definitionHash: flightDefinitionCatalogHash(input.catalog),
  });
}
/** Bounded, deterministic compiler. Availability changes actuation, never mass.
 * Removal is represented by absent parts or installed=false, and no stock ship
 * is selected if a definition or placement is invalid. */
export function compileFlightDefinition(
  input: FlightDefinitionInput,
): CompiledFlightDefinition {
  const reasons = new Set<string>();
  const reject = (r: string) => reasons.add(r);
  if (
    !input ||
    !Array.isArray(input.parts) ||
    input.parts.length > 4096 ||
    !Array.isArray(input.fittings) ||
    input.fittings.length > 256 ||
    !Array.isArray(input.cargo) ||
    input.cargo.length > 512 ||
    !Array.isArray(input.crew) ||
    input.crew.length > 256 ||
    !input.catalog ||
    !Array.isArray(input.catalog.definitions) ||
    input.catalog.definitions.length > 4096 ||
    !identifier(input.catalog.id) ||
    !positiveRevision(input.catalog.revision)
  )
    return {
      status: "rejected",
      reason: "invalid-flight-input-budget",
      reasons: ["invalid-flight-input-budget"],
    };
  const definitions = new Map<string, FlightPhysicalDefinition>();
  for (const d of input.catalog.definitions) {
    if (!checkedDefinition(d)) {
      reject("invalid-physical-definition:" + String(d?.id));
      continue;
    }
    const k = JSON.stringify([d.id, d.revision]);
    if (definitions.has(k)) reject("duplicate-physical-definition:" + d.id);
    else definitions.set(k, d);
  }
  const h = input.hull;
  if (
    !h ||
    !identifier(h.id) ||
    !positiveRevision(h.revision) ||
    !nonnegative(h.radius) ||
    h.radius <= 0 ||
    !nonnegative(h.halfLength) ||
    !point(h.center, 2)
  )
    reject("invalid-flight-hull");
  const parts = new Map<string, FlightPlacedPart>(),
    fittings = new Map<string, FlightFitting>(),
    fittingIds = new Set<string>(),
    actuatorFittingIds = new Set<string>();
  for (const p of input.parts) {
    if (
      !p ||
      !identifier(p.id) ||
      !identifier(p.definitionId) ||
      !positiveRevision(p.revision) ||
      !point(p.position, 3) ||
      typeof p.rotation !== "number" ||
      !Number.isFinite(p.rotation) ||
      Math.abs(p.rotation) > 1e9 ||
      typeof p.flipped !== "boolean"
    ) {
      reject("invalid-part-placement:" + String(p?.id));
      continue;
    }
    if (parts.has(p.id)) reject("duplicate-placed-part:" + p.id);
    else parts.set(p.id, p);
    if (!definitions.has(JSON.stringify([p.definitionId, p.revision])))
      reject(
        "missing-physical-definition:" + p.definitionId + "@" + p.revision,
      );
  }
  for (const f of input.fittings) {
    if (
      !f ||
      !identifier(f.id) ||
      !identifier(f.placedObjectId) ||
      !identifier(f.definitionId) ||
      !positiveRevision(f.definitionRevision) ||
      typeof f.installed !== "boolean" ||
      typeof f.powered !== "boolean" ||
      !nonnegative(f.availability) ||
      f.availability > 1 ||
      (f.detached !== undefined && typeof f.detached !== "boolean")
    ) {
      reject("invalid-flight-fitting:" + String(f?.id));
      continue;
    }
    if (fittingIds.has(f.id) || fittings.has(f.placedObjectId))
      reject("duplicate-flight-fitting:" + f.id);
    fittingIds.add(f.id);
    fittings.set(f.placedObjectId, f);
    const p = parts.get(f.placedObjectId),
      d = p && definitions.get(JSON.stringify([p.definitionId, p.revision]));
    if (d?.kind === "actuator") actuatorFittingIds.add(f.id);
    if (!p) reject("orphan-flight-fitting:" + f.id);
    else if (
      d &&
      ((d.kind !== "actuator" && d.kind !== "computer") ||
        (d as ActuatorDefinition | ComputerDefinition).fittingDefinitionId !==
          f.definitionId ||
        d.revision !== f.definitionRevision)
    )
      reject("flight-fitting-definition-mismatch:" + f.id);
  }
  const payloadIds = new Set<string>(parts.keys());
  for (const [source, rows] of [
    ["cargo", input.cargo],
    ["crew", input.crew],
  ] as const)
    for (const r of rows) {
      if (!r || typeof r !== "object") {
        reject("invalid-" + source + "-mass");
        continue;
      }
      const id = "containerId" in r ? r.containerId : r.characterId;
      if (
        !identifier(id) ||
        !nonnegative(r.massKg) ||
        !point(r.position, 2) ||
        (r.inertiaKgM2 !== undefined && !nonnegative(r.inertiaKgM2))
      )
        reject("invalid-" + source + "-mass:" + String(id));
      if (payloadIds.has(id)) reject("duplicate-physical-mass-identity:" + id);
      payloadIds.add(id);
    }
  if (input.supply !== undefined) {
    if (
      !input.supply ||
      typeof input.supply !== "object" ||
      Array.isArray(input.supply) ||
      Object.keys(input.supply).length > 256
    )
      reject("invalid-flight-supply");
    else
      for (const [id, v] of Object.entries(input.supply))
        if (!actuatorFittingIds.has(id) || !nonnegative(v) || v > 1)
          reject("invalid-flight-supply:" + id);
  }
  if (reasons.size) {
    const sorted = [...reasons].sort(order);
    return { status: "rejected", reason: sorted.join("; "), reasons: sorted };
  }
  try {
    const contributions: FlightMassContribution[] = [],
      actuators: CompiledFlightActuator[] = [],
      computers: CompiledFlightComputer[] = [];
    for (const p of byId(input.parts)) {
      const d = definitions.get(JSON.stringify([p.definitionId, p.revision]))!,
        f = fittings.get(p.id);
      if (f && !f.installed) continue;
      const [x, y] = located(d.centroid, p);
      contributions.push({
        id: "part:" + p.id,
        source: "part",
        sourceId: p.id,
        definitionId: d.id,
        definitionRevision: d.revision,
        massKg: d.massKg,
        x,
        y,
        inertiaKgM2: d.inertiaKgM2,
      });
      if (d.kind === "actuator" && f) {
        const a = d as ActuatorDefinition,
          mount = located(a.mountOffset, p),
          nozzle = located(a.nozzleOffset, p),
          force = transformFlightVector(a.forceAxis, p.rotation, p.flipped);
        actuators.push({
          id: f.id,
          placedObjectId: p.id,
          definitionId: d.id,
          definitionRevision: d.revision,
          x: mount[0],
          y: mount[1],
          rotation: Math.atan2(-force[0], force[1]),
          maxThrustN: a.maxThrustN,
          availability:
            f.powered && !f.detached
              ? f.availability *
                (input.supply && Object.hasOwn(input.supply, f.id)
                  ? input.supply[f.id]
                  : 1)
              : 0,
          nozzleX: nozzle[0],
          nozzleY: nozzle[1],
          height: p.position[2] + a.nozzleHeight,
          exhaustX: -force[0],
          exhaustY: -force[1],
        });
      }
      if (d.kind === "computer" && f) {
        const c = d as ComputerDefinition;
        computers.push({
          id: f.id,
          placedObjectId: p.id,
          definitionId: d.id,
          definitionRevision: d.revision,
          installed: true,
          powered: f.powered && !f.detached && f.availability > 0,
          requiredPowerW: c.requiredPowerW,
        });
      }
    }
    for (const r of [...input.cargo].sort((a, b) =>
      order(a.containerId, b.containerId),
    ))
      contributions.push({
        id: "cargo:" + r.containerId,
        source: "cargo",
        sourceId: r.containerId,
        massKg: r.massKg,
        x: r.position[0],
        y: r.position[1],
        inertiaKgM2: r.inertiaKgM2 ?? 0,
      });
    for (const r of [...input.crew].sort((a, b) =>
      order(a.characterId, b.characterId),
    ))
      contributions.push({
        id: "crew:" + r.characterId,
        source: "crew",
        sourceId: r.characterId,
        massKg: r.massKg,
        x: r.position[0],
        y: r.position[1],
        inertiaKgM2: r.inertiaKgM2 ?? 0,
      });
    const mass = compileMass(contributions),
      sortedActuators = byId(actuators);
    const definitionHash = flightDefinitionCatalogHash(input.catalog),
      inputHash = flightDefinitionInputHash(input);
    return {
      status: "ready",
      inputHash,
      definitionHash,
      mass,
      actuators: sortedActuators,
      computers: byId(computers),
      envelope: deriveEnvelope(sortedActuators, mass),
      hull: {
        id: h.id,
        revision: h.revision,
        radius: h.radius,
        halfLength: h.halfLength,
        authoredMidpointX: h.center[0],
        authoredMidpointY: h.center[1],
        lateralOffset: h.center[0] - mass.centerX,
        longitudinalOffset: h.center[1] - mass.centerY,
      },
      contributions,
    };
  } catch (e) {
    const reason =
      "flight-compilation-rejected:" +
      String(e instanceof Error ? e.message : e);
    return { status: "rejected", reason, reasons: [reason] };
  }
}
