import { expect, test } from "vitest";
import { createCruiseControl } from "./flight-controls";

test("cruise captures forward speed and manual thrust immediately cancels it", () => {
  const c = createCruiseControl();
  c.toggle("ship:seat:lease", 15, 30);
  expect(c.demand(0, "ship:seat:lease", false)).toBe(0.5);
  expect(c.demand(-1, "ship:seat:lease", false)).toBe(-1);
  expect(c.active).toBe(false);
  expect(c.demand(0, "ship:seat:lease", false)).toBe(0);
});
test.each([
  undefined,
  "other-ship:seat",
  "ship:other-seat",
  "ship:seat:new-lease",
])("cruise cannot survive control relationship loss: %s", (next) => {
  const c = createCruiseControl();
  c.toggle("ship:seat:lease", 0, 30);
  expect(c.demand(0, next, false)).toBe(0);
  expect(c.active).toBe(false);
  expect(c.demand(0, "ship:seat:lease", false)).toBe(0);
});
test("blocked controls cancel cruise without resuming it on focus return", () => {
  const c = createCruiseControl();
  c.toggle("helm", 0, 30);
  expect(c.demand(0, "helm", true)).toBe(0);
  expect(c.demand(0, "helm", false)).toBe(0);
  c.toggle(undefined, 0, 30);
  expect(c.active).toBe(false);
});
test("cruise stays inside existing speed intent limits and toggles off", () => {
  const c = createCruiseControl();
  c.toggle("helm", 90, 30);
  expect(c.throttle).toBe(1);
  c.toggle("helm", 90, 30);
  expect(c.active).toBe(false);
});
test.each([Infinity, NaN])(
  "non-finite speed cap %s cannot engage cruise",
  (maximum) => {
    const c = createCruiseControl();
    c.toggle("helm", 15, maximum);
    expect(c.active).toBe(false);
    expect(c.demand(0, "helm", false)).toBe(0);
  },
);
