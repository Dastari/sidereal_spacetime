/** Shared flight-installation contract. Prefab ships are installed by
 * planPrefabConstructionFlight (prefab-flight.ts); the retired Wayfarer planner
 * that lived here was removed on 2026-09-29. */
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
