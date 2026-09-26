import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import type { ConstructionDocument } from "../../content/src/construction";
import type { ConstructionInstanceMappings } from "../../sim/src/construction-instance";
import {
  wayfarerFlightInput,
  type WayfarerPhysicalVariant,
} from "../../content/src/wayfarer-flight-definition";
import {
  WAYFARER_PHYSICAL_CATALOG,
  WAYFARER_CREW_BODY_DEFINITION,
} from "../../content/src/physical-definitions";
import { WAYFARER_REBUILD_SHA256 } from "../../sim/src/wayfarer-rebuild-contract";
import { WAYFARER_EXTERIOR_SHA256 } from "../../sim/src/wayfarer-exterior-qualification";
import { QUALIFIED_WAYFARER_SHA256 } from "../../sim/src/wayfarer-walking-bindings";
import {
  INVENTORY_DEFINITIONS,
} from "../../content/src/inventory";
import { inventoryMass, type InventorySnapshot } from "../../sim/src/inventory";
import {
  transformFlightVector,
  type FlightPlacedPart,
  type FlightCargoMass,
  type FlightCrewMass,
} from "../../sim/src/flight-definition";
import { legacyInventorySnapshot } from "./scoped-inventory-authority";
import {
  PREFAB_FLIGHT_DEFINITION,
  prefabFlightInput,
  prefabFlightModelFor,
  prefabPlacedObjectId,
} from "@sidereal/sim/prefab-flight";

type Context = ReducerCtx<InferSchema<typeof world>>;
function bounded<T>(rows: Iterable<T>, limit: number): T[] {
  const out: T[] = [];
  for (const row of rows) {
    if (out.length === limit) throw Error("flight-input-read-budget");
    out.push(row);
  }
  return out;
}
function payloadMass(snapshot: InventorySnapshot) {
  const definitions = new Map<string, (typeof INVENTORY_DEFINITIONS)[number]>();
  const densities: Record<string, number> = {};
  for (const item of snapshot.items) {
    const inventory = INVENTORY_DEFINITIONS.find(d => d.id === item.definitionId);
    const physical = WAYFARER_PHYSICAL_CATALOG.definitions.find(d => d.id === "inventory:" + item.definitionId && d.revision === 1 && d.kind === "inventory");
    if (!inventory || !physical) throw Error("missing-inventory-physical-definition:" + item.definitionId);
    definitions.set(item.definitionId, { ...inventory, massKg: physical.massKg });
  }
  for (const c of snapshot.containers) if (c.kind === "liquid") {
    const physical = WAYFARER_PHYSICAL_CATALOG.definitions.find(d => d.id === "liquid:" + c.liquidType && d.revision === 1 && d.kind === "liquid");
    if (!physical) throw Error("missing-liquid-physical-definition:" + c.liquidType);
    densities[c.liquidType] = physical.massKg;
  }
  for (const c of snapshot.containers) {
    if (c.kind !== "grid" && c.kind !== "liquid")
      throw Error("invalid-flight-container-kind");
    if (
      c.kind === "liquid" &&
      (!Number.isFinite(c.amountLitres) ||
        !Number.isFinite(c.capacityLitres) ||
        c.amountLitres < 0 ||
        c.amountLitres > c.capacityLitres ||
        !(c.liquidType in densities))
    )
      throw Error("invalid-flight-liquid-mass");
  }
  return inventoryMass(snapshot, [...definitions.values()], densities);
}
/** Read current authoritative placement and inventory joins only. No reducer
 * supplies this input, no fixture fills missing mass, and no permission follows
 * from successful physical compilation. Source admission remains separate. */
