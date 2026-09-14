import { expect, it, vi } from "vitest";
import { createIntentTransmitter } from "./intent-transmitter";
import {
  solveFlight,
  pilotDesiredMotion,
} from "../../../packages/sim/src/ifcs";
import {
  LAB_FLIGHT_MASS,
  LAB_FLIGHT_ACTUATORS,
  LAB_FLIGHT_PROFILE,
} from "../../../packages/content/src/flight";
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
  const stalled = vi.fn();
  const tx = createIntentTransmitter({
    now: () => now,
    send,
    onError: error,
    onStalled: stalled,
  });
  return {
    tx,
    send,
    error,
    stalled,
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
  expect(f.tx.offer(a, walk)).toBe(true);
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
it("keeps held controls and releases flowing before earlier acknowledgements", async () => {
  const c = {},
    send = vi.fn(() => new Promise<void>(() => {})),
    f = setup(send);
  f.tx.offer(c, walk);
  await flush();
  f.at(100);
  expect(f.tx.offer(c, walk)).toBe(true);
  await flush();
  f.at(110);
  expect(f.tx.offer(c, idle)).toBe(true);
  await flush();
  expect(send).toHaveBeenLastCalledWith(c, idle);
  f.at(200);
  f.tx.offer(c, walk);
  f.tx.dispose();
  await flush();
  expect(send).toHaveBeenCalledTimes(3);
});

it("bounds stalled requests and asks for a replacement socket once", async () => {
  const c = {},
    send = vi.fn(() => new Promise<void>(() => {})),
    f = setup(send);
  for (let n = 0; n < 40; n++) {
    f.at(n * 100);
    f.tx.offer(c, idle, true);
    await flush();
  }
  expect(send).toHaveBeenCalledTimes(32);
  expect(f.stalled).toHaveBeenCalledExactlyOnceWith(c);
  expect(f.tx.offer({}, idle, true)).toBe(true);
  await flush();
  expect(send).toHaveBeenCalledTimes(33);
});

it("keeps IFCS enabled through released-input braking, even with delayed ACKs", async () => {
  let now = 0,
    lastInput = -Infinity;
  const c = {},
    intent = { ...idle, throttle: 1 };
  const tx = createIntentTransmitter({
    now: () => now,
    send: async () => {
      lastInput = now;
      // The server accepts input immediately; the response can be delayed.
      await new Promise<void>(() => {});
    },
    onError: vi.fn(),
    onStalled: vi.fn(),
  });
  let motion = { x: 0, y: 0, vx: 0, vy: 10, heading: 0, omega: 0 };
  for (now = 0; now <= 2200; now += 50) {
    tx.offer(c, now < 200 ? intent : idle, true);
    await flush();
    expect(now - lastInput).toBeLessThan(300);
    if (now >= 200) {
      const before = motion.vy;
      for (let step = 0; step < 3; step++) {
        motion = solveFlight(
          motion,
          pilotDesiredMotion(motion, idle, 30, 12, 0.65),
          LAB_FLIGHT_MASS,
          LAB_FLIGHT_ACTUATORS,
          now - lastInput < 300,
          LAB_FLIGHT_PROFILE,
        ).motion;
      }
      expect(motion.vy).toBeLessThan(before);
    }
  }
  tx.dispose();
});

it("ignores an older failure after newer input has been accepted", async () => {
  let reject!: (e: unknown) => void;
  const send = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<void>((_, r) => {
          reject = r;
        }),
    )
    .mockResolvedValue(undefined);
  const f = setup(send),
    c = {};
  f.tx.offer(c, walk);
  await flush();
  f.at(100);
  f.tx.offer(c, idle, true);
  await flush();
  reject(Error("old request"));
  await flush();
  expect(f.error).not.toHaveBeenCalled();
  f.at(200);
  expect(f.tx.offer(c, idle, true)).toBe(true);
});
