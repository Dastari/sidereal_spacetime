import { describe, expect, test } from "vitest";
import {
  CONSTRUCTION_SCHEMA,
  CONSTRUCTION_COMPILER,
  type ConstructionDocument,
} from "@sidereal/content/construction";
import { CONSTRUCTION_BOUNDARY_PIN } from "@sidereal/content/construction-boundary";
import { CONSTRUCTION_BOUNDARY_FAMILY_PIN } from "@sidereal/content/construction-boundary-family";
import { emptyLayout, stampTile } from "@sidereal/content/ship-layout";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { CABIN_COLLIDERS } from "../../content/src/interior";
import {
  constrainLabDeck,
  LAB_CREW_CLEARANCE,
} from "../../content/src/pilot-layout";
import {
  createNativeAirlockDocument,
  bindNativeAirlockPlan,
  nativeAirlockCollision,
} from "@sidereal/sim/construction-airlock-document";
import { compilePublishedNativeExternalAirlock } from "@sidereal/sim/construction-airlock-published";
import {
  compileDeckCollision,
  resolveDeckCollision,
} from "@sidereal/sim/construction-collision";
import { doorLeafObstacle } from "@sidereal/sim/construction-door-motion";
import {
  createNativePressureRoomDocument,
  nativePressureRoomCollision,
} from "@sidereal/sim/construction-pressure-document";
import {
  createNativeStairRoomDocument,
  nativeStairRoomCollision,
} from "@sidereal/sim/construction-stairs-document";
import {
  createNativeTraversalRoomDocument,
  nativeTraversalRoomCollision,
} from "@sidereal/sim/construction-traversal-document";
import {
  compileConstruction,
  PINNED_FLOOR_KIT,
  FLOOR_KIT_HASH,
} from "@sidereal/sim/construction-transactions";
import { pinnedFamilyCollision } from "@sidereal/sim/construction-boundary-family";
import { planNativeBoundaries } from "@sidereal/sim/construction-boundaries";
import { planConstructionInstance } from "@sidereal/sim/construction-instance";
import {
  qualifiedWayfarerWalkingBindings,
  QUALIFIED_WAYFARER_SHA256,
} from "../../sim/src/wayfarer-walking-bindings";
import { REFIT_FUEL_ATTACHMENT } from "@sidereal/sim/wayfarer-refit-audit";
import { canonicalPolygon, inside } from "@sidereal/sim/layout-geometry";
import { createDebugCollisionSource } from "./debug-collision-source";
import type { ConstructionRenderInput } from "./construction-instance";

const input = (
  document: ConstructionDocument,
  deckId = document.layout.playableDeckId,
): ConstructionRenderInput => ({
  instanceId: document.layout.id,
  documentJson: JSON.stringify(document),
  deckId,
});

test("qualified Wayfarer source uses all 99 walking obstacles, validates the pin and never fabricates runtime object IDs", () => {
  const snapshot = compileConstruction(WAYFARER_STARTER.documentJson);
  expect(snapshot.sha256).toBe(QUALIFIED_WAYFARER_SHA256);
  const document = JSON.parse(snapshot.canonical) as ConstructionDocument;
  const source = createDebugCollisionSource(input(document));
  const result = source.resolve();
  expect(result.scope).not.toMatch(/unavailable/);
  expect(result.supported).toBe(true);
  expect(result.partial).toBe(true);
  expect(result.frames[0].obstacles).toHaveLength(99);
  for (const binding of qualifiedWayfarerWalkingBindings(snapshot, 0.3, 1.8))
    for (const [i, obstacle] of binding.obstacles.entries())
      expect(
        result.frames[0].obstacles.find(
          (o) => o.id === `source:${binding.sourceObjectId}:${i}`,
        )?.vertices,
      ).toEqual(canonicalPolygon(obstacle.vertices));
  expect(
    result.frames[0].obstacles.every((o) => o.id.startsWith("source:")),
  ).toBe(true);
  expect(result.scope).toContain("moving cargo/carriers");
  expect(source.resolve()).toBe(result);
});

