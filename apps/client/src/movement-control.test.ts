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

it("claims a replacement after a forever-pending old release and bounds disposal cleanup", async () => {
  vi.useFakeTimers();
  const a = {},
    b = {},
    claim = vi.fn(async (_c: object) => {}),
    release = vi.fn((_c: object) => new Promise<void>(() => {}));
  const c = createMovementControl({ claim, release, onError: vi.fn() });
  c.activate(a);
  await c.settled();
  c.activate(b);
  await Promise.resolve();
  expect(c.canSend(a)).toBe(false);
  expect(c.canSend(b)).toBe(false);
  await vi.advanceTimersByTimeAsync(499);
  expect(claim).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  await c.settled();
  expect(claim).toHaveBeenLastCalledWith(b);
  expect(c.canSend(b)).toBe(true);
  c.dispose();
  expect(c.canSend(b)).toBe(false);
  await vi.advanceTimersByTimeAsync(500);
  await c.settled();
  expect(release).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});
it("handles synchronous release failure without poisoning future claims", async () => {
  const a = {},
    b = {},
    claim = vi.fn(async (_c: object) => {});
  const c = createMovementControl({
    claim,
    release: () => {
      throw Error("socket closed");
    },
    onError: vi.fn(),
  });
  c.activate(a);
  await c.settled();
  c.activate(b);
  await c.settled();
  expect(c.canSend(b)).toBe(true);
  c.dispose();
  await c.settled();
});
it("does not claim a replacement after disposal while waiting for old release", async () => {
  vi.useFakeTimers();
  const a = {},
    b = {},
    claim = vi.fn(async (_c: object) => {});
  const c = createMovementControl({
    claim,
    release: () => new Promise<void>(() => {}),
    onError: vi.fn(),
  });
  c.activate(a);
  await c.settled();
  c.activate(b);
  await Promise.resolve();
  c.dispose();
  await vi.advanceTimersByTimeAsync(500);
  await c.settled();
  expect(claim).toHaveBeenCalledTimes(1);
  expect(c.canSend(b)).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
it("orders same-connection release before reclaim without resetting its sequence", async () => {
  vi.useFakeTimers();
  const a = {},
    events: string[] = [];
  let acknowledge!: () => void;
  const c = createMovementControl({
    claim: async () => {
      events.push("claim");
    },
    release: () => {
      events.push("release");
      return new Promise<void>((r) => {
        acknowledge = r;
      });
    },
    onError: vi.fn(),
  });
  c.activate(a);
  await c.settled();
  expect(c.nextSequence(a)).toBe(1n);
  c.activate(null);
  await Promise.resolve();
  c.activate(a);
  await vi.advanceTimersByTimeAsync(500);
  await c.settled();
  expect(events).toEqual(["claim", "release", "claim"]);
  expect(c.nextSequence(a)).toBe(2n);
  acknowledge();
  await Promise.resolve();
  expect(c.canSend(a)).toBe(true);
  c.dispose();
  await vi.advanceTimersByTimeAsync(500);
  await c.settled();
});

it("replaces a socket whose claim acknowledgement never arrives", async () => {
  vi.useFakeTimers();
  const a = {},
    b = {},
    release = vi.fn(async (_c: object) => {}),
    error = vi.fn();
  let late!: () => void;
  const claim = vi.fn((target: object) =>
    target === a
      ? new Promise<void>((r) => {
          late = r;
        })
      : Promise.resolve(),
  );
  const c = createMovementControl({ claim, release, onError: error });
  c.activate(a);
  await Promise.resolve();
  c.activate(b);
  await vi.advanceTimersByTimeAsync(1499);
  expect(c.canSend(b)).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await c.settled();
  expect(release).toHaveBeenCalledWith(a);
  expect(claim).toHaveBeenLastCalledWith(b);
  expect(c.canSend(b)).toBe(true);
  expect(error).not.toHaveBeenCalled();
  late();
  await Promise.resolve();
  expect(c.canSend(a)).toBe(false);
  expect(c.canSend(b)).toBe(true);
  c.dispose();
  await c.settled();
  expect(vi.getTimerCount()).toBe(0);
});
it("bounds disposal during a never-acknowledged claim and ignores its late success", async () => {
  vi.useFakeTimers();
  const a = {},
    release = vi.fn(async (_c: object) => {}),
    error = vi.fn();
  let late!: () => void;
  const c = createMovementControl({
    claim: () =>
      new Promise<void>((r) => {
        late = r;
      }),
    release,
    onError: error,
  });
  c.activate(a);
  await Promise.resolve();
  c.dispose();
  await vi.advanceTimersByTimeAsync(1500);
  await c.settled();
  expect(release).toHaveBeenCalledWith(a);
  expect(c.canSend(a)).toBe(false);
  expect(error).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  late();
  await Promise.resolve();
  expect(c.canSend(a)).toBe(false);
});
it("cleans up an uncertain timed-out same-socket claim before allowing retry", async () => {
  vi.useFakeTimers();
  const a = {},
    events: string[] = [],
    error = vi.fn();
  let calls = 0;
  const c = createMovementControl({
    claim: () => {
      events.push("claim");
      return ++calls === 1 ? new Promise<void>(() => {}) : Promise.resolve();
    },
    release: async () => {
      events.push("release");
    },
    onError: error,
  });
  c.activate(a);
  await vi.advanceTimersByTimeAsync(1500);
  await c.settled();
  expect(events).toEqual(["claim", "release"]);
  expect(error).toHaveBeenCalledOnce();
  expect(c.canSend(a)).toBe(false);
  await vi.advanceTimersByTimeAsync(1000);
  c.activate(a);
  await c.settled();
  expect(events).toEqual(["claim", "release", "claim"]);
  expect(c.canSend(a)).toBe(true);
  c.dispose();
  await c.settled();
});