export function readConstructionFlightInput(ctx: Context, shipId: string) {
  const instance = ctx.db.constructionInstance.id.find(shipId);
  if (!instance) throw Error("missing-authored-flight-instance");
  if (
    instance.documentJson.length > 1_048_576 ||
    instance.idMapJson.length > 1_048_576
  )
    throw Error("flight-document-budget");
  // Prefab ships compile from their grammar data and component stats; the binding's
  // definition pin selects the path (written only by trusted installation code).
  const prefab =
    ctx.db.constructionFlightBinding.shipId.find(shipId)?.definitionId ===
    PREFAB_FLIGHT_DEFINITION;
  const variant: WayfarerPhysicalVariant = prefab
    ? "r001"
    : instance.blueprintSha256 === WAYFARER_REBUILD_SHA256
      ? "r002"
      : instance.blueprintSha256 === WAYFARER_EXTERIOR_SHA256
        ? "r005"
        : instance.blueprintSha256 === QUALIFIED_WAYFARER_SHA256
          ? "r001"
          : (() => {
              throw Error("unqualified-flight-structure");
            })();
  const document = JSON.parse(instance.documentJson) as ConstructionDocument;
  const mappings = JSON.parse(
    instance.idMapJson,
  ) as ConstructionInstanceMappings;
  const identities = Object.fromEntries(
    Object.values(mappings).flatMap((rows) =>
      Array.isArray(rows)
        ? rows.map((row) => [row.sourceId, row.instanceId])
        : [],
    ),
  );
  const fittingRows = bounded(ctx.db.constructionFlightFitting.by_ship.filter(shipId), 256);
  const fittings = fittingRows.map(({id,placedObjectId,definitionId,definitionRevision,installed,powered,availability})=>({id,placedObjectId,definitionId,definitionRevision,installed,powered,availability}));
  if (fittingRows.some((f) => f.shipId !== shipId))
    throw Error("flight-fitting-ship-mismatch");
  const attachments: FlightPlacedPart[] = bounded(
    ctx.db.wayfarerRefitAttachment.by_instance.filter(shipId),
    256,
  ).map((a) => ({
    id: a.id,
    definitionId: "physical:" + a.assetId,
    revision: 1,
    position: [a.x, a.y, a.z],
    rotation: 0,
    flipped: false,
  }));
  const replacements: { placedObjectId: string; part: FlightPlacedPart }[] = [];
  const cargo: FlightCargoMass[] = [];
  const crew: FlightCrewMass[] = [];
  const roots = new Set<string>();
  const catalog = new Map(
    WAYFARER_PHYSICAL_CATALOG.definitions.map((d) => [d.id, d]),
  );
  const shellPoint = (part: FlightPlacedPart): readonly [number, number] => {
    const definition = catalog.get(part.definitionId);
    if (!definition || definition.revision !== part.revision)
      throw Error("missing-cargo-shell-definition");
    const local = transformFlightVector(
      definition.centroid,
      part.rotation,
      part.flipped,
    );
    return [part.position[0] + local[0], part.position[1] + local[1]];
  };
  for (const binding of bounded(
    ctx.db.instanceInventoryBinding.by_instance.filter(shipId),
    512,
  )) {
    const root = ctx.db.inventoryContainer.id.find(binding.containerId);
    const scope = ctx.db.inventoryContainerScope.containerId.find(
      binding.containerId,
    );
    if (
      !root ||
      root.parentItemId ||
      !scope ||
      scope.rootContainerId !== root.id ||
      scope.instanceId !== shipId ||
      scope.placedObjectId !== binding.placedObjectId ||
      scope.lifecycle !== "active" ||
      scope.rootKind !== "instance" ||
      roots.has(root.id)
    )
      throw Error("invalid-flight-cargo-root-binding");
    roots.add(root.id);
    const assembly = ctx.db.constructionCargoAssembly.containerId.find(root.id);
    let shell: FlightPlacedPart;
    if (assembly) {
      const p = ctx.db.constructionCargoPlacement.containerId.find(root.id);
      if (
        !p ||
        assembly.instanceId !== shipId ||
        p.instanceId !== shipId ||
        assembly.placedObjectId !== binding.placedObjectId ||
        assembly.lifecycle !== "active" ||
        !["oneMetre", "twoMetre"].includes(assembly.carrierSize)
      )
        throw Error("invalid-flight-carrier-placement");
      shell = {
        id: binding.placedObjectId,
        definitionId:
          assembly.carrierSize === "oneMetre" ? "carrier-1m" : "carrier-2m",
        revision: 1,
        position: [p.originX / 32, p.originY / 32, p.originZ / 32],
        rotation: (p.quarterTurns * Math.PI) / 2,
        flipped: false,
      };
      replacements.push({
        placedObjectId: binding.placedObjectId,
        part: shell,
      });
    } else {
      const attached = attachments.find((a) => a.id === binding.placedObjectId);
      const part = document.layout.assembly?.parts.find(
        (p) => p.id === binding.placedObjectId,
      );
      if (!attached && !part) throw Error("missing-flight-cargo-shell");
      shell = attached ?? {
        id: part!.id,
        definitionId: "physical:" + part!.assetId,
        revision: 1,
        position: part!.position,
        rotation: part!.rotation,
        flipped: part!.flipped,
      };
    }
    const containers = bounded(
      ctx.db.inventoryContainerScope.by_root.filter(root.id),
      152,
    ).map((m) => {
      const c = ctx.db.inventoryContainer.id.find(m.containerId);
      if (!c || m.lifecycle !== "active" || m.instanceId !== shipId)
        throw Error("invalid-flight-cargo-membership");
      return c;
    });
    const items = bounded(
      ctx.db.inventoryItemMembership.by_root.filter(root.id),
      128,
    ).map((m) => {
      const item = ctx.db.inventoryItem.id.find(m.itemId);
      if (!item || item.containerId !== m.containerId || item.equipmentSlot)
        throw Error("invalid-flight-payload-membership");
      return item;
    });
    cargo.push({
      containerId: root.id,
      massKg: payloadMass({ containers, items }).containerMass(root.id),
      position: shellPoint(shell),
    });
  }
  const body = catalog.get(WAYFARER_CREW_BODY_DEFINITION);
  if (!body) throw Error("missing-crew-body-definition");
  for (const actor of bounded(ctx.db.character.by_ship.filter(shipId), 256)) {
    const snapshot = legacyInventorySnapshot(ctx, actor.id),
      masses = payloadMass(snapshot);
    let carried = 0;
    for (const root of snapshot.containers.filter(
      (c) => c.carried && !c.parentItemId,
    ))
      carried += masses.containerMass(root.id);
    for (const item of snapshot.items.filter((i) => i.equipmentSlot))
      carried += masses.itemMass(item.id);
    const stair = ctx.db.constructionStairWalk.characterId.find(actor.id),
      traversal = ctx.db.constructionTraversal.characterId.find(actor.id);
    if (stair && traversal) throw Error("conflicting-flight-crew-transit");
    const transit = stair ?? traversal;
    if (transit && transit.instanceId !== shipId)
      throw Error("flight-crew-transit-ship-mismatch");
    crew.push({
      characterId: actor.id,
      massKg: body.massKg + carried,
      inertiaKgM2: body.inertiaKgM2,
      position: transit
        ? [transit.acceptedX, transit.acceptedY]
        : [actor.localX, actor.localY],
    });
  }
  // Legacy ground inventory remains physical after its previous owner leaves.
  // Its historical owner key is not a reason to omit it from ship mass.
  for (const root of bounded(
    ctx.db.inventoryContainer.by_ship.filter(shipId),
    1024,
  )) {
    if (root.parentItemId || root.carried || roots.has(root.id)) continue;
    const scope = ctx.db.inventoryContainerScope.containerId.find(root.id);
    if (scope?.rootKind === "instance")
      throw Error("unbound-flight-cargo-root");
    const snapshot = legacyInventorySnapshot(ctx, root.characterId);
    cargo.push({
      containerId: root.id,
      massKg: payloadMass(snapshot).containerMass(root.id),
      position: [root.localX, root.localY],
    });
    roots.add(root.id);
  }
  if (prefab) {
    if (attachments.length || replacements.length)
      throw Error("prefab-flight-refit-unsupported");
    const model = prefabFlightModelFor(
      `${instance.id}:${instance.blueprintSha256}`,
      instance.documentJson,
    );
    return prefabFlightInput(
      model,
      (sourceId) => prefabPlacedObjectId(shipId, sourceId),
      { fittings, cargo, crew },
    );
  }
  return wayfarerFlightInput(
    document,
    { variant, identities, replacements, attachments },
    { fittings, cargo, crew },
  );
}
