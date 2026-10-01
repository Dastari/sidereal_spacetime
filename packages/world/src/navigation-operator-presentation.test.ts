import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ SenderError: class extends Error {} }));
import { inventoryDefinition } from "@sidereal/content/inventory";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  compileConstruction,
  constructionHash,
} from "@sidereal/sim/construction-transactions";
import {
  prefabConstructionDocument,
  PREFAB_DECK_ID,
} from "@sidereal/sim/prefab-construction";
import { planConstructionInstance } from "@sidereal/sim/construction-instance";
import {
  prefabFlightModel,
  prefabPlacedObjectId,
  catalogRevisionNumber,
  PREFAB_FLIGHT_DEFINITION,
} from "@sidereal/sim/prefab-flight";
import { dressShip } from "@sidereal/sim/ship-dresser";
import { itemDefinitions } from "./item-definitions";
import {
  currentNavigationOperatorSnapshots,
  operatorVisualKey,
  pinnedOperatorVisuals,
  resolvePinnedOperatorVisuals,
  operatorMappingAgrees,
  navigationOperatorSnapshotsFor,
  type OperatorWorldRegistration,
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

function spawnedFixture(prefabId: string) {
  const doc = prefabById(prefabId)!,
    catalog = defaultPrefabComponentCatalog();
  const snapshot = compileConstruction(
    JSON.stringify(prefabConstructionDocument(doc, catalog)),
  );
  let sequence = 0;
  const plan = planConstructionInstance(
    snapshot,
    {
      blueprintRevisionId: "trusted-test-prefab",
      expectedBlueprintSha256: snapshot.sha256,
      sourceDeckId: PREFAB_DECK_ID,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0.05,
      partitionHalfWidthM: 0.05,
      objectCollisionBindings: [],
    },
    () =>
      `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, "0")}`,
  );
  const model = prefabFlightModel(doc, catalog),
    [x, y] = model.station!;
  const computer = model.fittings
    .filter((f) => f.role === "computer")
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId))[0];
  const mount = dressShip(doc, { catalog }).components.find(
    (c) => c.component === "console.navigation.sm",
  )!;
  const stable = (v: unknown): string =>
    JSON.stringify(v, (_key, value) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
          )
        : value,
    );
  const registration: OperatorWorldRegistration = {
    profileId: "test-only",
    certificateSha256: "a".repeat(64),
    proofSha256: "b".repeat(64),
    manifestSha256: "c".repeat(64),
    compilerSha256: "d".repeat(64),
    geometrySha256: "e".repeat(64),
    navigationSha256: "f".repeat(64),
    prefabId: doc.id,
    blueprintSha256: snapshot.sha256,
    catalogId: catalog.revision.split("@")[0],
    catalogRevision: catalogRevisionNumber(catalog.revision),
    catalogSha256: constructionHash(
      stable({
        revision: catalog.revision,
        components: [...catalog.list()].sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
      }),
    ),
    mountSourceId: mount.mount,
    stationX: x,
    stationY: y,
    measuredVisualKeys: [],
    measuredAppearanceKeys: ["{}"],
  };
  const instance = {
    id: plan.instanceId,
    revision: 3n,
    blueprintSha256: snapshot.sha256,
    documentJson: JSON.stringify(plan.document),
    idMapJson: JSON.stringify(plan.mappings),
  };
  const deck = {
    id: plan.spawn.deckId,
    instanceId: instance.id,
    sourceDeckId: PREFAB_DECK_ID,
    elevation: 0,
  };
  const body = {
    id: "body",
    shipId: instance.id,
    connected: true,
    localX: x,
    localY: y,
  };
  const location = {
    characterId: body.id,
    instanceId: instance.id,
    deckId: deck.id,
    visitId: "current-visit",
    revision: 2n,
  };
  const binding = {
    shipId: instance.id,
    instanceId: instance.id,
    deckId: deck.id,
    stationId: "station",
    instanceRevision: 3n,
    blueprintSha256: snapshot.sha256,
    definitionId: PREFAB_FLIGHT_DEFINITION,
    lifecycle: "active",
    revision: 4n,
  };
  const mapping = {
    stationId: "station",
    shipId: instance.id,
    deckId: deck.id,
    seatPlacedObjectId: prefabPlacedObjectId(instance.id, "station"),
    consolePlacedObjectId: prefabPlacedObjectId(instance.id, computer.sourceId),
    revision: 5n,
  };
  const station = {
    id: "station",
    shipId: instance.id,
    localX: x,
    localY: y,
    operational: true,
    occupantId: body.id,
  };
  const seat = {
    characterId: body.id,
    shipId: instance.id,
    stationId: "station",
    deckId: deck.id,
    instanceRevision: 3n,
    revision: 6n,
    recoveryRequested: false,
  };
  const db = {
    constructionFlightBinding: { shipId: { find: () => binding } },
    constructionFlightStation: { stationId: { find: () => mapping } },
    station: { id: { find: () => station } },
    constructionPilotSeat: { characterId: { find: () => seat } },
    characterVitals: { characterId: { find: () => ({ state: "alive" }) } },
    characterAppearance: {
      characterId: { find: () => ({ appearanceJson: "{}" }) },
    },
    inventoryItem: {
      by_character: { filter: () => [] as (typeof equipped)[] },
    },
    inventoryItemPin: { itemId: { find: () => undefined } },
    contentDefinitionHead: { definitionKey: { find: () => undefined } },
    contentDefinition: { definitionRef: { find: () => undefined } },
  };
  const visible = { actor: body, instance, deck, bodies: [{ body, location }] };
  return { db, visible, registration, mapping, station, seat };
}

