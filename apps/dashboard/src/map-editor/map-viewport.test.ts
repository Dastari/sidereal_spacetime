import { describe, expect, it } from "vitest";
import {
  visibleCirclePath,
  diskVisible,
  showOrbit,
  hundredth,
} from "./map-viewport";
const view = { width: 1000, height: 600 };
describe("bounded map geometry", () => {
  it("omits enormous invisible boundaries and offscreen sprites", () => {
    expect(visibleCirclePath(500, 300, 1e10, view)).toBe("");
    expect(diskVisible(-1000, 300, 10, view)).toBe(false);
    expect(diskVisible(-10, 300, 30, view)).toBe(true);
  });
  it("clips a 100-million pixel orbit crossing the view to a bounded path", () => {
    const path = visibleCirclePath(500, -1e8 + 300, 1e8, view);
    expect(path).not.toBe("");
    const numbers = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    expect(numbers.length).toBeLessThan(600);
    for (let i = 0; i < numbers.length; i += 2) {
      expect(numbers[i]).toBeGreaterThanOrEqual(-2.01);
      expect(numbers[i]).toBeLessThanOrEqual(1002.01);
      expect(numbers[i + 1]).toBeGreaterThanOrEqual(-2.01);
      expect(numbers[i + 1]).toBeLessThanOrEqual(602.01);
    }
  });
  it("keeps local circles and delays moon guides", () => {
    expect(visibleCirclePath(500, 300, 100, view)).toContain("M");
    expect(showOrbit(25, false)).toBe(true);
    expect(showOrbit(25, true)).toBe(false);
    expect(showOrbit(50, true)).toBe(true);
    expect(hundredth(-23746989.214867294)).toBe(-23746989.21);
  });
});
