import { afterEach, expect, test, vi } from "vitest";
import { actionBarRect, playerStatusRect } from "./action-bar";
import type { Rect } from "./layout";

// createGameUI builds a CanvasUI over a Babylon layer; the HUD tests only need
// its drawing and hit list, so the constructor returns a canvas-free fixture.
const fake = vi.hoisted(() => ({
  ui: undefined as unknown,
  proto: undefined as unknown as object,
}));
vi.mock("./toolkit", async (original) => {
  const actual = await original<typeof import("./toolkit")>();
  fake.proto = actual.CanvasUI.prototype;
  return {
    ...actual,
    CanvasUI: class {
      constructor() {
        return fake.ui as never;
      }
    },
  };
});
import type { CanvasUI } from "./toolkit";
import {
  CONTROL_KEYS,
  MENU_TABS,
  createGameUI,
  type GameUIActions,
  type GameUIState,
} from "./index";

afterEach(() => vi.unstubAllGlobals());
const overlaps = (a: Rect, b: Rect) =>
  !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );

// The HUD draws at 1.35× from 1100 px wide, so these are the logical sizes.
const logical = (width: number, height: number) =>
  width >= 1100 ? [width / 1.35, height / 1.35] : [width, height];
for (const [pw, ph] of [
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
  [1024, 768],
] as const)
  test(`player status sits bottom-left beside the action bar at ${pw}×${ph}`, () => {
    const [w, h] = logical(pw, ph);
    const status = playerStatusRect(w, h),
      bar = actionBarRect(w, h);
    expect(status.x).toBe(16);
    // Shares the action bar's bottom edge, inside the viewport.
    expect(status.y + status.h).toBe(bar.y + bar.h);
    expect(status.y).toBeGreaterThan(h / 2);
    expect(overlaps(status, bar)).toBe(false);
    expect(status.x + status.w + 12).toBeLessThanOrEqual(bar.x);
    expect(bar.x + bar.w).toBeLessThanOrEqual(w - 12);
    // The bar keeps usable slots ((w − 86) / 10 px).
    expect((bar.w - 86) / 10).toBeGreaterThanOrEqual(47);
    // The E interaction button stays at the bottom right.
    const interact = {
      x: Math.max(16, w - 200),
      y: w < 1150 ? h - 146 : h - 63,
      w: 184,
      h: 39,
    };
    expect(overlaps(status, interact)).toBe(false);
    expect(overlaps(bar, interact)).toBe(false);
  });

test("narrow screens stack the player status above the centred action bar", () => {
  for (const [w, h] of [
    [800, 600],
    [640, 480],
  ]) {
    const status = playerStatusRect(w, h),
      bar = actionBarRect(w, h);
    expect(overlaps(status, bar)).toBe(false);
    expect(status.y + status.h).toBeLessThanOrEqual(bar.y);
    expect(bar.x).toBeCloseTo((w - bar.w) / 2);
  }
});

