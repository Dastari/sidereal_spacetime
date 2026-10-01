import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ SenderError: class extends Error {} }));
import { inventoryDefinition } from "@sidereal/content/inventory";
import { itemDefinitions } from "./item-definitions";
import {
  currentNavigationOperatorSnapshots,
  operatorVisualKey,
  pinnedOperatorVisuals,
  operatorSnapshotJson,
} from "./navigation-operator-presentation";
import type {
  AcceptedOperatorTuple,
  AdmittedNavigationContext,
  NavigationOperatorRegistration,
} from "@sidereal/sim/navigation-operator-context";

function definitions() {
  const seed = inventoryDefinition("pistol");
  const published = { ...seed, crewItemId: "repair-tool" };
  const db = {
    inventoryItemPin: {
      itemId: {
        find: (id: string) =>
          id === "private-item"
            ? { definitionId: "pistol", itemRevision: 2n, weaponRevision: 1n }
            : undefined,
      },
    },
    contentDefinitionHead: {
      definitionKey: {
        find: () => ({ latestRevision: 3n, currentRevision: 3n }),
      },
    },
    contentDefinition: {
      definitionRef: {
        find: (ref: string) =>
          ref === "item:pistol@2"
            ? {
                definitionId: "pistol",
                kind: "item",
                revision: 2n,
                status: "published",
                payloadJson: JSON.stringify(published),
                sha256: "test-pinned-pistol-r2",
              }
            : undefined,
      },
    },
  };
  return itemDefinitions({ db } as never);
}
const equipped = {
  id: "private-item",
  definitionId: "pistol",
  equipmentSlot: "hand",
};

test("EMPTY production yields no snapshot and never requests pinned items or admission", () => {
  expect(currentNavigationOperatorSnapshots()()).toBeUndefined();
});
test("public slots resolve actual instance pin, never seed/current revision, and contain no UUID", () => {
  const visuals = pinnedOperatorVisuals(
    [equipped, { ...equipped, id: "private-carried", equipmentSlot: "" }],
    definitions(),
  );
  expect(visuals).toEqual([
    {
      slot: "hand",
      definitionId: "pistol",
      definitionRevision: "2",
      crewItemId: "repair-tool",
      wardrobeId: null,
      characterComponentId: null,
    },
  ]);
  expect(JSON.stringify(visuals)).not.toContain("private-");
  expect(operatorVisualKey(visuals![0])).not.toEqual(
    operatorVisualKey({ ...visuals![0], definitionRevision: "1" }),
  );
});
test.each(["wrong-slot", "duplicate", "missing", "no-model", "throws"])(
  "malformed equipped snapshot fails closed: %s",
  (caseName) => {
    const defs = definitions();
    const items =
      caseName === "duplicate"
        ? [equipped, { ...equipped, id: "other" }]
        : [equipped];
    if (caseName === "wrong-slot")
      items[0] = { ...equipped, equipmentSlot: "private-unknown" };
    if (caseName === "missing") defs.find = () => undefined;
    if (caseName === "no-model")
      defs.find = () => ({
        ...inventoryDefinition("pistol"),
        crewItemId: undefined,
      });
    if (caseName === "throws")
      defs.find = () => {
        throw Error("invalid pinned definition");
      };
    expect(pinnedOperatorVisuals(items, defs)).toBeNull();
  },
);

test("injected serializer admits only explicitly measured pinned visuals and exposes public fields", () => {
  const registration: NavigationOperatorRegistration = {
    profileId: "synthetic-test-only",
    certificateSha256: "a".repeat(64),
    proofSha256: "b".repeat(64),
    manifestSha256: "c".repeat(64),
    compilerSha256: "d".repeat(64),
    geometrySha256: "e".repeat(64),
    navigationSha256: "f".repeat(64),
    prefabId: "fed.s.wren",
    blueprintSha256: "1".repeat(64),
    catalogId: "ship-components-v1",
    catalogRevision: 4,
    catalogSha256: "2".repeat(64),
    mountSourceId: "helm",
    stationX: 0,
    stationY: 3.5,
  };
  const context: AdmittedNavigationContext = {
    ...registration,
    storedMappingAgrees: true,
    internalQuarterTurns: 0,
    artQuarterTurns: 2,
    deckElevationM: 0,
    floorElevationM: 0.1875,
  };
  const tuple: AcceptedOperatorTuple = {
    characterId: "body",
    instanceId: "ship",
    deckId: "deck",
    visitId: "visit",
    stationId: "station",
    seatPlacedObjectId: "seat",
    consolePlacedObjectId: "computer",
    instanceRevision: "3",
    locationRevision: "2",
    bindingRevision: "1",
    mappingRevision: "1",
    seatRevision: "2",
    seatInstanceRevision: "3",
    bindingInstanceRevision: "3",
    lifecycle: "active",
    connected: true,
    dead: false,
    recoveryRequested: false,
    operational: true,
    occupantId: "body",
    acceptedX: 0,
    acceptedY: 3.5,
    standingElevationM: 0.1875,
  };
  const visuals = pinnedOperatorVisuals([equipped], definitions())!;
  const measured = new Set(visuals.map(operatorVisualKey));
  const packet = operatorSnapshotJson(
    { registration, context },
    tuple,
    '{"bodyType":"female"}',
    visuals,
    measured,
  )!;
  expect(JSON.parse(packet)).toMatchObject({
    characterId: "body",
    pose: "occupied",
    visuals,
  });
  expect(packet).not.toMatch(
    /private-item|owner|inventoryState|containerId|documentJson|catalogSha256/,
  );
  expect(
    operatorSnapshotJson(
      { registration, context },
      tuple,
      "{}",
      visuals,
      new Set(),
    ),
  ).toBeNull();
  // A revision1 cohort entry cannot certify the current actual revision2 visual, even with
  // the same public definition ID. Nor can catalog existence certify an unmeasured shield pack.
  const seedOnly = new Set([
    operatorVisualKey({
      ...visuals[0],
      definitionRevision: "1",
      crewItemId: "pistol",
    }),
  ]);
  expect(
    operatorSnapshotJson(
      { registration, context },
      tuple,
      "{}",
      visuals,
      seedOnly,
    ),
  ).toBeNull();
  const unmeasured = [{ ...visuals[0], crewItemId: "shield-pack" }];
  expect(
    operatorSnapshotJson(
      { registration, context },
      tuple,
      "{}",
      unmeasured,
      measured,
    ),
  ).toBeNull();
  const extended = [
    { ...visuals[0], itemId: "private-uuid", containerId: "private-container" },
  ];
  expect(
    operatorSnapshotJson(
      { registration, context },
      tuple,
      "{}",
      extended,
      measured,
    ),
  ).not.toMatch(/private-uuid|private-container/);
  expect(
    operatorSnapshotJson(
      { registration, context },
      { ...tuple, recoveryRequested: true },
      "{}",
      visuals,
      measured,
    ),
  ).toBeNull();
  expect(
    operatorSnapshotJson(
      { registration, context },
      tuple,
      "{",
      visuals,
      measured,
    ),
  ).toBeNull();
});
