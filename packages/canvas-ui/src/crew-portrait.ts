import type { CanvasUI } from "./toolkit";
import type { Rect } from "./layout";
export function portraitSource(preset: string) {
  return "/assets/crew/looks/" + encodeURIComponent(preset) + ".png";
}
/** Static authored appearance proof. Never snapshots a live actor or changes gear. */
export function createCrewPortrait(ui: CanvasUI) {
  const images = new Map<string, { bitmap: HTMLImageElement; bounds?: Rect }>();
  return (preset: string, r: Rect): boolean => {
    let entry = images.get(preset);
    if (!entry) {
      const bitmap = new Image();
      entry = { bitmap };
      images.set(preset, entry);
      const record = entry;
      bitmap.decoding = "async";
      bitmap.onload = () => {
        // One bounded alpha scan per selected preset preserves the original PNG,
        // removes its studio camera margin and uses no additional visible canvas.
        const backing = document.createElement("canvas");
        backing.width = bitmap.naturalWidth;
        backing.height = bitmap.naturalHeight;
        const ctx = backing.getContext("2d");
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0);
          const data = ctx.getImageData(
            0,
            0,
            backing.width,
            backing.height,
          ).data;
          let left = backing.width,
            top = backing.height,
            right = 0,
            bottom = 0;
          for (let y = 0; y < backing.height; y++)
            for (let x = 0; x < backing.width; x++) {
              if (data[(y * backing.width + x) * 4 + 3] > 8) {
                left = Math.min(left, x);
                top = Math.min(top, y);
                right = Math.max(right, x + 1);
                bottom = Math.max(bottom, y + 1);
              }
            }
          if (right > left && bottom > top)
            record.bounds = {
              x: left,
              y: top,
              w: right - left,
              h: bottom - top,
            };
        }
        ui.invalidate();
      };
      bitmap.onerror = () => ui.invalidate();
      bitmap.src = portraitSource(preset);
    }
    if (!entry.bitmap.complete || !entry.bitmap.naturalWidth) return false;
    const source = entry.bounds ?? {
      x: 0,
      y: 0,
      w: entry.bitmap.naturalWidth,
      h: entry.bitmap.naturalHeight,
    };
    const scale = Math.min(r.w / source.w, r.h / source.h);
    const w = source.w * scale,
      h = source.h * scale;
    ui.ctx.drawImage(
      entry.bitmap,
      source.x,
      source.y,
      source.w,
      source.h,
      r.x + (r.w - w) / 2,
      r.y + (r.h - h) / 2,
      w,
      h,
    );
    return true;
  };
}
