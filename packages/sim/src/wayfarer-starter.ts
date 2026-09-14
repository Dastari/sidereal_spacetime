import { CURRENT_WAYFARER_STARTER } from "@sidereal/content/wayfarer-current-starter";
import { planWayfarerRebuildGame } from "./wayfarer-rebuild-game";
import {
  compileDeckCollision,
  resolveDeckCollision,
  canOccupyDeck,
} from "./construction-collision";
import type { WayfarerStarterTemplate } from "@sidereal/content/wayfarer-current-starter";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { compileConstruction } from "./construction-transactions";
import { planConstructionInstance } from "./construction-instance";
import { qualifiedWayfarerWalkingBindings } from "./wayfarer-walking-bindings";
import { planQualifiedWayfarerFunctionalSeeds } from "./construction-functional-instances";
import {
  planQualifiedConstructionFlight,
  type FlightSpawnPlacement,
} from "./construction-flight";

/** Full preflight before writes. Identity/berth sources belong to the server
 * transaction; neither is accepted in the onboarding reducer request. */
export function planWayfarerStarter(input: {
  characterId: string;
  template?: WayfarerStarterTemplate;
  berth: FlightSpawnPlacement;
  allocateUuid(): string;
  identityExists(id: string): boolean;
}) {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.characterId))
    throw Error("Fresh starter character UUID required");
  if (input.identityExists(input.characterId))
    throw Error("Starter character identity already allocated");
  const used = new Set([input.characterId.toLowerCase()]);
  const fresh = () => {
    const id = input.allocateUuid();
    const key = id.toLowerCase();
    if (!uuid.test(id) || used.has(key) || input.identityExists(id))
      throw Error("Starter identity already allocated or invalid");
    used.add(key);
    return id;
  };
  const template = input.template ?? WAYFARER_STARTER;
  const snapshot = compileConstruction(template.documentJson);
  if (snapshot.sha256 !== template.sha256)
    throw Error("Trusted starter source hash mismatch");
  const instance = planConstructionInstance(
    snapshot,
    {
      blueprintRevisionId: template.blueprintId,
      expectedBlueprintSha256: template.sha256,
      sourceDeckId: template.sourceDeckId,
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
    fresh,
  );
  if (template.sha256 === CURRENT_WAYFARER_STARTER.sha256) {
    const geometry = planWayfarerRebuildGame(instance.document);
    const frame = resolveDeckCollision(
      compileDeckCollision(instance.document.layout, instance.spawn.deckId, {
        shipId: instance.instanceId,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
        obstacles: geometry.instanceObstacles,
      }),
      [],
    );
    const position: [number, number] = [0, -2];
    if (
      !canOccupyDeck(
        frame,
        {
          shipId: instance.instanceId,
          deckId: instance.spawn.deckId,
          position,
        },
        0.3,
      )
    )
      throw Error("Rebuilt starter corridor spawn is not clear");
    instance.spawn.positionM = position;
  }
  const functional = planQualifiedWayfarerFunctionalSeeds(instance, fresh);
  const flight = planQualifiedConstructionFlight(
    {
      id: instance.instanceId,
      revision: 1n,
      blueprintSha256: instance.blueprintSha256,
      documentJson: JSON.stringify(instance.document),
      idMapJson: JSON.stringify(instance.mappings),
      spawnDeckId: instance.spawn.deckId,
      name: instance.document.layout.name,
    },
    input.berth,
    fresh,
    [...used],
  );
  return {
    entitlement: template.entitlement,
    characterId: input.characterId,
    instance,
    functional,
    flight,
    allocatedIds: [...used],
    // Personal kit remains the existing separate exactly-once inventory seed.
    cargoInitiallyEmpty: true as const,
    authoringGrants: [] as const,
  };
}
export type WayfarerStarterPlan = ReturnType<typeof planWayfarerStarter>;
