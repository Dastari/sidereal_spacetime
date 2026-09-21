import { expect, test, vi } from "vitest";
import { backgroundRenderer } from "./background-renderer";
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
test("continuous navigation paints completed frames and bounds pending work to the latest view", async () => {
  const send = vi.fn(),
    paint = vi.fn();
  const render = backgroundRenderer(async (n: number) => n, send, paint);
  render.update(1);
  await flush();
  for (let i = 2; i <= 80; i++) render.update(i);
  expect(send.mock.calls).toEqual([[1]]);
  expect(paint).not.toHaveBeenCalled();
  const pixels = new Uint8ClampedArray([2, 5, 12, 255]);
  render.complete(pixels);
  await flush();
  expect(paint.mock.calls).toEqual([[1, pixels]]);
  expect(send.mock.calls).toEqual([[1], [80]]);
  render.complete(pixels);
  expect(paint.mock.calls[1]).toEqual([80, pixels]);
});
test("views superseded during image loading are skipped and disposed work cannot paint", async () => {
  let ready!: (value: number) => void;
  const send = vi.fn(),
    paint = vi.fn();
  const render = backgroundRenderer(
    (n: number) =>
      n === 1
        ? new Promise<number>((r) => {
            ready = r;
          })
        : Promise.resolve(n),
    send,
    paint,
  );
  render.update(1);
  render.update(2);
  render.update(3);
  ready(1);
  await flush();
  expect(send.mock.calls).toEqual([[3]]);
  render.dispose();
  render.complete(new Uint8ClampedArray());
  render.update(4);
  expect(paint).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(1);
});
test("failed preparation retains the displayed frame and permits the next update", async () => {
  const send = vi.fn(),
    paint = vi.fn();
  const render = backgroundRenderer(
    async (n: number) => {
      if (n === 1) throw Error("invalid draft");
      return n;
    },
    send,
    paint,
  );
  render.update(1);
  await flush();
  render.update(2);
  await flush();
  expect(send.mock.calls).toEqual([[2]]);
  expect(paint).not.toHaveBeenCalled();
});
