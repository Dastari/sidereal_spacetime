import { afterEach, expect, it, vi } from "vitest";
import { createMovementControl } from "./movement-control";
afterEach(() => vi.useRealTimers());
function setup(claim = vi.fn(async (_c: object) => {})) {
  const release = vi.fn(async (_c: object) => {}),
    onError = vi.fn();
  return {
    claim,
    release,
    onError,
    c: createMovementControl({ claim, release, onError }),
  };
}
it("requires an accepted claim before sending and uses per-connection monotonic sequences", async () => {
  const f = setup(),
    a = {},
    b = {};
  f.c.activate(a);
  expect(f.c.canSend(a)).toBe(false);
  await f.c.settled();
  expect(f.c.canSend(a)).toBe(true);
  expect(f.c.nextSequence(a)).toBe(1n);
  f.c.activate(null);
  expect(f.c.canSend(a)).toBe(false);
  await f.c.settled();
  f.c.activate(a);
  await f.c.settled();
  expect(f.c.nextSequence(a)).toBe(2n);
  f.c.activate(b);
  await f.c.settled();
  expect(f.c.nextSequence(b)).toBe(1n);
  expect(f.release).toHaveBeenCalledWith(a);
});
it("serializes rapid blur/focus around a pending claim and releases on disposal", async () => {
  let finish!: () => void;
  const f = setup(
      vi.fn(
        () =>
          new Promise<void>((r) => {
            finish = r;
          }),
      ),
    ),
    a = {};
  f.c.activate(a);
  await Promise.resolve();
  f.c.activate(null);
  f.c.activate(a);
  finish();
  await f.c.settled();
  expect(f.c.canSend(a)).toBe(true);
  expect(f.claim).toHaveBeenCalledOnce();
  expect(f.release).not.toHaveBeenCalled();
  f.c.dispose();
  expect(f.c.canSend(a)).toBe(false);
  await f.c.settled();
  expect(f.release).toHaveBeenCalledOnce();
});
it("never enables input when a claim finishes after blur", async () => {
  let finish!: () => void;
  const f = setup(
      vi.fn(
        () =>
          new Promise<void>((r) => {
            finish = r;
          }),
      ),
    ),
    a = {};
  f.c.activate(a);
  await Promise.resolve();
  f.c.activate(null);
  finish();
  await f.c.settled();
  expect(f.c.canSend(a)).toBe(false);
  expect(f.release).toHaveBeenCalledWith(a);
});
it("allows retry after a denied claim without sending intent", async () => {
  vi.useFakeTimers();
  const f = setup(
      vi.fn(async () => {
        throw Error("Denied");
      }),
    ),
    a = {};
  f.c.activate(a);
  await f.c.settled();
  expect(f.c.canSend(a)).toBe(false);
  expect(f.onError).toHaveBeenCalledOnce();
  f.c.activate(a);
  await f.c.settled();
  expect(f.claim).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(1000);
  f.c.activate(a);
  await f.c.settled();
  expect(f.claim).toHaveBeenCalledTimes(2);
});
