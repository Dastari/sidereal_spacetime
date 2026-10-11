import { expect, test, vi } from "vitest";
import { createVesselLifecycle } from "./vessel-lifecycle";
test("revocation clears the occupied assembly immediately and discards a late import", async () => {
  let finish!: (value: string) => void;
  const clear = vi.fn(),
    cancel = vi.fn(),
    install = vi.fn(),
    discard = vi.fn();
  const lifecycle = createVesselLifecycle({
    initialKey: "deck",
    clear,
    prepare: () => ({
      cancel,
      ready: new Promise<string>((r) => (finish = r)),
    }),
    install,
    discard,
  });
  const loading = lifecycle.replace("another-deck", true);
  expect(clear).toHaveBeenCalledTimes(1);
  await lifecycle.replace("outside");
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(clear).toHaveBeenCalledTimes(2);
  finish("revoked-private-mesh");
  expect(await loading).toBe(false);
  expect(install).not.toHaveBeenCalled();
  expect(discard).toHaveBeenCalledWith("revoked-private-mesh");
  await lifecycle.replace("outside");
  expect(clear).toHaveBeenCalledTimes(2);
  lifecycle.dispose();
  lifecycle.dispose();
  expect(clear).toHaveBeenCalledTimes(3);
});
test("same-context updates reuse assembly, failed loads can retry, and disposal rejects replacements", async () => {
  const prepare = vi
    .fn()
    .mockReturnValueOnce({
      cancel: vi.fn(),
      ready: Promise.reject(Error("load")),
    })
    .mockReturnValue({ cancel: vi.fn(), ready: Promise.resolve("deck") });
  const install = vi.fn();
  const lifecycle = createVesselLifecycle({
    initialKey: "outside",
    clear: vi.fn(),
    prepare,
    install,
    discard: vi.fn(),
  });
  await expect(lifecycle.replace("deck", {})).rejects.toThrow("load");
  expect(await lifecycle.replace("deck", {})).toBe(true);
  expect(await lifecycle.replace("deck", {})).toBe(true);
  expect(prepare).toHaveBeenCalledTimes(2);
  expect(install).toHaveBeenCalledTimes(1);
  lifecycle.dispose();
  expect(await lifecycle.replace("new", {})).toBe(false);
});
