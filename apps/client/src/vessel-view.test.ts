import { expect, test } from "vitest";
import {
  awaitingDeckPresentation,
  createDeckViewRestoration,
} from "./vessel-view";
test("requests deck before graphics install, so the first ready frame has its final view", () => {
  const restore = createDeckViewRestoration();
  expect(restore(undefined)).toBe(false);
  expect(restore("entry")).toBe(true);
  expect(restore("new-entry")).toBeUndefined();
  expect(restore("new-entry")).toBeUndefined();
});
test("holds actor framing when EVA clears before admission/install, and releases only for ready deck or no ship", () => {
  const before = {
    connected: true,
    shipId: "ship",
    hasEva: true,
    interiorReady: false,
  };
  expect(awaitingDeckPresentation(before)).toBe(false);
  const projectionGap = { ...before, hasEva: false };
  expect(awaitingDeckPresentation(projectionGap)).toBe(true);
  expect(
    awaitingDeckPresentation({ ...projectionGap, interiorReady: true }),
  ).toBe(false);
  expect(awaitingDeckPresentation({ ...projectionGap, connected: false })).toBe(
    false,
  );
  expect(awaitingDeckPresentation({ ...projectionGap, shipId: "" })).toBe(
    false,
  );
});
test("preserves flight preference across an aboard document rebuild but restores on re-entry", () => {
  const restore = createDeckViewRestoration();
  expect(restore("visit")).toBe(true);
  expect(restore("edit")).toBeUndefined();
  expect(restore("edit")).toBeUndefined();
  expect(restore(undefined)).toBe(false);
  expect(restore("return")).toBe(true);
  expect(restore("return")).toBeUndefined();
});
test("revoked pending entry cannot restore a later exterior assembly", () => {
  const restore = createDeckViewRestoration();
  expect(restore("entry")).toBe(true);
  expect(restore(undefined)).toBe(false);
  expect(restore(undefined)).toBe(false);
});
