import { afterEach, expect, test, vi } from "vitest";
import {
  CHARACTER_EXPRESSIONS,
  CHARACTER_FACE_DETAILS,
  CHARACTER_FACIAL_HAIR,
  CHARACTER_FACE_AGES,
} from "@sidereal/content/appearance";
import {
  resolveCrewAppearance,
  type CrewAppearance,
} from "@sidereal/render/crew/appearance";
import {
  drawAppearanceControls,
  appearanceControlsHeight,
  HAIR_COLORS,
  EYE_COLORS,
} from "./appearance-controls";
import { CanvasUI } from "./toolkit";

afterEach(() => vi.unstubAllGlobals());
function fixture(width = 430) {
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
      get: (object, key) => Reflect.get(object, key) ?? noop,
      set: (object, key, value) => Reflect.set(object, key, value),
    },
  );
  const ui = Object.assign(Object.create(CanvasUI.prototype), {
    ctx,
    hits: [],
    panels: [],
    width: 1280,
    height: 800,
    focus: "",
    hover: "",
    opacity: 0.94,
  }) as CanvasUI;
  let appearance: CrewAppearance = {};
  const change = vi.fn((patch: CrewAppearance) => {
    appearance = { ...appearance, ...patch };
  });
  const rect = { x: 20, y: 30, w: width, h: 400 };
  const draw = () => {
    ui.hits = [];
    return drawAppearanceControls(ui, rect, appearance, change);
  };
  const click = (id: string) =>
    ui.hits.find((hit) => hit.id === id)!.action?.();
  return { ui, rect, draw, change, click, appearance: () => appearance };
}

test("Crew offers 32 distinct hair swatches and eight eyes colors, with meaningful accessible names", () => {
  const { ui, draw, click, change } = fixture();
  draw();
  expect(HAIR_COLORS.length).toBeGreaterThanOrEqual(24);
  expect(new Set(HAIR_COLORS.map(([, color]) => color)).size).toBe(
    HAIR_COLORS.length,
  );
  for (const name of [
    "Hot pink",
    "Electric blue",
    "Cyan",
    "Orange",
    "Red",
    "Violet",
    "Lime",
  ]) {
    const index = HAIR_COLORS.findIndex(([label]) => label === name);
    expect(index).toBeGreaterThanOrEqual(0);
    const id = `crew-hair-color-${index}`;
    expect(ui.hits.find((hit) => hit.id === id)?.label).toBe(
      `Hair color: ${name}`,
    );
    click(id);
    expect(change).toHaveBeenLastCalledWith({ hair: HAIR_COLORS[index][1] });
  }
  expect(EYE_COLORS).toHaveLength(8);
  EYE_COLORS.forEach(([name, color], i) => {
    const id = `crew-eyes-color-${i}`;
    expect(ui.hits.find((hit) => hit.id === id)?.label).toBe(
      `Eye color: ${name}`,
    );
    click(id);
    expect(change).toHaveBeenLastCalledWith({ eyes: color });
  });
});

test("each face selector reaches every persisted option and wraps without altering the other choices", () => {
  const { draw, click, appearance } = fixture();
  for (const [key, values] of [
    ["expression", CHARACTER_EXPRESSIONS],
    ["faceDetail", CHARACTER_FACE_DETAILS],
    ["facialHair", CHARACTER_FACIAL_HAIR],
    ["faceAge", CHARACTER_FACE_AGES],
  ] as const) {
    const initial = resolveCrewAppearance(appearance())[key];
    const observed = new Set<string>();
    for (let i = 0; i < values.length; i++) {
      draw();
      const previous = appearance();
      click(`crew-${key}`);
      const current = appearance();
      observed.add(resolveCrewAppearance(current)[key]);
      for (const other of Object.keys(previous) as Array<keyof CrewAppearance>)
        if (other !== key) expect(current[other]).toBe(previous[other]);
    }
    expect(observed).toEqual(new Set(values));
    expect(resolveCrewAppearance(appearance())[key]).toBe(initial);
  }
});

test.each([280, 430, 640])(
  "Crew controls fit a %i px scroll region without overlapping hit targets",
  (width) => {
    const { ui, rect, draw } = fixture(width);
    const height = draw();
    for (const [i, hit] of ui.hits.entries()) {
      const a = hit.rect;
      expect(a.x).toBeGreaterThanOrEqual(rect.x);
      expect(a.x + a.w).toBeLessThanOrEqual(rect.x + rect.w + 0.001);
      expect(a.y + a.h).toBeLessThanOrEqual(rect.y + height);
      expect(a.w).toBeGreaterThan(28);
      expect(a.h).toBeGreaterThanOrEqual(34);
      for (const other of ui.hits.slice(i + 1)) {
        const b = other.rect;
        expect(
          a.x + a.w <= b.x ||
            b.x + b.w <= a.x ||
            a.y + a.h <= b.y ||
            b.y + b.h <= a.y,
        ).toBe(true);
      }
    }
  },
);

test.each([180, 250, 280, 444, 640])(
  "premeasured Crew scroll exposes the final hair swatch at %i px width",
  (width) => {
    const { ui, rect, draw, click, change } = fixture(width);
    const viewportTop = rect.y;
    const measured = appearanceControlsHeight(width);
    rect.y -= Math.max(0, measured - rect.h);
    expect(draw()).toBe(measured);
    // Production menu rejects every partially clipped hit. The last swatch
    // must therefore fit fully, not merely have a visible sliver at the bottom.
    const lastId = `crew-hair-color-${HAIR_COLORS.length - 1}`;
    const visible = ui.hits.filter(
      ({ rect: hit }) =>
        hit.y >= viewportTop && hit.y + hit.h <= viewportTop + rect.h,
    );
    expect(visible.some((hit) => hit.id === lastId)).toBe(true);
    click(lastId);
    expect(change).toHaveBeenLastCalledWith({ hair: HAIR_COLORS.at(-1)![1] });
  },
);
