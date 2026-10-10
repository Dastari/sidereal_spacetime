import { expect, test } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabBedSeats } from "@sidereal/sim/prefab-seats";
import { prefabSeatPresentation } from "./seated-presentation";
import {
  CREW_STUDY_SCALE,
  CREW_STUDY_SEATED_PELVIS_UNDERSIDE_M,
  CREW_STUDY_SEATED_PELVIS_REAR_M,
  CREW_STUDY_PILOT_CHAIR,
} from "@sidereal/content/crew-study";
import { prefabFlightModel } from "@sidereal/sim/prefab-flight";

test("current admitted bed geometry supplies all four yaws and bounded support; stale positions supply no pose", () => {
  const source = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!,
    catalog = defaultPrefabComponentCatalog();
  const mount = source.mounts.find((m) => m.component === "crew-bunk.sm")!;
  expect(mount).toBeDefined();
  for (const [facing, yaw] of [
    ["fore", 0],
    ["port", Math.PI / 2],
    ["aft", Math.PI],
    ["starboard", -Math.PI / 2],
  ] as const) {
    const doc = {
      ...source,
      mounts: source.mounts.map((m) =>
        m.id === mount.id ? { ...m, normal: facing } : m,
      ),
    };
    const bed = prefabBedSeats(doc, catalog).find(
      (b) => b.placementId === `prefab:mount:${mount.id}`,
    )!;
    expect(bed).toBeDefined();
    expect(
      prefabSeatPresentation({ doc, catalog }, bed.seatX, bed.seatY),
    ).toMatchObject({
      facing: yaw,
      lift: 0.375 - CREW_STUDY_SCALE * CREW_STUDY_SEATED_PELVIS_UNDERSIDE_M,
      lean: (-35 * Math.PI) / 180,
      footSupport: 0,
    });
    expect(
      prefabSeatPresentation({ doc, catalog }, bed.seatX + 0.5, bed.seatY),
    ).toBeUndefined();
  }
  expect(prefabSeatPresentation(undefined, 0, 0)).toBeUndefined();
});

for (const id of ["fed.s.wren-fleet", "fed.m.wayfarer-fleet"])
  test(`${id} accepted native pilot anchor derives chair contact; nearby unseated positions do not`, () => {
    const doc = PREFAB_SHIPS.find((p) => p.id === id)!,
      catalog = defaultPrefabComponentCatalog(),
      station = prefabFlightModel(doc, catalog).station!;
    const sourceFit = 21 / 16 / CREW_STUDY_PILOT_CHAIR.height;
    expect(prefabSeatPresentation({ doc, catalog }, ...station)).toEqual({
      facing: 0,
      lift:
        CREW_STUDY_PILOT_CHAIR.cushionTop * sourceFit -
        CREW_STUDY_SCALE * CREW_STUDY_SEATED_PELVIS_UNDERSIDE_M,
      lean: 0,
      footSupport: CREW_STUDY_PILOT_CHAIR.footBaseTop * sourceFit,
      footForward: CREW_STUDY_PILOT_CHAIR.footBaseForward * sourceFit,
      forward:
        CREW_STUDY_SEATED_PELVIS_REAR_M * CREW_STUDY_SCALE -
        CREW_STUDY_PILOT_CHAIR.cushionRear * sourceFit,
    });
    expect(
      prefabSeatPresentation({ doc, catalog }, station[0], station[1] - 0.875),
    ).toBeUndefined();
  });
