import type { CanvasUI } from "./toolkit";
import { palette } from "./toolkit";
import type { Rect } from "./layout";
export interface SharedEntryState {
  admitted: boolean;
  ready: boolean;
  canJoin: boolean;
  pending: boolean;
  contactCount: number;
  message: string;
  reviewRequired: boolean;
}
export interface SharedEntryActions {
  join(): void;
  review(): void;
}
/** Explicit relocation action in the ordinary navigation panel. */
export function drawSharedEntry(
  ui: CanvasUI,
  rect: Omit<Rect, "h">,
  state: SharedEntryState,
  actions: SharedEntryActions,
): number {
  const height = state.admitted ? 48 : state.reviewRequired ? 242 : 208;
  const r = { ...rect, h: height };
  ui.panel(r);
  ui.text(
    state.admitted
      ? `Shared system · ${state.contactCount} nearby ships`
      : "Explore together",
    r.x + 12,
    r.y + 12,
    16,
    palette.text,
    r.w - 24,
  );
  if (state.admitted) return height + 12;
  ui.paragraph(
    "Move this ship into the shared system. Your crew, equipment and cargo stay with it.",
    { x: r.x + 12, y: r.y + 42, w: r.w - 24, h: 66 },
    13,
  );
  ui.paragraph(
    state.message ||
      (state.ready
        ? "Choose when to leave your private space."
        : "Checking your account and ship…"),
    { x: r.x + 12, y: r.y + 112, w: r.w - 24, h: 48 },
    12,
    palette.muted,
  );
  ui.button(
    "shared-world-join",
    state.pending ? "Joining…" : "Join shared system",
    { x: r.x + 12, y: r.y + height - 46, w: r.w - 24, h: 32 },
    actions.join,
    {
      disabled:
        !state.ready || !state.canJoin || state.pending || state.reviewRequired,
      accent: true,
    },
  );
  if (state.reviewRequired)
    ui.button(
      "shared-world-review",
      "Review current ship",
      { x: r.x + 12, y: r.y + height - 82, w: r.w - 24, h: 30 },
      actions.review,
      { disabled: state.pending || !state.ready },
    );
  return height + 12;
}
