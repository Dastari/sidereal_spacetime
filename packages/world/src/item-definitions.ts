/**
 * Server resolution of pinned item and weapon definitions (roadmap X-2). Inventory, combat,
 * ground drops, crew presentation and flight mass read definitions through this adapter; the
 * code catalogues are only the seed (revision 1). Rules: `@sidereal/sim/pinned-definitions`.
 */
import {
  SenderError,
  type InferSchema,
  type ViewCtx,
} from "spacetimedb/server";
import type world from "./index";
import type { InventoryDefinition } from "@sidereal/content/inventory";
import type { WeaponDefinition } from "@sidereal/content/weapons";
import type { DefinitionResolver } from "@sidereal/sim/inventory";
import {
  implicitPin,
  newInstancePin,
  resolveItemDefinition,
  resolveWeaponDefinition,
  type DefinitionRegistryReader,
  type ItemPin,
} from "@sidereal/sim/pinned-definitions";

type Db = Pick<ViewCtx<InferSchema<typeof world>>, "db">["db"];
type Instance = { id: string; definitionId: string };
export type PinnedItemDefinitions = ReturnType<typeof itemDefinitions>;

export function registryReader(db: Db): DefinitionRegistryReader {
  return {
    revision: (ref) =>
      db.contentDefinition.definitionRef.find(ref) ?? undefined,
    currentRevision: (kind, definitionId) => {
      const head = db.contentDefinitionHead.definitionKey.find(
        `${kind}:${definitionId}`,
      );
      // A definition with only a draft is not in the registry yet.
      return head && head.latestRevision > 0n
        ? head.currentRevision
        : undefined;
    },
  };
}

/** One resolver per transaction or view evaluation. */
export function itemDefinitions(ctx: { db: Db }) {
  const reader = registryReader(ctx.db);
  const staged = new Map<string, ItemPin & { definitionId: string }>();
  const cache = new Map<string, ItemPin>();
  const pinOf = (instance: Instance): ItemPin => {
    const s = staged.get(instance.id);
    if (s) return s;
    let pin = cache.get(instance.id);
    if (!pin) {
      const row = ctx.db.inventoryItemPin.itemId.find(instance.id);
      pin =
        row && row.definitionId === instance.definitionId
          ? {
              itemRevision: row.itemRevision,
              weaponRevision: row.weaponRevision,
            }
          : implicitPin(instance.definitionId);
      cache.set(instance.id, pin);
    }
    return pin;
  };
  const item = (instance: Instance): InventoryDefinition => {
    const pin = pinOf(instance),
      d = resolveItemDefinition(
        reader,
        instance.definitionId,
        pin.itemRevision,
      );
    if (!d)
      throw new SenderError(
        `Unknown item definition item:${instance.definitionId}@${pin.itemRevision}`,
      );
    return d;
  };
  const weapon = (instance: Instance): WeaponDefinition | undefined =>
    resolveWeaponDefinition(
      reader,
      instance.definitionId,
      pinOf(instance).weaponRevision,
    );
  const find = (instance: Instance): InventoryDefinition | undefined =>
    resolveItemDefinition(
      reader,
      instance.definitionId,
      pinOf(instance).itemRevision,
    );
  const grid: DefinitionResolver = find;
  return {
    reader,
    pin: pinOf,
    item,
    find,
    weapon,
    grid,
    /** Current-revision pin for a new instance, visible to this resolver before insertion. */
    stage(itemId: string, definitionId: string): InventoryDefinition {
      let pin: ItemPin;
      try {
        pin = newInstancePin(reader, definitionId);
      } catch (e) {
        throw new SenderError(e instanceof Error ? e.message : String(e));
      }
      staged.set(itemId, { ...pin, definitionId });
      return item({ id: itemId, definitionId });
    },
    /** Definition a new instance would get, without staging. */
    preview(definitionId: string): InventoryDefinition {
      let pin: ItemPin;
      try {
        pin = newInstancePin(reader, definitionId);
      } catch (e) {
        throw new SenderError(e instanceof Error ? e.message : String(e));
      }
      const d = resolveItemDefinition(reader, definitionId, pin.itemRevision);
      if (!d) throw new SenderError(`Unknown item definition ${definitionId}`);
      return d;
    },
    staged: (itemId: string) => staged.get(itemId),
    /** Evaluate an instance under a proposed pin (operator resync validation). */
    override(itemId: string, definitionId: string, pin: ItemPin) {
      staged.set(itemId, { ...pin, definitionId });
    },
  };
}

type WriteDb = {
  inventoryItemPin: {
    insert(row: {
      itemId: string;
      definitionId: string;
      itemRevision: bigint;
      weaponRevision: bigint;
      source: string;
      pinnedMicros: bigint;
    }): unknown;
  };
};
/** Write the staged pin of a newly inserted instance. */
export function commitPin(
  ctx: { db: WriteDb; timestamp: { microsSinceUnixEpoch: bigint } },
  defs: PinnedItemDefinitions,
  itemId: string,
) {
  const pin = defs.staged(itemId);
  if (!pin) throw new SenderError("New item instance has no staged pin");
  ctx.db.inventoryItemPin.insert({
    itemId,
    definitionId: pin.definitionId,
    itemRevision: pin.itemRevision,
    weaponRevision: pin.weaponRevision,
    source: "created",
    pinnedMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
