import {
  LAB_FLIGHT_ACTUATORS,
  LAB_FLIGHT_COMPUTER,
  LAB_FLIGHT_MASS,
  LAB_FLIGHT_PROFILE,
  LAB_FLIGHT_SPEED,
} from "@sidereal/content/flight";
import { LAB_HULL } from "@sidereal/content/space";
import { STARTER } from "@sidereal/content";
import { PILOT_LAYOUT } from "../../content/src/pilot-layout";
import {
  qualifiedWayfarerInstanceObstacles,
  isQualifiedWayfarerBlueprint,
} from "./wayfarer-walking-bindings";
import { constructionHash } from "./construction-transactions";
import { spatialCell, validateSpacePoint } from "./spatial-cells";
import type { ConstructionDocument } from "@sidereal/content/construction";
import type {
  ConstructionInstanceMappings,
  ConstructionIdentityMapping,
} from "./construction-instance";

/** Existing development installation, not a material/geometry-derived flight rating.
 * Only this exact qualified authored source may use it. Refits need a new compiler. */
export const CONSTRUCTION_FLIGHT_DEFINITION =
  "qualified-wayfarer-lab-flight-v1";
/** Stored on installation so a code/content update cannot silently retune ships. */
export const CONSTRUCTION_FLIGHT_DEFINITION_SHA256 = constructionHash(
  JSON.stringify({
    definition: CONSTRUCTION_FLIGHT_DEFINITION,
    mass: LAB_FLIGHT_MASS,
    hull: LAB_HULL,
    profile: LAB_FLIGHT_PROFILE,
    speed: LAB_FLIGHT_SPEED,
    computer: LAB_FLIGHT_COMPUTER,
    actuators: LAB_FLIGHT_ACTUATORS,
    starter: STARTER,
    pilot: PILOT_LAYOUT,
  }),
);
export interface QualifiedFlightInstance {
  id: string;
  revision: bigint;
  blueprintSha256: string;
  documentJson: string;
  idMapJson: string;
  spawnDeckId: string;
  name: string;
}
export interface FlightSpawnPlacement {
  systemId: string;
  x: number;
  y: number;
  serverTick: bigint;
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Called with a server-reserved berth, never coordinates from a reducer request.
 * Uses the instance UUID as ship UUID so cargo, decks and actor locations keep
 * their existing joins. Devices/station are newly allocated; nobody is seated. */
export function planQualifiedConstructionFlight(
  instance: QualifiedFlightInstance,
  placement: FlightSpawnPlacement,
  allocate: () => string,
  reservedIds: readonly string[] = [],
) {
  if (
    !isQualifiedWayfarerBlueprint(instance.blueprintSha256) ||
    instance.revision !== 1n
  )
    throw Error("Exact unrefitted qualified Wayfarer instance required");
  if (
    instance.documentJson.length > 1_048_576 ||
    instance.idMapJson.length > 1_048_576
  )
    throw Error("Bounded construction source required");
  qualifiedWayfarerInstanceObstacles(instance, instance.spawnDeckId);
  validateSpacePoint(placement);
  if (
    !placement.systemId ||
    placement.systemId.length > 160 ||
    placement.serverTick < 0n
  )
    throw Error("Valid server-selected system sample required");
  if (reservedIds.length > 16384)
    throw Error("Flight identity budget exceeded");
  const document = JSON.parse(instance.documentJson) as ConstructionDocument;
  const map = JSON.parse(instance.idMapJson) as ConstructionInstanceMappings;
  const objects = new Map(map.objects.map((m) => [m.sourceId, m.instanceId]));
  const parts = new Map(document.layout.assembly!.parts.map((p) => [p.id, p]));
  const placed = (sourceId: string) => {
    const id = objects.get(sourceId);
    if (!id || !parts.has(id))
      throw Error("Qualified flight placement missing: " + sourceId);
    return id;
  };
  const used = new Set(
    [
      instance.id,
      ...reservedIds,
      ...Object.values(map).flatMap((rows: ConstructionIdentityMapping[]) =>
        rows.map((r) => r.instanceId),
      ),
    ].map((s) => s.toLowerCase()),
  );
  const fresh = () => {
    const id = allocate();
    if (!uuid.test(id) || used.has(id.toLowerCase()))
      throw Error("Fresh flight UUID required");
    used.add(id.toLowerCase());
    return id;
  };
  const shipId = instance.id;
  const station = {
    id: fresh(),
    shipId,
    deckId: instance.spawnDeckId,
    placedObjectId: placed("equipment-control-seat"),
    consolePlacedObjectId: placed("equipment-control-console"),
    localX: PILOT_LAYOUT.station.x,
    localY: PILOT_LAYOUT.station.y,
    occupantId: undefined as string | undefined,
    // Installation is inert until native station access and per-ship IFCS are wired.
    operational: false,
  };
  const computer = {
    id: fresh(),
    shipId,
    placedObjectId: station.consolePlacedObjectId,
    sourceDeviceId: LAB_FLIGHT_COMPUTER.id,
    definitionId: LAB_FLIGHT_COMPUTER.definitionId,
    installed: LAB_FLIGHT_COMPUTER.installed,
    powered: LAB_FLIGHT_COMPUTER.powered,
  };
  const actuators = LAB_FLIGHT_ACTUATORS.map((a) => ({
    ...a,
    id: fresh(),
    shipId,
    placedObjectId: placed(a.id),
    sourceDeviceId: a.id,
  }));
  const cell = spatialCell(placement);
  return {
    definitionId: CONSTRUCTION_FLIGHT_DEFINITION,
    definitionSha256: CONSTRUCTION_FLIGHT_DEFINITION_SHA256,
    instanceId: instance.id,
    instanceRevision: instance.revision,
    blueprintSha256: instance.blueprintSha256,
    ship: {
      id: shipId,
      name: instance.name,
      revision: 1n,
      x: placement.x,
      y: placement.y,
      vx: 0,
      vy: 0,
      heading: 0,
      omega: 0,
      massKg: STARTER.massKg,
      thrustN: STARTER.thrustN,
      turnAcceleration: STARTER.turnAcceleration,
      tick: placement.serverTick,
    },
    motion: {
      shipId,
      systemId: placement.systemId,
      x: placement.x,
      y: placement.y,
      vx: 0,
      vy: 0,
      heading: 0,
      omega: 0,
      serverTick: placement.serverTick,
      cellX: BigInt(cell.cellX),
      cellY: BigInt(cell.cellY),
    },
    station,
    computer,
    actuators,
    flight: {
      mass: { ...LAB_FLIGHT_MASS },
      hull: { ...LAB_HULL },
      profile: { ...LAB_FLIGHT_PROFILE },
      speed: { ...LAB_FLIGHT_SPEED },
    },
    provenance: "existing-development-flight-installation" as const,
    physicalMassCompiled: false as const,
    routedPowerFuelImplemented: false as const,
    armorRatingImplemented: false as const,
    actorMutationRequired: false as const,
    cargoMutationRequired: false as const,
    activation: "installed-dormant" as const,
  };
}
export type ConstructionFlightPlan = ReturnType<
  typeof planQualifiedConstructionFlight
>;
