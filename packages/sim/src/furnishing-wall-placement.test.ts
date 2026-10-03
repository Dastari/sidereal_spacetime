import { expect, test } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { WAYFARER_GAMEPLAY_OBJECTS } from "@sidereal/content/wayfarer-authored-gameplay";
import {
  FURNISHING_DEFAULT,
  furnishingMountKind,
  effectiveWayfarerObjects,
} from "@sidereal/content/wayfarer-furnishings";
import {
  furnishingWallSurfaces,
  wallFurnishingPlacement,
  qualifyWallFurnishingPlacement,
} from "./furnishing-wall-placement";
import { planFurnishingEdit } from "./ship-furnishings";
const doc = PREFAB_SHIPS.find((p) => p.id === "fed.m.wayfarer")!;
const lamp = "Cockpit_wall_light_cyan_v";
const centre = (id: string) => {
  const source = WAYFARER_GAMEPLAY_OBJECTS.find((o) => o.object === id)!;
  return [
    (source.min[0] + source.max[0]) / 2,
    (source.min[1] + source.max[1]) / 2,
  ];
};

test("portable mounts are explicit; ship architecture and floor consoles do not become wall fixtures", () => {
  expect(furnishingMountKind(lamp)).toBe("wall");
  expect(furnishingMountKind("Hall_wall_locker_door")).toBe("wall");
  expect(furnishingMountKind("Lounge_coffee_table")).toBe("floor");
  for (const id of [
    "POST_lounge_front",
    "PART_lounge_front",
    "Hall_walls_hall_lampcol",
    "Cockpit_screen_box",
    "Cockpit_command_station",
    "constructor",
  ])
    expect(furnishingMountKind(id)).toBeUndefined();
  expect(
    furnishingWallSurfaces(PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!),
  ).toEqual([]);
});

test("a lamp and poster transfer to perpendicular and opposite wall faces with automatic yaw and unchanged height", () => {
  const poster = "Lounge_poster_goodcrew";
  for (const id of [lamp, poster]) {
    for (const pointer of [
      [0.5, 5.5],
      [5.08, 3],
      [4.42, -3],
    ] as [number, number][]) {
      const pose = wallFurnishingPlacement(doc, id, pointer, false)!;
      expect(pose).toBeDefined();
      expect(qualifyWallFurnishingPlacement(doc, id, pose)).toEqual(pose);
      const before = WAYFARER_GAMEPLAY_OBJECTS.find((o) => o.object === id)!,
        after = effectiveWayfarerObjects({ [id]: pose }).find(
          (o) => o.object === id,
        )!;
      expect(after.min[2]).toBe(before.min[2]);
      expect(after.max[2]).toBe(before.max[2]);
      const accepted = planFurnishingEdit(
        doc,
        {},
        { sourceObjectId: id, action: "move", ...pose },
      );
      expect(accepted[id]).toEqual(pose);
    }
  }
  expect(
    wallFurnishingPlacement(doc, poster, [0.5, 5.5], false)!.yaw,
  ).toBeCloseTo(-Math.PI);
  expect(
    wallFurnishingPlacement(doc, poster, [5.08, 3], false)!.yaw,
  ).toBeCloseTo(-Math.PI / 2);
});

test("wall tangent snapping preserves normal flush contact including diagonals", () => {
  const id = "Hydroponics_wall_lamp_amber";
  for (const pointer of [
    [0.43, 5.5],
    [5.08, 2.87],
    [10.8, 2.6],
  ] as [number, number][]) {
    const free = wallFurnishingPlacement(doc, id, pointer, false)!,
      snapped = wallFurnishingPlacement(doc, id, pointer, true)!;
    expect(free).toBeDefined();
    expect(snapped).toBeDefined();
    expect(qualifyWallFurnishingPlacement(doc, id, snapped)).toEqual(snapped);
    const face = furnishingWallSurfaces(doc).find((face) => {
      const delta = free.yaw - Math.atan2(face.normal[1], face.normal[0]);
      return (
        Math.abs(Math.sin(delta)) < 0.00001 &&
        Math.abs(
          (centre(id)[0] + free.dx - face.a[0]) * face.normal[0] +
            (centre(id)[1] + free.dy - face.a[1]) * face.normal[1],
        ) < 0.2
      );
    })!;
    const dx = snapped.dx - free.dx,
      dy = snapped.dy - free.dy;
    expect(dx * face.normal[0] + dy * face.normal[1]).toBeCloseTo(0, 5);
  }
});

test("unsupported, detached, reversed, over-height, doorway and arbitrary floor placements reject", () => {
  const valid = wallFurnishingPlacement(doc, lamp, [5.08, 3], false)!;
  for (const patch of [
    { dx: valid.dx + 0.1 },
    { yaw: valid.yaw + Math.PI },
    { dx: 100 },
  ])
    expect(() =>
      qualifyWallFurnishingPlacement(doc, lamp, { ...valid, ...patch }),
    ).toThrow(/wall contact/);
  expect(
    wallFurnishingPlacement(doc, lamp, [0, 0], false, 0.1),
  ).toBeUndefined();
  expect(
    wallFurnishingPlacement(doc, lamp, [5.08, 0], false, 0.1),
  ).toBeUndefined();
  expect(
    wallFurnishingPlacement(doc, lamp, [11, 2], false, 0.5),
  ).toBeUndefined();
  expect(wallFurnishingPlacement(doc, lamp, [NaN, 0], false)).toBeUndefined();
  expect(
    wallFurnishingPlacement(doc, "Lounge_coffee_table", [0, 5.5], false),
  ).toBeUndefined();
});

test("authored default wall fixtures retain exact offsets while generic off-wall moves do not gain that exception", () => {
  expect(
    qualifyWallFurnishingPlacement(doc, lamp, {
      ...FURNISHING_DEFAULT,
      snap: false,
    }),
  ).toEqual({ ...FURNISHING_DEFAULT, snap: false });
  expect(() =>
    planFurnishingEdit(
      doc,
      {},
      {
        sourceObjectId: lamp,
        action: "move",
        dx: 0.01,
        dy: 0,
        yaw: 0,
        snap: false,
      },
    ),
  ).toThrow(/wall contact/);
});

test("short partitions retain exact polygon normals and support height instead of creating tall bounding rectangles", () => {
  const faces = furnishingWallSurfaces(doc).filter((face) =>
    face.id.startsWith("PART_"),
  );
  expect(faces.length).toBeGreaterThan(20);
  expect(faces.every((face) => face.maxZ <= 1.32)).toBe(true);
  for (const face of faces) {
    const source = WAYFARER_GAMEPLAY_OBJECTS.find((o) =>
      face.id.startsWith(o.object + ":"),
    )!;
    expect(source.footprint).toContainEqual(face.a);
    expect(source.footprint).toContainEqual(face.b);
  }
});
