import { randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import {
  createNativeAirlockDocument,
  readNativeAirlockDocument,
  nativeAirlockDocumentIdentities,
  remapNativeAirlockDocument,
} from "./construction-airlock-document";
import { compileLayout } from "./layout-compiler";
import { readConstructionDraft } from "./construction-transactions";
test("two semantic doors anchor actual landing partition, roof keeps landing unroofed through explicit binding", () => {
  const d = createNativeAirlockDocument();
  expect(compileLayout(d.layout).valid).toBe(true);
  expect(readNativeAirlockDocument(JSON.stringify(d))).toEqual(d);
  expect(d.airlockRoom.roofTileIds).toHaveLength(12);
  expect(d.airlockRoom.exteriorTileIds).toHaveLength(4);
  // Shared parser accepts only the exact bound native fixture.
  expect(
    JSON.parse(readConstructionDraft(JSON.stringify(d)).canonical).airlockRoom,
  ).toEqual(d.airlockRoom);
});
test("two template spawns and JSON reload preserve independent exhaustive UUID mappings", () => {
  const d = createNativeAirlockDocument(),
    ids = nativeAirlockDocumentIdentities(d),
    all: string[] = [];
  for (let i = 0; i < 2; i++) {
    const map = Object.fromEntries(ids.map((id) => [id, randomUUID()]));
    const next = remapNativeAirlockDocument(d, map);
    expect(readNativeAirlockDocument(JSON.stringify(next))).toEqual(next);
    all.push(...nativeAirlockDocumentIdentities(next));
  }
  expect(new Set(all).size).toBe(ids.length * 2);
  expect(() => remapNativeAirlockDocument(d, {})).toThrow("mapping");
});
test.each(["floor", "roof", "door", "part", "old-proof"] as const)(
  "rejects changed %s qualification",
  (kind) => {
    const d = createNativeAirlockDocument();
    if (kind === "floor") d.layout.tiles[0].vertices[0][0] += 0.5;
    if (kind === "roof")
      d.airlockRoom.roofTileIds.push(d.airlockRoom.exteriorTileIds[0]);
    if (kind === "door") d.layout.openings[1].a[1] = 13;
    if (kind === "part") d.airlockRoom.parts[1].sourcePartIndex = 0;
    if (kind === "old-proof") d.airlockRoom.pin.sha256 = "0".repeat(64);
    expect(() => readNativeAirlockDocument(JSON.stringify(d))).toThrow();
  },
);

test("actual accepted door orientations retain closed barriers and supported one-door-at-a-time routes", async () => {
  const { readFileSync } = await import("node:fs");
  const { createPublishedNativeExternalAirlockCompiler } =
    await import("./construction-airlock-plan");
  const { nativeAirlockCollision } =
    await import("./construction-airlock-document");
  const { sweepDeckCircle, canOccupyDeck } =
    await import("./construction-collision");
  const d = createNativeAirlockDocument(),
    plan = createPublishedNativeExternalAirlockCompiler(
      readFileSync(
        "assets/art-library/designs/shipyard.structure.external-airlock/revisions/r000/audit-a007.json",
      ),
    )(d.layout.id);
  const frame = (inner: number, outer: number) =>
    nativeAirlockCollision(d, plan, [
      {
        openingId: d.airlockRoom.innerDoorId,
        fraction: inner,
        sealRetraction: inner,
      },
      {
        openingId: d.airlockRoom.outerDoorId,
        fraction: outer,
        sealRetraction: outer,
      },
    ]);
  const loc = (x: number) => ({
    shipId: plan.instanceId,
    deckId: d.airlockRoom.deckId,
    position: [x, 1] as [number, number],
  });
  expect(
    sweepDeckCircle(frame(0, 0), loc(1), [3, 0], 0.3).position[0],
  ).toBeLessThan(2);
  expect(
    sweepDeckCircle(frame(1, 0), loc(1), [3, 0], 0.3).position[0],
  ).toBeCloseTo(4);
  expect(
    sweepDeckCircle(frame(0, 1), loc(4), [3, 0], 0.3).position[0],
  ).toBeCloseTo(7);
  expect(canOccupyDeck(frame(0, 1), loc(7), 0.3)).toBe(true);
  expect(canOccupyDeck(frame(0, 1), loc(8.1), 0.3)).toBe(false);
});
