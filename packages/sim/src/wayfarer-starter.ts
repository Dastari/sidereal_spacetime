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
  const snapshot = compileConstruction(WAYFARER_STARTER.documentJson);
  if (snapshot.sha256 !== WAYFARER_STARTER.sha256)
    throw Error("Trusted starter source hash mismatch");
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
    fresh,
  );
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
    entitlement: WAYFARER_STARTER.entitlement,
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
