/**
 * Operator resync of item instances to other definition revisions (roadmap X-2; the Studio
 * migration tool is ST-16). Publishing never retargets instances; this explicit, audited,
 * all-or-nothing operation does. Deployment identity only, like the other operator reducers.
 */
import {
  SenderError,
  type InferSchema,
  type ReducerCtx,
} from "spacetimedb/server";
import type world from "./index";
import {
  CHARACTER_CARRY_LIMIT_KG,
  LIQUID_DENSITY_KG_PER_LITRE,
} from "@sidereal/content/inventory";
import { LAB_WEAPONS } from "@sidereal/content/weapons";
import { validateInventory } from "@sidereal/sim/inventory";
import { DEFINITION_ID_PATTERN } from "@sidereal/sim/content-definitions";
import {
  itemRef,
  resolveItemDefinition,
  weaponRef,
  type ItemPin,
} from "@sidereal/sim/pinned-definitions";
import { itemDefinitions, registryReader } from "./item-definitions";
import { legacyInventorySnapshot } from "./scoped-inventory-authority";
import {
  archiveJson,
  priorOperation,
  requireShipOperator,
} from "./ship-operator";

type Context = ReducerCtx<InferSchema<typeof world>>;
export const RESYNC_LIMITS = { items: 2000, scan: 200000, reported: 200 };

function fail(message: string): never {
  throw new SenderError(message);
}

/** A resync target must be a published registry revision, or revision 1 from the seed. */
function requireTarget(
  ctx: Context,
  kind: "item" | "weapon",
  definitionId: string,
  revision: bigint,
) {
  const ref =
    kind === "item"
      ? itemRef(definitionId, revision)
      : weaponRef(definitionId, revision);
  const row = ctx.db.contentDefinition.definitionRef.find(ref);
  if (row) {
    if (row.status !== "published")
      fail(`${ref} is ${row.status}; resync targets must be published`);
    return;
  }
  // No registry row: only revision 1 exists, from the seed (the code catalogue).
  const seeded =
    revision === 1n &&
    (kind === "item"
      ? !!resolveItemDefinition(registryReader(ctx.db), definitionId, 1n)
      : !!LAB_WEAPONS[definitionId]);
  if (!seeded) fail(`${ref} does not exist`);
}

