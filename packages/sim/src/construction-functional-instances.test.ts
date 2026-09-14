import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { WAYFARER_CONVERSION_PIN as PIN } from "@sidereal/content/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "./wayfarer-conversion-candidate";
import { qualifiedWayfarerWalkingBindings } from "./wayfarer-walking-bindings";
import { planConstructionInstance } from "./construction-instance";
import { planQualifiedWayfarerFunctionalSeeds } from "./construction-functional-instances";
const allocator = () => {
  let n = 0;
  return () =>
    `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
};
function setup() {
  const allocate = allocator(),
    c = createWayfarerConversionCandidate(
      Object.fromEntries(
        Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
      ) as WayfarerPinnedInputs,
    ),
    request = {
      blueprintRevisionId: "fixture",
      expectedBlueprintSha256: c.snapshot.sha256,
      sourceDeckId: PIN.deckId,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      objectCollisionBindings: qualifiedWayfarerWalkingBindings(
        c.snapshot,
        0.3,
        1.8,
      ),
    };
  return {
    allocate,
    a: planConstructionInstance(c.snapshot, request, allocate),
    b: planConstructionInstance(c.snapshot, request, allocate),
  };
}
test("each spawn proposes fresh empty instance-owned containers and independent existing interaction state", () => {
  const { allocate, a, b } = setup(),
    x = planQualifiedWayfarerFunctionalSeeds(a, allocate),
    y = planQualifiedWayfarerFunctionalSeeds(b, allocate);
  expect(x.containers).toHaveLength(4);
  expect(x.interactions).toHaveLength(4);
  expect(
    x.containers.every(
      (c) =>
        c.contents.length === 0 &&
        c.instanceId === a.instanceId &&
        c.deckId === a.spawn.deckId &&
        c.physicalPayloadRatingKg === null,
    ),
  ).toBe(true);
  const ids = [
    ...x.containers,
    ...x.interactions,
    ...y.containers,
    ...y.interactions,
  ].map((r) => r.id);
  expect(new Set(ids).size).toBe(16);
  expect(
    ids.some(
      (id) => a.allocatedIds.includes(id) || b.allocatedIds.includes(id),
    ),
  ).toBe(false);
  expect(x.loadoutApplied).toBe(false);
  expect(x.authorityInstallationReady).toBe(false);
  expect(
    x.interactions.filter((i) => i.kind === "seat")[0].occupantCharacterId,
  ).toBeNull();
});
test("existing development capacities are explicit and cannot be interpreted as physical cargo ratings or health", () => {
  const { a, allocate } = setup(),
    x = planQualifiedWayfarerFunctionalSeeds(a, allocate);
  for (const c of x.containers) {
    expect(c.columns).toBe(14);
    expect(c.maxInventoryMassKg).toBe(500);
    expect(c.capacityBasis).toBe("existing-development-inventory-fixture");
    expect(c.physicalPayloadRatingKg).toBeNull();
  }
  expect(x.interactions.every((i) => i.healthDefinitionId === null)).toBe(true);
});
test("tampered source or reused placement UUID cannot mint functional state", () => {
  const { a } = setup();
  expect(() =>
    planQualifiedWayfarerFunctionalSeeds(a, () => a.allocatedIds[0]),
  ).toThrow("fresh UUID");
  const tampered = structuredClone(a);
  tampered.document.layout.assembly!.parts[0].position[0] += 1;
  expect(() =>
    planQualifiedWayfarerFunctionalSeeds(tampered, allocator()),
  ).toThrow();
});
