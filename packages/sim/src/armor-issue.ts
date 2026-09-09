import type { GridDefinition } from "./inventory";
/** Packs a fixed content delivery while reserving every existing item footprint.
 * A preferred locker keeps each uniform set together in the four ship crates. */
export function packArmorIssue(
  definitions: readonly (GridDefinition & { preferredLocker?: number })[],
  width = 16,
  height = 16,
  lockerCount = 0,
  existing: readonly {
    locker: number;
    width: number;
    height: number;
    x: number;
    y: number;
  }[] = [],
) {
  const lockers: boolean[][] = Array.from({ length: lockerCount }, () =>
    Array(width * height).fill(false),
  );
  for (const item of existing) {
    const cells = lockers[item.locker];
    if (!cells) throw Error("Unknown supply container");
    for (let yy = 0; yy < item.height; yy++)
      for (let xx = 0; xx < item.width; xx++) {
        const x = item.x + xx,
          y = item.y + yy;
        if (x < 0 || y < 0 || x >= width || y >= height)
          throw Error("Existing cargo exceeds expanded grid");
        cells[y * width + x] = true;
      }
  }
  const placements: {
    definitionId: string;
    locker: number;
    x: number;
    y: number;
  }[] = [];
  for (const item of definitions) {
    if (item.width > width || item.height > height)
      throw Error("Armor exceeds locker bounds");
    let placement: (typeof placements)[number] | undefined;
    const order = lockerCount
      ? Array.from(
          { length: lockerCount },
          (_, i) => ((item.preferredLocker ?? 0) + i) % lockerCount,
        )
      : Array.from({ length: lockers.length + 1 }, (_, i) => i);
    for (const n of order) {
      const cells =
        lockers[n] ?? (lockers[n] = Array(width * height).fill(false));
      for (let y = 0; y <= height - item.height && !placement; y++)
        for (let x = 0; x <= width - item.width && !placement; x++) {
          let free = true;
          for (let yy = 0; yy < item.height; yy++)
            for (let xx = 0; xx < item.width; xx++)
              if (cells[(y + yy) * width + x + xx]) free = false;
          if (free) {
            for (let yy = 0; yy < item.height; yy++)
              for (let xx = 0; xx < item.width; xx++)
                cells[(y + yy) * width + x + xx] = true;
            placement = { definitionId: item.id, locker: n, x, y };
          }
        }
      if (placement) break;
    }
    if (!placement || lockers.length > 4)
      throw Error("No room for the uniform delivery in the four supply crates");
    placements.push(placement);
  }
  return { lockers: lockers.length, placements };
}