function hud(overrides: Partial<GameUIState> = {}) {
  vi.stubGlobal(
    "Image",
    class {
      complete = false;
      decoding = "";
      src = "";
    },
  );
  const noop = () => {};
  const ctx = new Proxy(
    {
      measureText: (text: string) => ({ width: text.length * 7 }),
      createLinearGradient: () => ({ addColorStop: noop }),
    },
    {
      get: (o, k) => Reflect.get(o, k) ?? noop,
      set: (o, k, v) => Reflect.set(o, k, v),
    },
  );
  const ui = Object.assign(Object.create(fake.proto), {
    ctx,
    hits: [],
    panels: [],
    width: 1920,
    height: 1080,
    scale: 1,
    focus: "",
    hover: "",
    opacity: 0.94,
    keyboard: false,
    setWorldCursor: noop,
    invalidate: noop,
  }) as CanvasUI;
  fake.ui = ui;
  const actions = {
    view: vi.fn(),
    station: vi.fn(),
    enter: vi.fn(),
    rename: vi.fn(),
    vista: vi.fn(),
    motion: vi.fn(),
    camera: vi.fn(),
    focusDestination: vi.fn(),
    crew: vi.fn(),
    dismiss: vi.fn(),
    retry: vi.fn(),
    combat: vi.fn(),
    openService: vi.fn(),
    closeService: vi.fn(() => false),
    signOut: vi.fn(),
  } satisfies GameUIActions;
  const state: GameUIState = {
    status: "ready",
    error: "",
    modelStatus: "",
    hasActor: true,
    connected: true,
    actorName: "Dastari",
    shipName: "Wren",
    seated: false,
    nearStation: false,
    interior: true,
    receipts: 0,
    pending: false,
    vistaId: "",
    reducedMotion: false,
    destinations: [],
    accountKind: "oidc",
    account: { name: "Dastari", note: "Saved.", transfer: false },
    vesselServices: [{ id: "ship-systems", label: "Ship systems" }],
    ...overrides,
  };
  const canvas = { setAttribute: noop } as unknown as HTMLCanvasElement;
  const game = createGameUI(canvas, {} as never, state, actions, []);
  const draw = () => {
    ui.hits = [];
    ui.panels = [];
    ui.draw();
    return ui.hits.map((hit) => hit.id);
  };
  return { ui, game, actions, draw };
}

test("the top HUD keeps only Menu; windows open from keys", () => {
  const { ui, draw } = hud();
  const ids = draw();
  expect(ids).toContain("menu");
  for (const gone of [
    "combat-toggle",
    "navigation",
    "character-open",
    "inventory-open",
    "view",
  ])
    expect(ids).not.toContain(gone);
  // N toggles the map without a button (no destinations: nothing to list).
  expect(ui.shortcut("KeyN")).toBe(true);
});

test("the system menu opens on Controls with key hints and window buttons", () => {
  const { ui, draw, actions } = hud();
  ui.escape();
  const ids = draw();
  for (const tab of MENU_TABS) expect(ids).toContain("tab-" + tab);
  expect(MENU_TABS[0]).toBe("Controls");
  expect(ids).toEqual(
    expect.arrayContaining([
      "open-character",
      "open-inventory",
      "open-map",
      "open-combat",
      "open-view",
    ]),
  );
  expect(CONTROL_KEYS.map(([key]) => key)).toContain("Esc");
  // A menu button leaves the menu and runs the mode.
  ui.hits.find((hit) => hit.id === "open-combat")!.action!();
  expect(actions.combat).toHaveBeenCalledOnce();
  expect(draw()).not.toContain("tab-Controls");
});

test("Account lives in the menu: sign out and character transfer", () => {
  const { ui, draw, actions } = hud({
    account: { name: "Dastari", note: "Transfer", transfer: true },
  });
  ui.escape();
  draw();
  ui.hits.find((hit) => hit.id === "tab-Account")!.action!();
  const ids = draw();
  expect(ids).toContain("sign-out");
  expect(ids).toContain("account-transfer");
  ui.hits.find((hit) => hit.id === "account-transfer")!.action!();
  expect(actions.openService).toHaveBeenCalledWith("account");
  ui.escape();
  draw();
  ui.hits.find((hit) => hit.id === "tab-Account")!.action!();
  draw();
  ui.hits.find((hit) => hit.id === "sign-out")!.action!();
  expect(actions.signOut).toHaveBeenCalledOnce();
});

test("ship services open from the Vessel tab; Escape closes an open panel first", () => {
  const { ui, draw, actions } = hud();
  ui.escape();
  draw();
  ui.hits.find((hit) => hit.id === "tab-Vessel")!.action!();
  draw();
  ui.hits.find((hit) => hit.id === "service-ship-systems")!.action!();
  expect(actions.openService).toHaveBeenCalledWith("ship-systems");
  actions.closeService.mockReturnValueOnce(true);
  ui.escape();
  // The panel closed; the menu did not reopen.
  expect(draw()).not.toContain("tab-Controls");
});
