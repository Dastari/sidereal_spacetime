import { expect, test } from "vitest";
import { drawShipActions, shipHudContext } from "./ship-hud";
import type { CanvasUI } from "./toolkit";
test("ship HUD follows view context while EVA retains character controls", () => {
  expect(shipHudContext(true, undefined, true)).toBe(false);
  expect(shipHudContext(false, undefined, true)).toBe(true);
  expect(shipHudContext(false, {}, true)).toBe(false);
  expect(shipHudContext(false, undefined, false)).toBe(false);
});
test("ship actions remain disabled without helm and do not imply unavailable modules work", () => {
  const buttons: { id: string; action: () => void; disabled: boolean }[] = [];
  const ui = {
    panel() {},
    text() {},
    button(
      id: string,
      _label: string,
      _rect: unknown,
      action: () => void,
      options: { disabled: boolean },
    ) {
      buttons.push({ id, action, disabled: options.disabled });
    },
  } as unknown as CanvasUI;
  const invoked: string[] = [];
  drawShipActions(
    ui,
    { x: 0, y: 0, w: 710, h: 87 },
    { flight: "Unavailable", cruiseAvailable: false, cruiseActive: false },
    {
      cruise: () => invoked.push("cruise"),
      systems: () => invoked.push("systems"),
      navigation: () => invoked.push("navigation"),
    },
  );
  expect(buttons.filter((b) => !b.disabled).map((b) => b.id)).toEqual([
    "ship-systems",
    "ship-navigation",
  ]);
  for (const button of buttons.filter((b) => !b.disabled)) button.action();
  expect(invoked).toEqual(["systems", "navigation"]);
});
