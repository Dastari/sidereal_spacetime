import { expect, it } from "vitest";
import { snapLayoutPoint } from "./layout-placement-grid";
it("snaps horizontal native placement without burying its independent deck datum", () => {
  expect(snapLayoutPoint([-4.6875, -6, 0.1875], 1)).toEqual([-5, -6, 0.1875]);
  expect(snapLayoutPoint([0.1, 0.3, 3.1875], 0.5)).toEqual([0, 0.5, 3.1875]);
});
it("does not rewrite an imported input and rejects invalid grid proposals", () => {
  const source = [-4.6875, -6, 0.1875] as const;
  snapLayoutPoint(source, 2);
  expect(source).toEqual([-4.6875, -6, 0.1875]);
  expect(() => snapLayoutPoint(source, 0)).toThrow();
});
