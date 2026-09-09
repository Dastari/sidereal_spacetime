import { expect, test } from "vitest";
import { objectDetails } from "./objects";
import { LAB_FLIGHT_ACTUATORS } from "@sidereal/content/flight";
import { LAB_STORAGE_FIXTURES } from "../../../packages/content/src/storage-fixtures";
import type { EquipmentCatalog } from "./objects";
const placementId = LAB_STORAGE_FIXTURES[0].placementId;
const catalog: EquipmentCatalog = {
  entries: [
    {
      asset: {
        id: "approved-crate",
        label: "Cargo",
        category: "cargo",
        nodes: [],
        bounds: { min: [0, 0, 0], max: [0.48, 0.4, 0.48] },
      },
      placements: [
        {
          id: placementId,
          assetId: "approved-crate",
          position: [-3.6875, 2.0625, 0.25],
          rotation: 0,
          flipped: false,
          removedCells: [],
        },
      ],
    },
  ],
};
test("storage opens only from its server-projected placement binding and liquids cannot become item grids", () => {
  expect(objectDetails(placementId, catalog, [])?.actions[0].enabled).toBe(
    false,
  );
  const container = {
    id: "server-uuid",
    placementId,
    parentItemId: "",
    name: "Supply crate",
    kind: "grid" as const,
    width: 6,
    height: 6,
    maxMassKg: 500,
    capacityLitres: 0,
    amountLitres: 0,
    liquidType: "",
    carried: false,
  };
  expect(
    objectDetails(
      placementId,
      catalog,
      [],
      undefined,
      undefined,
      [],
      [container],
    )?.actions[0],
  ).toEqual({ id: "open-storage", label: "Open storage", enabled: true });
  expect(
    objectDetails(
      placementId,
      catalog,
      [],
      undefined,
      undefined,
      [],
      [{ ...container, kind: "liquid" }],
    )?.actions[0].enabled,
  ).toBe(false);
  expect(
    objectDetails(
      placementId,
      catalog,
      [],
      undefined,
      undefined,
      [],
      [{ ...container, placementId: "another-placement" }],
    )?.actions[0].enabled,
  ).toBe(false);
});

test("native engine inspection retains its placed UUID while resolving accepted source telemetry", () => {
  const nativeId = "new-instance-engine";
  const nativeCatalog: EquipmentCatalog = {
    entries: [
      {
        ...catalog.entries[0],
        placements: [{ ...catalog.entries[0].placements[0], id: nativeId }],
      },
    ],
  };
  const sourceId = LAB_FLIGHT_ACTUATORS.find((d) =>
    d.id.startsWith("drives-main"),
  )!.id;
  const details = objectDetails(
    nativeId,
    nativeCatalog,
    [],
    undefined,
    undefined,
    [{ actuatorId: sourceId, throttle: 0.5 }],
    [],
    [{ placedObjectId: nativeId, sourceDeviceId: sourceId }],
  );
  expect(details?.placementId).toBe(nativeId);
  expect(details?.name).toBe("Main engine");
  expect(details?.stats.find((s) => s.label === "Throttle")?.value).toBe("50%");
  expect(
    objectDetails(nativeId, nativeCatalog, [])?.stats.some(
      (s) => s.label === "Rated thrust",
    ),
  ).toBe(false);
});
