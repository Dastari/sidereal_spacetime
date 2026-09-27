import { reparentMapObject } from "./map-commands";
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

test("body parenting preserves transforms/descendants and rejects cycles or stars", () => {
  const d = newSystemMap("system");
  d.bodies = [
    {
      id: "star",
      name: "Star",
      kind: "star",
      x: 0,
      y: 0,
      height: 0,
      radius: 1,
    },
    {
      id: "planet",
      name: "Planet",
      kind: "planet",
      x: 100,
      y: 200,
      height: -20,
      radius: 1,
      parentId: "star",
    },
    {
      id: "other",
      name: "Other",
      kind: "planet",
      x: 300,
      y: 200,
      height: -30,
      radius: 1,
      parentId: "star",
    },
    {
      id: "moon",
      name: "Moon",
      kind: "moon",
      x: 110,
      y: 210,
      height: -20,
      radius: 1,
      parentId: "planet",
    },
  ];
  const positions = d.bodies.map(({ id, x, y, height, radius }) => ({
    id,
    x,
    y,
    height,
    radius,
  }));
  reparentMapObject(d, "moon", "other");
  expect(d.bodies[3].parentId).toBe("other");
  expect(
    d.bodies.map(({ id, x, y, height, radius }) => ({
      id,
      x,
      y,
      height,
      radius,
    })),
  ).toEqual(positions);
  expect(() => reparentMapObject(d, "moon", "star")).toThrow();
  expect(() => reparentMapObject(d, "star", "planet")).toThrow();
  expect(() => reparentMapObject(d, "other", "moon")).toThrow();
  // Live catalog rows encode moons as planets with a planet parent.
  d.bodies[3].kind = "planet";
  expect(() => reparentMapObject(d, "moon", "star")).toThrow();
  expect(() => reparentMapObject(d, "planet", "moon")).toThrow();
  reparentMapObject(d, "planet", "system");
  expect(d.bodies[1].parentId).toBeNull();
});
test("zone parenting preserves placement and refuses subtree cycles or unknown targets", () => {
  const d = newSystemMap("system");
  d.zones = [
    newMapZone("parent", 25, 50),
    { ...newMapZone("child", 30, 60), parentId: "parent" },
  ];
  expect(() => reparentMapObject(d, "parent", "child")).toThrow();
  expect(() => reparentMapObject(d, "child", "unknown-system")).toThrow();
  reparentMapObject(d, "child", "system");
  expect(d.zones[1]).toMatchObject({ parentId: "system", x: 30, y: 60 });
  expect(() => reparentMapObject(d, "live-ship", "system")).toThrow();
});
