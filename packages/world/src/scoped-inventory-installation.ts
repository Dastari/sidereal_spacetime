import { SenderError } from "spacetimedb/server";
import { isQualifiedWayfarerBlueprint } from "../../sim/src/wayfarer-walking-bindings";
import { wayfarerThresholdElevation } from "../../sim/src/wayfarer-threshold";
import { planQualifiedWayfarerFunctionalSeeds } from "../../sim/src/construction-functional-instances";
import type { ConstructionInstancePlan } from "../../sim/src/construction-instance";
import { LAB_STORAGE_FIXTURES } from "../../content/src/storage-fixtures";
import { constructionCollision } from "./construction-doors";
import { qualifyCargoAccessPoint } from "./scoped-inventory";
import type { synchronizeLegacyInventory } from "./scoped-inventory-authority";
type Context = Parameters<typeof synchronizeLegacyInventory>[0];
/** Exact r001 native qualification, metres in source deck coordinates. Old lab
 * aisle points collide with current wall/fixture footprints; keep those legacy
 * bindings unchanged and qualify these independent instance approach points. */
export const QUALIFIED_CARGO_APPROACHES: Readonly<
  Record<string, readonly [number, number]>
> = {
  "room-storage-container-2.15-0.25": [-3.75, 2.625],
  "room-storage-container-2.15-1": [-2.875, 2.5],
  "room-storage-container-3.5-0.25": [-3.75, 2.875],
  "room-storage-container-3.5-1": [-2.875, 3],
};

/** Called only inside validated spawn. Refits/existing instances require their
 * own operation/revision guard; this never converts private lab cargo. */
export function installQualifiedInstanceCargo(
  ctx: Context,
  plan: ConstructionInstancePlan,
  providedSeeds?: ReturnType<typeof planQualifiedWayfarerFunctionalSeeds>,
) {
  if (!isQualifiedWayfarerBlueprint(plan.blueprintSha256)) return;
  const instance = ctx.db.constructionInstance.id.find(plan.instanceId);
  if (!instance)
    throw new SenderError("Cargo installation requires the spawned instance");
  let seeds: ReturnType<typeof planQualifiedWayfarerFunctionalSeeds>;
  if (providedSeeds) {
    if (
      providedSeeds.containers.length !== 4 ||
      providedSeeds.interactions.length !== 4
    )
      throw new SenderError("Cargo functional batch size mismatch");
    const ids = [
      ...providedSeeds.containers,
      ...providedSeeds.interactions,
    ].map((s) => s.id);
    let cursor = 0;
    const rebuilt = planQualifiedWayfarerFunctionalSeeds(
      plan,
      () => ids[cursor++],
    );
    const serialize = (value: unknown) =>
      JSON.stringify(value, (_key, v) =>
        typeof v === "bigint" ? v.toString() : v,
      );
    if (
      cursor !== ids.length ||
      serialize(rebuilt) !== serialize(providedSeeds)
    )
      throw new SenderError("Cargo functional seed reconstruction mismatch");
    seeds = rebuilt;
  } else
    seeds = planQualifiedWayfarerFunctionalSeeds(plan, () =>
      ctx.newUuidV4().toString(),
    );
  const sourceByPlaced = new Map(
    plan.mappings.objects.map((m) => [m.instanceId, m.sourceId]),
  );
  const frame = constructionCollision(ctx, instance, plan.spawn.deckId),
    geometry = {
      instanceRevision: instance.revision,
      frame,
      supportHeightAt: wayfarerThresholdElevation,
    };
  // Validate the entire batch before writing a single container.
  const ready = seeds.containers.map((seed) => {
    const fixture = LAB_STORAGE_FIXTURES.find(
      (f) => f.placementId === sourceByPlaced.get(seed.placedObjectId),
    );
    if (!fixture) throw new SenderError("Cargo source placement missing");
    if (
      ctx.db.inventoryContainer.id.find(seed.id) ||
      ctx.db.inventoryItem.id.find(seed.id)
    )
      throw new SenderError("Cargo identity already exists");
    if (
      ctx.db.instanceInventoryBinding.placedObjectId.find(seed.placedObjectId)
    )
      throw new SenderError("Cargo placed object is already bound");
    const approach = QUALIFIED_CARGO_APPROACHES[fixture.placementId];
    if (!approach) throw new SenderError("Cargo approach definition missing");
    const scope = {
      kind: "instance" as const,
      instanceId: seed.instanceId,
      deckId: seed.deckId,
      placedObjectId: seed.placedObjectId,
      instanceRevision: instance.revision,
      accessPointM: [
        approach[0],
        approach[1],
        wayfarerThresholdElevation(approach[0], approach[1]),
      ] as const,
    };
    if (!qualifyCargoAccessPoint(scope, geometry))
      throw new SenderError(
        "Cargo approach has no qualified standing clearance: " +
          fixture.placementId,
      );
    return { seed, scope };
  });
  for (const { seed, scope } of ready) {
    ctx.db.inventoryContainer.insert({
      id: seed.id,
      characterId: "",
      parentItemId: "",
      kind: "grid",
      name: seed.name,
      width: seed.columns,
      height: seed.rows,
      maxMassKg: seed.maxInventoryMassKg,
      capacityLitres: 0,
      amountLitres: 0,
      liquidType: "",
      shipId: seed.instanceId,
      localX: seed.positionM[0],
      localY: seed.positionM[1],
      carried: false,
    });
    ctx.db.inventoryContainerScope.insert({
      containerId: seed.id,
      rootContainerId: seed.id,
      rootKind: "instance",
      rootCharacterId: "",
      instanceId: seed.instanceId,
      deckId: seed.deckId,
      placedObjectId: seed.placedObjectId,
      revision: 1n,
      instanceRevision: instance.revision,
      definitionRevision: seed.definitionId,
      accessX: scope.accessPointM[0],
      accessY: scope.accessPointM[1],
      accessZ: scope.accessPointM[2],
      lifecycle: "active",
    });
    ctx.db.instanceInventoryBinding.insert({
      placedObjectId: seed.placedObjectId,
      containerId: seed.id,
      instanceId: seed.instanceId,
      deckId: seed.deckId,
      definitionRevision: seed.definitionId,
    });
  }
}
