import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { createWayfarerAirlockCandidate } from "./wayfarer-airlock-candidate";
import { planConstructionInstance } from "./construction-instance";
const root = resolve(import.meta.dirname, "../../..");
const kit = resolve(
  root,
  "assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003",
);
const inputs = () => ({
  original: readFileSync(
    resolve(root, "packages/content/src/wayfarer-starter-r001.json"),
    "utf8",
  ),
  mapping: readFileSync(resolve(kit, "replacement-mapping.json"), "utf8"),
  walking: readFileSync(resolve(kit, "native-walking-projection-v2.json"), "utf8"),
  motion: readFileSync(
    resolve(kit, "native-motion-neighbor-qualification.json"),
    "utf8",
  ),
});
describe("qualified Wayfarer airlock compile/spawn candidate", () => {
  it("preserves source identities and compiles joined floors with exact native colliders", () => {
    const source = inputs(),
      candidate = createWayfarerAirlockCandidate(source);
    const before = JSON.parse(source.original);
    expect(candidate.document.floors).toHaveLength(67);
    expect(candidate.document.layout.assembly?.parts).toHaveLength(266);
    expect(candidate.bindings).toHaveLength(266);
    expect(candidate.dynamicDoorPartIds).toHaveLength(4);
    expect(candidate.exteriorFloorIds).toHaveLength(4);
    for (const original of before.layout.assembly.parts) {
      const actual = candidate.document.layout.assembly!.parts.find(
        (p) => p.id === original.id,
      )!;
      expect(actual.position).toEqual(original.position);
      expect(actual.rotation).toBe(original.rotation);
      if (
        !["wall-2--2", "wall-3--2", "superstructure-3--2"].includes(original.id)
      )
        expect(actual).toEqual(original);
    }
    expect(candidate.pressureNeighbor.installablePressurizedNeighbor).toBe(
      false,
    );
    expect(candidate.registered).toBe(false);
  });
  it("uses normal independent instance allocation for two complete candidates", () => {
    const candidate = createWayfarerAirlockCandidate(inputs());
    let sequence = 1;
    const allocate = () =>
      `a0000000-0000-4000-8000-${(sequence++).toString(16).padStart(12, "0")}`;
    const spawn = () =>
      planConstructionInstance(
        candidate.snapshot,
        {
          blueprintRevisionId: "review-source",
          expectedBlueprintSha256: candidate.snapshot.sha256,
          sourceDeckId: candidate.document.layout.playableDeckId,
          bodyRadiusM: 0.3,
          bodyHeightM: 1.8,
          perimeterHalfWidthM: 0.0625,
          partitionHalfWidthM: 0.0625,
          objectCollisionBindings: candidate.bindings,
        },
        allocate,
      );
    const a = spawn(),
      b = spawn();
    expect(a.mappings.objects).toHaveLength(266);
    expect(a.mappings.floors).toHaveLength(67);
    expect(a.mappings.openings).toHaveLength(2);
    expect(a.allocatedIds.every((id) => !b.allocatedIds.includes(id))).toBe(
      true,
    );
  });
  it("rejects forged native proof or source instead of accepting client collider changes", () => {
    const source = inputs();
    expect(() =>
      createWayfarerAirlockCandidate({
        ...source,
        walking: source.walking + " ",
      }),
    ).toThrow("altered qualified walking");
    const altered = JSON.parse(source.original);
    altered.layout.tiles[0].vertices[0][0] += 1;
    expect(() =>
      createWayfarerAirlockCandidate({
        ...source,
        original: JSON.stringify(altered),
      }),
    ).toThrow();
  });
});
