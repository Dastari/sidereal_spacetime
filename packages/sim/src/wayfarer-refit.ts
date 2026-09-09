import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { compileConstruction } from "./construction-transactions";
import { planConstructionInstance } from "./construction-instance";
import { planQualifiedConstructionFlight } from "./construction-flight";
import {
  qualifiedWayfarerWalkingBindings,
  qualifiedWayfarerInstanceObstacles,
} from "./wayfarer-walking-bindings";
import {
  compileDeckCollision,
  resolveDeckCollision,
  canOccupyDeck,
} from "./construction-collision";
import {
  REFIT_FUEL_ATTACHMENT,
  qualifyRefitFuelLayout,
} from "./wayfarer-refit-audit";

/** Trusted conversion planner reuses the original ship/station IDs. It allocates
 * only new structural/device identities, never another ship, character or kit. */
export function planWayfarerRefit(input: {
  shipId: string;
  stationId: string;
  actorPosition: [number, number];
  systemId: string;
  x: number;
  y: number;
  serverTick: bigint;
  hasFuel: boolean;
  allocateUuid(): string;
  identityExists(id: string): boolean;
}) {
  const snapshot = compileConstruction(WAYFARER_STARTER.documentJson),
    used = new Set([input.shipId, input.stationId]);
  const fresh = () => {
    const id = input.allocateUuid();
    if (used.has(id) || input.identityExists(id))
      throw Error("Refit identity collision");
    used.add(id);
    return id;
  };
  const instance = planConstructionInstance(
    snapshot,
    {
      blueprintRevisionId: WAYFARER_STARTER.blueprintId,
      expectedBlueprintSha256: WAYFARER_STARTER.sha256,
      sourceDeckId: WAYFARER_STARTER.sourceDeckId,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      objectCollisionBindings: qualifiedWayfarerWalkingBindings(
        snapshot,
        0.3,
        1.8,
      ),
    },
    (kind) => (kind === "instance" ? input.shipId : fresh()),
  );
  const row = {
    id: instance.instanceId,
    revision: 1n,
    blueprintSha256: instance.blueprintSha256,
    documentJson: JSON.stringify(instance.document),
    idMapJson: JSON.stringify(instance.mappings),
    spawnDeckId: instance.spawn.deckId,
    name: instance.document.layout.name,
  };
  const obstacles = qualifiedWayfarerInstanceObstacles(
    row,
    instance.spawn.deckId,
  );
  let attachmentId: string | undefined;
  if (input.hasFuel) {
    const proof = qualifyRefitFuelLayout();
    if (!proof.footprintClear || !proof.approachClear)
      throw Error("Refit fuel layout qualification changed");
    attachmentId = fresh();
    obstacles.push({
      id: attachmentId,
      definitionId: REFIT_FUEL_ATTACHMENT.assetId,
      vertices: [
        [-3.5, 6.5],
        [-2.5, 6.5],
        [-2.5, 7.5],
        [-3.5, 7.5],
      ],
    });
  }
  const frame = resolveDeckCollision(
    compileDeckCollision(instance.document.layout, instance.spawn.deckId, {
      shipId: input.shipId,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      obstacles,
    }),
    [],
  );
  if (
    !canOccupyDeck(
      frame,
      {
        shipId: input.shipId,
        deckId: instance.spawn.deckId,
        position: input.actorPosition,
      },
      0.3,
    )
  )
    throw Error(
      "Walk to clear supported floor before refitting; current position cannot be retained",
    );
  instance.spawn.positionM = [...input.actorPosition];
  let n = 0;
  const flight = planQualifiedConstructionFlight(
    row,
    {
      systemId: input.systemId,
      x: input.x,
      y: input.y,
      serverTick: input.serverTick,
    },
    () => (n++ === 0 ? input.stationId : fresh()),
  );
  return {
    instance,
    flight,
    attachmentId,
    frame,
    retainedActorPosition: [...input.actorPosition] as [number, number],
  };
}
