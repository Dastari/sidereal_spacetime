import { describe, it, expect } from "vitest";
import { createPlanetRotationClock, planetAxialAngle } from "./planet-rotation";
describe("render-only planet axial rotation", () => {
  it("has equal phase across frame rates including very slow renderers", () => {
    const phases = [2, 30, 60, 144].map((fps) => {
      const clock = createPlanetRotationClock();
      let age = 0;
      for (let i = 0; i <= fps * 20; i++)
        age = clock.step((i * 1000) / fps, false);
      return planetAxialAngle(131, age);
    });
    for (const phase of phases) expect(phase).toBeCloseTo(phases[0], 10);
    expect(phases[0]).not.toBe(0);
  });
  it("freezes reduced motion or hidden/disabled time without a resume jump", () => {
    const c = createPlanetRotationClock();
    c.step(0, false);
    expect(c.step(1000, false)).toBe(1);
    expect(c.step(2000, true)).toBe(1);
    expect(c.step(60000, true)).toBe(1);
    expect(c.step(90000, false)).toBe(1);
    expect(c.step(91000, false)).toBe(2);
  });
  it("repeats seed phase after rebuild and remains bounded without angle accumulation", () => {
    expect(planetAxialAngle(131, 90)).toBe(planetAxialAngle(131, 90));
    expect(planetAxialAngle(131, 90)).not.toBe(planetAxialAngle(9187, 90));
    for (const t of [0, 1, 1000, 1e10, NaN]) {
      expect(planetAxialAngle(131, t)).toBeGreaterThanOrEqual(0);
      expect(planetAxialAngle(131, t)).toBeLessThan(Math.PI * 2);
    }
  });
});
