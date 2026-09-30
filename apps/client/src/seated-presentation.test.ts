import { expect, test } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { prefabBedSeats } from "../../../packages/sim/src/prefab-seats";
import { prefabSeatPresentation } from "./seated-presentation";

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
      lift: 0.07500000000000001,
      lean: (-25 * Math.PI) / 180,
      footSupport: 0,
    });
    expect(
      prefabSeatPresentation({ doc, catalog }, bed.seatX + 0.5, bed.seatY),
    ).toBeUndefined();
  }
  expect(prefabSeatPresentation(undefined, 0, 0)).toBeUndefined();
});