test("a UUID-remapped admitted starter retains exact source geometry and accepted fuel mount, with no private map input", () => {
  const snapshot = compileConstruction(WAYFARER_STARTER.documentJson);
  let n = 1000;
  const plan = planConstructionInstance(
    snapshot,
    {
      blueprintRevisionId: WAYFARER_STARTER.blueprintId,
      expectedBlueprintSha256: snapshot.sha256,
      sourceDeckId: WAYFARER_STARTER.sourceDeckId,
      bodyRadiusM: 0.3,
      bodyHeightM: 1.8,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      objectCollisionBindings: qualifiedWayfarerWalkingBindings(
        snapshot,
        0.3,
        1.8,
      ),
    },
    () => `00000000-0000-4000-8000-${(--n).toString(16).padStart(12, "0")}`,
  );
  const admitted = input(plan.document, plan.spawn.deckId);
  admitted.attachments = [
    {
      id: "admitted-fuel",
      instanceId: plan.instanceId,
      deckId: plan.spawn.deckId,
      assetId: REFIT_FUEL_ATTACHMENT.assetId,
      assetSha256: REFIT_FUEL_ATTACHMENT.glbSha256,
      x: -3,
      y: 7,
      z: 0.1875,
    },
  ];
  const result = createDebugCollisionSource(admitted).resolve();
  expect(result.scope).not.toMatch(/unavailable/);
  expect(result.frames[0].shipId).toBe(plan.instanceId);
  expect(result.frames[0].deckId).toBe(plan.spawn.deckId);
  expect(result.frames[0].obstacles).toHaveLength(100);
  expect(
    result.frames[0].obstacles.find((o) => o.id === "admitted-fuel")?.vertices,
  ).toEqual([
    [-3.5, 6.5],
    [-2.5, 6.5],
    [-2.5, 7.5],
    [-3.5, 7.5],
  ]);
  const before = admitted.documentJson;
  createDebugCollisionSource(admitted).resolve();
  expect(admitted.documentJson).toBe(before);
  for (const field of ["x", "assetSha256", "instanceId"] as const) {
    const bad = structuredClone(admitted);
    Object.assign(bad.attachments![0], {
      [field]: field === "x" ? -2 : "wrong",
    });
    expect(createDebugCollisionSource(bad).resolve().supported).toBe(false);
  }
  const altered = structuredClone(plan.document);
  altered.layout.assembly!.parts[0].position[0] += 0.1;
  expect(createDebugCollisionSource(input(altered)).resolve().supported).toBe(
    false,
  );
  expect(
    createDebugCollisionSource({
      ...admitted,
      deckId: "unrelated-deck",
    }).resolve().frames,
  ).toEqual([]);
});

describe.each([
  ["stairs", createNativeStairRoomDocument, nativeStairRoomCollision],
  ["ladder", createNativeTraversalRoomDocument, nativeTraversalRoomCollision],
] as const)("native %s source", (_label, createDocument, colliders) => {
  test("both deck frames use shared simulation solids and retain the unsupported upper aperture", () => {
    const document = createDocument();
    const source = createDebugCollisionSource(input(document));
    for (const deck of document.layout.decks) {
      const result = source.resolve({ deckId: deck.id });
      expect(result.scope).not.toMatch(/unavailable/);
      const expected = resolveDeckCollision(
        compileDeckCollision(document.layout, deck.id, {
          shipId: document.layout.id,
          perimeterHalfWidthM: 0,
          partitionHalfWidthM: 0,
          obstacles: colliders(document, deck.id),
        }),
        [],
      );
      expect(result.frames).toEqual([expected]);
      expect(result.frames[0].elevationM).toBe(deck.elevation / 32);
      for (const hole of deck.holes)
        expect(
          result.frames[0].floors.some((p) =>
            inside([hole.seed[0] / 32, hole.seed[1] / 32], p),
          ),
        ).toBe(false);
    }
  });
});

