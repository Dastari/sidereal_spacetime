import { expect, it } from "vitest";
import { stellarEruptionState } from "./stellar-eruption";
it("leaves long quiet intervals between two distinct six-second eruptions", () => {
  for (const time of [0, 3.99, 10, 16, 21.99, 28, 30])
    expect(stellarEruptionState(time).strength).toBe(0);
  expect(stellarEruptionState(7).strength).toBeCloseTo(1);
  expect(stellarEruptionState(25).strength).toBeCloseTo(1);
  expect(stellarEruptionState(7).angle).not.toBe(
    stellarEruptionState(25).angle,
  );
  expect(stellarEruptionState(4.001).strength).toBeLessThan(1e-6);
  expect(stellarEruptionState(9.999).strength).toBeLessThan(1e-6);
});
