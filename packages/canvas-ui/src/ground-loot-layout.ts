import type { Rect } from "./layout";

/** Stable item identities retain their collision offset as the projected anchor
 * moves. Corrections use neighbouring edges, rather than jumping30px grid steps. */
export function createGroundLootLayout() {
  const offsets = new Map<string, { x: number; y: number }>();
  return (
    anchors: readonly { id: string; x: number; y: number; w: number }[],
    width: number,
    height: number,
  ) => {
    const used: Rect[] = [];
    const result = new Map<string, Rect>();
    const current = new Set(anchors.map((a) => a.id));
    for (const id of offsets.keys()) if (!current.has(id)) offsets.delete(id);
    for (const a of [...anchors].sort((a, b) => a.id.localeCompare(b.id))) {
      const origin = {
        x: Math.max(8, Math.min(a.x - a.w / 2, width - a.w - 8)),
        y: Math.max(55, Math.min(a.y - 24, height - 130)),
      };
      const previous = offsets.get(a.id) ?? { x: 0, y: 0 };
      const preferred = {
        x: Math.max(8, Math.min(origin.x + previous.x, width - a.w - 8)),
        y: Math.max(55, Math.min(origin.y + previous.y, height - 130)),
        w: a.w,
        h: 26,
      };
      const fits = (box: Rect) =>
        box.x >= 8 &&
        box.x + box.w <= width - 8 &&
        box.y >= 55 &&
        box.y + box.h <= height - 104 &&
        !used.some(
          (b) =>
            box.x < b.x + b.w + 3 &&
            box.x + box.w + 3 > b.x &&
            box.y < b.y + b.h + 3 &&
            box.y + box.h + 3 > b.y,
        );
      let placed: Rect | undefined = fits(preferred) ? preferred : undefined;
      if (!placed) {
        // Retain the chosen side of a pile. Its boundary moves continuously with
        // the camera; only actual collisions/viewport bounds can displace it.
        const edges = used.flatMap((b) => [
          { ...preferred, y: b.y - preferred.h - 3 },
          { ...preferred, y: b.y + b.h + 3 },
        ]);
        edges.sort(
          (a, b) => Math.abs(a.y - preferred.y) - Math.abs(b.y - preferred.y),
        );
        placed = edges.find(fits);
      }
      if (!placed) {
        placement: for (
          let column = 0;
          column <= Math.ceil(width / (a.w + 6));
          column++
        )
          for (const direction of column ? [-1, 1] : [0])
            for (let step = 0; step <= Math.ceil(height / 30); step++)
              for (const vertical of step ? [-1, 1] : [0]) {
                const box = {
                  x: origin.x + column * direction * (a.w + 6),
                  y: origin.y + step * vertical * 30,
                  w: a.w,
                  h: 26,
                };
                if (fits(box)) {
                  placed = box;
                  break placement;
                }
              }
      }
      if (placed) {
        used.push(placed);
        offsets.set(a.id, { x: placed.x - origin.x, y: placed.y - origin.y });
        result.set(a.id, placed);
      } else offsets.delete(a.id);
    }
    return result;
  };
}
