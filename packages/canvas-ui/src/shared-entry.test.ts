import { describe, it, expect, vi } from "vitest";
import { drawSharedEntry, type SharedEntryState } from "./shared-entry";
import type { CanvasUI } from "./toolkit";
const base: SharedEntryState = {
  admitted: false,
  ready: true,
  canJoin: true,
  pending: false,
  contactCount: 0,
  message: "",
  reviewRequired: false,
};
function draw(patch: Partial<SharedEntryState> = {}) {
  const ui = {
    panel: vi.fn(),
    text: vi.fn(),
    paragraph: vi.fn(),
    button: vi.fn(),
  };
  const actions = { join: vi.fn(), review: vi.fn() };
  const height = drawSharedEntry(
    ui as unknown as CanvasUI,
    { x: 0, y: 0, w: 262 },
    { ...base, ...patch },
    actions,
  );
  return { ui, actions, height };
}
describe("shared-system navigation action", () => {
  it("does not join on painting and gives the explicit action a relocation explanation", () => {
    const { ui, actions } = draw();
    expect(actions.join).not.toHaveBeenCalled();
    expect(ui.paragraph.mock.calls[0]![0]).toContain("Move this ship");
    const button = ui.button.mock.calls[0]!;
    expect(button[1]).toBe("Join shared system");
    expect(button[4].disabled).toBe(false);
    button[3]();
    expect(actions.join).toHaveBeenCalledOnce();
  });
  it.each([
    { ready: false },
    { canJoin: false },
    { pending: true },
    { reviewRequired: true },
  ])("disables unsafe or duplicate entry %j", (patch) => {
    expect(draw(patch).ui.button.mock.calls[0]![4].disabled).toBe(true);
  });
  it("offers a separate explicit review after a stale journal", () => {
    const { ui, actions } = draw({ reviewRequired: true });
    expect(ui.button.mock.calls[1]![1]).toBe("Review current ship");
    ui.button.mock.calls[1]![3]();
    expect(actions.review).toHaveBeenCalledOnce();
  });
  it("shows accepted contacts without a second join button", () => {
    const { ui, height } = draw({ admitted: true, contactCount: 2 });
    expect(ui.text.mock.calls[0]![0]).toBe("Shared system · 2 nearby ships");
    expect(ui.button).not.toHaveBeenCalled();
    expect(height).toBe(60);
  });
});
