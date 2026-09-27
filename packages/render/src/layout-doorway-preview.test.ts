import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  emptyLayout,
  stampTile,
  type Point,
} from "@sidereal/content/ship-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { positiveOverlap } from "@sidereal/sim/layout-geometry";
import { planLayoutInsetVisuals } from "./layout-inset-visual-plan";
import { INSET_VISUAL_PARTS } from "./inset-visual-registry";
import { doorwayWallSpans } from "./layout-doorway-walls";
import {
  planLayoutDoorways,
  loadLayoutDoorways,
} from "./layout-doorway-preview";
import { DOORWAY250_VISUALS } from "@sidereal/content/construction-doorway-visuals";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { proposeWallOpening } from "@sidereal/sim/layout-structure";
import { createDoorway250ReviewLayout } from "@sidereal/content/doorway250-review-layout";
const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.unstubAllGlobals();
});
function document() {
  const doc = emptyLayout("doors", "main");
  doc.decks[0].elevation = 112;
  doc.decks[0].ceiling = 102;
  doc.structure = {
    schema: "sidereal.layout-structure.v2",
    wallConvention: "inset250-v1",
    grid: 16,
    hull: {
      id: "room",
      name: "Room",
      revision: "1",
      width: 128,
      length: 128,
      height: 224,
      origin: [0, 0, 0],
    },
    tileStyles: {},
    wallFaces: {},
    armor: [],
    navigationReservations: [],
    boundaryTreatments: [
      {
        id: "centered-left",
        deckId: "main",
        source: "partition",
        sourceAnchorId: "wall",
        a: [0, 0],
        b: [44, 0],
        treatment: "auto",
        reservationSide: "center",
      },
      {
        id: "centered-right",
        deckId: "main",
        source: "partition",
        sourceAnchorId: "wall",
        a: [84, 0],
        b: [128, 0],
        treatment: "auto",
        reservationSide: "center",
      },
    ],
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
  };
  doc.partitions = [
    {
      id: "wall",
      deckId: "main",
      a: [0, 0],
      b: [128, 0],
      seal: "design-sealed",
    },
  ];
  doc.openings = [
    {
      id: "door",
      deckId: "main",
      partitionId: "wall",
      kind: "door",
      a: [44, 0],
      b: [84, 0],
      clearance: 32,
      sill: 0,
      setback: 12,
    },
  ];
  return doc;
}
it("matches the unscaled native aperture, floor datum and full-frame wall exclusion in both directions", () => {
  const doc = document(),
    source = JSON.stringify(doc);
  const plan = planLayoutDoorways(doc, "main");
  expect(plan.issues).toEqual([]);
  expect(plan.requests).toEqual([
    {
      openingId: "door",
      deckId: "main",
      originM: [1, -0.125, 3.6875],
      yawRadians: 0,
    },
  ]);
  expect(plan.wallExclusions).toEqual([
    {
      openingId: "door",
      deckId: "main",
      partitionId: "wall",
      a: [32, 0],
      b: [96, 0],
    },
  ]);
  expect(JSON.stringify(doc)).toBe(source);
  [doc.openings[0].a, doc.openings[0].b] = [
    doc.openings[0].b,
    doc.openings[0].a,
  ];
  expect(planLayoutDoorways(doc, "main").requests[0]).toMatchObject({
    originM: [3, 0.125, 3.6875],
    yawRadians: Math.PI,
  });
});
it("preserves passages and rejects wrong width, short walls, corner conflicts and overlapping frame reserves", () => {
  const doc = document();
  doc.openings[0].kind = "passage";
  expect(planLayoutDoorways(doc, "main").requests).toHaveLength(0);
  doc.openings[0].kind = "door";
  doc.openings[0].b = [76, 0];
  expect(planLayoutDoorways(doc, "main").issues[0].message).toMatch(/1.25/);
  doc.openings[0].a = [0, 0];
  doc.openings[0].b = [40, 0];
  expect(planLayoutDoorways(doc, "main").issues[0].message).toMatch(/375/);
  doc.openings[0].a = [44, 0];
  doc.openings[0].b = [84, 0];
  doc.openings.push({
    ...doc.openings[0],
    id: "second",
    a: [88, 0],
    b: [128, 0],
  });
  expect(planLayoutDoorways(doc, "main").requests).toHaveLength(0);
  doc.openings.pop();
  doc.partitions.push({
    id: "junction",
    deckId: "main",
    a: [40, 0],
    b: [40, 32],
    seal: "design-sealed",
  });
  expect(planLayoutDoorways(doc, "main").issues[0].message).toMatch(/junction/);
  doc.partitions.pop();
  if (doc.structure?.schema !== "sidereal.layout-structure.v2")
    throw Error("Fixture requires v2");
  doc.structure.deckProfiles[0].clearHeight = 48;
  expect(planLayoutDoorways(doc, "main").requests).toHaveLength(0);
});
function setup() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const parent = new TransformNode("ship", scene);
  const fetcher = vi.fn(async (url: string) => {
    const bytes = readFileSync("assets/runtime" + url.replace(/^\/assets/, ""));
    return {
      ok: true,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  return { scene, parent, fetcher };
}
it("assembles the full 2 m frame between native centered wall spans without doubled jamb solids", () => {
  const doc = document();
  doc.tiles = [
    [0, 0],
    [64, 0],
    [128, 0],
    [0, 64],
    [64, 64],
    [128, 64],
  ].map((origin, i) =>
    stampTile("floor-" + i, "main", "rectangle", origin as Point),
  );
  doc.partitions[0].a = [0, 64];
  doc.partitions[0].b = [192, 64];
  doc.openings[0].a = [76, 64];
  doc.openings[0].b = [116, 64];
  if (doc.structure?.schema !== "sidereal.layout-structure.v2")
    throw Error("Fixture requires v2");
  doc.structure.hull.width = 192;
  doc.structure.boundaryTreatments[0].a = [0, 64];
  doc.structure.boundaryTreatments[0].b = [76, 64];
  doc.structure.boundaryTreatments[1].a = [116, 64];
  doc.structure.boundaryTreatments[1].b = [192, 64];
  const compiled = compileLayout(doc),
    before = JSON.stringify(compiled.walls);
  expect(compiled.diagnostics.filter((d) => d.severity === "error")).toEqual(
    [],
  );
  const door = planLayoutDoorways(doc, "main"),
    clipped = doorwayWallSpans(compiled.walls, door);
  expect(door.issues).toEqual([]);
  const partition = clipped.filter((w) => w.source === "partition");
  expect(
    partition.reduce(
      (sum, w) => sum + Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]),
      0,
    ),
  ).toBe(128);
  expect(JSON.stringify(compiled.walls)).toBe(before);
  const plan = planLayoutInsetVisuals({
    document: doc,
    compiled,
    deckId: "main",
  });
  expect(plan.issues).toEqual([]);
  const reservation: Point[] = [
    [2, 1.875],
    [4, 1.875],
    [4, 2.125],
    [2, 2.125],
  ];
  const walls = plan.requests.filter(
    (request) =>
      INSET_VISUAL_PARTS.find((part) => part.key === request.key)?.kind ===
      "wall",
  );
  expect(walls.length).toBeGreaterThan(10);
  for (const request of walls) {
    const part = INSET_VISUAL_PARTS.find((part) => part.key === request.key)!;
    if (!("footprintM" in part)) throw Error("Native wall footprint missing");
    const angle = request.yawRadians ?? (request.quarterTurns * Math.PI) / 2;
    const c = Math.round(Math.cos(angle)),
      s = Math.round(Math.sin(angle));
    const polygon = part.footprintM.map(
      ([x, y]) =>
        [
          request.originM[0] + c * x - s * y,
          request.originM[1] + s * x + c * y,
        ] as Point,
    );
    expect(positiveOverlap(reservation, polygon), request.key).toBe(false);
  }
});
it("the normal opening edit produces a renderable native door and wall plan without hand-authored jamb metadata", () => {
  const source = createDoorway250ReviewLayout();
  source.openings = [];
  if (source.structure?.schema !== "sidereal.layout-structure.v2")
    throw Error();
  source.structure.boundaryTreatments = [
    {
      ...source.structure.boundaryTreatments[0],
      a: [0, 64],
      b: [192, 64],
    },
  ];
  const next = proposeWallOpening(source, {
    id: "new-door",
    deckId: source.playableDeckId,
    partitionId: source.partitions[0].id,
    slot: [96, 64],
    width: 40,
    kind: "door",
    clearance: 16,
    sill: 0,
    setback: 12,
  });
  expect(compileLayout(next).valid).toBe(true);
  expect(planLayoutDoorways(next, next.playableDeckId)).toMatchObject({
    requests: [{ openingId: "new-door", originM: [2, 1.875, 0.1875] }],
    issues: [],
  });
  expect(
    planLayoutInsetVisuals({
      document: next,
      compiled: compileLayout(next),
      deckId: next.playableDeckId,
    }).issues,
  ).toEqual([]);
  const corner = proposeWallOpening(source, {
    id: "corner-door",
    deckId: source.playableDeckId,
    partitionId: source.partitions[0].id,
    slot: [32, 64],
    width: 40,
    kind: "door",
    clearance: 16,
    sill: 0,
    setback: 12,
  });
  expect(compileLayout(corner).valid).toBe(true);
  expect(planLayoutDoorways(corner, corner.playableDeckId)).toMatchObject({
    requests: [],
    issues: [{ message: expect.stringMatching(/frame overlaps another wall/) }],
  });
});
it("loads exact authored parts once, preserves hinge bind and uses independent seals for accepted poses", async () => {
  const f = setup();
  const request = planLayoutDoorways(document(), "main").requests[0];
  const view = await loadLayoutDoorways(f.scene, f.parent, [
    request,
    { ...request, openingId: "other", originM: [8, 0, 0.1875] },
  ]);
  expect(f.fetcher).toHaveBeenCalledTimes(4);
  expect(view.entries).toHaveLength(2);
  const [a, b] = view.entries;
  expect(a.hinge.position.asArray()).toEqual([0.3125, -0.1875, -0.0625]);
  expect(a.ring.morphTargetManager).not.toBe(b.ring.morphTargetManager);
  expect(a.ring.geometry).toBe(b.ring.geometry);
  expect(a.ring.isVisible).toBe(false);
  const leaf = view.meshes.find(
    (m) =>
      m.metadata.openingId === a.openingId && m.metadata.nativePart === "leaf",
  )!;
  const vertex = Vector3.FromArray(leaf.getVerticesData("position")!, 0);
  const closed = Vector3.TransformCoordinates(
    vertex,
    leaf.computeWorldMatrix(true),
  );
  const hinge = Vector3.TransformCoordinates(
    Vector3.Zero(),
    a.hinge.computeWorldMatrix(true),
  );
  view.setDoors([
    { openingId: a.openingId, fraction: 1 },
    { openingId: b.openingId, fraction: 0, sealRetraction: 0 },
  ]);
  const opened = Vector3.TransformCoordinates(
    vertex,
    leaf.computeWorldMatrix(true),
  );
  expect(opened.x).toBeCloseTo(hinge.x + closed.z - hinge.z, 6);
  expect(opened.z).toBeCloseTo(hinge.z - closed.x + hinge.x, 6);
  expect(opened.y).toBeCloseTo(closed.y, 6);
  expect(a.ring.morphTargetManager!.getTarget(0).influence).toBe(1);
  expect(b.ring.morphTargetManager!.getTarget(0).influence).toBe(0);
  expect(a.root.metadata.pressureReady).toBe(false);
  view.setDoors([{ openingId: a.openingId, fraction: 1, sealRetraction: 0 }]);
  expect(a.ring.isVisible).toBe(false);
  expect(b.ring.isVisible).toBe(false);
  view.dispose();
  view.dispose();
  expect(f.scene.meshes).toHaveLength(0);
  expect(f.scene.morphTargetManagers).toHaveLength(0);
  expect(f.parent.isDisposed()).toBe(false);
});
it("checks source pins and refuses duplicate or invalid placements before loading", async () => {
  for (const part of DOORWAY250_VISUALS.parts) {
    const bytes = readFileSync(
      "assets/runtime" + part.url.replace(/^\/assets/, ""),
    );
    expect(constructionHash(bytes)).toBe(part.sha256);
  }
  const f = setup(),
    request = planLayoutDoorways(document(), "main").requests[0];
  await expect(
    loadLayoutDoorways(f.scene, f.parent, [request, request]),
  ).rejects.toThrow(/placement/);
  expect(f.fetcher).not.toHaveBeenCalled();
  f.fetcher.mockResolvedValue({
    ok: true,
    arrayBuffer: async () => new Uint8Array([0]).buffer,
  });
  await expect(
    loadLayoutDoorways(f.scene, f.parent, [request]),
  ).rejects.toThrow(/hash/);
  expect(f.scene.meshes).toHaveLength(0);
});
