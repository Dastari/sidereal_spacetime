import { expect, test } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabWalkFrame } from "./prefab-construction";
import { referenceRoomLayoutR025 } from "@sidereal/content/ship-reference-room-layout-r025";
import { prefabShipObjects } from "./prefab-deck-objects";
import {
  prefabBedSeats,
  prefabBedTransitionFrame,
  qualifyPrefabBed,
} from "./prefab-seats";

test("R025 auxiliary equipment preserves the exact medical bed and its own-only transition", () => {
  const original = PREFAB_SHIPS.find((p) => p.id === "fed.m.crest")!;
  const candidate = referenceRoomLayoutR025(original),
    catalog = defaultPrefabComponentCatalog();
  const oldBeds = prefabBedSeats(original, catalog),
    beds = prefabBedSeats(candidate, catalog);
  expect(beds).toEqual(oldBeds);
  const medical = beds.filter(
    (b) => b.assetId === "shipyard.equipment.medical-bed",
  );
  expect(medical).toHaveLength(1);
  expect(medical[0].supportHeight).toBe(0.5);
  const objects = prefabShipObjects(candidate, catalog),
    aux = objects.find(
      (o) => o.designId === "shipyard.equipment.medical-equipment-bank-r025",
    )!;
  expect(aux).toBeDefined();
  expect(aux.blocks).toBe(true);
  expect(aux.station).toBeNull();
  expect(beds.some((b) => b.assetId === aux.designId)).toBe(false);
  const frame = prefabWalkFrame(candidate, catalog);
  for (const bed of medical) {
    expect(qualifyPrefabBed(frame, bed)).toBe(true);
    const transition = prefabBedTransitionFrame(frame, bed.obstacleId);
    expect(transition.obstacles.map((o) => o.id)).toEqual(
      frame.obstacles.filter((o) => o.id !== bed.obstacleId).map((o) => o.id),
    );
    expect(transition.obstacles.some((o) => o.id === `prefab-${aux.id}`)).toBe(
      true,
    );
  }
});

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