test("pressure doorway keeps a physical open leaf; missing and partial accepted state keeps the aperture blocked", () => {
  const document = createNativePressureRoomDocument(),
    id = document.layout.openings[0].id;
  const source = createDebugCollisionSource(input(document));
  const closed = source.resolve();
  expect(closed.frames[0].obstacles).toEqual(
    compileDeckCollision(document.layout, document.layout.playableDeckId, {
      shipId: document.layout.id,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0.0625,
      obstacles: nativePressureRoomCollision(
        document,
        document.layout.playableDeckId,
      ),
    }).obstacles,
  );
  expect(closed.frames[0].segments.some((s) => s.id === `opening:${id}`)).toBe(
    true,
  );
  for (const fraction of [0, 0.5, 1]) {
    const result = source.resolve({ doors: [{ openingId: id, fraction }] });
    expect(
      result.frames[0].segments.some((s) => s.id === `opening:${id}`),
    ).toBe(fraction !== 1);
    const leaf = doorLeafObstacle(
      { id, origin: [2, 0], quarterTurns: 1 },
      fraction,
    );
    expect(result.frames[0].obstacles.find((o) => o.id === leaf.id)).toEqual(
      leaf,
    );
  }
  for (const doors of [
    [{ openingId: "unknown", fraction: 1 }],
    [{ openingId: id, fraction: NaN }],
    [{ openingId: id, fraction: 1.1 }],
    [
      { openingId: id, fraction: 0 },
      { openingId: id, fraction: 1 },
    ],
  ]) {
    expect(source.resolve({ doors }).supported).toBe(false);
  }
  expect(
    source.resolve({ doors: [{ openingId: id, fraction: 1 }] }).supported,
  ).toBe(true);
});

test.each(["r001", "r004"] as const)(
  "boundary %s uses its own approved structural source and width",
  (revision) => {
    const layout = emptyLayout(`boundary-${revision}`, "deck");
    for (let x = 0; x < 2; x++)
      for (let y = 0; y < 2; y++)
        layout.tiles.push(
          stampTile(`tile-${x}-${y}`, "deck", "rectangle", [x * 64, y * 64]),
        );
    if (revision === "r001") {
      layout.partitions.push({
        id: "partition",
        deckId: "deck",
        a: [64, 0],
        b: [64, 128],
        seal: "design-sealed",
      });
      layout.openings.push({
        id: "door",
        deckId: "deck",
        partitionId: "partition",
        a: [64, 12],
        b: [64, 52],
        kind: "door",
        clearance: 16,
        sill: 0,
      });
    }
    const document: ConstructionDocument = {
      schema: CONSTRUCTION_SCHEMA,
      compiler: CONSTRUCTION_COMPILER,
      layout,
      floorKit: {
        id: PINNED_FLOOR_KIT.id,
        revision: PINNED_FLOOR_KIT.revision,
        sha256: FLOOR_KIT_HASH,
      },
      boundaryKit:
        revision === "r001"
          ? { ...CONSTRUCTION_BOUNDARY_PIN }
          : { ...CONSTRUCTION_BOUNDARY_FAMILY_PIN },
      floors: layout.tiles.map((t) => ({
        id: t.id,
        deckId: t.deckId,
        partId: "square-2m",
        origin: [t.vertices[0][0], t.vertices[0][1], 0],
        quarterTurns: 0,
        reflected: false,
      })),
    };
    const states =
      revision === "r001" ? [{ openingId: "door", fraction: 0.75 }] : [];
    const result = createDebugCollisionSource(input(document)).resolve({
      doors: states,
    });
    expect(result.scope).not.toMatch(/unavailable/);
    if (revision === "r004") {
      const expected = compileDeckCollision(layout, "deck", {
        shipId: layout.id,
        perimeterHalfWidthM: 0,
        partitionHalfWidthM: 0,
        obstacles: pinnedFamilyCollision(layout, "deck"),
      });
      expect(result.frames).toEqual([resolveDeckCollision(expected, [])]);
      expect(result.frames[0].obstacles.length).toBeGreaterThan(0);
    } else {
      expect(
        result.frames[0].segments.some((s) => s.halfWidthM === 0.0625),
      ).toBe(true);
      const door = planNativeBoundaries(layout, "deck", { floorTopUnits: 6 })
        .doors[0];
      const leaf = doorLeafObstacle(
        {
          id: door.openingId,
          origin: [door.frameStartUnits[0] / 32, door.frameStartUnits[1] / 32],
          quarterTurns: door.quarterTurns,
        },
        0.75,
      );
      expect(result.frames[0].obstacles).toEqual([leaf]);
    }
  },
);

