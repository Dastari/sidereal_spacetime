import { describe, it, expect, vi, afterEach } from "vitest";
const fixture = vi.hoisted(() => ({
  presentation: "loading",
  create: vi.fn(),
  setAppearance: vi.fn(),
  render: vi.fn(),
  canvas: {},
  dispose: vi.fn(),
}));
vi.mock("../../render/src/character-preview", () => ({
  createCharacterPreview: () => {
    fixture.create();
    return {
      canvas: fixture.canvas,
      ready: Promise.resolve(),
      status: "ready",
      get presentationStatus() {
        return fixture.presentation;
      },
      setAppearance: fixture.setAppearance,
      render: fixture.render,
      resize: vi.fn(),
      setRotation: vi.fn(),
      rotate: vi.fn(),
      needsRender: true,
      dispose: fixture.dispose,
    };
  },
}));
vi.mock("./hud-icons", () => ({ drawHudIcon: vi.fn() }));
vi.mock("./item-frame", () => ({
  drawItemFrame: vi.fn(),
  ITEM_RARITY_PALETTES: { common: {}, rare: {}, epic: {}, legendary: {} },
}));
import { createCharacterSheet } from "./character-sheet";
import type { CanvasUI } from "./toolkit";
import type { InventoryState } from "./inventory";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function harness() {
  fixture.presentation = "loading";
  const images = vi.fn(),
    text = vi.fn(),
    drawImage = vi.fn();
  vi.stubGlobal("document", {});
  vi.stubGlobal("Image", images);
  const noop = () => {};
  const ctx = new Proxy(
    { drawImage },
    {
      get: (target, key) =>
        key in target ? target[key as keyof typeof target] : noop,
    },
  );
  const ui = new Proxy(
    {
      ctx,
      panels: [],
      hits: [],
      text,
      button: () => {
        ui.hits.push({
          label: "",
          id: "test",
          rect: { x: 0, y: 0, w: 1, h: 1 },
        });
      },
    },
    {
      get: (target, key) =>
        key in target ? target[key as keyof typeof target] : noop,
    },
  ) as unknown as CanvasUI;
  const cosmetics = {
    presets: ["engineer"],
    selected: () => "engineer",
    select: noop,
    appearance: () => ({
      bodyType: "female" as const,
      hairStyle: "braids" as const,
    }),
  };
  const sheet = createCharacterSheet(ui, {
    cosmetics,
    icon: noop,
    equipment: noop,
  });
  const state: InventoryState = {
    revision: "0",
    items: [],
    containers: [],
    hotbar: [],
    carriedMassKg: 0,
    carryLimitKg: 32,
  };
  return {
    sheet,
    images,
    text,
    drawImage,
    draw: () =>
      sheet.draw(state, { x: 0, y: 0, w: 460, h: 540 }, "Actual actor", false),
  };
}
describe("actual character sheet portrait loading", () => {
  it("never requests a preset proof image and waits for a personalized shaded frame", async () => {
    const h = harness();
    h.draw();
    expect(h.images).not.toHaveBeenCalled();
    expect(h.drawImage).not.toHaveBeenCalled();
    expect(h.text.mock.calls.some((c) => c[0] === "Loading character…")).toBe(
      true,
    );
    await vi.waitFor(() => expect(fixture.create).toHaveBeenCalledOnce());
    h.draw();
    expect(h.drawImage).not.toHaveBeenCalled();
    fixture.presentation = "ready";
    h.draw();
    expect(h.drawImage).toHaveBeenCalledWith(
      fixture.canvas,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
    );
    expect(fixture.setAppearance).toHaveBeenLastCalledWith(
      "engineer",
      expect.objectContaining({
        bodyType: "female",
        hairStyle: "braids",
        equippedComponents: {},
      }),
    );
    expect(fixture.setAppearance.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      fixture.render.mock.invocationCallOrder.at(-1)!,
    );
    expect(fixture.render.mock.invocationCallOrder.at(-1)!).toBeLessThan(
      h.drawImage.mock.invocationCallOrder.at(-1)!,
    );
    h.sheet.dispose();
    expect(fixture.dispose).toHaveBeenCalledOnce();
  });
  it("uses a neutral failure state instead of substituting engineering gear", async () => {
    const h = harness();
    h.draw();
    await vi.waitFor(() => expect(fixture.create).toHaveBeenCalledOnce());
    fixture.presentation = "error";
    h.draw();
    expect(h.images).not.toHaveBeenCalled();
    expect(h.drawImage).not.toHaveBeenCalled();
    expect(
      h.text.mock.calls.some((c) => c[0] === "Character preview unavailable"),
    ).toBe(true);
    h.sheet.dispose();
  });
});