test.each(["fed.s.wren", "fed.m.crest"])(
  "real spawned %s restores source IDs and distinguishes computer authority from rendered helm",
  (prefabId) => {
    const f = spawnedFixture(prefabId);
    const read = navigationOperatorSnapshotsFor(
      { db: f.db } as never,
      f.visible as never,
      [f.registration],
    );
    const packet = read(f.visible.bodies[0] as never);
    expect(packet).toBeDefined();
    expect(JSON.parse(packet!)).toMatchObject({
      status: "supported",
      visitId: "current-visit",
      mountSourceId: f.registration.mountSourceId,
      consolePlacedObjectId: f.mapping.consolePlacedObjectId,
      seatPlacedObjectId: f.mapping.seatPlacedObjectId,
    });
    expect(f.mapping.consolePlacedObjectId).not.toBe(
      prefabPlacedObjectId(f.visible.instance.id, f.registration.mountSourceId),
    );
    expect(packet).not.toMatch(
      /documentJson|idMapJson|blueprintSha256|inventoryItem|owner/,
    );
  },
);

test.each([
  "foreign-mapping",
  "stale-seat",
  "wrong-occupant",
  "recovery",
  "nonfinite-station",
  "new-visit",
])("positive trusted adapter refuses incoherent %s", (mode) => {
  const f = spawnedFixture("fed.s.wren");
  if (mode === "foreign-mapping") f.mapping.consolePlacedObjectId = "foreign";
  if (mode === "stale-seat") f.seat.instanceRevision = 2n;
  if (mode === "wrong-occupant") f.station.occupantId = "other";
  if (mode === "recovery") f.seat.recoveryRequested = true;
  if (mode === "nonfinite-station") f.station.localX = NaN;
  if (mode === "new-visit")
    f.visible.bodies[0].location.instanceId = "foreign-instance";
  expect(
    navigationOperatorSnapshotsFor({ db: f.db } as never, f.visible as never, [
      f.registration,
    ])(f.visible.bodies[0] as never),
  ).toBeUndefined();
});

test("post-trust visual/helper failure yields unavailable without losing accepted recovery context or leaking exceptions", () => {
  const f = spawnedFixture("fed.s.wren");
  f.db.characterAppearance.characterId.find = () => {
    throw Error("private-account/private-item/CAS999");
  };
  const packet = navigationOperatorSnapshotsFor(
    { db: f.db } as never,
    f.visible as never,
    [f.registration],
  )(f.visible.bodies[0] as never)!;
  expect(JSON.parse(packet)).toMatchObject({
    status: "visual-unavailable",
    acceptedX: f.visible.bodies[0].body.localX,
    unavailableSlots: [{ slot: null, reason: "request-unavailable" }],
  });
  expect(packet).not.toMatch(/private|CAS999/);
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

test("admitted serializer distinguishes unavailable pinned visuals without losing the accepted tuple", () => {
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
  ).toContain('"status":"visual-unavailable"');
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
  ).toContain('"status":"visual-unavailable"');
  const unmeasured = [{ ...visuals[0], crewItemId: "shield-pack" }];
  expect(
    operatorSnapshotJson(
      { registration, context },
      tuple,
      "{}",
      unmeasured,
      measured,
    ),
  ).toContain('"status":"visual-unavailable"');
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
  ).toContain('"status":"visual-unavailable"');
});

test("resolver failure and duplicate unknown slot expose only safe public reasons", () => {
  const defs = definitions();
  defs.find = () => {
    throw Error("private-item @999 internalCAS private-owner");
  };
  const resolved = resolvePinnedOperatorVisuals([equipped], defs);
  expect(resolved).toEqual({
    visuals: [],
    unavailableSlots: [{ slot: "hand", reason: "definition-unavailable" }],
  });
  expect(JSON.stringify(resolved)).not.toMatch(/private|999|internalCAS/);
  expect(
    resolvePinnedOperatorVisuals(
      [{ ...equipped, equipmentSlot: "private-unknown" }],
      defs,
    ).unavailableSlots,
  ).toEqual([{ slot: null, reason: "request-unavailable" }]);
});

test("grouped mapping must exactly agree with admitted identities plus the layout source", () => {
  const flat = { layout: "ship", deck: "accepted-deck", tile: "accepted-tile" };
  const grouped = {
    decks: [{ sourceId: "deck", instanceId: "accepted-deck" }],
    floors: [{ sourceId: "tile", instanceId: "accepted-tile" }],
  };
  expect(operatorMappingAgrees(JSON.stringify(grouped), flat, "ship")).toBe(
    true,
  );
  expect(
    operatorMappingAgrees(
      JSON.stringify({
        ...grouped,
        rooms: [{ sourceId: "invented", instanceId: "another" }],
      }),
      flat,
      "ship",
    ),
  ).toBe(false);
  expect(
    operatorMappingAgrees(
      JSON.stringify({ ...grouped, floors: [] }),
      flat,
      "ship",
    ),
  ).toBe(false);
  expect(
    operatorMappingAgrees(
      JSON.stringify(grouped),
      { ...flat, extra: "accepted-tile" },
      "ship",
    ),
  ).toBe(false);
  expect(
    operatorMappingAgrees(
      JSON.stringify({ ...grouped, privateFlag: true }),
      flat,
      "ship",
    ),
  ).toBe(false);
});
