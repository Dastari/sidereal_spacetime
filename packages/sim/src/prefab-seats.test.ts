import { expect, test } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabWalkFrame } from "./prefab-construction";
import {
  prefabBedSeats,
  prefabBedTransitionFrame,
  qualifyPrefabBed,
} from "./prefab-seats";

test("prefab bed seats derive actual geometry and exempt only the selected bed", () => {
  const doc = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!;
  const catalog = defaultPrefabComponentCatalog();
  const beds = prefabBedSeats(doc, catalog);
  expect(beds.length).toBeGreaterThan(0);
  const frame = prefabWalkFrame(doc, catalog);
  for (const bed of beds) {
    expect(bed.placementId).toMatch(/^prefab:(mount|socket):/);
    const transition = prefabBedTransitionFrame(frame, bed.obstacleId);
    expect(transition.obstacles.map((o) => o.id)).toEqual(
      frame.obstacles.filter((o) => o.id !== bed.obstacleId).map((o) => o.id),
    );
  }
  expect(beds.some((bed) => qualifyPrefabBed(frame, bed))).toBe(true);
  const bed = beds.find((b) => qualifyPrefabBed(frame, b))!;
  expect(qualifyPrefabBed({ ...frame, floors: [] }, bed)).toBe(false);
  expect(
    qualifyPrefabBed(
      {
        ...frame,
        obstacles: frame.obstacles.filter((o) => o.id !== bed.obstacleId),
      },
      bed,
    ),
  ).toBe(false);
  expect(
    qualifyPrefabBed(
      {
        ...frame,
        segments: [
          ...frame.segments,
          {
            id: "wall",
            a: [bed.approachX - 1, (bed.approachY + bed.seatY) / 2],
            b: [bed.approachX + 1, (bed.approachY + bed.seatY) / 2],
            halfWidthM: 0.1,
          },
        ],
      },
      bed,
    ),
  ).toBe(false);
});
