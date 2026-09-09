import { expect, it, vi } from "vitest";
import { createIntentTransmitter } from "./intent-transmitter";
const idle = { throttle: 0, turn: 0, dx: 0, dy: 0, sprint: false };
const walk = { ...idle, dx: 1 };
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
function setup(send = vi.fn(async (_target: object) => {})) {
  let now = 0;
  const error = vi.fn();
  const tx = createIntentTransmitter({ now: () => now, send, onError: error });
  return {
    tx,
    send,
    error,
    at: (n: number) => {
      now = n;
    },
  };
}
it("reduces idle traffic to a 1s heartbeat while sending changes immediately", async () => {
  const f = setup(),
    c = {};
  f.tx.offer(c, idle);
  await flush();
  for (let i = 50; i < 1000; i += 50) {
    f.at(i);
    expect(f.tx.offer(c, idle)).toBe(false);
  }
  f.at(1000);
  expect(f.tx.offer(c, idle)).toBe(true);
  await flush();
  f.at(1010);
  expect(f.tx.offer(c, walk)).toBe(true);
  await flush();
  f.at(1020);
  expect(f.tx.offer(c, idle)).toBe(true);
  await flush();
  expect(f.send).toHaveBeenCalledTimes(4);
});
it("keeps moving commands fresh well inside the 300ms server expiry", async () => {
  const f = setup(),
    c = {};
  f.tx.offer(c, walk);
  await flush();
  f.at(50);
  expect(f.tx.offer(c, walk)).toBe(false);
  f.at(100);
  expect(f.tx.offer(c, walk)).toBe(true);
  await flush();
  expect(f.send).toHaveBeenCalledTimes(2);
});
it("sends a fresh snapshot for a replacement socket and bounds in-flight work", async () => {
  let complete!: () => void;
  const f = setup(
      vi.fn(
        () =>
          new Promise<void>((r) => {
            complete = r;
          }),
      ),
    ),
    a = {},
    b = {};
  f.tx.offer(a, idle);
  await flush();
  f.at(999);
  expect(f.tx.offer(a, walk)).toBe(false);
  complete();
  await flush();
  expect(f.tx.offer(b, idle)).toBe(true);
  await flush();
  expect(f.send).toHaveBeenLastCalledWith(b, idle);
  complete();
  await flush();
});
it("backs off reducer errors and does not report late disposed failures", async () => {
  const f = setup(
      vi.fn(async () => {
        throw new Error("denied");
      }),
    ),
    c = {};
  f.tx.offer(c, walk);
  await flush();
  expect(f.error).toHaveBeenCalledOnce();
  f.at(50);
  expect(f.tx.offer(c, walk)).toBe(false);
  f.at(1000);
  expect(f.tx.offer(c, walk)).toBe(true);
  f.tx.dispose();
  await flush();
  expect(f.error).toHaveBeenCalledOnce();
  expect(f.tx.offer(c, idle)).toBe(false);
});

it("replaces an old socket with an indefinitely pending send and ignores its late rejection", async () => {
  const a = {},
    b = {};
  let rejectOld!: (error: unknown) => void;
  const send = vi.fn((target: object) =>
    target === a
      ? new Promise<void>((_, reject) => {
          rejectOld = reject;
        })
      : Promise.resolve(),
  );
  const f = setup(send);
  expect(f.tx.offer(a, walk)).toBe(true);
  await flush();
  expect(f.tx.offer(b, idle)).toBe(true);
  await flush();
  expect(send).toHaveBeenLastCalledWith(b, idle);
  rejectOld(Error("old socket closed"));
  await flush();
  expect(f.error).not.toHaveBeenCalled();
  f.at(100);
  expect(f.tx.offer(b, walk)).toBe(true);
  await flush();
  expect(send).toHaveBeenCalledTimes(3);
  f.tx.dispose();
});
it("bounds an unacknowledged same-socket send and suppresses deferred work after disposal", async () => {
  const c = {},
    send = vi.fn(() => new Promise<void>(() => {})),
    f = setup(send);
  expect(f.tx.offer(c, walk)).toBe(true);
  await flush();
  f.at(999);
  expect(f.tx.offer(c, idle)).toBe(false);
  f.at(1000);
  expect(f.tx.offer(c, idle)).toBe(true);
  await flush();
  expect(send).toHaveBeenCalledTimes(2);
  f.at(2000);
  expect(f.tx.offer(c, walk)).toBe(true);
  f.tx.dispose();
  await flush();
  expect(send).toHaveBeenCalledTimes(2);
});
