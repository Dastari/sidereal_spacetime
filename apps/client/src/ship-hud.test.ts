import { expect, test } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabComponentDefinition } from "@sidereal/sim/prefab-deck-objects";
import { shipComponentIntegrity } from "./ship-hud";
const prefab = {
  doc: PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!,
  catalog: defaultPrefabComponentCatalog(),
};
test("sparse damage overlays the complete pinned component capacity", () => {
  const pristine = shipComponentIntegrity("own", true, prefab, [])!;
  expect(pristine.hp).toBe(pristine.maxHp);
  expect(pristine.count).toBe(prefab.doc.mounts.length);
  const mount = prefab.doc.mounts[0];
  const maximum = prefabComponentDefinition(
    mount.component,
    prefab.catalog.revision,
  )!.integrity.hp;
  const row = {
    shipId: "own",
    objectId: "mount:" + mount.id,
    componentId: mount.component,
    hp: maximum / 2,
    maxHp: maximum,
  };
  const damaged = shipComponentIntegrity("own", true, prefab, [row])!;
  expect(damaged.maxHp).toBe(pristine.maxHp);
  expect(damaged.hp).toBe(pristine.hp - maximum / 2);
  expect(damaged.damaged).toBe(1);
  expect(
    shipComponentIntegrity("own", true, prefab, [{ ...row, shipId: "other" }]),
  ).toEqual(pristine);
});
test("passengers and missing/stale definitions never imply pristine ship health", () => {
  expect(shipComponentIntegrity("own", false, prefab, [])).toBeUndefined();
  expect(shipComponentIntegrity("own", true, undefined, [])).toBeUndefined();
  const mount = prefab.doc.mounts[0];
  expect(
    shipComponentIntegrity("own", true, prefab, [
      {
        shipId: "own",
        objectId: "mount:" + mount.id,
        componentId: "wrong-pin",
        hp: 10,
        maxHp: 20,
      },
    ]),
  ).toBeUndefined();
});
