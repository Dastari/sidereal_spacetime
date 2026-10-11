import { expect, test, vi } from "vitest";
import {
  readSteeringStyle,
  saveSteeringStyle,
  STEERING_STORAGE_KEY,
} from "./control-settings";
test("one validated device steering setting survives re-entry and blocked storage", () => {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  expect(readSteeringStyle(storage)).toBe("cursor");
  saveSteeringStyle("keyboard", storage);
  expect(readSteeringStyle(storage)).toBe("keyboard");
  data.set(STEERING_STORAGE_KEY, "obsolete");
  expect(readSteeringStyle(storage)).toBe("cursor");
  const failed = {
    getItem: vi.fn(() => {
      throw Error("blocked");
    }),
    setItem: vi.fn(() => {
      throw Error("blocked");
    }),
  };
  expect(readSteeringStyle(failed)).toBe("cursor");
  expect(() => saveSteeringStyle("keyboard", failed)).not.toThrow();
});
