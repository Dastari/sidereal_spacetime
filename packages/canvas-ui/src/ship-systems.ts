import { CanvasUI, palette } from "./toolkit";
import { WindowStack } from "./windows";
import { contains, type Rect } from "./layout";
export type CanvasServiceView = {
  close?: () => boolean;
  draw: (ui: CanvasUI) => void;
  scroll: (delta: number, x?: number, y?: number) => boolean;
};
export type ShipSystemsState = {
  ready: boolean;
  name: string;
  status: string;
  error: string;
  pending: string;
  budget: readonly { label: string; value: string }[];
  issues: readonly string[];
  engines: readonly {
    id: string;
    label: string;
    connected: boolean;
    enabled: boolean;
  }[];
  canInspect: boolean;
};
/** Service content is a typed read model; paint/controls remain part of the shared kit. */
export function createShipSystemsWindow(
  read: () => ShipSystemsState,
  actions: {
    close: () => void;
    inspect: () => void;
    power: (id: string, connected: boolean) => void;
  },
): CanvasServiceView {
  const stack = new WindowStack();
  let content: Rect | undefined;
  return {
    scroll(delta, x, y) {
      const window = stack.windows[0];
      if (!window || (x !== undefined && !contains(window.rect, x, y ?? 0)))
        return false;
      window.scroll = Math.max(
        0,
        Math.min(window.limit, window.scroll + delta),
      );
      return true;
    },
    draw(ui) {
      const state = read();
      if (!stack.windows.length)
        stack.open("ship-systems", {
          x: Math.max(8, ui.width - 430),
          y: 64,
          w: 414,
          h: Math.min(670, ui.height - 90),
        });
      stack.clamp(ui.width, ui.height);
      const window = stack.windows[0],
        r = window.rect;
      ui.windowFrame(
        "ship-systems",
        "Ship systems",
        r,
        true,
        (dx, dy) => stack.move(window.id, dx, dy, ui.width, ui.height),
        actions.close,
      );
      content = { x: r.x + 12, y: r.y + 55, w: r.w - 24, h: r.h - 66 };
      let y = content.y - window.scroll;
      ui.scrollRegion(content, () => {
        ui.text(state.name, content!.x, y, 17, palette.text, content!.w);
        y += 28;
        ui.button(
          "systems-design-open",
          "Open systems design view",
          { x: content!.x, y, w: content!.w, h: 36 },
          actions.inspect,
          { disabled: !state.ready || !state.canInspect },
        );
        y += 50;
        ui.text(
          state.ready ? state.status : "Loading ship connections…",
          content!.x,
          y,
          14,
          palette.muted,
          content!.w,
        );
        y += 27;
        for (const line of state.budget) {
          ui.text(
            line.label,
            content!.x,
            y,
            14,
            palette.muted,
            content!.w * 0.4,
          );
          ui.text(
            line.value,
            content!.x + content!.w * 0.42,
            y,
            14,
            palette.text,
            content!.w * 0.58,
          );
          y += 24;
        }
        for (const issue of state.issues) {
          ui.text(issue, content!.x, y, 13, palette.gold, content!.w);
          y += 25;
        }
        if (state.error) {
          ui.text(state.error, content!.x, y, 13, palette.red, content!.w);
          y += 25;
        }
        if (state.engines.length) {
          y += 10;
          ui.text("Power connections", content!.x, y, 20);
          y += 30;
        }
        for (const engine of state.engines) {
          ui.button(
            `power-${engine.id}`,
            `${engine.connected ? "✓" : "○"} ${engine.label}`,
            { x: content!.x, y, w: content!.w, h: 36 },
            () => actions.power(engine.id, !engine.connected),
            {
              selected: engine.connected,
              pending: state.pending === engine.id,
              disabled: !state.ready || !!state.pending || !engine.enabled,
            },
          );
          y += 46;
        }
      });
      window.limit = Math.max(0, y + window.scroll - content.y - content.h);
      window.scroll = Math.min(window.scroll, window.limit);
    },
  };
}
