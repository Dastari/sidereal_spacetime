import { expect, test, vi } from "vitest";
import { emptyLayout, stampTile } from "../../content/src/ship-layout";
import { bindConstructionLayout } from "./construction-layout";
import {
  compileConstruction,
  readConstructionDraft,
} from "./construction-transactions";
import { planConstructionInstance } from "./construction-instance";
import {
  planConstructionRefitIdentities,
  type ConstructionRefitIdentityRequest,
} from "./construction-refit-identities";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
function setup() {
  const layout = emptyLayout("original", "lower");
  layout.tiles = [stampTile("floor", "lower", "rectangle", [0, 0])];
  layout.assembly = {
    schema: "sidereal.layout-assembly.v1",
    source: null,
    revisions: { "immutable-art": "hash" },
    parts: [
      {
        id: "structural-wall",
        assetId: "immutable-art",
        position: [0, 0, 0],
        rotation: 0,
        flipped: false,
        removedCells: [],
      },
    ],
  };
  const snapshot = compileConstruction(
    JSON.stringify(bindConstructionLayout(layout).document),
  );
  let counter = 0;
  const instance = planConstructionInstance(
    snapshot,
    {
      blueprintRevisionId: "revision-1",
      expectedBlueprintSha256: snapshot.sha256,
      sourceDeckId: "lower",
      bodyRadiusM: 0.25,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0.05,
      partitionHalfWidthM: 0.05,
      objectCollisionBindings: [
        {
          sourceObjectId: "structural-wall",
          definitionId: "qualified-nonblocking",
          deckIds: ["lower"],
          obstacles: [],
        },
      ],
    },
    () => uuid(++counter),
  );
  const candidate = JSON.parse(snapshot.canonical);
  candidate.layout.name = "Rebuilt";
  candidate.layout.partitions = [
    {
      id: "new-partition",
      deckId: "lower",
      a: [32, 0],
      b: [32, 64],
      seal: "design-sealed",
    },
  ];
  const proof = readConstructionDraft(JSON.stringify(candidate));
  const request: ConstructionRefitIdentityRequest = {
    instanceId: instance.instanceId,
    currentRevision: 4n,
    expectedRevision: 4n,
    sourceCanonical: snapshot.canonical,
    expectedSourceSha256: snapshot.sha256,
    sourceBlueprintRevisionId: "revision-1",
    currentInstanceDocumentJson: JSON.stringify(instance.document),
    candidateCanonical: proof.canonical,
    expectedCandidateSha256: proof.sha256,
    blueprintRevisionId: "revision-2",
    existingMappings: instance.mappings,
    protectedObjectIds: [],
    removableObjectIds: [],
  };
  return {
    request,
    candidate,
    instance,
    allocate: vi.fn(() => uuid(++counter)),
  };
}
function updated(
  request: ConstructionRefitIdentityRequest,
  candidate: unknown,
) {
  const p = readConstructionDraft(JSON.stringify(candidate));
  return {
    ...request,
    candidateCanonical: p.canonical,
    expectedCandidateSha256: p.sha256,
  };
}
test("retains existing identities, allocates only additions and returns no gameplay approval", () => {
  const { request, instance, allocate } = setup(),
    plan = planConstructionRefitIdentities(request, allocate);
  expect(plan.instanceId).toBe(instance.instanceId);
  expect(plan.mappings.decks).toEqual(instance.mappings.decks);
  expect(plan.mappings.floors).toEqual(instance.mappings.floors);
  expect(plan.mappings.objects).toEqual(instance.mappings.objects);
  expect(plan.allocatedIds).toHaveLength(1);
  expect(plan.document.layout.partitions[0].deckId).toBe(
    instance.mappings.decks[0].instanceId,
  );
  expect(plan.qualificationRequired).toBe(true);
  expect(plan.nextRevision).toBe(5n);
  expect(JSON.stringify(instance.document)).toBe(
    request.currentInstanceDocumentJson,
  );
});
test("rejects stale revision and changed source/live proof before any allocation", () => {
  const { request, allocate } = setup();
  for (const patch of [
    { expectedRevision: 3n },
    { expectedSourceSha256: "a".repeat(64) },
    { expectedCandidateSha256: "a".repeat(64) },
    { sourceCanonical: request.sourceCanonical + " " },
  ])
    expect(() =>
      planConstructionRefitIdentities({ ...request, ...patch }, allocate),
    ).toThrow();
  const live = JSON.parse(request.currentInstanceDocumentJson);
  live.layout.name = "Changed after review";
  expect(() =>
    planConstructionRefitIdentities(
      { ...request, currentInstanceDocumentJson: JSON.stringify(live) },
      allocate,
    ),
  ).toThrow("Live instance");
  expect(allocate).not.toHaveBeenCalled();
});
test("replaying against incremented revision fails and deterministic allocator reproduces proposal", () => {
  const a = setup(),
    b = setup();
  const plan = planConstructionRefitIdentities(a.request, a.allocate);
  expect(plan).toEqual(planConstructionRefitIdentities(b.request, b.allocate));
  expect(() =>
    planConstructionRefitIdentities(
      { ...a.request, currentRevision: plan.nextRevision },
      a.allocate,
    ),
  ).toThrow("Revision conflict");
});
test("object deletion requires explicit structural approval and never deletes protected contents owners", () => {
  const { request, candidate, instance, allocate } = setup();
  candidate.layout.assembly.parts = [];
  const req = updated(request, candidate),
    id = instance.mappings.objects[0].instanceId;
  expect(() => planConstructionRefitIdentities(req, allocate)).toThrow(
    "Object removal",
  );
  expect(() =>
    planConstructionRefitIdentities(
      { ...req, removableObjectIds: [id], protectedObjectIds: [id] },
      allocate,
    ),
  ).toThrow("Protected object");
  const plan = planConstructionRefitIdentities(
    { ...req, removableObjectIds: [id] },
    allocate,
  );
  expect(plan.removed).toEqual([
    { domain: "objects", ...instance.mappings.objects[0] },
  ]);
});
test("rejects malicious allocator, duplicate mapping domains and bounded reserved IDs", () => {
  const { request, instance } = setup();
  for (const id of [
    "invalid",
    instance.instanceId,
    instance.mappings.decks[0].instanceId,
  ])
    expect(() => planConstructionRefitIdentities(request, () => id)).toThrow(
      "Allocator",
    );
  expect(() =>
    planConstructionRefitIdentities(
      { ...request, reservedIds: [uuid(99).toUpperCase()] },
      () => uuid(99),
    ),
  ).toThrow("Allocator");
  expect(() =>
    planConstructionRefitIdentities(
      { ...request, reservedIds: Array(16385).fill(uuid(99)) },
      () => uuid(100),
    ),
  ).toThrow("budget");
  expect(() =>
    planConstructionRefitIdentities(
      {
        ...request,
        existingMappings: { ...request.existingMappings, alias: [] } as never,
      },
      () => uuid(100),
    ),
  ).toThrow("Unknown mapping domain");
});
test("remaps v2 boundary anchors, reservations and exact native identity while preserving native asset data", () => {
  const { request, candidate, instance, allocate } = setup();
  candidate.layout.structure = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    hull: {
      id: "hull",
      revision: "r1",
      name: "Hull",
      width: 320,
      length: 704,
      height: 112,
      origin: [-160, -352, 0],
    },
    grid: 32,
    wallFaces: {},
    tileStyles: { floor: { material: "floor" } },
    armor: [],
    deckProfiles: [
      {
        deckId: "lower",
        floorThickness: 6,
        clearHeight: 96,
        roofThickness: 4,
        serviceVoid: 6,
        pitch: 112,
      },
    ],
    navigationReservations: [
      {
        id: "reserved",
        deckId: "lower",
        vertices: [
          [0, 0],
          [8, 0],
          [0, 8],
        ],
        reason: "nonwalkable",
      },
    ],
    boundaryTreatments: [
      {
        id: "treatment",
        deckId: "lower",
        source: "partition",
        sourceAnchorId: "new-partition",
        a: [32, 0],
        b: [32, 64],
        treatment: "custom",
        native: {
          id: "structural-wall",
          revision: "structural-wall",
          sha256: "a".repeat(64),
        },
      },
    ],
  };
  candidate.layout.decks[0].ceiling = 102;
  const plan = planConstructionRefitIdentities(
      updated(request, candidate),
      allocate,
    ),
    s = plan.document.layout.structure!;
  expect(s.schema).toBe("sidereal.layout-structure.v2");
  if (s.schema !== "sidereal.layout-structure.v2") return;
  expect(s.navigationReservations[0].id).toBe(
    plan.mappings.navigationReservations[0].instanceId,
  );
  expect(s.navigationReservations[0].deckId).toBe(
    instance.mappings.decks[0].instanceId,
  );
  expect(s.boundaryTreatments[0].native?.id).toBe(
    instance.mappings.objects[0].instanceId,
  );
  expect(s.boundaryTreatments[0].native?.revision).toBe("structural-wall");
  expect(s.tileStyles[instance.mappings.floors[0].instanceId].material).toBe(
    "floor",
  );
  expect(s.boundaryTreatments[0].sourceAnchorId).toBe(
    plan.mappings.partitions[0].instanceId,
  );
});

