import {
  furnishingState,
  emptyFurnishingStorage,
} from "./ship-furnishings-tables";
import {
  isWayfarerGameplay,
  assertWayfarerPrefabContract,
  WAYFARER_STORAGE_OBJECTS,
} from "@sidereal/content/wayfarer-authored-gameplay";
import type { FurnishingOverrides } from "@sidereal/content/wayfarer-furnishings";
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import type { ConstructionDocument } from "@sidereal/content/construction";
import type { ConstructionInstanceMappings } from "@sidereal/sim/construction-instance";
import {
  PHYSICAL_CATALOG,
  CREW_BODY_DEFINITION,
} from "@sidereal/content/physical-definitions";
import type { GridDefinition } from "@sidereal/sim/inventory";
import { itemDefinitions } from "./item-definitions";
import { inventoryMass, type InventorySnapshot } from "@sidereal/sim/inventory";
import {
  transformFlightVector,
  type FlightPlacedPart,
  type FlightCargoMass,
  type FlightCrewMass,
} from "@sidereal/sim/flight-definition";
import { legacyInventorySnapshot } from "./scoped-inventory-authority";
import {
  readShipPrefab,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { powerSupplyOf } from "./ship-power";
import { prefabSourceMountId } from "@sidereal/sim/prefab-flight-supply";
import {
  PREFAB_DECK_ID,
  isPrefabConstruction,
} from "@sidereal/sim/prefab-construction";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { prefabCargoSockets } from "@sidereal/sim/prefab-cargo-sockets";
import {
  PREFAB_FLIGHT_DEFINITION,
  prefabFlightInput,
  prefabFlightModelFor,
  prefabPlacedObjectId,
} from "@sidereal/sim/prefab-flight";

type Context = ReducerCtx<InferSchema<typeof world>>;

/** Storage socket centres of a prefab source (ship-local m) by socket key, memoised per source. */
const PREFAB_SOCKET_MEMO = new Map<
  string,
  ReadonlyMap<string, [number, number]>
>();
function prefabStorageSocketCentres(
  key: string,
  document: unknown,
  furnishings: FurnishingOverrides = {},
): ReadonlyMap<string, [number, number]> {
  const hit = PREFAB_SOCKET_MEMO.get(key);
  if (hit) return hit;
  if (!isPrefabConstruction(document)) throw Error("prefab-flight-source");
  const centres = new Map(
    prefabCargoSockets(
      readShipPrefab(document.prefab.document),
      0,
      prefabComponentCatalogFor(document.prefab.catalog),
      furnishings,
    ).map((s) => [s.key, s.centreM] as const),
  );
  if (PREFAB_SOCKET_MEMO.size >= 64) PREFAB_SOCKET_MEMO.clear();
  PREFAB_SOCKET_MEMO.set(key, centres);
  return centres;
}

function bounded<T>(rows: Iterable<T>, limit: number): T[] {
  const out: T[] = [];
  for (const row of rows) {
    if (out.length === limit) throw Error("flight-input-read-budget");
    out.push(row);
  }
  return out;
}
/**
 * Mass (kg) a character carries and wears: carried containers with their contents and every
 * equipped item. The crew-mass rule of flight; EVA adds it to the suited body.
 */
export function characterCarriedMassKg(
  ctx: Parameters<typeof legacyInventorySnapshot>[0],
  characterId: string,
): number {
  const snapshot = legacyInventorySnapshot(ctx, characterId),
    masses = payloadMass(ctx, snapshot);
  let carried = 0;
  for (const root of snapshot.containers.filter(
    (c) => c.carried && !c.parentItemId,
  ))
    carried += masses.containerMass(root.id);
  for (const item of snapshot.items.filter((i) => i.equipmentSlot))
    carried += masses.itemMass(item.id);
  return carried;
}
/**
 * Payload mass from each item's pinned definition (X-2). Revision 1 keeps the explicit v1 physical
 * snapshot (equal to the seed); a later revision, or an item the snapshot does not list, uses its
 * pinned definition's mass. A published edit never retunes items already aboard.
 */
function payloadMass(
  ctx: Parameters<typeof itemDefinitions>[0],
  snapshot: InventorySnapshot,
) {
  const defs = itemDefinitions(ctx);
  const definitions = new Map<string, GridDefinition>();
  const densities: Record<string, number> = {};
  for (const item of snapshot.items) {
    const pin = defs.pin(item),
      inventory = defs.find(item);
    const physical =
      pin.itemRevision === 1n
        ? PHYSICAL_CATALOG.definitions.find(
            (d) =>
              d.id === "inventory:" + item.definitionId &&
              d.revision === 1 &&
              d.kind === "inventory",
          )
        : undefined;
    if (!inventory)
      throw Error("missing-inventory-physical-definition:" + item.definitionId);
    definitions.set(item.id, {
      ...inventory,
      massKg: physical?.massKg ?? inventory.massKg,
    });
  }
  for (const c of snapshot.containers)
    if (c.kind === "liquid") {
      const physical = PHYSICAL_CATALOG.definitions.find(
        (d) =>
          d.id === "liquid:" + c.liquidType &&
          d.revision === 1 &&
          d.kind === "liquid",
      );
      if (!physical)
        throw Error("missing-liquid-physical-definition:" + c.liquidType);
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
  return inventoryMass(snapshot, (i) => definitions.get(i.id), densities);
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
  // Only trusted prefab installations compile flight (the Wayfarer variants were
  // retired on 2026-09-29).
  if (!prefab) throw Error("unqualified-flight-structure");
  const document = JSON.parse(instance.documentJson) as ConstructionDocument;
  const furnishing = furnishingState(ctx.db, shipId);
  const mappings = JSON.parse(
    instance.idMapJson,
  ) as ConstructionInstanceMappings;
  const fittingRows = bounded(
    ctx.db.constructionFlightFitting.by_ship.filter(shipId),
    256,
  );
  const fittings = fittingRows.map(
    ({
      id,
      placedObjectId,
      definitionId,
      definitionRevision,
      installed,
      powered,
      availability,
    }) => ({
      id,
      placedObjectId,
      definitionId,
      definitionRevision,
      installed,
      powered,
      availability,
    }),
  );
  if (fittingRows.some((f) => f.shipId !== shipId))
    throw Error("flight-fitting-ship-mismatch");
  const replacements: { placedObjectId: string; part: FlightPlacedPart }[] = [];
  const cargo: FlightCargoMass[] = [];
  const crew: FlightCrewMass[] = [];
  const roots = new Set<string>();
  const catalog = new Map(PHYSICAL_CATALOG.definitions.map((d) => [d.id, d]));
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
    const prefix = `${shipId}:${binding.deckId}:`;
    const sourceObject = binding.placedObjectId.startsWith(prefix)
      ? binding.placedObjectId.slice(prefix.length)
      : "";
    // Only a preserved, empty, exact authored-source deletion can leave a retired root.
    if (
      root &&
      scope &&
      scope.lifecycle === "retired" &&
      scope.rootContainerId === root.id &&
      scope.instanceId === shipId &&
      scope.deckId === binding.deckId &&
      root.shipId === shipId &&
      scope.placedObjectId === binding.placedObjectId &&
      scope.rootKind === "instance" &&
      scope.instanceRevision === instance.revision &&
      !roots.has(root.id) &&
      furnishing.overrides[sourceObject]?.deleted &&
      WAYFARER_STORAGE_OBJECTS.some((id) => id === sourceObject) &&
      isPrefabConstruction(document) &&
      isWayfarerGameplay(readShipPrefab(document.prefab.document)) &&
      emptyFurnishingStorage(ctx.db, root.id)
    ) {
      assertWayfarerPrefabContract(
        readShipPrefab(
          (document as { prefab: { document: unknown } }).prefab.document,
        ),
      );
      roots.add(root.id);
      continue;
    }
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
    let shell: FlightPlacedPart | undefined;
    let position: readonly [number, number] | undefined;
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
      const part = document.layout.assembly?.parts.find(
        (p) => p.id === binding.placedObjectId,
      );
      if (part)
        shell = {
          id: part.id,
          definitionId: "physical:" + part.assetId,
          revision: 1,
          position: part.position,
          rotation: part.rotation,
          flipped: part.flipped,
        };
      else {
        // Prefab storage socket (operator-bound crate or locker): furniture carries no flight
        // shell of its own, so the payload mass sits at the socket centre on the prefab deck.
        const deck = ctx.db.constructionDeck.id.find(binding.deckId);
        const prefix = `${shipId}:${binding.deckId}:`;
        const centre =
          deck?.instanceId === shipId &&
          deck.sourceDeckId === PREFAB_DECK_ID &&
          binding.placedObjectId.startsWith(prefix)
            ? prefabStorageSocketCentres(
                `${instance.id}:${instance.blueprintSha256}:${furnishing.revision}`,
                document,
                furnishing.overrides,
              ).get(binding.placedObjectId.slice(prefix.length))
            : undefined;
        if (!centre) throw Error("missing-flight-cargo-shell");
        position = centre;
      }
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
      massKg: payloadMass(ctx, { containers, items }).containerMass(root.id),
      position: position ?? shellPoint(shell!),
    });
  }
  const body = catalog.get(CREW_BODY_DEFINITION);
  if (!body) throw Error("missing-crew-body-definition");
  for (const actor of bounded(ctx.db.character.by_ship.filter(shipId), 256)) {
    // EVA: a character outside the hull (free or maglocked) is not ship mass.
    if (ctx.db.evaBody.characterId.find(actor.id)) continue;
    const carried = characterCarriedMassKg(ctx, actor.id);
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
      massKg: payloadMass(ctx, snapshot).containerMass(root.id),
      position: [root.localX, root.localY],
    });
    roots.add(root.id);
  }
  if (replacements.length) throw Error("prefab-flight-refit-unsupported");
  const key = `${instance.id}:${instance.blueprintSha256}`;
  const model = prefabFlightModelFor(key, instance.documentJson);
  // Runtime supply is transient. Physical mount damage remains in fitting availability;
  // fractional power multiplies it exactly once in the flight compiler.
  const runtimeSupply = powerSupplyOf(ctx, shipId);
  const prefabSupply = Object.fromEntries(
    fittingRows
      .filter((f) => f.kind === "actuator")
      .map((f) => [
        f.id,
        runtimeSupply[`mount:${prefabSourceMountId(f.sourceDeviceId) ?? ""}`] ??
          0,
      ]),
  );
  for (let i = 0; i < fittingRows.length; i++)
    if (fittingRows[i].kind === "computer")
      fittings[i].powered =
        fittings[i].powered &&
        (runtimeSupply[
          `mount:${prefabSourceMountId(fittingRows[i].sourceDeviceId) ?? ""}`
        ] ?? 0) >= 1;
  return prefabFlightInput(
    model,
    (sourceId) => prefabPlacedObjectId(shipId, sourceId),
    { fittings, cargo, crew, supply: prefabSupply },
  );
}
