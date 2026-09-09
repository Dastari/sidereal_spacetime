import { expect, it, vi } from "vitest";
import {
  createConnectionResources,
  subscriptionErrorMessage,
} from "./connection-resources";
const handle = (active = true, ended = false) => ({
  isActive: () => active,
  isEnded: () => ended,
  unsubscribe: vi.fn(),
});
it("releases replaced queries and removes cache listeners exactly once", () => {
  const r = createConnectionResources(),
    a = handle(),
    b = handle(),
    remove = vi.fn();
  r.retain("world", a);
  r.retain("world", a);
  r.listen(remove);
  expect(a.unsubscribe).not.toHaveBeenCalled();
  r.retain("world", b);
  expect(a.unsubscribe).toHaveBeenCalledOnce();
  r.dispose();
  r.dispose();
  expect(b.unsubscribe).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
});
it("supports explicit scope removal and skips already failed or pending handles on socket cleanup", () => {
  const r = createConnectionResources(),
    a = handle(),
    pending = handle(false),
    failed = handle(false, true);
  r.retain("nearby", a);
  r.remove("nearby");
  r.retain("pending", pending);
  r.retain("failed", failed);
  r.dispose();
  expect(a.unsubscribe).toHaveBeenCalledOnce();
  expect(pending.unsubscribe).not.toHaveBeenCalled();
  expect(failed.unsubscribe).not.toHaveBeenCalled();
});
it("cleans up resources received after disposal", () => {
  const r = createConnectionResources(),
    a = handle(),
    remove = vi.fn();
  r.dispose();
  r.retain("late", a);
  r.listen(remove);
  expect(a.unsubscribe).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
});
it("uses the installed SDK error event and handles absent messages", () => {
  expect(subscriptionErrorMessage({ event: new Error("Query denied") })).toBe(
    "Query denied",
  );
  expect(subscriptionErrorMessage({ event: "Lost subscription" })).toBe(
    "Lost subscription",
  );
  expect(subscriptionErrorMessage({})).not.toBe("undefined");
});

it("unsubscribes a retired pending query when it eventually applies", () => {
  const r = createConnectionResources();
  let active = false;
  const a = {
    isActive: () => active,
    isEnded: () => false,
    unsubscribe: vi.fn(),
  };
  r.retain("nearby", a);
  r.remove("nearby");
  expect(a.unsubscribe).not.toHaveBeenCalled();
  active = true;
  expect(r.applied(a)).toBe(false);
  expect(a.unsubscribe).toHaveBeenCalledOnce();
  r.dispose();
  expect(a.unsubscribe).toHaveBeenCalledOnce();
});
