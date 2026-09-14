import { WAYFARER_PHYSICAL_CATALOG } from "@sidereal/content/physical-definitions";
import {
  transformFlightVector,
  type ActuatorDefinition,
  type ComputerDefinition,
} from "./flight-definition";
import { PILOT_LAYOUT } from "@sidereal/content/pilot-layout";
import {
  qualifiedWayfarerInstanceObstacles,
  isQualifiedWayfarerBlueprint,
} from "./wayfarer-walking-bindings";
import { spatialCell, validateSpacePoint } from "./spatial-cells";
import type { ConstructionDocument } from "@sidereal/content/construction";
import type {
  ConstructionInstanceMappings,
  ConstructionIdentityMapping,
} from "./construction-instance";

/** Immutable installation protocol pin retained for existing bindings. Physical
 * ratings are compiled separately from versioned placed-part definitions. */
export const CONSTRUCTION_FLIGHT_DEFINITION =
  "qualified-wayfarer-lab-flight-v1";
export const CONSTRUCTION_FLIGHT_DEFINITION_SHA256 =
  "8aee8337485375adcea4b3408ffc4589f08da8391057d9ef407fd8d002c311d0";
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
    // Activation remains a separate validated transaction.
    operational: false,
  };
  const consolePart = parts.get(station.consolePlacedObjectId)!;
  const computerDefinition = WAYFARER_PHYSICAL_CATALOG.definitions.find(
    (d) =>
      d.id === "physical:" + consolePart.assetId &&
      d.revision === 1 &&
      d.kind === "computer",
  ) as ComputerDefinition | undefined;
  if (
    !computerDefinition ||
    !computerDefinition.visualRevisions?.includes(
      document.layout.assembly!.revisions[consolePart.assetId],
    )
  )
    throw Error("Missing qualified computer physical definition");
  const computer = {
    id: fresh(),
    shipId,
    placedObjectId: station.consolePlacedObjectId,
    sourceDeviceId: "computer-flight-01",
    definitionId: computerDefinition.fittingDefinitionId,
    definitionRevision: computerDefinition.revision,
    installed: true,
    powered: true,
  };
  const sourceIds = new Map(map.objects.map((m) => [m.instanceId, m.sourceId]));
  const actuators = [...parts.values()].flatMap((part) => {
    const definition = WAYFARER_PHYSICAL_CATALOG.definitions.find(
      (d) => d.id === "physical:" + part.assetId && d.revision === 1,
    );
    if (!definition)
      throw Error("Missing placed-part physical definition: " + part.assetId);
    if (definition.kind !== "actuator") return [];
    const d = definition as ActuatorDefinition;
    if (
      !d.visualRevisions?.includes(
        document.layout.assembly!.revisions[part.assetId],
      )
    )
      throw Error("Missing qualified actuator asset revision");
    const sourceDeviceId = sourceIds.get(part.id);
    if (!sourceDeviceId) throw Error("Missing actuator source mapping");
    const mount = transformFlightVector(
      d.mountOffset,
      part.rotation,
      part.flipped,
    );
    const axis = transformFlightVector(
      d.forceAxis,
      part.rotation,
      part.flipped,
    );
    return [
      {
        id: fresh(),
        shipId,
        placedObjectId: part.id,
        sourceDeviceId,
        definitionId: d.fittingDefinitionId,
        definitionRevision: d.revision,
        x: part.position[0] + mount[0],
        y: part.position[1] + mount[1],
        rotation: Math.atan2(-axis[0], axis[1]),
        maxThrustN: d.maxThrustN,
        availability: 1,
      },
    ];
  });
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
      massKg: 0,
      thrustN: 0,
      turnAcceleration: 0,
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
    provenance: "versioned-placed-part-installation" as const,
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
