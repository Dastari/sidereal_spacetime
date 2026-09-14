import { expect, it, vi } from "vitest";
import { createPlanetBuildScheduler } from "./planet-build-scheduler";
it("admits one upload continuation per frame across competing bodies and releases cancellation", async () => {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    callbacks.push(cb);
    return callbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const scheduler = createPlanetBuildScheduler(),
    done: number[] = [];
  const a = scheduler.next().then(() => done.push(1)),
    b = scheduler.next().then(() => done.push(2));
  expect(callbacks.length).toBe(1);
  callbacks.shift()!(0);
  await a;
  expect(done).toEqual([1]);
  expect(callbacks.length).toBe(1);
  callbacks.shift()!(16);
  await b;
  expect(done).toEqual([1, 2]);
  const c = scheduler.next();
  scheduler.dispose();
  await c;
  vi.unstubAllGlobals();
});
