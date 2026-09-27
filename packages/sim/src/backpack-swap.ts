import {
  inventoryMass,
  itemSize,
  validateInventory,
  type GridDefinition,
  type GridItem,
  type InventoryLocation,
  type InventorySnapshot,
} from "./inventory";

/** Plan a whole backpack exchange without requiring an intermediate inventory
 * position. Existing contents of the replacement retain their layout; contents
 * of the old pack move as intact item/container subtrees. Nothing is mutated. */
export function planBackpackEquip(
  snapshot: InventorySnapshot,
  definitions: readonly GridDefinition[],
  density: Readonly<Record<string, number>>,
  pocketsId: string,
  carryLimitKg: number,
  itemId: string,
  previousDestinationId?: string,
): GridItem[] {
  const defs = new Map(definitions.map((d) => [d.id, d]));
  const incoming = snapshot.items.find((i) => i.id === itemId);
  if (!incoming || defs.get(incoming.definitionId)?.equipSlot !== "back")
    throw new Error("Item is not a backpack");
  const previous = snapshot.items.find((i) => i.equipmentSlot === "back");
  if (previous?.id === incoming.id) return [...snapshot.items];
  const oldGrids = snapshot.containers.filter(
    (c) => c.parentItemId === previous?.id,
  );
  const newGrids = snapshot.containers.filter(
    (c) => c.parentItemId === incoming.id,
  );
  if (
    previous &&
    (oldGrids.length !== 1 ||
      newGrids.length !== 1 ||
      oldGrids[0].kind !== "grid" ||
      newGrids[0].kind !== "grid")
  )
    throw new Error("Backpack storage is unavailable");
  const moving = previous
    ? snapshot.items.filter(
        (i) => i.containerId === oldGrids[0].id && i.id !== incoming.id,
      )
    : [];
  const movingIds = new Set(moving.map((i) => i.id));
  let items = snapshot.items.map((i) =>
    i.id === incoming.id
      ? {
          ...i,
          containerId: "",
          equipmentSlot: "back",
          x: 0,
          y: 0,
          rotated: false,
        }
      : i.id === previous?.id
        ? {
            ...i,
            containerId: previousDestinationId ?? incoming.containerId,
            equipmentSlot: "",
            x: incoming.x,
            y: incoming.y,
            rotated: incoming.rotated,
          }
        : movingIds.has(i.id)
          ? { ...i, containerId: newGrids[0].id }
          : { ...i },
  );
  // Mass/cycle rules do not depend on the pending rectangular coordinates.
  // Check once before the bounded packing search, including nested liquids.
  const mass = inventoryMass({ ...snapshot, items }, definitions, density);
  for (const c of snapshot.containers)
    if (mass.containerMass(c.id) > c.maxMassKg + 1e-8)
      throw new Error("Backpack swap exceeds a container payload limit");
  const carried =
    mass.containerMass(pocketsId) +
    items
      .filter((i) => i.equipmentSlot)
      .reduce((sum, i) => sum + mass.itemMass(i.id), 0);
  if (carried > carryLimitKg + 1e-8)
    throw new Error("Backpack swap exceeds the character carry limit");

  function* placements(
    item: GridItem,
    ignored: ReadonlySet<string>,
  ): Generator<InventoryLocation> {
    const c = snapshot.containers.find((c) => c.id === item.containerId);
    if (!c || c.kind !== "grid") return;
    const d = defs.get(item.definitionId)!;
    const occupied = items
      .filter(
        (i) => i.containerId === c.id && i.id !== item.id && !ignored.has(i.id),
      )
      .map((i) => ({ ...i, ...itemSize(i, defs.get(i.definitionId)!) }));
    function fits(x: number, y: number, rotated: boolean) {
      const size = itemSize({ ...item, rotated }, d);
      return (
        x >= 0 &&
        y >= 0 &&
        x + size.width <= c!.width &&
        y + size.height <= c!.height &&
        !occupied.some(
          (o) =>
            x < o.x + o.width &&
            x + size.width > o.x &&
            y < o.y + o.height &&
            y + size.height > o.y,
        )
      );
    }
    if (fits(item.x, item.y, item.rotated))
      yield {
        containerId: c.id,
        equipmentSlot: "",
        x: item.x,
        y: item.y,
        rotated: item.rotated,
      };
    for (const rotated of d.width === d.height
      ? [item.rotated]
      : [item.rotated, !item.rotated])
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          if (x === item.x && y === item.y && rotated === item.rotated)
            continue;
          if (fits(x, y, rotated))
            yield { containerId: c.id, equipmentSlot: "", x, y, rotated };
        }
  }
  const set = (id: string, location: InventoryLocation) => {
    items = items.map((i) => (i.id === id ? { ...i, ...location } : i));
  };
  if (previous) {
    const old = items.find((i) => i.id === previous.id)!;
    const location = placements(old, movingIds).next().value;
    if (!location)
      throw new Error("The old backpack does not fit its return location");
    set(old.id, location);
  }
  // Largest rectangles first, with backtracking for layouts that defeat greedy
  // placement. A fixed bound prevents pathological inventory requests stalling a tick.
  const ordered = [...moving].sort((a, b) => {
    const x = defs.get(a.definitionId)!,
      y = defs.get(b.definitionId)!;
    return y.width * y.height - x.width * x.height || a.id.localeCompare(b.id);
  });
  let attempts = 0;
  function pack(index: number): boolean {
    if (index === ordered.length) return true;
    const item = items.find((i) => i.id === ordered[index].id)!;
    for (const location of placements(item, movingIds)) {
      if (++attempts > 8192)
        throw new Error(
          "Backpack layout search limit reached; rearrange the replacement pack and retry",
        );
      set(item.id, location);
      movingIds.delete(item.id);
      if (pack(index + 1)) return true;
      movingIds.add(item.id);
    }
    return false;
  }
  if (!pack(0))
    throw new Error(
      "Backpack contents do not fit the replacement's available Tetris space",
    );
  validateInventory(
    { ...snapshot, items },
    definitions,
    density,
    pocketsId,
    carryLimitKg,
  );
  return items;
}