export function resyncItemDefinitions(
  ctx: Context,
  args: {
    operationId: string;
    definitionId: string;
    itemRevision: bigint;
    weaponRevision: bigint;
    /** JSON array of item IDs, or `"*"` for every instance of the definition. */
    itemIdsJson: string;
    dryRun: boolean;
  },
) {
  requireShipOperator(ctx);
  if (!DEFINITION_ID_PATTERN.test(args.definitionId))
    fail("Invalid definition ID");
  const request = JSON.stringify({
    definitionId: args.definitionId,
    itemRevision: args.itemRevision.toString(),
    weaponRevision: args.weaponRevision.toString(),
    itemIdsJson: args.itemIdsJson,
  });
  const kind = args.dryRun ? "definition-resync-dry-run" : "definition-resync";
  if (priorOperation(ctx.db, ctx.sender, args.operationId, kind, request))
    return;
  requireTarget(ctx, "item", args.definitionId, args.itemRevision);
  if (args.weaponRevision > 0n)
    requireTarget(ctx, "weapon", args.definitionId, args.weaponRevision);
  const target: ItemPin = {
    itemRevision: args.itemRevision,
    weaponRevision: args.weaponRevision,
  };

  // Select the instances.
  let selected: { id: string; definitionId: string; characterId: string }[];
  let ids: unknown;
  try {
    ids = JSON.parse(args.itemIdsJson);
  } catch {
    fail('itemIdsJson must be "*" or a JSON array of item IDs');
  }
  if (ids === "*") {
    selected = [];
    let scanned = 0;
    for (const item of ctx.db.inventoryItem.iter()) {
      if (++scanned > RESYNC_LIMITS.scan) fail("Too many items to scan");
      if (item.definitionId === args.definitionId) selected.push(item);
    }
  } else if (
    Array.isArray(ids) &&
    ids.length > 0 &&
    ids.every((id) => typeof id === "string")
  ) {
    selected = (ids as string[]).map((id) => {
      const item = ctx.db.inventoryItem.id.find(id);
      if (!item) fail("Unknown item " + id);
      if (item.definitionId !== args.definitionId)
        fail(`Item ${id} is ${item.definitionId}, not ${args.definitionId}`);
      return item;
    });
  } else fail('itemIdsJson must be "*" or a non-empty JSON array of item IDs');

  const before = itemDefinitions(ctx),
    after = itemDefinitions(ctx);
  // A current weapon pin of 0 means the instance has no weapon rules: resync keeps it that way
  // unless the operator names a weapon revision, and never strips rules a weapon instance has.
  const changes = selected
    .map((item) => ({ item, from: before.pin(item) }))
    .filter(
      ({ from }) =>
        from.itemRevision !== target.itemRevision ||
        from.weaponRevision !== target.weaponRevision,
    );
  if (changes.length > RESYNC_LIMITS.items)
    fail(`At most ${RESYNC_LIMITS.items} instances per resync`);
  for (const { item, from } of changes) {
    if (from.weaponRevision > 0n && target.weaponRevision === 0n)
      fail(`Item ${item.id} is a weapon; name a weapon revision`);
    after.override(item.id, item.definitionId, target);
  }

  // Validate every affected inventory under the new pins: placement, slots, nesting, payload
  // and carry limits must still hold. Container grids of existing instances keep their size.
  const blocked: { itemId: string; reason: string }[] = [];
  // Group by the inventory each instance lives in: a ship cargo root or a character.
  const groups = new Map<string, string[]>();
  for (const { item } of changes) {
    const membership = ctx.db.inventoryItemMembership.itemId.find(item.id);
    const root = membership?.rootContainerId
      ? ctx.db.inventoryContainerScope.containerId.find(
          membership.rootContainerId,
        )
      : undefined;
    const key =
      root?.rootKind === "instance"
        ? "root:" + membership!.rootContainerId
        : "character:" + item.characterId;
    groups.set(key, [...(groups.get(key) ?? []), item.id]);
  }
  for (const [key, itemIds] of groups) {
    try {
      if (key.startsWith("root:")) {
        const rootId = key.slice("root:".length);
        const containers = [
          ...ctx.db.inventoryContainerScope.by_root.filter(rootId),
        ].flatMap((m) => {
          const c = ctx.db.inventoryContainer.id.find(m.containerId);
          return c && m.lifecycle === "active" ? [c] : [];
        });
        const items = [
          ...ctx.db.inventoryItemMembership.by_root.filter(rootId),
        ].flatMap((m) => {
          const i = ctx.db.inventoryItem.id.find(m.itemId);
          return i ? [i] : [];
        });
        validateInventory(
          { items, containers },
          after.grid,
          LIQUID_DENSITY_KG_PER_LITRE,
          rootId,
          Number.POSITIVE_INFINITY,
        );
      } else {
        const snapshot = legacyInventorySnapshot(
          ctx,
          key.slice("character:".length),
        );
        const pockets = snapshot.containers.find(
          (c) => c.carried && !c.parentItemId && c.kind === "grid",
        );
        validateInventory(
          snapshot,
          after.grid,
          LIQUID_DENSITY_KG_PER_LITRE,
          pockets?.id ?? "",
          pockets ? CHARACTER_CARRY_LIMIT_KG : Number.POSITIVE_INFINITY,
        );
      }
    } catch (e) {
      for (const itemId of itemIds)
        blocked.push({
          itemId,
          reason: e instanceof Error ? e.message : String(e),
        });
    }
  }
  const summary = {
    definitionId: args.definitionId,
    target: {
      item: itemRef(args.definitionId, target.itemRevision),
      weapon: target.weaponRevision
        ? weaponRef(args.definitionId, target.weaponRevision)
        : "",
    },
    dryRun: args.dryRun,
    selected: selected.length,
    changed: changes.length,
    unchanged: selected.length - changes.length,
    blocked: blocked.slice(0, RESYNC_LIMITS.reported),
    blockedCount: blocked.length,
    items: changes.slice(0, RESYNC_LIMITS.reported).map(({ item, from }) => ({
      itemId: item.id,
      from: {
        item: from.itemRevision.toString(),
        weapon: from.weaponRevision.toString(),
      },
    })),
  };
  if (!args.dryRun) {
    if (blocked.length)
      fail(
        `${blocked.length} instance(s) would become invalid (first: ${blocked[0].itemId}: ${blocked[0].reason}); run a dry run and resync the others by ID`,
      );
    const now = ctx.timestamp.microsSinceUnixEpoch;
    for (const { item } of changes) {
      const row = {
        itemId: item.id,
        definitionId: item.definitionId,
        itemRevision: target.itemRevision,
        weaponRevision: target.weaponRevision,
        source: "resync:" + args.operationId,
        pinnedMicros: now,
      };
      if (ctx.db.inventoryItemPin.itemId.find(item.id))
        ctx.db.inventoryItemPin.itemId.update(row);
      else ctx.db.inventoryItemPin.insert(row);
      // A smaller capacity clamps stored energy; nothing else about the instance changes.
      const energy = ctx.db.weaponEnergy.itemId.find(item.id),
        weapon = after.weapon(item);
      if (energy && weapon && energy.energy > weapon.capacity)
        ctx.db.weaponEnergy.itemId.update({
          ...energy,
          energy: weapon.capacity,
          revision: energy.revision + 1n,
        });
    }
  }
  ctx.db.shipOperatorOperation.insert({
    operationId: args.operationId,
    principal: ctx.sender,
    kind,
    request,
    summaryJson: archiveJson(summary),
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