test("airlock uses the paired compiler and accepted seal state, including open leaves that do not disappear", () => {
  const document = createNativeAirlockDocument();
  const plan = bindNativeAirlockPlan(
    document,
    compilePublishedNativeExternalAirlock,
    document.layout.id,
  );
  const source = createDebugCollisionSource(input(document));
  const states = [
    {
      openingId: document.airlockRoom.innerDoorId,
      fraction: 1,
      sealRetraction: 1,
    },
    {
      openingId: document.airlockRoom.outerDoorId,
      fraction: 0.35,
      sealRetraction: 1,
    },
  ];
  const result = source.resolve({ doors: states });
  expect(result.scope).not.toMatch(/unavailable/);
  expect(result.frames).toEqual([
    nativeAirlockCollision(document, plan, states),
  ]);
  expect(
    result.frames[0].segments.some(
      (s) => s.id === `opening:${document.airlockRoom.innerDoorId}`,
    ),
  ).toBe(false);
  const deployedSeal = source.resolve({
    doors: [{ ...states[0], sealRetraction: 0 }, states[1]],
  });
  expect(
    deployedSeal.frames[0].segments.some(
      (s) => s.id === `opening:${document.airlockRoom.innerDoorId}`,
    ),
  ).toBe(true);
});

test("legacy diagnostics exactly use walk obstruction rectangles and the canopy centre-position clamp", () => {
  const result = createDebugCollisionSource().resolve(),
    frame = result.frames[0];
  expect(result.scope).toContain(".3m actor expansion");
  expect(frame.obstacles).toHaveLength(CABIN_COLLIDERS.length);
  for (const box of CABIN_COLLIDERS) {
    const obstacle = frame.obstacles.find((o) => o.id === box.id)!;
    expect(obstacle.vertices).toEqual([
      [box.x - box.width / 2, box.y - box.depth / 2],
      [box.x + box.width / 2, box.y - box.depth / 2],
      [box.x + box.width / 2, box.y + box.depth / 2],
      [box.x - box.width / 2, box.y + box.depth / 2],
    ]);
  }
  for (const y of [
    -7.5,
    8,
    8.324,
    8.326,
    9,
    10.8,
    11.5,
    LAB_CREW_CLEARANCE.maxY - 0.001,
  ]) {
    const edge = constrainLabDeck(100, y).x;
    expect(inside([edge - 0.0001, y], frame.floors[0])).toBe(true);
    expect(inside([edge + 0.0001, y], frame.floors[0])).toBe(false);
  }
});

test("malformed/foreign construction is explicitly unavailable instead of falling back to visual or legacy geometry", () => {
  for (const documentJson of ["{bad", "{}", WAYFARER_STARTER.documentJson]) {
    const result = createDebugCollisionSource({
      instanceId: "not-the-instance",
      deckId: "wrong",
      documentJson,
    }).resolve();
    expect(result).toMatchObject({
      frames: [],
      supported: false,
      partial: true,
    });
    expect(result.scope).toMatch(/^Collision source unavailable:/);
  }
});
