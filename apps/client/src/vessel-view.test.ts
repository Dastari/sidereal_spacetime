import { expect, test } from "vitest";
import { createDeckViewRestoration } from "./vessel-view";
test("waits for the current accepted assembly and restores once on entry", () => {
  const restore = createDeckViewRestoration();
  expect(restore(undefined, "old")).toBe(false);
  expect(restore("entry", undefined)).toBeUndefined();
  expect(restore("new-entry", "entry")).toBeUndefined();
  expect(restore("new-entry", "new-entry")).toBe(true);
  expect(restore("new-entry", "new-entry")).toBeUndefined();
});
test("preserves flight preference across an aboard document rebuild but restores on re-entry", () => {
  const restore = createDeckViewRestoration();
  expect(restore("visit", "visit")).toBe(true);
  expect(restore("edit", "visit")).toBeUndefined();
  expect(restore("edit", "edit")).toBeUndefined();
  expect(restore(undefined, "edit")).toBe(false);
  expect(restore("return", undefined)).toBeUndefined();
  expect(restore("return", "return")).toBe(true);
});
test("revoked pending entry cannot restore a later exterior assembly", () => {
  const restore = createDeckViewRestoration();
  expect(restore("entry", undefined)).toBeUndefined();
  expect(restore(undefined, undefined)).toBe(false);
  expect(restore(undefined, "entry")).toBe(false);
});
