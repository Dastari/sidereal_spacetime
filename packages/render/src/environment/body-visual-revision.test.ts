import { expect, test, vi } from "vitest";
import { createBodyVisualRevision } from "./body-visual-revision";
import type { SpaceBodyState } from "./index";
import { planetRecipeForAppearance } from "@sidereal/content/environment";

test("body visual revision detects in-place recipes but ignores replicated motion without per-frame cloning", () => {
  const body: SpaceBodyState = {
    id: "a",
    kind: "planet",
    appearance: "ice",
    seed: 1,
    radius: 100,
    x: 0,
    y: 0,
    height: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    omega: 0,
    recipe: planetRecipeForAppearance("ice", 1),
  };
  const revision = createBodyVisualRevision(),
    clone = vi.spyOn(globalThis, "structuredClone");
  try {
    expect(revision(body, 1, false, false)).toBe(1);
    for (let i = 0; i < 10; i++) {
      body.x++;
      body.heading += 0.1;
      expect(revision(body, 1, false, false)).toBe(1);
    }
    expect(clone).toHaveBeenCalledTimes(1);
    body.recipe!.palette[0] = "abcdef";
    expect(revision(body, 1, false, false)).toBe(2);
    expect(
      revision(
        {
          ...body,
          recipe: { ...body.recipe!, palette: [...body.recipe!.palette] },
        },
        1,
        false,
        false,
      ),
    ).toBe(2);
    expect(revision(body, 0, false, false)).toBe(3);
    expect(revision(body, 0, true, false)).toBe(4);
    body.recipe = undefined;
    expect(revision(body, 0, true, false)).toBe(5);
  } finally {
    clone.mockRestore();
  }
});
