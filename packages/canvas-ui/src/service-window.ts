import { CanvasUI, palette } from "./toolkit";
import { WindowStack } from "./windows";
import { contains, type Rect } from "./layout";
import type { CanvasServiceView } from "./ship-systems";
export type ServiceRow =
  | {
      kind: "text";
      text: string;
      tone?: "normal" | "muted" | "error" | "warning";
    }
  | {
      kind: "button";
      id: string;
      text: string;
      run: () => void;
      disabled?: boolean;
      pending?: boolean;
      danger?: boolean;
    }
  | {
      kind: "input";
      id: string;
      label: string;
      value: string;
      change: (value: string) => void;
      max?: number;
    };
export function createServiceWindow(
  read: () => { title: string; rows: readonly ServiceRow[]; pending?: boolean },
  close: () => void,
): CanvasServiceView & { close: () => boolean } {
  const stack = new WindowStack();
  let content: Rect | undefined;
  return {
    close() {
      if (!read().pending) close();
      return true;
    },
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
    draw(ui: CanvasUI) {
      const state = read();
      if (!stack.windows.length)
        stack.open("service", {
          x: Math.max(8, ui.width - 480),
          y: 64,
          w: 460,
          h: Math.min(650, ui.height - 100),
        });
      stack.clamp(ui.width, ui.height);
      const window = stack.windows[0],
        r = window.rect;
      ui.windowFrame(
        "service",
        state.title,
        r,
        true,
        (dx, dy) => stack.move(window.id, dx, dy, ui.width, ui.height),
        () => {
          if (!state.pending) close();
        },
      );
      content = { x: r.x + 14, y: r.y + 56, w: r.w - 28, h: r.h - 70 };
      let y = content.y - window.scroll;
      ui.scrollRegion(content, () => {
        for (const row of state.rows) {
          if (row.kind === "button") {
            ui.button(
              row.id,
              row.text,
              { x: content!.x, y, w: content!.w, h: 36 },
              row.run,
              {
                disabled: row.disabled,
                pending: row.pending,
                variant: row.danger ? "danger" : undefined,
              },
            );
            y += 46;
          } else if (row.kind === "input") {
            ui.text(row.label, content!.x, y, 14, palette.muted, content!.w);
            y += 22;
            ui.input(
              row.id,
              row.label,
              row.value,
              { x: content!.x, y, w: content!.w, h: 36 },
              row.change,
              row.max ?? 40,
            );
            y += 48;
          } else {
            const size = row.tone === "normal" ? 17 : 14;
            const lines = Math.max(
              1,
              Math.ceil(
                row.text.length / Math.max(12, content!.w / (size * 0.48)),
              ),
            );
            ui.paragraph(
              row.text,
              { x: content!.x, y, w: content!.w, h: lines * (size + 6) },
              size,
              row.tone === "error"
                ? palette.red
                : row.tone === "warning"
                  ? palette.gold
                  : row.tone === "normal"
                    ? palette.text
                    : palette.muted,
            );
            y += lines * (size + 6) + 12;
          }
        }
      });
      window.limit = Math.max(0, y + window.scroll - content.y - content.h);
      window.scroll = Math.min(window.scroll, window.limit);
    },
  };
}
