import { expect, test, vi } from "vitest";
import { waitForLiveMap } from "./live-map-save";
test("waits for delayed authoritative state and returns canonical values", async () => {
  let row = { revision: 4n, name: "old" };
  let notify = () => {};
  const cleanup = vi.fn();
  let settled = false;
  const saved = waitForLiveMap(
    () => row,
    (inspect) => {
      notify = inspect;
      return cleanup;
    },
    4n,
  ).then((value) => {
    settled = true;
    return value;
  });
  notify();
  await Promise.resolve();
  expect(settled).toBe(false);
  row = { revision: 5n, name: "server canonical" };
  notify();
  expect(await saved).toEqual(row);
  expect(cleanup).toHaveBeenCalledOnce();
});
test("accepts already updated cache and cleans up a timed-out confirmation", async () => {
  const cleanup = vi.fn();
  expect(
    await waitForLiveMap(
      () => ({ revision: 2n }),
      () => cleanup,
      1n,
    ),
  ).toEqual({ revision: 2n });
  await expect(
    waitForLiveMap(
      () => undefined,
      () => cleanup,
      1n,
      1,
    ),
  ).rejects.toThrow("Retry Save");
  expect(cleanup).toHaveBeenCalledTimes(2);
});
