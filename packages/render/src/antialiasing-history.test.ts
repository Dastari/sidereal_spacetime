import { describe, expect, it } from "vitest";
import {
  invalidatesTemporalHistory,
  type TemporalSceneState,
} from "./antialiasing-history";

const base: TemporalSceneState = {
  x: 0,
  y: 0,
  localX: 0,
  localY: 0,
  interior: true,
  inspect: false,
};
describe("temporal history discontinuities", () => {
  it("retains history during walking and fast continuous ship travel", () => {
    expect(invalidatesTemporalHistory(base, { ...base, localY: 0.5 }, 50)).toBe(
      false,
    );
    expect(
      invalidatesTemporalHistory(
        { ...base, vx: 2000 },
        { ...base, x: 100, vx: 2000 },
        50,
      ),
    ).toBe(false);
  });
  it("rejects ship and deck teleports", () => {
    expect(invalidatesTemporalHistory(base, { ...base, x: 500 }, 50)).toBe(
      true,
    );
    expect(invalidatesTemporalHistory(base, { ...base, localY: 10 }, 50)).toBe(
      true,
    );
  });
  it("rejects view, deck, seat and observed world changes", () => {
    for (const patch of [
      { interior: false },
      { inspect: true },
      { constructionDeckId: "upper" },
      { seated: true },
      { vistaId: "ice" },
    ])
      expect(invalidatesTemporalHistory(base, { ...base, ...patch }, 50)).toBe(
        true,
      );
  });
  it("rejects a resumed stale stream even at the same position", () => {
    expect(invalidatesTemporalHistory(base, base, 1500)).toBe(true);
  });
});
