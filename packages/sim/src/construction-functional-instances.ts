import { LAB_STORAGE_FIXTURES } from "../../content/src/storage-fixtures";
import { LAB_INTERACTIONS } from "../../content/src/interactions";
import { qualifiedWayfarerInstanceObstacles } from "./wayfarer-walking-bindings";
import type { ConstructionInstancePlan } from "./construction-instance";

export interface ConstructionContainerSeed {
  id: string;
  instanceId: string;
  deckId: string;
  placedObjectId: string;
  definitionId: string;
  kind: "grid";
  name: string;
  columns: number;
  rows: number;
  maxInventoryMassKg: number;
  positionM: readonly [number, number, number];
  contents: readonly [];
  revision: bigint;
  capacityBasis: "existing-development-inventory-fixture";
  physicalPayloadRatingKg: null;
}
export interface ConstructionInteractionSeed {
  id: string;
  instanceId: string;
  deckId: string;
  placedObjectId: string;
  definitionId: string;
  kind: "seat" | "light";
  enabled: boolean;
  occupantCharacterId: null;
  revision: bigint;
  approachM: readonly [number, number, number];
  seatM: readonly [number, number, number] | null;
  healthDefinitionId: null;
}
/** Allocation proposal only: current inventory tables are character-scoped and
 * must not receive these instance-owned rows until deck/access adapters exist.
 * Values reuse current development gameplay definitions, never mesh-derived stats. */
export function planQualifiedWayfarerFunctionalSeeds(
  plan: ConstructionInstancePlan,
  allocateUuid: () => string,
) {
  qualifiedWayfarerInstanceObstacles(
    {
      id: plan.instanceId,
      blueprintSha256: plan.blueprintSha256,
      documentJson: JSON.stringify(plan.document),
      idMapJson: JSON.stringify(plan.mappings),
    },
    plan.spawn.deckId,
  );
  const mappings = new Map(
    plan.mappings.objects.map((m) => [m.sourceId, m.instanceId]),
  );
  const placements = new Map(
    plan.document.layout.assembly!.parts.map((p) => [p.id, p]),
  );
  const cargo = LAB_STORAGE_FIXTURES.map((d) => {
    const placed = mappings.get(d.placementId),
      p = placed && placements.get(placed);
    if (!p) throw Error("Functional seed: exact cargo placement missing");
    return { d, p };
  });
  const interactions = LAB_INTERACTIONS.map((d) => {
    const placed = mappings.get(d.placementId),
      p = placed && placements.get(placed);
    if (!p || p.assetId !== d.assetId || !["seat", "light"].includes(d.kind))
      throw Error("Functional seed: interaction revision/placement missing");
    return { d, p };
  });
  const used = new Set(plan.allocatedIds.map((s) => s.toLowerCase())),
    sourceIds = new Set(
      Object.values(plan.mappings)
        .flat()
        .map((m) => m.sourceId.toLowerCase()),
    );
  const fresh = () => {
    const id = allocateUuid();
    const key = id.toLowerCase();
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      ) ||
      used.has(key) ||
      sourceIds.has(key)
    )
      throw Error("Functional seed: allocator must provide fresh UUIDs");
    used.add(key);
    return id;
  };
  const containers: ConstructionContainerSeed[] = cargo.map(({ d, p }) => ({
    id: fresh(),
    instanceId: plan.instanceId,
    deckId: plan.spawn.deckId,
    placedObjectId: p.id,
    definitionId: "wayfarer-development-storage-grid-v1",
    kind: "grid",
    name: d.name,
    columns: d.width,
    rows: d.height,
    maxInventoryMassKg: d.maxMassKg,
    positionM: [...p.position],
    contents: [],
    revision: 1n,
    capacityBasis: "existing-development-inventory-fixture",
    physicalPayloadRatingKg: null,
  }));
  const objects: ConstructionInteractionSeed[] = interactions.map(
    ({ d, p }) => ({
      id: fresh(),
      instanceId: plan.instanceId,
      deckId: plan.spawn.deckId,
      placedObjectId: p.id,
      definitionId: "wayfarer-development-" + d.kind + "-v1",
      kind: d.kind === "seat" ? "seat" : "light",
      enabled: true,
      occupantCharacterId: null,
      revision: 1n,
      approachM: [d.approachX, d.approachY, 0.1875],
      seatM: d.kind === "seat" ? [d.seatX, d.seatY, 0.1875] : null,
      healthDefinitionId: null,
    }),
  );
  return {
    instanceId: plan.instanceId,
    containers,
    interactions: objects,
    authorityInstallationReady: false as const,
    requiredAdapters: [
      "instance-owned inventory scope and grants",
      "deck-aware reach/line-of-sight",
      "container transfer revision/receipt ownership",
      "seat recovery and support",
      "powered hydroponics semantics",
      "qualified health definitions",
      "persistent lifecycle deletion/refit guards",
    ] as const,
    unboundVisualObjects: plan.mappings.objects
      .filter(
        (m) =>
          !objects.some((o) => o.placedObjectId === m.instanceId) &&
          !containers.some((o) => o.placedObjectId === m.instanceId),
      )
      .map((m) => m.instanceId),
    loadoutApplied: false as const,
  };
}
