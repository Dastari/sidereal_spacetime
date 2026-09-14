import { expect, it } from "vitest";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { CONSTRUCTION_INSET_VISUAL_PIN } from "@sidereal/content/construction-inset-visuals";
import { compileLayout } from "./layout-compiler";
import { bindConstructionLayout } from "./construction-layout";
import { matchNativeFloorTile, floorModelOptions } from "./layout-native-floor";
import { compileConstruction } from "./construction-transactions";
import { planConstructionInstance } from "./construction-instance";
import { planPinnedInsetBoundaries } from "./construction-inset-boundaries";
import {
  compileDeckCollision,
  resolveDeckCollision,
  canOccupyDeck,
} from "./construction-collision";
function source() {
  const d = emptyLayout("inward-source", "main");
  d.decks[0].ceiling = 102;
  d.tiles = [
    [0, 0],
    [64, 0],
    [0, 64],
    [64, 64],
  ].map(([x, y], i) => {
    const t = stampTile("tile-" + i, "main", "rectangle", [0, 0]);
    t.vertices = [
      [x, y],
      [x + 64, y],
      [x + 64, y + 64],
      [x, y + 64],
    ];
    return t;
  });
  d.partitions = [
    {
      id: "partition",
      deckId: "main",
      a: [64, 0],
      b: [64, 128],
      seal: "design-sealed",
    },
  ];
  d.structure = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    grid: 16,
    hull: {
      id: "test",
      name: "test",
      revision: "1",
      width: 128,
      length: 128,
      height: 112,
      origin: [0, 0, 0],
    },
    tileStyles: {},
    wallFaces: {},
    armor: [],
    navigationReservations: [],
    deckProfiles: [
      {
        deckId: "main",
        floorThickness: 6,
        clearHeight: 96,
        roofThickness: 4,
        serviceVoid: 6,
        pitch: 112,
      },
    ],
    boundaryTreatments: [
      {
        id: "internal",
        deckId: "main",
        source: "partition",
        sourceAnchorId: "partition",
        a: [64, 0],
        b: [64, 128],
        treatment: "auto",
        reservationSide: "center",
      },
    ],
  };
  const compiled = compileLayout(d);
  expect(compiled.valid).toBe(true);
  const perimeter = compiled.walls.find((w) => w.source === "perimeter")!;
  d.structure.boundaryTreatments.push({
    id: "exterior",
    deckId: "main",
    source: "perimeter",
    sourceAnchorId: perimeter.anchorId,
    a: perimeter.a,
    b: perimeter.b,
    treatment: "auto",
  });
  const model = floorModelOptions(d.tiles[0], 0)[0];
  d.structure.tileStyles[d.tiles[0].id] = {
    model: { assetId: model.assetId, revision: model.revision },
  };
  expect(
    matchNativeFloorTile(
      d.tiles[0],
      0,
      d.structure.tileStyles[d.tiles[0].id].model,
    ),
  ).not.toBeNull();
  const result = bindConstructionLayout(d).document;
  result.boundaryKit = { ...CONSTRUCTION_INSET_VISUAL_PIN };
  return result;
}
const allocator = () => {
  let i = 0;
  return () =>
    "00000000-0000-4000-8000-" + (++i).toString(16).padStart(12, "0");
};
const request = (sha: string) => ({
  blueprintRevisionId: "review-blueprint",
  expectedBlueprintSha256: sha,
  sourceDeckId: "main",
  bodyRadiusM: 0.3,
  bodyHeightM: 1.8,
  perimeterHalfWidthM: 0,
  partitionHalfWidthM: 0,
  objectCollisionBindings: [],
});
it("two independent instances preserve exact native coverage and fully remap v2 attachments", () => {
  const doc = source(),
    before = JSON.stringify(doc),
    snapshot = compileConstruction(before),
    allocate = allocator();
  const a = planConstructionInstance(
      snapshot,
      request(snapshot.sha256),
      allocate,
    ),
    b = planConstructionInstance(snapshot, request(snapshot.sha256), allocate);
  expect(a.allocatedIds.some((id) => b.allocatedIds.includes(id))).toBe(false);
  expect(JSON.stringify(doc)).toBe(before);
  const geometry = (plan: ReturnType<typeof planPinnedInsetBoundaries>) =>
    plan.placements
      .map((p) => ({
        family: p.family,
        profileId: p.profileId,
        origin: p.originUnits,
        q: p.quarterTurns,
        height: p.quarterHeight,
      }))
      .sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
  const original = planPinnedInsetBoundaries(doc, "main");
  for (const instance of [a, b]) {
    expect(instance.document.boundaryKit).toEqual(
      CONSTRUCTION_INSET_VISUAL_PIN,
    );
    expect(
      compileConstruction(JSON.stringify(instance.document)).readiness,
    ).toEqual(snapshot.readiness);
    expect(
      geometry(
        planPinnedInsetBoundaries(instance.document, instance.spawn.deckId),
      ),
    ).toEqual(geometry(original));
    const config = instance.document.layout.structure;
    if (config?.schema !== "sidereal.layout-structure.v2") throw Error();
    expect(config.deckProfiles[0].deckId).toBe(instance.spawn.deckId);
    expect(Object.keys(config.tileStyles)).toEqual([
      instance.mappings.floors.find((m) => m.sourceId === "tile-0")!.instanceId,
    ]);
    expect(config.boundaryTreatments).toHaveLength(2);
    for (const t of config.boundaryTreatments) {
      expect(
        instance.mappings.boundaryTreatments.some((m) => m.instanceId === t.id),
      ).toBe(true);
      expect(t.deckId).toBe(instance.spawn.deckId);
      if (t.source === "partition")
        expect(t.sourceAnchorId).toBe(
          instance.mappings.partitions[0].instanceId,
        );
      else
        expect(t.sourceAnchorId.startsWith(instance.spawn.deckId + ":")).toBe(
          true,
        );
    }
    const bound = planPinnedInsetBoundaries(
      instance.document,
      instance.spawn.deckId,
    );
    const frame = resolveDeckCollision(
      compileDeckCollision(instance.document.layout, instance.spawn.deckId, {
        shipId: instance.instanceId,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
        obstacles: bound.obstacles,
      }),
      [],
    );
    expect(
      canOccupyDeck(
        frame,
        {
          shipId: instance.instanceId,
          deckId: instance.spawn.deckId,
          position: instance.spawn.positionM,
        },
        0.3,
      ),
    ).toBe(true);
    expect(instance.spawn.positionM[0]).toBeGreaterThanOrEqual(0.55 - 1e-6);
    expect(instance.spawn.walkingElevationM).toBe(0.1875);
  }
});
it("rejects absent/incompatible kit and profile instead of falling back", () => {
  const absent = source();
  delete absent.boundaryKit;
  expect(() => compileConstruction(JSON.stringify(absent))).toThrow();
  const pin = source();
  pin.boundaryKit!.sha256 = "0".repeat(64);
  expect(() => compileConstruction(JSON.stringify(pin))).toThrow();
  const profile = source();
  if (profile.layout.structure?.schema !== "sidereal.layout-structure.v2")
    throw Error();
  profile.layout.structure.deckProfiles[0].clearHeight = 48;
  expect(() => compileConstruction(JSON.stringify(profile))).toThrow();
});
