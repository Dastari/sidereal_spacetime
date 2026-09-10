import { expect, it } from "vitest";
import { createTemporalSkinHistory } from "./temporal-skin-history";
it("resets on visible deformation, newly visible/removed rigs, but preserves static accumulation", () => {
  const tracker = createTemporalSkinHistory(),
    values = new Float32Array([1, 0, 0, 1]),
    pose = { id: "rig", values };
  expect(tracker.sample([pose])).toBe(true);
  expect(tracker.sample([pose, pose])).toBe(false);
  values[1] = 0.2;
  expect(tracker.sample([pose])).toBe(true);
  expect(tracker.sample([pose])).toBe(false);
  expect(tracker.sample([])).toBe(true);
  expect(tracker.sample([])).toBe(false);
  expect(tracker.sample([pose])).toBe(true);
});
it("bounds invalid and oversized palettes without changing source matrices", () => {
  const tracker = createTemporalSkinHistory();
  for (const values of [new Float32Array([NaN]), new Float32Array(4097)])
    expect(tracker.sample([{ id: "rig", values }])).toBe(true);
  expect(
    tracker.sample(
      Array.from({ length: 129 }, (_, i) => ({
        id: String(i),
        values: new Float32Array([1]),
      })),
    ),
  ).toBe(true);
});