test("missing and aliased existing IDs fail the conservation proof", () => {
  const { request, instance, allocate } = setup();
  expect(() =>
    planConstructionRefitIdentities(
      {
        ...request,
        existingMappings: { ...request.existingMappings, floors: [] },
      },
      allocate,
    ),
  ).toThrow("Incomplete");
  expect(() =>
    planConstructionRefitIdentities(
      {
        ...request,
        existingMappings: {
          ...request.existingMappings,
          floors: [
            {
              ...request.existingMappings.floors[0],
              instanceId: instance.mappings.decks[0].instanceId,
            },
          ],
        },
      },
      allocate,
    ),
  ).toThrow("Duplicate");
  expect(allocate).not.toHaveBeenCalled();
});

test("duplicate allocation across multiple additions is rejected and inputs remain unchanged", () => {
  const { request, candidate } = setup();
  candidate.layout.rooms = [
    {
      id: "room",
      deckId: "lower",
      name: "Room",
      type: "Cargo",
      seed: [16, 16],
      boundaryIds: ["new-partition"],
      access: "crew",
      floorTheme: "none",
      wallTheme: "none",
    },
  ];
  const req = updated(request, candidate),
    before = req.candidateCanonical;
  expect(() => planConstructionRefitIdentities(req, () => uuid(99))).toThrow(
    "duplicate",
  );
  expect(req.candidateCanonical).toBe(before);
});
