import { expect, test } from "vitest";
import { furnishingPlanePoint, wallDragPose } from "./furnishing-drag";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { furnishingWallSurfaces } from "@sidereal/sim/furnishing-wall-placement";
import { WAYFARER_GAMEPLAY_OBJECTS } from "@sidereal/content/wayfarer-authored-gameplay";
test("deck ray projection rejects behind-camera and parallel rays", () => {
  expect(
    furnishingPlanePoint({ origin: [5, 6, 10], direction: [1, -1, -2] }, 2),
  ).toEqual([9, 2]);
  expect(
    furnishingPlanePoint({ origin: [5, 6, 1], direction: [1, -1, -2] }, 2),
  ).toBeUndefined();
  expect(
    furnishingPlanePoint({ origin: [5, 6, 1], direction: [1, -1, 0] }, 2),
  ).toBeUndefined();
});
test("wall dragging uses the camera-facing physical wall, including opposite wall transfer", () => {
  const doc = PREFAB_SHIPS.find((p) => p.id === "fed.m.wayfarer")!;
  const id = "Lounge_poster_goodcrew",
    source = WAYFARER_GAMEPLAY_OBJECTS.find((o) => o.object === id)!;
  const z = (source.min[2] + source.max[2]) / 2;
  for (const wall of furnishingWallSurfaces(doc).filter(
    (w) => w.id === "hull:far" || w.id === "hull:near",
  )) {
    const x = -6,
      y = (wall.a[1] + wall.b[1]) / 2;
    const pose = wallDragPose(
      doc,
      id,
      {
        origin: [x + wall.normal[0] * 2, y + wall.normal[1] * 2, z],
        direction: [-wall.normal[0], -wall.normal[1], 0],
      },
      false,
    );
    expect(pose).toBeDefined();
    expect(pose!.dy).not.toBe(0);
  }
});
