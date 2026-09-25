import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { PartCatalog } from "@sidereal/content/assembly";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import {
  FRAMED_WAYFARER_VISUALS,
  framedWayfarerVisual,
} from "./framed-wayfarer-visuals";

const catalog = JSON.parse(
  readFileSync("assets/runtime/assembly/catalog-shipyard-r005.json", "utf8"),
) as PartCatalog;

test("the framed revision preserves all physical definitions and covers eighteen sides, six bow surfaces and six engine definitions", () => {
  expect(FRAMED_WAYFARER_VISUALS).toHaveLength(30);
  const before = JSON.stringify(catalog);
  for (const entry of FRAMED_WAYFARER_VISUALS) {
    const original = catalog.assets.find(
      (asset) => asset.id === entry.assetId,
    )!;
    const updated = framedWayfarerVisual(original);
    const { visual: oldVisual, ...physical } = original;
    const { visual, ...after } = updated;
    expect(after).toEqual(physical);
    expect(visual).not.toEqual(oldVisual);
    expect(
      constructionHash(
        new Uint8Array(
          readFileSync(
            "assets/runtime/" + visual!.url.slice("/assets/".length),
          ),
        ),
      ),
    ).toBe(visual!.sha256);
    for (let axis = 0; axis < 3; axis++) {
      expect(visual!.bounds.min[axis]).toBeGreaterThanOrEqual(
        original.bounds.min[axis] - 0.0001,
      );
      expect(visual!.bounds.max[axis]).toBeLessThanOrEqual(
        original.bounds.max[axis] + 0.0001,
      );
    }
  }
  expect(JSON.stringify(catalog)).toBe(before);
});

test("unknown revisions cannot inherit a framed surface by matching only an asset ID", () => {
  const original = catalog.assets.find(
    (asset) => asset.id === FRAMED_WAYFARER_VISUALS[0].assetId,
  )!;
  const changed = structuredClone(original);
  changed.bounds.max[0] += 0.03125;
  expect(() => framedWayfarerVisual(changed)).toThrow("Unqualified");
  changed.bounds = original.bounds;
  changed.nodes = ["unqualified-new-mesh"];
  expect(() => framedWayfarerVisual(changed)).toThrow("Unqualified");
  const floor = catalog.assets.find((asset) => asset.category === "floor")!;
  expect(framedWayfarerVisual(floor)).toBe(floor);
});
