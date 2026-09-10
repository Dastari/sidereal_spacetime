import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  refitAttachmentPlacements,
  type RefitAttachmentVisual,
} from "./construction-refit-attachments";
import { REFIT_FUEL_ATTACHMENT as PIN } from "@sidereal/sim/wayfarer-refit-audit";
import type { PartCatalog } from "@sidereal/content/assembly";
const catalog = JSON.parse(
  readFileSync("assets/runtime/assembly/catalog.json", "utf8"),
) as PartCatalog;
const row: RefitAttachmentVisual = {
  id: "preserved-fuel-placed-id",
  instanceId: "old-ship",
  deckId: "new-deck",
  assetId: PIN.assetId,
  assetSha256: PIN.glbSha256,
  x: PIN.positionM[0],
  y: PIN.positionM[1],
  z: PIN.positionM[2],
};
test("refit visual preserves accepted attachment identity, exact native placement and immutable catalog", () => {
  const before = JSON.stringify(catalog);
  const parts = refitAttachmentPlacements(
    [row],
    "old-ship",
    "new-deck",
    catalog.assets,
    ["existing-floor"],
  );
  expect(parts).toEqual([
    {
      id: row.id,
      assetId: row.assetId,
      position: [-3, 7, 0.1875],
      rotation: 0,
      flipped: false,
      removedCells: [],
    },
  ]);
  expect(JSON.stringify(catalog)).toBe(before);
});
test("foreign deck/instance, substituted art, moved fuel and duplicate identity fail closed", () => {
  for (const change of [
    { instanceId: "other-ship" },
    { deckId: "other-deck" },
    { assetSha256: "0".repeat(64) },
    { assetId: "other" },
    { x: 0 },
    { z: NaN },
  ])
    expect(() =>
      refitAttachmentPlacements(
        [{ ...row, ...change }],
        "old-ship",
        "new-deck",
        catalog.assets,
        [],
      ),
    ).toThrow();
  expect(() =>
    refitAttachmentPlacements([row], "old-ship", "new-deck", catalog.assets, [
      row.id,
    ]),
  ).toThrow();
  expect(() =>
    refitAttachmentPlacements(
      [row, { ...row, id: "second" }],
      "old-ship",
      "new-deck",
      catalog.assets,
      [],
    ),
  ).toThrow();
  expect(() =>
    refitAttachmentPlacements([row], "old-ship", "new-deck", [], []),
  ).toThrow();
});
