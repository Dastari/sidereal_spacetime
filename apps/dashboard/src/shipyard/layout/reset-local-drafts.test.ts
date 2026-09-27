import { expect, it } from "vitest";
import { resetLegacyLocalDrafts } from "./reset-local-drafts";
it("resets only the active profile's old drafts once and preserves subsequent work", () => {
  const entries = new Map([
    ["sidereal.layout.recovery.v1:owner:d:local", "old"],
    ["sidereal.layout.active.v1:owner", "old"],
    ["sidereal.assembly.draft.v1", "old"],
    ["sidereal.layout.recovery.v1:someone-else:d:local", "keep"],
    ["sidereal.layout.hull-catalogue.v1:owner", "keep"],
    ["oidc.user:provider", "keep"],
    ["sidereal.inventory", "keep"],
  ]);
  const storage = {
    get length() {
      return entries.size;
    },
    key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (k: string) => entries.get(k) ?? null,
    setItem: (k: string, v: string) => {
      entries.set(k, v);
    },
    removeItem: (k: string) => {
      entries.delete(k);
    },
  } as Storage;
  resetLegacyLocalDrafts(storage, "owner");
  expect([...entries.values()].filter((v) => v === "keep")).toHaveLength(4);
  expect([...entries.values()]).not.toContain("old");
  storage.setItem("sidereal.layout.recovery.v1:owner:new:local", "new");
  resetLegacyLocalDrafts(storage, "owner");
  expect(storage.getItem("sidereal.layout.recovery.v1:owner:new:local")).toBe(
    "new",
  );
});
