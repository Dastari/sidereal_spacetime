import { expect, test } from "vitest";
import { constructionInspectionCatalog } from "./construction-inspection";
import { objectDetails, type EquipmentCatalog } from "./objects";
const asset = {
  id: "crate",
  label: "Cargo",
  category: "cargo",
  nodes: [],
  bounds: { min: [0, 0, 0], max: [1, 1, 1] },
} as EquipmentCatalog["entries"][number]["asset"];
const placed = (id: string) => ({
  id,
  assetId: "crate",
  position: [3, 4, 0] as [number, number, number],
  rotation: 0,
  flipped: false,
  removedCells: [],
});
const catalog: EquipmentCatalog = {
  entries: [{ asset, placements: [placed("stock")] }],
};
const document = (id: string) =>
  JSON.stringify({ layout: { assembly: { parts: [placed(id)] } } });
test("inspection uses accepted instance identities and positions, never stock placements", () => {
  const a = constructionInspectionCatalog(catalog, document("instance-a"))!;
  const b = constructionInspectionCatalog(catalog, document("instance-b"))!;
  expect(objectDetails("stock", a, [])).toBeUndefined();
  expect(objectDetails("instance-a", b, [])).toBeUndefined();
  expect(a.entries[0].asset).toBe(asset);
  const container = {
    id: "container-a",
    placementId: "instance-a",
    parentItemId: "",
    kind: "grid" as const,
    name: "Crate",
    width: 4,
    height: 4,
    maxMassKg: 50,
    capacityLitres: 0,
    amountLitres: 0,
    liquidType: "",
  };
  expect(
    objectDetails("instance-a", a, [], undefined, undefined, [], [container])
      ?.actions,
  ).toEqual([{ id: "open-storage", label: "Open storage", enabled: true }]);
  expect(objectDetails("instance-a", a, [])?.actions).toEqual([]);
});
test("revoked, malformed and duplicate-instance documents do not fall back to stock ship", () => {
  expect(constructionInspectionCatalog(catalog, undefined)).toBeUndefined();
  expect(constructionInspectionCatalog(catalog, "broken")).toBeUndefined();
  expect(
    constructionInspectionCatalog(
      catalog,
      JSON.stringify({
        layout: { assembly: { parts: [placed("x"), placed("x")] } },
      }),
    ),
  ).toBeUndefined();
});
