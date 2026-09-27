import { expect, test } from "vitest";
import {
  toAstronomicalKm,
  fromAstronomicalKm,
  formatAstronomicalDistance,
  formatAstronomicalSpeed,
  REFERENCE_FLIGHT_SPEED,
} from "./astronomical-units";
test("one fixed conversion applies to celestial sizes, distances and speeds", () => {
  expect(formatAstronomicalDistance(20)).toBe("2,000 km");
  expect(formatAstronomicalSpeed(REFERENCE_FLIGHT_SPEED)).toBe("3,000 km/s");
  expect(toAstronomicalKm(900) / toAstronomicalKm(REFERENCE_FLIGHT_SPEED)).toBe(
    30,
  );
  expect(fromAstronomicalKm(toAstronomicalKm(-123.456789))).toBeCloseTo(
    -123.456789,
    10,
  );
});
test.each([
  [0, "0 m"],
  [0.00002, "2 m"],
  [1, "100 km"],
  [15000000, "1.5 billion km"],
  [-1250, "-125,000 km"],
  [Infinity, "Unavailable"],
])("formats astronomical coordinate %s", (value, text) => {
  expect(formatAstronomicalDistance(value as number)).toBe(text);
});
