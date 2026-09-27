import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import type { PartCatalog } from "@sidereal/content/assembly";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import {
  WAYFARER_EXTERIOR_REMOVED_FILLER_IDS,
  WAYFARER_EXTERIOR_SHA256,
} from "@sidereal/sim/wayfarer-exterior-qualification";
import source from "./framed-wayfarer-stock.json";
import {
  framedStockWayfarerPlacements,
  FRAMED_STOCK_WAYFARER_SOURCE_PINS,
} from "./framed-wayfarer-stock";
import { FRAMED_WAYFARER_VISUALS } from "./framed-wayfarer-visuals";
import {
  deriveStockWayfarerExterior,
  validateStockExteriorManifest,
} from "./remote-ships";

const read = (path: string) => readFileSync(path, "utf8");
const templateText = read("assets/runtime/assembly/wayfarer.json");
const hullText = read("assets/runtime/assembly/hull-manifest.json");
const manifest = () => deriveStockWayfarerExterior(templateText, hullText);

test("cosmetic stock plan records exact public sources and only known exterior asset contracts", () => {
  const pins = FRAMED_STOCK_WAYFARER_SOURCE_PINS;
  expect(pins.stockManifestSha256).toBe(manifest().sha256);
  expect(pins.stockTemplateFileSha256).toBe(constructionHash(templateText));
  expect(pins.stockHullManifestFileSha256).toBe(constructionHash(hullText));
  expect(pins.stockLegacyShellFileSha256).toBe(
    constructionHash(readFileSync("assets/runtime/voxels/wayfarer.glb")),
  );
  expect(pins.qualifiedExteriorFileSha256).toBe(
    constructionHash(read("packages/content/src/wayfarer-exterior-r005.json")),
  );
  expect(pins.qualifiedExteriorBlueprintSha256).toBe(WAYFARER_EXTERIOR_SHA256);
  const catalogText = read(
    "assets/runtime/assembly/catalog-shipyard-r005.json",
  );
  expect(pins.qualifiedCatalogFileSha256).toBe(constructionHash(catalogText));
  const catalog = JSON.parse(catalogText) as PartCatalog;
  expect(source.assets).toHaveLength(30);
  for (const asset of source.assets) {
    expect(asset).toEqual(catalog.assets.find((a) => a.id === asset.id));
    expect(["superstructure", "wall", "engine"]).toContain(asset.category);
  }
  expect(source.removedPlacementIds).toEqual(
    WAYFARER_EXTERIOR_REMOVED_FILLER_IDS,
  );
  expect(source.placements).toHaveLength(37);
  expect(JSON.stringify(source)).not.toMatch(
    /characterId|accountId|inventory|room-storage|room-engineering|fittingProxy|floor--|treatment:/,
  );
});

test("sides use the qualified r005 positions; front and engines retain their original poses", () => {
  const oldTemplate = JSON.parse(templateText);
  const qualified = JSON.parse(
    read("packages/content/src/wayfarer-exterior-r005.json"),
  );
  const fields = (p: (typeof source.placements)[number]) => ({
    id: p.id,
    assetId: p.assetId,
    position: p.position,
    rotation: p.rotation,
    flipped: p.flipped,
  });
  const plan = framedStockWayfarerPlacements(manifest());
  for (const p of source.placements) {
    const reference = qualified.layout.assembly.parts.find(
      (part: { id: string }) => part.id === p.id,
    );
    expect(p).toEqual(fields(reference));
    const output = plan.find((part) => part.id === p.id)!;
    expect(output.position).toEqual(p.position);
    expect(output.rotation).toBe(p.rotation);
    expect(output.flipped).toBe(p.flipped);
    const original = oldTemplate.parts.find(
      (part: { id: string }) => part.id === p.id,
    );
    if (p.id.startsWith("superstructure-")) {
      expect(p.position[0]).toBe(p.id.startsWith("superstructure--3") ? -5 : 5);
      expect(p.position[2]).toBe(0.1875);
      expect(p.flipped).toBe(p.position[0] < 0);
      expect(p.assetId).not.toBe(original.assetId);
      expect(p.position).not.toEqual(original.position);
    } else {
      expect(p).toEqual(fields(original));
    }
  }
  expect(
    source.placements.filter((p) => p.id.startsWith("superstructure-")),
  ).toHaveLength(18);
  expect(
    source.placements.filter((p) => p.id.startsWith("pilot-")),
  ).toHaveLength(10);
  expect(
    source.placements.filter((p) => p.id.startsWith("drives-")),
  ).toHaveLength(9);
});

test("replacement preserves public identities, decals and original source manifest without interior leakage", () => {
  const original = manifest();
  const frozen = structuredClone(original);
  const plan = framedStockWayfarerPlacements(original);
  expect(plan).toHaveLength(117);
  expect(new Set(plan.map((p) => p.id)).size).toBe(117);
  expect(plan.flatMap((p) => p.decals ?? [])).toHaveLength(5);
  expect(
    plan.every(
      (p) =>
        !/(rear-partition|airlock-frame|cargo|floor|room-|equipment|cutaway)/.test(
          p.id,
        ),
    ),
  ).toBe(true);
  for (const id of WAYFARER_EXTERIOR_REMOVED_FILLER_IDS)
    expect(plan.some((p) => p.id === id)).toBe(false);
  const replaced = new Set(source.placements.map((p) => p.id));
  for (const p of plan) {
    if (replaced.has(p.id)) continue;
    expect(p).toEqual(
      original.payload.placements.find((row) => row.id === p.id),
    );
  }
  plan[0].position[0]++;
  expect(original).toEqual(frozen);
});

test("unknown stock revisions and incomplete or unqualified native bindings fail closed", () => {
  const changed = manifest();
  changed.payload.placements[0].position[0]++;
  changed.sha256 = constructionHash(JSON.stringify(changed.payload));
  changed.assetId = `stock-wayfarer-exterior:${changed.sha256}`;
  validateStockExteriorManifest(changed, changed.assetId);
  expect(() => framedStockWayfarerPlacements(changed)).toThrow(
    /Unqualified.*revision/,
  );
  expect(() => framedStockWayfarerPlacements(manifest(), [])).toThrow(
    /Incomplete/,
  );
  const altered = structuredClone(FRAMED_WAYFARER_VISUALS);
  for (const contract of altered[0].sources) contract.bounds.max[2]++;
  expect(() => framedStockWayfarerPlacements(manifest(), altered)).toThrow(
    /Unqualified framed visual source/,
  );
});

test("all replacements resolve to two shared exact native libraries with preserved physical bounds", () => {
  const plan = framedStockWayfarerPlacements(manifest());
  const native = plan.filter((p) => p.url.includes("/native/framed-wayfarer/"));
  expect(native).toHaveLength(37);
  const files = new Map(native.map((p) => [p.url, p.sha256]));
  expect(files.size).toBe(2);
  for (const [url, hash] of files)
    expect(
      constructionHash(
        readFileSync("assets/runtime/" + url.slice("/assets/".length)),
      ),
    ).toBe(hash);
  for (const asset of source.assets) {
    const visual = FRAMED_WAYFARER_VISUALS.find(
      (entry) => entry.assetId === asset.id,
    )!.visual;
    for (let axis = 0; axis < 3; axis++) {
      expect(visual.bounds!.min[axis]).toBeGreaterThanOrEqual(
        asset.bounds.min[axis] - 0.0001,
      );
      expect(visual.bounds!.max[axis]).toBeLessThanOrEqual(
        asset.bounds.max[axis] + 0.0001,
      );
    }
  }
});
