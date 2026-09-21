import { expect, test } from "vitest";
import { newMapZone } from "@sidereal/content/zones";
import { newSystemMap } from "@sidereal/content/system-map";
import {
  moveMapSelection,
  duplicateMapSelection,
  deleteMapSelection,
} from "./map-commands";
test("selected ancestor and child move once, including inspector elevation", () => {
  const d = newSystemMap("system");
  d.zones = [
    newMapZone("parent"),
    { ...newMapZone("child", 10, 20), parentId: "parent" },
  ];
  moveMapSelection(d, ["parent", "child"], 1, 2, 3);
  expect(d.zones[1]).toMatchObject({ x: 11, y: 22, height: 3 });
});
test("subtree copy remaps placed IDs and delete preserves unrelated zones", () => {
  const d = newSystemMap("system");
  d.zones = [
    newMapZone("parent"),
    { ...newMapZone("child", 10, 20), parentId: "parent" },
    newMapZone("other"),
  ];
  let n = 0;
  expect(duplicateMapSelection(d, ["parent"], () => `copy-${++n}`)).toEqual([
    "copy-1",
    "copy-2",
  ]);
  expect(d.zones[4].parentId).toBe("copy-1");
  deleteMapSelection(d, ["parent"]);
  expect(d.zones.map((z) => z.id)).toEqual(["other", "copy-1", "copy-2"]);
});
