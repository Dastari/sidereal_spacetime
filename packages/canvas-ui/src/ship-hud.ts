import type { CanvasUI } from "./toolkit";
import { palette } from "./toolkit";
import type { Rect } from "./layout";

export type ShipHudState = {
  integrity?: { hp: number; maxHp: number; damaged: number; count: number };
  flight: string;
  cruiseAvailable: boolean;
  cruiseActive: boolean;
  cruiseSpeed?: number;
};
export const shipHudContext = (
  interior: boolean,
  eva: unknown,
  hasShip: boolean,
) => !interior && !eva && hasShip;

export function drawShipStatus(
  ui: CanvasUI,
  r: Rect,
  state: ShipHudState,
  mass?: number,
) {
  const integrity = state.integrity;
  ui.text("Components", r.x, r.y, 11, palette.muted);
  ui.text(
    integrity
      ? `${Math.round(integrity.hp)} / ${Math.round(integrity.maxHp)}`
      : "Unavailable",
    r.x,
    r.y + 16,
    13,
    palette.text,
    r.w,
  );
  ui.ctx.fillStyle = "#163d60";
  ui.ctx.fillRect(r.x, r.y + 34, r.w, 5);
  if (integrity) {
    ui.ctx.fillStyle = palette.blue;
    ui.ctx.fillRect(r.x, r.y + 34, (r.w * integrity.hp) / integrity.maxHp, 5);
  }
  ui.text(
    integrity
      ? `${integrity.damaged} damaged / ${integrity.count} installed`
      : "Status not disclosed",
    r.x,
    r.y + 43,
    11,
    palette.muted,
    r.w,
  );
  ui.text(
    `Mass ${mass === undefined ? "unavailable" : (mass / 1000).toFixed(2) + " t"}`,
    r.x,
    r.y + 61,
    11,
    palette.muted,
    r.w,
  );
  ui.text(state.flight, r.x, r.y + 78, 11, palette.blue, r.w);
}

/** Only present installed/implemented operations. Disabled slots disclose absence;
 * no character inventory binding is invoked from this ship action bar. */
export function drawShipActions(
  ui: CanvasUI,
  r: Rect,
  state: ShipHudState,
  actions: {
    cruise?: () => void;
    systems?: () => void;
    navigation: () => void;
  },
) {
  ui.panel(r, true);
  ui.text(
    state.cruiseActive
      ? `Cruise ${state.cruiseSpeed?.toFixed(1) ?? "—"} m/s · X cancels`
      : "Ship controls · X cruise · W/S overrides",
    r.x + 10,
    r.y + 7,
    11,
    palette.blue,
    r.w - 20,
  );
  const gap = 6,
    width = (r.w - 20 - gap * 4) / 5;
  const entries = [
    {
      id: "ship-cruise",
      label: state.cruiseActive ? "Cancel cruise" : "Cruise",
      action: actions.cruise,
      disabled: !state.cruiseAvailable,
      selected: state.cruiseActive,
    },
    {
      id: "ship-systems",
      label: "Systems",
      action: actions.systems,
      disabled: !actions.systems,
    },
    {
      id: "ship-navigation",
      label: "Navigation",
      action: actions.navigation,
      disabled: false,
    },
    { id: "ship-shields", label: "No shields", disabled: true },
    { id: "ship-boost", label: "No travel drive", disabled: true },
  ];
  entries.forEach((entry, i) =>
    ui.button(
      entry.id,
      entry.label,
      { x: r.x + 10 + i * (width + gap), y: r.y + 26, w: width, h: 47 },
      entry.action ?? (() => {}),
      { disabled: entry.disabled, selected: entry.selected },
    ),
  );
}
