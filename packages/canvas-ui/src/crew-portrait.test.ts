import { afterEach, expect, test, vi } from "vitest";
import { createCrewPortrait } from "./crew-portrait";
import type { CanvasUI } from "./toolkit";
afterEach(() => vi.unstubAllGlobals());
test("changing presets switches the authored image and never displays a stale previous portrait", () => {
  const loaded: {
    src: string;
    complete: boolean;
    naturalWidth: number;
    naturalHeight: number;
  }[] = [];
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      complete = false;
      naturalWidth = 480;
      naturalHeight = 640;
      constructor() {
        loaded.push(this);
      }
    },
  );
  const drawImage = vi.fn();
  const ui = { ctx: { drawImage }, invalidate: vi.fn() } as unknown as CanvasUI;
  const draw = createCrewPortrait(ui),
    r = { x: 10, y: 20, w: 220, h: 280 };
  expect(draw("engineer", r)).toBe(false);
  expect(loaded[0].src).toBe("/assets/crew/looks/engineer.png");
  loaded[0].complete = true;
  expect(draw("engineer", r)).toBe(true);
  expect(drawImage.mock.calls.at(-1)?.[0]).toBe(loaded[0]);
  const count = drawImage.mock.calls.length;
  expect(draw("recon", r)).toBe(false);
  expect(drawImage).toHaveBeenCalledTimes(count);
  expect(loaded[1].src).toBe("/assets/crew/looks/recon.png");
  loaded[1].complete = true;
  expect(draw("recon", r)).toBe(true);
  expect(drawImage.mock.calls.at(-1)?.[0]).toBe(loaded[1]);
  expect(draw("engineer", r)).toBe(true);
  expect(loaded).toHaveLength(2);
});
