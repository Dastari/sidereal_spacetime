import type {
  ScopedContainer,
  ScopedItem,
} from "@sidereal/sim/scoped-inventory";
export interface LegacyItem extends Omit<
  ScopedItem,
  "revision" | "equippedByCharacterId"
> {
  characterId: string;
}
export interface LegacyContainer extends Omit<
  ScopedContainer,
  "revision" | "scope" | "lifecycle"
> {
  characterId: string;
  carried: boolean;
  shipId: string;
  localX: number;
  localY: number;
  name: string;
}
export interface LegacyInventorySnapshot {
  items: readonly LegacyItem[];
  containers: readonly LegacyContainer[];
}
export interface LegacyMembership {
  rootContainerId: string;
  rootCharacterId: string;
  rootKind: "character" | "legacy-private";
}
/** Bounded pure compatibility diff. Root scope follows actual containment, never
 * the historical `carried` flag copied onto a bag or dropped wrapper. */
export function planLegacyInventoryMetadata(
  characterId: string,
  before: LegacyInventorySnapshot,
  after: LegacyInventorySnapshot,
) {
  const resolve = (snapshot: LegacyInventorySnapshot) => {
    if (snapshot.items.length > 128 || snapshot.containers.length > 152)
      throw Error("Legacy inventory metadata budget exceeded");
    const items = new Map(snapshot.items.map((i) => [i.id, i])),
      containers = new Map(snapshot.containers.map((c) => [c.id, c]));
    if (
      items.size !== snapshot.items.length ||
      containers.size !== snapshot.containers.length ||
      snapshot.items.some((i) => i.characterId !== characterId) ||
      snapshot.containers.some((c) => c.characterId !== characterId)
    )
      throw Error("Legacy inventory scope mismatch");
    const pockets = snapshot.containers.find(
      (c) => c.carried && !c.parentItemId && c.kind === "grid",
    );
    const path = (id: string): LegacyContainer[] => {
      const result: LegacyContainer[] = [];
      let c = containers.get(id);
      while (c) {
        if (result.some((p) => p.id === c!.id) || result.length > 6)
          throw Error("Legacy inventory cycle");
        result.push(c);
        if (!c.parentItemId) return result;
        const item = items.get(c.parentItemId);
        if (!item) throw Error("Legacy container parent missing");
        c = item.equipmentSlot ? pockets : containers.get(item.containerId);
      }
      throw Error("Legacy inventory root missing");
    };
    const itemPath = (item: LegacyItem) =>
      item.equipmentSlot ? (pockets ? [pockets] : []) : path(item.containerId);
    const root = (p: LegacyContainer[]): LegacyMembership => {
      const c = p.at(-1);
      if (!c) throw Error("Legacy pockets missing");
      return {
        rootContainerId: c.id,
        rootCharacterId: characterId,
        rootKind: c.carried ? "character" : "legacy-private",
      };
    };
    return { items, containers, path, itemPath, root };
  };
  const old = resolve(before),
    next = resolve(after),
    changedContainers = new Set<string>(),
    changedItems = new Set<string>();
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  for (const id of new Set([...old.items.keys(), ...next.items.keys()])) {
    const a = old.items.get(id),
      b = next.items.get(id);
    if (
      same(a, b) &&
      (!a || !b || same(old.root(old.itemPath(a)), next.root(next.itemPath(b))))
    )
      continue;
    changedItems.add(id);
    for (const [tree, item] of [
      [old, a],
      [next, b],
    ] as const) {
      if (!item) continue;
      for (const c of tree.itemPath(item)) changedContainers.add(c.id);
      // Moving a bag invalidates nested-content CAS even if inner cells stay put.
      for (const c of tree.containers.values())
        if (tree.path(c.id).some((p) => p.parentItemId === id))
          changedContainers.add(c.id);
    }
  }
  const containerMembership = [...next.containers.values()].map((c) => {
    const membership = next.root(next.path(c.id));
    if (
      !same(old.containers.get(c.id), c) ||
      !old.containers.has(c.id) ||
      !same(old.root(old.path(c.id)), membership)
    )
      changedContainers.add(c.id);
    return { containerId: c.id, ...membership };
  });
  const itemMembership = [...next.items.values()].map((i) => ({
    itemId: i.id,
    containerId: i.containerId,
    ...next.root(next.itemPath(i)),
  }));
  return {
    containerMembership,
    itemMembership,
    changedContainerIds: [...changedContainers],
    changedItemIds: [...changedItems],
    removedContainerIds: [...old.containers.keys()].filter(
      (id) => !next.containers.has(id),
    ),
    removedItemIds: [...old.items.keys()].filter((id) => !next.items.has(id)),
  };
}
