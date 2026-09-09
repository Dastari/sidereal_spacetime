import { contains, type Rect } from "./layout";
export type FloatingWindow = {
  id: string;
  rect: Rect;
  scroll: number;
  limit: number;
  preferredSize?: { w: number; h: number };
};
/** Presentation-only window order. Rectangles are clamped on every resize/drag. */
export class WindowStack {
  readonly windows: FloatingWindow[] = [];
  focus(id: string) {
    const index = this.windows.findIndex((w) => w.id === id);
    if (index >= 0) this.windows.push(...this.windows.splice(index, 1));
  }
  open(id: string, rect: Rect) {
    if (!this.windows.some((w) => w.id === id))
      this.windows.push({
        id,
        rect,
        scroll: 0,
        limit: 0,
        preferredSize: { w: rect.w, h: rect.h },
      });
    this.focus(id);
  }
  close(id: string) {
    const index = this.windows.findIndex((w) => w.id === id);
    if (index >= 0) this.windows.splice(index, 1);
  }
  at(x: number, y: number) {
    return [...this.windows].reverse().find((w) => contains(w.rect, x, y));
  }
  clamp(width: number, height: number) {
    for (const window of this.windows) {
      const w = Math.min(
        window.preferredSize?.w ?? window.rect.w,
        Math.max(1, width - 16),
      );
      const h = Math.min(
        window.preferredSize?.h ?? window.rect.h,
        Math.max(1, height - 100),
      );
      window.rect = {
        w,
        h,
        x: Math.max(8, Math.min(window.rect.x, width - w - 8)),
        y: Math.max(
          Math.min(64, Math.max(0, height - h - 8)),
          Math.min(window.rect.y, height - h - 16),
        ),
      };
    }
  }
  move(id: string, dx: number, dy: number, width: number, height: number) {
    const window = this.windows.find((w) => w.id === id);
    if (!window) return;
    window.rect.x += dx;
    window.rect.y += dy;
    this.clamp(width, height);
  }
}
