import { describe, expect, it, vi } from "vitest";
import {
  GLTF_TO_ZUP,
  componentMatrix,
  mountRotation,
  multiply,
  transformPoint,
} from "@sidereal/render/prefab-ship/frames";
import { bowGlass, bowHeights } from "@sidereal/content/bow-profiles";
import { G, placedTilePolygon } from "@sidereal/content/construction-grammar";
import { insidePolygon } from "@sidereal/content/construction-grammar";
import {
  deriveInterior,
  volumeGeometry,
  placeMount,
  placeMountTile,
} from "@sidereal/content/ship-prefab";
import { dressShip } from "./ship-dresser";
import * as dresser from "./ship-dresser";
import {
  polygonBoundarySample,
  sampleShipVisualLayers,
} from "./ship-visual-sampler";
import type { ShipVisualLayer } from "@sidereal/content/ship-visual";
import {
  referencePlateDecals,
  referenceCockpitApertureSourceAdmittedR002,
  SHIP_VISUAL_MACRO_PROFILES_R002,
  REFERENCE_OPTICAL_INTERFACES_R002,
} from "@sidereal/content/ship-visual-r002";
import {
  referenceCockpitApertureR002,
  referenceStaticWallFittingBoundsR002,
  referenceOpticalGuardBoxesR002,
  referenceOpticalMatingSolidsR002,
  referenceOpticalMatingCubeR002,
  compactColumns,
} from "./ship-visual-layers-r002";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import {
  createRetainedWallBoundaryR002,
  RETAINED_WALL_INPUTS_R002,
} from "./ship-visual-r002-retained-wall-boundary";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  compileShipVisual,
  visualProfilesSha256,
  visualVolumeSha256,
  visualCellKey,
  removeShipVisualCells,
  type VisualCell,
} from "./ship-visual-compiler";

describe("retained original guarded wall composition", () => {
  const catalog = defaultPrefabComponentCatalog();
  const ship = PREFAB_SHIPS.find((s) => s.id === "fed.s.wren")!;
  it("keeps original profile projection and airlock living selection independent of the new purpose", () => {
    expect(
      Object.keys(RETAINED_WALL_INPUTS_R002.federation.wallTasks),
    ).toHaveLength(9);
    expect(RETAINED_WALL_INPUTS_R002.federation.wallTasks).not.toHaveProperty(
      "airlock",
    );
    expect(RETAINED_WALL_INPUTS_R002.aurelian.corner).toBe(3);
    expect(RETAINED_WALL_INPUTS_R002.riftjack.course).toBe(40);
    const room = {
      ...ship.rooms[0],
      id: "air",
      type: "airlock" as const,
      rect: [0, 0, 8, 2] as [number, number, number, number],
    };
    const doc = { ...ship, rooms: [room] },
      interior = { ...deriveInterior(doc, 0, catalog), sockets: [] };
    const helper = createRetainedWallBoundaryR002(
      doc,
      interior,
      [],
      "federation",
      () => false,
    );
    const runs = helper.forFace("face", [0, 0], [128, 0], [0, 1]);
    expect(runs).toHaveLength(1);
    expect(runs[0].key).toBe("living");
    expect(runs[0].U - runs[0].u).toBe(40);
  });
  it("finishes complete old main and secondary ranking before a protected-band projection", () => {
    const room = {
      ...ship.rooms[0],
      id: "air",
      type: "airlock" as const,
      rect: [0, 0, 8, 2] as [number, number, number, number],
    };
    const doc = { ...ship, rooms: [room] },
      interior = { ...deriveInterior(doc, 0, catalog), sockets: [] };
    const helper = createRetainedWallBoundaryR002(
      doc,
      interior,
      [],
      "federation",
      () => false,
    );
    const choice = helper.forFace("source", [0, 0], [128, 0], [0, 1])[0];
    const template = (y: number): ShipVisualLayer => ({
      id: "wall:task:case",
      role: "plate",
      slot: "primary",
      support: "wall",
      surfaceRole: "wall",
      normalHint: [0, 1, 0],
      bounds: [44, y, 6, 84, y + 1, 22],
    });
    const layers = [
      template(0),
      template(8),
      ...[0, 8].map((y) => ({
        id: "wall:core",
        role: "core" as const,
        slot: "secondary" as const,
        support: "wall",
        bounds: [44, y + 1, 6, 84, y + 3, 22] as ShipVisualLayer["bounds"],
      })),
    ];
    // Reverse collection order: original global ranking still selects face aa,
    // while the protected zz band receives its actual secondary recipe.
    helper.collect(choice, "zz", "wall", [template(8)]);
    helper.collect(choice, "aa", "wall", [template(0)]);
    const out = helper.finish(sampleShipVisualLayers(layers));
    const main = out.filter((l) => l.id.includes(":room-task:air:"));
    const secondary = out.filter((l) =>
      l.id.includes(":secondary-room-task:air:"),
    );
    expect(main.length).toBeGreaterThan(0);
    expect(main.every((l) => l.bounds[1] === 0)).toBe(true);
    expect(secondary.length).toBeGreaterThan(0);
    expect(secondary.every((l) => l.bounds[1] === 8)).toBe(true);
    expect(secondary.some((l) => l.role === "void")).toBe(true);
    for (const l of [...main, ...secondary]) {
      expect(l.support).toBe("wall");
      expect(l.surfaceRole).toBe("wall");
      expect(l.normalHint).toEqual([0, 1, 0]);
      expect(l.bounds[3] - l.bounds[0]).toBe(1);
      expect(l.bounds[5] - l.bounds[2]).toBe(1);
    }
  });
});

describe("candidate ordered column compaction", () => {
  const column = (
    x: number,
    id = "case",
    role: ShipVisualLayer["role"] = "core",
  ): ShipVisualLayer => ({
    id,
    role,
    slot: "secondary",
    support: "pressure",
    bounds: [x, 0, 0, x + 1, 1, 3],
  });
  const cells = (layers: ShipVisualLayer[]) =>
    [...sampleShipVisualLayers(layers)].sort(([a], [b]) => a.localeCompare(b));
  const exposed = (layers: ShipVisualLayer[]) => {
    const volume = sampleShipVisualLayers(layers);
    return [...volume.values()]
      .flatMap((c) =>
        [
          [-1, 0, 0],
          [1, 0, 0],
          [0, -1, 0],
          [0, 1, 0],
          [0, 0, -1],
          [0, 0, 1],
        ]
          .filter(
            (n) =>
              !volume.has(visualCellKey(c.x + n[0], c.y + n[1], c.z + n[2])),
          )
          .map((n) => ({ cell: c, face: n })),
      )
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  };
  it("preserves reconstructed core after overlapping clears with reused IDs and split heights", () => {
    const layers = [
      column(0),
      column(0, "clear", "void"),
      column(1),
      column(0),
      {
        ...column(1, "clear", "void"),
        bounds: [1, 0, 1, 2, 1, 2] as ShipVisualLayer["bounds"],
      },
      {
        ...column(1),
        slot: "primary" as const,
        bounds: [1, 0, 1, 2, 1, 2] as ShipVisualLayer["bounds"],
      },
    ];
    const compacted = compactColumns(layers);
    expect(cells(compacted)).toEqual(cells(layers));
    expect(exposed(compacted)).toEqual(exposed(layers));
    const intact = sampleShipVisualLayers(layers),
      actual = sampleShipVisualLayers(compacted);
    const removed = (volume: typeof actual) =>
      [...removeShipVisualCells(volume, new Set(["0,0,1"]))].sort(([a], [b]) =>
        a.localeCompare(b),
      );
    expect(removed(actual)).toEqual(removed(intact));
  });
  it("merges compatible adjacent columns across only spatially disjoint writes", () => {
    const layers = [column(0), column(3, "independent", "void"), column(1)];
    const compacted = compactColumns(layers);
    expect(compacted).toHaveLength(2);
    expect(compacted[0].bounds).toEqual([0, 0, 0, 2, 1, 3]);
    expect(cells(compacted)).toEqual(cells(layers));
  });
  it("compacts interleaved revisits while preserving every column's entire write sequence", () => {
    const layers = [
      column(0),
      column(1),
      column(0, "clear", "void"),
      column(1, "clear", "void"),
      { ...column(0), slot: "primary" as const },
      { ...column(1), slot: "primary" as const },
    ];
    const compacted = compactColumns(layers);
    expect(compacted).toHaveLength(3);
    expect(compacted.map((l) => [l.role, l.slot, l.bounds])).toEqual([
      ["core", "secondary", [0, 0, 0, 2, 1, 3]],
      ["void", "secondary", [0, 0, 0, 2, 1, 3]],
      ["core", "primary", [0, 0, 0, 2, 1, 3]],
    ]);
    expect(cells(compacted)).toEqual(cells(layers));
    expect(exposed(compacted)).toEqual(exposed(layers));
  });
  it("joins available compatible writes from unequal-length column stacks without crossing predecessors", () => {
    const layers = [
      column(0),
      column(1),
      column(2),
      column(1, "intermediate", "plate"),
      column(2, "intermediate", "plate"),
      { ...column(0, "final"), slot: "primary" as const },
      { ...column(1, "final"), slot: "primary" as const },
      { ...column(2, "final"), slot: "primary" as const },
    ];
    const compacted = compactColumns(layers);
    expect(compacted).toHaveLength(3);
    expect(compacted.map((l) => [l.id, l.bounds])).toEqual([
      ["case", [0, 0, 0, 3, 1, 3]],
      ["intermediate", [1, 0, 0, 3, 1, 3]],
      ["final", [0, 0, 0, 3, 1, 3]],
    ]);
    expect(cells(compacted)).toEqual(cells(layers));
    expect(exposed(compacted)).toEqual(exposed(layers));
  });
  it("commutes disjoint Z writes with opposite column orders while retaining exact unions", () => {
    const low = (x: number): ShipVisualLayer => ({
      ...column(x, "lower"),
      bounds: [x, 0, 0, x + 1, 1, 1],
    });
    const high = (x: number): ShipVisualLayer => ({
      ...column(x, "upper"),
      bounds: [x, 0, 2, x + 1, 1, 3],
    });
    const layers = [low(0), high(1), high(0), low(1)];
    const compacted = compactColumns(layers);
    expect(compacted).toHaveLength(2);
    expect(compacted.map((l) => l.bounds).sort()).toEqual(
      [
        [0, 0, 0, 2, 1, 1],
        [0, 0, 2, 2, 1, 3],
      ].sort(),
    );
    expect(cells(compacted)).toEqual(cells(layers));
    expect(exposed(compacted)).toEqual(exposed(layers));
  });
  it("retains every partial-height predecessor before a later full-height write", () => {
    const layers = [
      column(0),
      {
        ...column(0, "lower", "plate"),
        bounds: [0, 0, 0, 1, 1, 1] as ShipVisualLayer["bounds"],
      },
      {
        ...column(0, "upper", "void"),
        bounds: [0, 0, 2, 1, 1, 3] as ShipVisualLayer["bounds"],
      },
      { ...column(0, "reconstructed"), slot: "primary" as const },
    ];
    const compacted = compactColumns(layers);
    expect(compacted).toHaveLength(4);
    expect(compacted.at(-1)?.id).toBe("reconstructed");
    expect(cells(compacted)).toEqual(cells(layers));
    expect(exposed(compacted)).toEqual(exposed(layers));
  });
  it("does not commute through a broad overlapping clear barrier", () => {
    const layers = [
      column(0),
      {
        ...column(0, "broad-clear", "void"),
        bounds: [0, 0, 1, 2, 1, 2] as ShipVisualLayer["bounds"],
      },
      column(1),
    ];
    const compacted = compactColumns(layers);
    expect(compacted).toHaveLength(3);
    expect(compacted[1].id).toBe("broad-clear");
    expect(cells(compacted)).toEqual(cells(layers));
    expect(exposed(compacted)).toEqual(exposed(layers));
  });
  it("keeps newly unlocked identical children in a separate emitted operation", () => {
    const layers = [column(0), column(1), column(0), column(1)];
    const compacted = compactColumns(layers);
    expect(compacted).toHaveLength(2);
    expect(compacted.map((l) => l.bounds)).toEqual([
      [0, 0, 0, 2, 1, 3],
      [0, 0, 0, 2, 1, 3],
    ]);
    expect(cells(compacted)).toEqual(cells(layers));
  });
  it("ignores stale heap entries after an existing ready group grows", () => {
    const layers = [
      column(0, "a"),
      column(1, "a"),
      column(2, "b"),
      column(0, "b"),
      column(1, "b"),
      column(3, "d"),
    ];
    const compacted = compactColumns(layers);
    expect(compacted.map((l) => [l.id, l.bounds])).toEqual([
      ["a", [0, 0, 0, 2, 1, 3]],
      ["b", [0, 0, 0, 3, 1, 3]],
      ["d", [3, 0, 0, 4, 1, 3]],
    ]);
    expect(cells(compacted)).toEqual(cells(layers));
    expect(exposed(compacted)).toEqual(exposed(layers));
  });
  it("rejects before adding an over-budget semantic key", () => {
    const layers = Array.from({ length: 100001 }, (_, i) =>
      column(0, `key-${i}`),
    );
    expect(() => compactColumns(layers)).toThrow(
      "Visual compaction semantic keys exceed limit",
    );
  });
  it("counts broad barriers in the cumulative output ceiling", () => {
    const barrier = {
      ...column(0),
      bounds: [0, 0, 0, 2, 1, 3] as ShipVisualLayer["bounds"],
    };
    expect(() =>
      compactColumns(Array.from({ length: 100001 }, () => barrier)),
    ).toThrow("Visual layer count exceeds limit");
  });
  it.each(["polygon", "holes", "band"] as const)(
    "treats uncertain %s footprints as an ordering barrier",
    (field) => {
      const uncertain: ShipVisualLayer = {
        ...column(3, "uncertain"),
        ...(field === "polygon"
          ? {
              polygon: [
                [3, 0],
                [4, 0],
                [4, 1],
                [3, 1],
              ] as [number, number][],
            }
          : field === "holes"
            ? { holes: [] }
            : { band: 1 }),
      };
      const layers = [column(0), uncertain, column(1)];
      expect(compactColumns(layers)).toHaveLength(3);
      expect(cells(compactColumns(layers))).toEqual(cells(layers));
    },
  );
  it("does not merge different sampled chart, facet, surface or support qualifications", () => {
    const variants: Partial<ShipVisualLayer>[] = [
      { surfaceRole: "wall" },
      { support: "other" },
      { normalHint: [1, 0, 0] },
      {
        normalChart: "intact-face",
        normalHint: [Math.SQRT1_2, 0, Math.SQRT1_2],
      },
      { normalSide: { id: "side", normal: [1, 0, 0], faces: 2 } },
      { facet: { id: "plane", a: [1, 1, 0], d: 2 } },
    ];
    for (const metadata of variants) {
      const layers = [column(0), { ...column(1), ...metadata }];
      expect(compactColumns(layers)).toHaveLength(2);
      expect(cells(compactColumns(layers))).toEqual(cells(layers));
      expect(exposed(compactColumns(layers))).toEqual(exposed(layers));
    }
  });
  it("retains both actual Wren pressure courses after split optical passes", () => {
    const ship = PREFAB_SHIPS.find((s) => s.id === "fed.s.wren")!;
    const r = compileShipVisual(
      ship,
      defaultPrefabComponentCatalog(),
      "deck",
      "federation",
      undefined,
      "r002",
    );
    for (const y of [32, 79]) {
      expect(r.cells.get(visualCellKey(191, y, 15))).toBeUndefined();
      expect(r.cells.get(visualCellKey(190, y, 15))?.slot).toBe("primary");
      for (const x of [189, 188])
        expect(r.cells.get(visualCellKey(x, y, 15))?.role).toBe("core");
    }
  }, 20000);
});

describe("versioned reference recipes", () => {
  const doc = PREFAB_SHIPS.find((s) => s.id === "fed.s.wren")!;
  const catalog = defaultPrefabComponentCatalog();
  it("uses complete convex SAT for mating pigment, including mirrored transforms and conservative malformed fallback", () => {
    const profile = SHIP_VISUAL_MACRO_PROFILES_R002.federation;
    const original = profile.opticalMatingPigments;
    const piece = "bow.slope1.deck.s2.a0.edge1";
    const pin = profile.opticalInterfaces[piece].assetSha256;
    const originalDress = dresser.dressShip;
    const spy = vi.spyOn(dresser, "dressShip");
    let placement = { x: 0, y: 0, z: 0, rotDeg: 0, mirror: false };
    spy.mockImplementation((s, o) => ({
      ...originalDress(s, o),
      kit: [{ piece, view: "both", ...placement }] as ReturnType<
        typeof originalDress
      >["kit"],
    }));
    const tetra = {
      sourcePart: 0,
      vertices: [
        [0, 0, 0],
        [2 / 16, 0, 0],
        [0, 2 / 16, 0],
        [0, 0, 2 / 16],
      ] as [number, number, number][],
      triangles: [
        [0, 2, 1],
        [0, 1, 3],
        [0, 3, 2],
        [1, 2, 3],
      ] as [number, number, number][],
    };
    try {
      profile.opticalMatingPigments = {
        [piece]: { assetSha256: pin, parts: [tetra] },
      };
      let solids = referenceOpticalMatingSolidsR002(
        doc,
        "deck",
        catalog,
        "federation",
      );
      expect(solids).toHaveLength(1);
      // Inside the broad AABB, but completely beyond the tetra's sloping face.
      expect(referenceOpticalMatingCubeR002(1, 1, 1, solids)).toBe(false);
      expect(referenceOpticalMatingCubeR002(0, 0, 0, solids)).toBe(true);
      const small = {
        ...tetra,
        vertices: tetra.vertices.map(
          (p) => p.map((n) => n * 0.05 + 0.2 / 16) as [number, number, number],
        ),
      };
      profile.opticalMatingPigments = {
        [piece]: { assetSha256: pin, parts: [small] },
      };
      solids = referenceOpticalMatingSolidsR002(
        doc,
        "deck",
        catalog,
        "federation",
      );
      // Neither cell centre nor ANY cube corner is inside this small solid, but
      // the complete cube intersects it. Point-only attribution would miss it.
      expect(referenceOpticalMatingCubeR002(0, 0, 0, solids)).toBe(true);
      profile.opticalMatingPigments = original;
      for (const mirror of [false, true])
        for (const rotDeg of [0, 90, 17]) {
          placement = { x: 1.23, y: -4.5, z: 0.2, rotDeg, mirror };
          solids = referenceOpticalMatingSolidsR002(
            doc,
            "deck",
            catalog,
            "federation",
          );
          const vertices = original[piece].parts[0].vertices;
          const centroid = [0, 1, 2].map(
            (i) => vertices.reduce((a, p) => a + p[i], 0) / vertices.length,
          );
          const x = mirror ? -centroid[0] : centroid[0],
            c = Math.cos((rotDeg * Math.PI) / 180),
            s = Math.sin((rotDeg * Math.PI) / 180);
          const world = [
            placement.x + c * x - s * centroid[1],
            placement.y + s * x + c * centroid[1],
            placement.z + centroid[2],
          ];
          expect(
            referenceOpticalMatingCubeR002(
              ...(world.map((v) => Math.floor(v * 16)) as [
                number,
                number,
                number,
              ]),
              solids,
            ),
          ).toBe(true);
        }
      placement = { x: 0, y: 0, z: 0, rotDeg: 0, mirror: false };
      for (const bad of [
        { assetSha256: "0".repeat(64), parts: [tetra] },
        {
          assetSha256: pin,
          parts: [{ ...tetra, triangles: tetra.triangles.slice(1) }],
        },
        {
          assetSha256: pin,
          parts: [
            { ...tetra, vertices: [[NaN, 0, 0], ...tetra.vertices.slice(1)] },
          ],
        },
        {
          assetSha256: pin,
          parts: [
            { ...tetra, triangles: [[0, 1, 99], ...tetra.triangles.slice(1)] },
          ],
        },
        {
          assetSha256: pin,
          parts: [
            {
              ...tetra,
              vertices: [...tetra.vertices, [2 / 16, 2 / 16, 2 / 16]],
            },
          ],
        },
      ]) {
        profile.opticalMatingPigments = {
          [piece]: bad as (typeof original)[string],
        };
        expect(
          referenceOpticalMatingSolidsR002(
            doc,
            "deck",
            catalog,
            "federation",
          ).filter((s) => !s.veto),
        ).toHaveLength(0);
      }
      profile.opticalMatingPigments = original;
      placement = { ...placement, rotDeg: NaN };
      expect(
        referenceOpticalMatingSolidsR002(
          doc,
          "deck",
          catalog,
          "federation",
        ).filter((s) => !s.veto),
      ).toHaveLength(0);
      placement = {
        ...placement,
        rotDeg: 0,
        mirror: "uncertain" as unknown as boolean,
      };
      expect(
        referenceOpticalMatingSolidsR002(
          doc,
          "deck",
          catalog,
          "federation",
        ).filter((s) => !s.veto),
      ).toHaveLength(0);
      placement = { x: 0, y: 0, z: 0, rotDeg: 0, mirror: false };
      profile.opticalMatingPigments = {};
      expect(
        referenceOpticalMatingSolidsR002(
          doc,
          "deck",
          catalog,
          "federation",
        ).filter((s) => !s.veto),
      ).toHaveLength(0);
    } finally {
      profile.opticalMatingPigments = original;
      spy.mockRestore();
    }
  });
  it("vetoes shared cubes touching uncertain or malformed optical variants before neighboring certified pigment", () => {
    const profile = SHIP_VISUAL_MACRO_PROFILES_R002.federation;
    const originalDress = dresser.dressShip;
    const spy = vi.spyOn(dresser, "dressShip");
    const piece = "bow.slope1.deck.s2.a0.edge1";
    let kit = [
      { piece, view: "both", x: 0, y: 0, z: 0, rotDeg: 0, mirror: false },
    ] as ReturnType<typeof originalDress>["kit"];
    spy.mockImplementation((s, o) => ({ ...originalDress(s, o), kit }));
    const original = profile.opticalMatingPigments;
    const originalInterfaces = profile.opticalInterfaces;
    try {
      const qualified = referenceOpticalMatingSolidsR002(
        doc,
        "deck",
        catalog,
        "federation",
      );
      const v = original[piece].parts[0].vertices;
      const cell = [0, 1, 2].map((i) =>
        Math.floor((v.reduce((n, p) => n + p[i], 0) / v.length) * 16),
      ) as [number, number, number];
      expect(referenceOpticalMatingCubeR002(...cell, qualified)).toBe(true);
      for (const uncertain of [
        "canopy.corner45.deck",
        "canopy.corner45.deck.cut",
      ]) {
        const b = profile.opticalInterfaces[uncertain].sourceFrameBounds[0];
        // Place the ACTUAL uncertain source box centre on an actual qualifying
        // neighbor cube. The complete cube must be vetoed, including touch.
        kit = [
          kit[0],
          {
            piece: uncertain,
            view: "both",
            x: (cell[0] + 0.5) / 16 - (b[0] + b[3]) / 2,
            y: (cell[1] + 0.5) / 16 - (b[1] + b[4]) / 2,
            z: (cell[2] + 0.5) / 16 - (b[2] + b[5]) / 2,
            rotDeg: 0,
            mirror: false,
          },
        ] as typeof kit;
        const solids = referenceOpticalMatingSolidsR002(
          doc,
          "deck",
          catalog,
          "federation",
        );
        expect(solids.some((s) => !s.veto)).toBe(true);
        expect(solids.some((s) => s.veto)).toBe(true);
        expect(referenceOpticalMatingCubeR002(...cell, solids)).toBe(false);
        const onlyVeto = solids.filter((s) => s.veto),
          raw = qualified[0];
        // A neighboring certified box sharing ONLY the excluded AABB boundary
        // must also be vetoed; centre-only exclusion would incorrectly pass it.
        const end = Math.ceil(onlyVeto[0].bounds[3] * 16);
        const touching = {
          ...onlyVeto[0],
          bounds: [
            end / 16,
            cell[1] / 16,
            cell[2] / 16,
            (end + 1) / 16,
            (cell[1] + 1) / 16,
            (cell[2] + 1) / 16,
          ],
        };
        const fakeQualified = {
          ...raw,
          bounds: [
            (end - 1) / 16,
            cell[1] / 16,
            cell[2] / 16,
            end / 16,
            (cell[1] + 1) / 16,
            (cell[2] + 1) / 16,
          ],
          axes: [],
        };
        expect(
          referenceOpticalMatingCubeR002(end - 1, cell[1], cell[2], [
            fakeQualified,
            touching,
          ]),
        ).toBe(false);
        kit = [kit[0]];
      }
      kit.push({
        piece: "canopy.unknown",
        view: "both",
        x: 0,
        y: 0,
        z: 0,
        rotDeg: 0,
        mirror: false,
      } as (typeof kit)[number]);
      expect(
        referenceOpticalMatingSolidsR002(doc, "deck", catalog, "federation"),
      ).toEqual([]);
      kit = [
        kit[0],
        {
          ...kit[0],
          piece: "canopy.corner45.deck",
          mirror: "unknown" as unknown as boolean,
        },
      ];
      expect(
        referenceOpticalMatingSolidsR002(doc, "deck", catalog, "federation"),
      ).toEqual([]);
      // Known missing/hash-invalid solids become vetoes rather than simply
      // disappearing and leaving their shared cubes open to another owner.
      kit = [kit[0]];
      profile.opticalMatingPigments = {};
      const missing = referenceOpticalMatingSolidsR002(
        doc,
        "deck",
        catalog,
        "federation",
      );
      expect(missing.some((s) => s.veto)).toBe(true);
      expect(
        referenceOpticalMatingCubeR002(...cell, [...qualified, ...missing]),
      ).toBe(false);
      profile.opticalInterfaces = {
        ...originalInterfaces,
        [piece]: { ...originalInterfaces[piece], sourceFrameBounds: [] },
      };
      expect(
        referenceOpticalMatingSolidsR002(doc, "deck", catalog, "federation"),
      ).toEqual([]);
    } finally {
      profile.opticalMatingPigments = original;
      profile.opticalInterfaces = originalInterfaces;
      spy.mockRestore();
    }
  });
  // Each assembly is independently bounded. Vitest executes these ordinary
  // tests serially; no concurrent mutable-profile/global fixture is used.
  for (const ship of [doc, PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!])
    for (const view of ["deck", "flight"] as const)
      it(`changes only actual final opaque mating pigment ${ship.id}/${view} while retaining all occupied roles and RAW exclusions`, () => {
        const profile = SHIP_VISUAL_MACRO_PROFILES_R002.federation;
        const original = profile.opticalMatingPigments;
        let changedTotal = 0;
        const current = compileShipVisual(
          ship,
          catalog,
          view,
          "federation",
          undefined,
          "r002",
        );
        let baseline: ReturnType<typeof compileShipVisual>;
        try {
          profile.opticalMatingPigments = {};
          baseline = compileShipVisual(
            ship,
            catalog,
            view,
            "federation",
            undefined,
            "r002",
          );
        } finally {
          profile.opticalMatingPigments = original;
        }
        const solids = referenceOpticalMatingSolidsR002(
          ship,
          view,
          catalog,
          "federation",
        );
        expect(current.cells.size).toBe(baseline.cells.size);
        const mismatches: string[] = [];
        const invalidPigments: string[] = [];
        for (const [key, c] of current.cells) {
          const old = baseline.cells.get(key);
          if (!old) {
            mismatches.push(key);
            continue;
          }
          const { slot: oldSlot, ...before } = old,
            { slot: newSlot, ...after } = c;
          // Compare EVERY cell and metadata field, including exact RAW/facet
          // ownership; collect errors rather than thousands of assertion calls.
          if (JSON.stringify(after) !== JSON.stringify(before))
            mismatches.push(key);
          if (oldSlot === newSlot) continue;
          changedTotal++;
          if (
            newSlot !== "trim" ||
            !c.family.startsWith("volume:") ||
            !["core", "frame", "plate"].includes(c.role) ||
            c.facet !== undefined ||
            c.surfaceRole === "floor" ||
            !referenceOpticalMatingCubeR002(c.x, c.y, c.z, solids)
          )
            invalidPigments.push(key);
        }
        expect(
          mismatches,
          `${ship.id}/${view} geometry, core, RAW and shading metadata`,
        ).toEqual([]);
        expect(
          invalidPigments,
          `${ship.id}/${view} final source mating owners only`,
        ).toEqual([]);
        expect(changedTotal).toBeGreaterThan(
          ship.id === "fed.s.wren" && view === "deck" ? 0 : 10,
        );
      }, 20000);
  it("retains the complete old optical RAW exclusion for a missing glass roof or uncertain actual placement", () => {
    const roof = "bow.square.deck.s2.a0.roof";
    const ship = PREFAB_SHIPS.find((s) =>
      dressShip(s, { catalog }).kit.some((k) => k.piece === roof),
    )!;
    expect(REFERENCE_OPTICAL_INTERFACES_R002[roof].kind).toBe("optical");
    const profile = SHIP_VISUAL_MACRO_PROFILES_R002.federation;
    const original = profile.opticalInterfaces;
    const oldRaw = (r: ReturnType<typeof compileShipVisual>) => {
      const polygons = ship.volumes.flatMap((v) =>
        v.tiles.filter(bowGlass).map(placedTilePolygon),
      );
      let checked = 0;
      for (const c of r.cells.values())
        if (
          polygons.some(
            (poly) =>
              insidePolygon(poly, (c.x + 0.5) / 16, (c.y + 0.5) / 16) ||
              polygonBoundarySample([(c.x + 0.5) / 16, (c.y + 0.5) / 16], poly)
                .distance <=
                2 / 16,
          )
        ) {
          checked++;
          expect(c.facet, `${c.x},${c.y},${c.z}`).toBeUndefined();
        }
      expect(checked).toBeGreaterThan(100);
    };
    try {
      const missing = { ...original };
      delete missing[roof];
      profile.opticalInterfaces = missing;
      expect(
        referenceOpticalGuardBoxesR002(ship, "flight", catalog, missing)
          .unknownVariant,
      ).toBe(true);
      oldRaw(
        compileShipVisual(
          ship,
          catalog,
          "flight",
          "federation",
          undefined,
          "r002",
        ),
      );
    } finally {
      profile.opticalInterfaces = original;
    }
    const originalDress = dresser.dressShip;
    const spy = vi.spyOn(dresser, "dressShip");
    try {
      for (const change of [
        { x: NaN },
        { z: Infinity },
        { rotDeg: NaN },
        { mirror: "uncertain" },
      ]) {
        spy.mockImplementation((s, o) => {
          const dressed = originalDress(s, o);
          dressed.kit = dressed.kit.map((k) =>
            k.piece === roof ? ({ ...k, ...change } as typeof k) : k,
          );
          return dressed;
        });
        expect(
          referenceOpticalGuardBoxesR002(ship, "flight", catalog)
            .unknownVariant,
        ).toBe(true);
      }
      oldRaw(
        compileShipVisual(
          ship,
          catalog,
          "flight",
          "federation",
          undefined,
          "r002",
        ),
      );
    } finally {
      spy.mockRestore();
    }
  }, 15000);
  it("guards separate original optical solids and retained glass in the actual transformed kit frame", () => {
    for (const id of ["fed.s.wren", "fed.m.crest"]) {
      const ship = PREFAB_SHIPS.find((s) => s.id === id)!;
      for (const view of ["deck", "flight"] as const) {
        const guards = referenceOpticalGuardBoxesR002(ship, view, catalog);
        expect(guards.unknownVariant).toBe(false);
        let retained = 0,
          source = 0;
        for (const placement of dressShip(ship, { catalog }).kit) {
          if (placement.view !== "both" && placement.view !== view) continue;
          const certificate =
            REFERENCE_OPTICAL_INTERFACES_R002[placement.piece];
          if (!certificate) continue;
          if (placement.piece.endsWith(".cut")) {
            expect(certificate.retainedGlassBounds).toHaveLength(0);
          }
          const angle = (placement.rotDeg * Math.PI) / 180;
          for (const [kind, boxes] of [
            ["source", certificate.sourceFrameBounds],
            ["retained", certificate.retainedGlassBounds],
          ] as const)
            for (const b of boxes) {
              kind === "source" ? source++ : retained++;
              const corners: number[][] = [];
              for (const x of [b[0], b[3]])
                for (const y of [b[1], b[4]])
                  for (const z of [b[2], b[5]]) {
                    const X = placement.mirror ? -x : x;
                    corners.push([
                      placement.x + X * Math.cos(angle) - y * Math.sin(angle),
                      placement.y + X * Math.sin(angle) + y * Math.cos(angle),
                      placement.z + z,
                    ]);
                  }
              // Independently enumerate every transformed source/GLB corner;
              // the integer exclusion must contain it plus a full Cheb2 margin.
              const expected = [
                ...[0, 1, 2].map(
                  (a) =>
                    Math.floor(Math.min(...corners.map((p) => p[a])) * 16) - 2,
                ),
                ...[0, 1, 2].map(
                  (a) =>
                    Math.ceil(Math.max(...corners.map((p) => p[a])) * 16) + 2,
                ),
              ];
              expect(
                guards.bounds.some(
                  (g) =>
                    g.piece === placement.piece &&
                    g.kind === kind &&
                    g.bounds.join(",") === expected.join(","),
                ),
              ).toBe(true);
            }
        }
        expect(source).toBeGreaterThan(0);
        if (view === "flight") expect(retained).toBeGreaterThan(0);
      }
    }
    const missing = { ...REFERENCE_OPTICAL_INTERFACES_R002 };
    const placed = dressShip(doc, { catalog }).kit.find(
      (k) =>
        k.view !== "flight" &&
        (k.piece.startsWith("canopy.") || /^bow\..*\.edge\d+$/.test(k.piece)) &&
        missing[k.piece],
    );
    expect(placed).toBeDefined();
    delete missing[placed!.piece];
    expect(
      referenceOpticalGuardBoxesR002(doc, "deck", catalog, missing)
        .unknownVariant,
    ).toBe(true);
    expect(
      referenceOpticalGuardBoxesR002(doc, "flight", catalog, {}).unknownVariant,
    ).toBe(true);
  });
  it("keeps every deck attachment island continuously backed with a sealed hard cut top", () => {
    let checked = 0,
      exposedTops = 0;
    for (const id of ["fed.s.wren", "fed.m.crest"]) {
      const ship = PREFAB_SHIPS.find((s) => s.id === id)!;
      const r = compileShipVisual(
        ship,
        catalog,
        "deck",
        "federation",
        undefined,
        "r002",
      );
      const lastLayerAt = (x: number, y: number, z: number) => {
        for (let i = r.layers.length - 1; i >= 0; i--) {
          const layer = r.layers[i];
          const b = layer.bounds;
          if (
            x >= b[0] &&
            x < b[3] &&
            y >= b[1] &&
            y < b[4] &&
            z >= b[2] &&
            z < b[5]
          )
            return layer;
        }
        return undefined;
      };
      const islands = r.layers.filter((l) =>
        l.id.endsWith(":attachment-island-core"),
      );
      const supportBoxes = r.layers.filter(
        (l) =>
          l.role === "core" &&
          (l.id.endsWith(":core") || l.id.endsWith(":attachment-island-core")),
      );
      const interior = deriveInterior(ship, 0, catalog);
      const connected = new Map<string, Set<string>>();
      const lowerSupport = (island: (typeof islands)[number]) => {
        let found = connected.get(island.support!);
        if (found) return found;
        const core = r.layers.find(
          (a) => a.support === island.support && a.id.endsWith(":core"),
        )!;
        const b = [
          core.bounds[0] - 2,
          core.bounds[1] - 2,
          G.deck.floorTopTexels - 1,
          core.bounds[3] + 2,
          core.bounds[4] + 2,
          G.deck.floorTopTexels + 23,
        ];
        const queue: number[][] = [];
        found = new Set();
        for (let y = b[1]; y < b[4]; y++)
          for (let x = b[0]; x < b[3]; x++) {
            const key = visualCellKey(x, y, b[2]);
            if (
              ["floor", "core", "frame", "doorframe"].includes(
                r.cells.get(key)?.role ?? "",
              )
            ) {
              found.add(key);
              queue.push([x, y, b[2]]);
            }
          }
        for (let i = 0; i < queue.length; i++) {
          const p = queue[i];
          for (const d of [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1],
          ]) {
            const n = p.map((v, a) => v + d[a]);
            if (n.some((v, a) => v < b[a] || v >= b[a + 3])) continue;
            const key = visualCellKey(n[0], n[1], n[2]);
            if (
              !found.has(key) &&
              ["core", "frame", "doorframe"].includes(
                r.cells.get(key)?.role ?? "",
              )
            ) {
              found.add(key);
              queue.push(n);
            }
          }
        }
        connected.set(island.support!, found);
        return found;
      };
      for (const l of islands)
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            checked++;
            for (let z = l.bounds[2]; z < l.bounds[5]; z++) {
              const c = r.cells.get(visualCellKey(x, y, z));
              const owner = lastLayerAt(x, y, z);
              if (!c) {
                // The final existing optical/door opening owns its real void;
                // preserved header support must go around it, never fill it.
                expect(owner?.role).toBe("void");
                expect(owner?.id).toMatch(/:(?:opening|glass-aperture)$/);
                continue;
              }
              // The exception is a real crossing of occupied support bands,
              // not a family/name exemption: the other frame must adjoin its
              // retained core at this exact Z and retain continuous solid below.
              const postIntersection = interior.posts.some(
                (p, i) =>
                  c!.family === `post:${i}` &&
                  x >= p[0] * 16 - 2 &&
                  x < p[0] * 16 + 2 &&
                  y >= p[1] * 16 - 2 &&
                  y < p[1] * 16 + 2 &&
                  z >= G.deck.floorTopTexels &&
                  z < G.deck.floorTopTexels + 22,
              );
              const structuralIntersection =
                c!.role === "frame" &&
                c!.family !== l.support &&
                owner?.role === "frame" &&
                (postIntersection ||
                  supportBoxes.some(
                    (a) =>
                      a.support === c!.family &&
                      x >= a.bounds[0] - 1 &&
                      x < a.bounds[3] + 1 &&
                      y >= a.bounds[1] - 1 &&
                      y < a.bounds[4] + 1 &&
                      z >= a.bounds[2] &&
                      z < a.bounds[5],
                  )) &&
                Array.from(
                  { length: z - l.bounds[2] + 1 },
                  (_, i) => l.bounds[2] + i,
                ).every((q) => r.cells.has(visualCellKey(x, y, q)));
              expect(
                z < l.bounds[2] + 2
                  ? ["core", "frame"].includes(c!.role)
                  : c!.role === "core" || structuralIntersection,
                `${id}:${x},${y},${z}:${c!.role}:${c!.family}:${owner?.id}`,
              ).toBe(true);
            }
            const top = r.cells.get(visualCellKey(x, y, l.bounds[5] - 1))!;
            if (!top) continue; // Explicit original aperture extends through this cut.
            expect(
              lowerSupport(l).has(visualCellKey(x, y, l.bounds[5] - 1)),
              `${id}:connected-cap:${x},${y}`,
            ).toBe(true);
            const above = r.cells.get(visualCellKey(x, y, l.bounds[5]));
            if (above) {
              // A preserved outer wall/header can physically cover this island;
              // do not trim that other assembly to manufacture an exposed cap.
              expect(above.family).not.toBe(l.support);
              expect(
                ["core", "frame", "doorframe", "plate", "roof"].includes(
                  above.role,
                ),
              ).toBe(true);
              continue;
            }
            exposedTops++;
            expect(top.facet).toBeUndefined();
            expect(top.normalHint).toBeUndefined();
            expect(top.normalSide).toBeUndefined();
          }
      // Both retained side courses meet the central support at every island;
      // full doorway/glazed jamb source retains its old height independently.
      for (const l of r.layers.filter((l) =>
        l.id.endsWith(":attachment-island-return"),
      ))
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++)
            for (let z = l.bounds[2]; z < l.bounds[5]; z++)
              if (!r.cells.has(visualCellKey(x, y, z)))
                expect(
                  lastLayerAt(x, y, z)?.id,
                  `${id}:return:${x},${y},${z}`,
                ).toMatch(/:(?:opening|glass-aperture)$/);
      for (const door of deriveInterior(ship, 0, catalog).doors.filter(
        (d) => !d.exterior,
      )) {
        const dx = door.b[0] - door.a[0],
          dy = door.b[1] - door.a[1],
          span = Math.hypot(dx, dy);
        for (const along of [0.1875, span - 0.1875]) {
          const x = Math.floor((door.a[0] + (dx * along) / span) * 16),
            y = Math.floor((door.a[1] + (dy * along) / span) * 16);
          for (
            let z = G.deck.floorTopTexels + 19;
            z < G.deck.floorTopTexels + 22;
            z++
          ) {
            const c = r.cells.get(visualCellKey(x, y, z));
            expect(c, `${id}:${door.id}:${x},${y},${z}`).toBeDefined();
            expect(["core", "frame", "doorframe"].includes(c!.role)).toBe(true);
            expect(c!.facet).toBeUndefined();
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(exposedTops).toBeGreaterThan(20);
  }, 15000);
  it("shares smaller anchored wing markings while retaining all legacy and non-plate decals", () => {
    const original = dressShip(doc, { catalog }).decals;
    expect(referencePlateDecals(doc, original)).toBe(original);
    expect(referencePlateDecals(doc, original, "r001")).toBe(original);
    const selected = referencePlateDecals(doc, original, "r002");
    let changed = 0;
    selected.forEach((d, i) => {
      const before = original[i];
      if (d === before) return;
      changed++;
      expect(d.normal[2]).toBe(1);
      expect(["number", "emblem"]).toContain(d.kind);
      for (let axis = 0; axis < 3; axis++) {
        const c = (q: typeof d) =>
          q.corners.reduce((n, p) => n + p[axis] / 4, 0);
        expect(c(d)).toBeCloseTo(c(before), 10);
        const span = (q: typeof d) =>
          Math.max(...q.corners.map((p) => p[axis])) -
          Math.min(...q.corners.map((p) => p[axis]));
        expect(span(d)).toBeCloseTo(span(before) * (axis === 2 ? 1 : 0.6), 10);
      }
    });
    expect(changed).toBe(2);
    expect(
      original
        .filter((d) => d.kind === "name")
        .every((d) => selected.includes(d)),
    ).toBe(true);
  });
  it("tucks pale slope cells behind quiet pressure edges and backs clipped local casings", () => {
    for (const view of ["deck", "flight"] as const) {
      const result = compileShipVisual(
        doc,
        catalog,
        view,
        "federation",
        undefined,
        "r002",
      );
      for (const l of result.layers.filter((l) =>
        l.id.endsWith("sloped-roof-plate"),
      )) {
        const v = doc.volumes.find((v) => l.support === `volume:${v.id}`)!;
        const poly = volumeGeometry(v).outline!.outer.map(
          ([x, y]): [number, number] => [x * 16, y * 16],
        );
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++)
            expect(
              polygonBoundarySample([x + 0.5, y + 0.5], poly).distance,
            ).toBeGreaterThanOrEqual(2);
      }
      if (view !== "deck") continue;
      const wells = result.layers.filter(
        (l) =>
          l.role === "void" &&
          (l.id.includes(":room-task:") ||
            l.id.includes(":secondary-room-task:")) &&
          l.id.endsWith(":well"),
      );
      let open = 0;
      let pressure: VisualCell | undefined;
      for (const l of wells) {
        const [x, y, z, X, Y, Z] = l.bounds;
        for (let a = x; a < X; a++)
          for (let b = y; b < Y; b++)
            for (let c = z; c < Z; c++) {
              if (result.cells.has(visualCellKey(a, b, c))) continue;
              open++;
              expect(
                [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                ].some(([dx, dy]) =>
                  [1, 2].some(
                    (n) =>
                      result.cells.get(visualCellKey(a + dx * n, b + dy * n, c))
                        ?.role === "core",
                  ),
                ),
              ).toBe(true);
            }
      }
      expect(open).toBeGreaterThan(0);
      // Every selected seat is exactly one outer partition course; the two
      // central pressure planes survive on BOTH sides, including after a cut.
      for (const well of wells) {
        const [x, y, z, X, Y, Z] = well.bounds;
        const vertical = X - x === 1;
        expect(vertical ? X - x : Y - y).toBe(1);
        for (let a = x; a < X; a++)
          for (let b = y; b < Y; b++)
            for (let c = z; c < Z; c++) {
              if (result.cells.has(visualCellKey(a, b, c))) continue;
              const sign = [-1, 1].find((sign) =>
                [1, 2].every(
                  (n) =>
                    result.cells.get(
                      visualCellKey(
                        a + (vertical ? sign * n : 0),
                        b + (vertical ? 0 : sign * n),
                        c,
                      ),
                    )?.role === "core",
                ),
              );
              expect(sign).toBeDefined();
              pressure ??= result.cells.get(
                visualCellKey(
                  a + (vertical ? sign! : 0),
                  b + (vertical ? 0 : sign!),
                  c,
                ),
              );
            }
      }
      expect(pressure).toBeDefined();
      const key = visualCellKey(pressure!.x, pressure!.y, pressure!.z);
      const cut = compileShipVisual(
        doc,
        catalog,
        view,
        "federation",
        new Set([key]),
        "r002",
      );
      expect(cut.cells.has(key)).toBe(false);
      expect(
        [...cut.cells.values()].filter((c) => c.family === pressure!.family)
          .length,
      ).toBe(
        [...result.cells.values()].filter((c) => c.family === pressure!.family)
          .length - 1,
      );
    }
  }, 15000);
  for (const ship of [doc, PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!])
    for (const view of ["deck", "flight"] as const)
      it(`reconstructs actual diagonal owners and shallow five-cell trays with original guarded facets ${ship.id}/${view}`, () => {
        const r = compileShipVisual(
          ship,
          catalog,
          view,
          "federation",
          undefined,
          "r002",
        );
        const owned = [...r.cells.values()].filter((c) => c.facetFaces);
        const interior = deriveInterior(ship, 0, catalog);
        const geoms = ship.volumes.map(volumeGeometry);
        const frameRects = ship.mounts
          .filter((m) => m.attach === "edge")
          .map(
            (m) => placeMount(m, catalog.get(m.component), geoms, ship).rect,
          );
        const opticalBoxes = referenceOpticalGuardBoxesR002(
          ship,
          view,
          catalog,
        );
        const opticalEdges = [
          ...[...interior.exteriorWalls, ...interior.partitions].filter(
            (e) =>
              e.type === "window" ||
              e.type === "wall.glazed" ||
              e.variant === "glazed",
          ),
        ];
        const apertureGuards = r.layers.filter(
          (l) =>
            l.role === "void" &&
            (l.id.endsWith(":opening") || l.id.endsWith(":glass-aperture")),
        );
        // The independent sweep formula includes the full-open outer leaf edge,
        // not just closed opening centres. Frame/opening/optical rings stay raw.
        for (const c of r.cells.values()) {
          if (!c.facet) continue;
          const p = [(c.x + 0.5) / 16, (c.y + 0.5) / 16];
          for (const d of interior.doors) {
            const dx = d.b[0] - d.a[0],
              dy = d.b[1] - d.a[1],
              span = Math.hypot(dx, dy);
            const X = p[0] - (d.a[0] + d.b[0]) / 2,
              Y = p[1] - (d.a[1] + d.b[1]) / 2;
            const w = Math.max(0.6, (span - 0.75) / 2);
            const sweep = w / 2 + 0.005 + 0.95 * w + w / 2;
            expect(
              Math.abs((X * dx + Y * dy) / span) >
                Math.max(span / 2, sweep) + 2 / 16 ||
                Math.abs((-X * dy + Y * dx) / span) > 5 / 16 + 2 / 16,
            ).toBe(true);
          }
          for (const b of frameRects)
            expect(
              p[0] < b[0] - 2 / 16 ||
                p[0] > b[2] + 2 / 16 ||
                p[1] < b[1] - 2 / 16 ||
                p[1] > b[3] + 2 / 16,
            ).toBe(true);
          expect(
            opticalBoxes.bounds.find(
              (g) =>
                c.x >= g.bounds[0] &&
                c.x < g.bounds[3] &&
                c.y >= g.bounds[1] &&
                c.y < g.bounds[4] &&
                c.z >= g.bounds[2] &&
                c.z < g.bounds[5],
            ),
            `${ship.id}:${view}:${c.x},${c.y},${c.z}`,
          ).toBeUndefined();
          for (const e of opticalEdges) {
            const dx = e.b[0] - e.a[0],
              dy = e.b[1] - e.a[1],
              span = Math.hypot(dx, dy);
            const u = ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / span;
            const v =
              Math.abs(-(p[0] - e.a[0]) * dy + (p[1] - e.a[1]) * dx) / span;
            expect(u < -2 / 16 || u > span + 2 / 16 || v > 0.25 + 2 / 16).toBe(
              true,
            );
          }
          for (const a of apertureGuards) {
            expect(
              c.x + 0.5 < a.bounds[0] - 2 ||
                c.x + 0.5 > a.bounds[3] + 2 ||
                c.y + 0.5 < a.bounds[1] - 2 ||
                c.y + 0.5 > a.bounds[4] + 2 ||
                c.z + 0.5 < a.bounds[2] - 2 ||
                c.z + 0.5 > a.bounds[5] + 2,
            ).toBe(true);
          }
        }
        expect(owned.length).toBeGreaterThan(50);
        expect(r.layers.some((l) => l.id.endsWith(":molded-shoulder"))).toBe(
          false,
        );
        for (const c of owned) {
          expect(c.role).not.toBe("floor");
          expect(c.surfaceRole).not.toBe("floor");
          expect(["glass", "emit_a", "emit_b"]).not.toContain(c.slot);
          expect(c.facet!.a.filter((v) => v !== 0)).toHaveLength(2);
          expect(
            c.facet!.a.reduce(
              (n, v, i) => n + v * ([c.x, c.y, c.z][i] + 0.5),
              0,
            ),
          ).toBe(c.facet!.d);
          const volume = ship.volumes.find(
            (v) => c.family === `volume:${v.id}`,
          )!;
          const g = volumeGeometry(volume),
            poly = g.outline!.outer.map(([x, y]): [number, number] => [
              x * 16,
              y * 16,
            ]);
          const boundary = polygonBoundarySample([c.x + 0.5, c.y + 0.5], poly);
          if (c.facet!.a[2] === 0) {
            const edge = poly[boundary.edgeIndex];
            // Common patch IDs are insufficient: every retained height/slot
            // must use the FIRST occupied boundary row, not a parallel seat.
            expect(c.facet!.d, `${ship.id}:${c.x},${c.y},${c.z}`).toBe(
              Math.round(c.facet!.a[0] * edge[0] + c.facet!.a[1] * edge[1]) - 1,
            );
          }
          expect(
            Math.min(boundary.edgeT, 1 - boundary.edgeT) * boundary.edgeLength,
          ).toBeGreaterThanOrEqual(3);
          for (const h of g.outline!.holes ?? [])
            expect(
              polygonBoundarySample(
                [c.x + 0.5, c.y + 0.5],
                h.map(([x, y]): [number, number] => [x * 16, y * 16]),
              ).distance,
            ).toBeGreaterThan(2);
        }
        const tray = r.layers.filter((l) =>
          l.id.endsWith(":shallow-pressure-tray"),
        );
        expect(tray.length).toBeGreaterThan(0);
        expect(
          owned.some((c) =>
            ship.volumes.some(
              (v) => v.height === "wing" && c.family === `volume:${v.id}`,
            ),
          ),
        ).toBe(true);
        const trayColumns = new Map<string, Set<number>>();
        for (const l of tray) {
          expect(l.role).toBe("core");
          for (let x = l.bounds[0]; x < l.bounds[3]; x++)
            for (let y = l.bounds[1]; y < l.bounds[4]; y++) {
              const key = `${x},${y}`,
                z = trayColumns.get(key) ?? new Set<number>();
              for (let q = l.bounds[2]; q < l.bounds[5]; q++) z.add(q);
              trayColumns.set(key, z);
            }
          for (let x = l.bounds[0]; x < l.bounds[3]; x++)
            for (let y = l.bounds[1]; y < l.bounds[4]; y++)
              for (let z = l.bounds[2]; z < l.bounds[5]; z++)
                expect(r.cells.get(visualCellKey(x, y, z))?.role).toBe("core");
        }
        for (const z of trayColumns.values()) {
          const rows = [...z].sort((a, b) => a - b);
          expect(rows).toHaveLength(2);
          expect(rows[1] - rows[0]).toBe(1);
        }
        const armour = r.layers.filter((l) =>
          l.id.endsWith(":shallow-offset-armor"),
        );
        expect(armour.every((l) => l.bounds[5] - l.bounds[2] === 1)).toBe(true);
        // Original face qualification remains immutable, while current removals are real.
        const c = owned[0],
          key = visualCellKey(c.x, c.y, c.z);
        const cut = removeShipVisualCells(r.cells, new Set([key]));
        expect(cut.has(key)).toBe(false);
        const next = owned.find((p) => cut.has(visualCellKey(p.x, p.y, p.z)))!;
        expect(cut.get(visualCellKey(next.x, next.y, next.z))?.facetFaces).toBe(
          next.facetFaces,
        );
      }, 20000);
  it("reconstructs the actual picked old rim owners rather than preserving a nominal channel veto", () => {
    const r = compileShipVisual(
      doc,
      catalog,
      "deck",
      "federation",
      undefined,
      "r002",
    );
    // The exact authored sequence seats the subframe first, then opens the
    // protected route. Priority-preserving compaction must retain that void,
    // rather than resurrecting the earlier frame at the historical picked cell.
    const point = [68, -11, 25] as const;
    const writes = r.layers.filter(
      (l) =>
        point.every(
          (v, axis) => v >= l.bounds[axis] && v < l.bounds[axis + 3],
        ) &&
        (!l.polygon ||
          (insidePolygon(l.polygon, point[0] + 0.5, point[1] + 0.5) &&
            !l.holes?.some((hole) =>
              insidePolygon(hole, point[0] + 0.5, point[1] + 0.5),
            ) &&
            (l.band === undefined ||
              polygonBoundarySample([point[0] + 0.5, point[1] + 0.5], l.polygon)
                .distance <= l.band))),
    );
    expect(
      writes.some(
        (l) => l.id === "volume:wing-s:roof-subframe" && l.role === "frame",
      ),
    ).toBe(true);
    expect(writes.at(-1)?.id).toBe("volume:wing-s:roof-protected-channel");
    expect(writes.at(-1)?.role).toBe("void");
    expect(r.cells.has(visualCellKey(...point))).toBe(false);
    const retained = r.cells.get(visualCellKey(70, -9, 23))!;
    expect(retained.role).toBe("core");
    expect(retained.slot).toBe("secondary");
    expect(retained.family).toBe("volume:wing-s");
    expect(retained.facet?.a).toEqual([1, -1, 0]);
    expect(retained.facet?.d).toBe(79);
    expect(retained.facetFaces).toBe(6);
    for (const [dx, dy] of [
      [-1, 0],
      [0, 1],
    ])
      for (const depth of [1, 2])
        expect(
          r.cells.get(visualCellKey(70 + dx * depth, -9 + dy * depth, 23))
            ?.role,
        ).toBe("core");
    // The common FIRST outer casing retains this old diagonal pressure pick;
    // seating it deeper would compound the permitted .044194m clip recession.
    expect(r.cells.get(visualCellKey(168, 9, 9))?.role).toBe("core");
    expect(r.cells.get(visualCellKey(167, 9, 9))?.role).toBe("core");
    expect(r.cells.get(visualCellKey(166, 9, 9))?.role).toBe("core");
    // Exact whole wing thickness is18 cells; the5-cell finish package is atop it.
    const support = r.cells.get(visualCellKey(70, -9, 10))!;
    expect(support.role).toBe("core");
    expect(support.family).toBe("volume:wing-s");
    const oldRim = r.layers.filter((l) => l.id === "volume:hull:cassette-rim");
    expect(
      oldRim.every(
        (l) =>
          !(
            168 >= l.bounds[0] &&
            168 < l.bounds[3] &&
            9 >= l.bounds[1] &&
            9 < l.bounds[4] &&
            9 >= l.bounds[2] &&
            9 < l.bounds[5]
          ),
      ),
    ).toBe(true);
  });
  it("keeps actual floor, door approach and seat contact planes flat across both complete ships", () => {
    for (const ship of [
      doc,
      PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!,
    ]) {
      const before = JSON.stringify(ship);
      const baseline = compileShipVisual(ship, catalog, "deck", "federation");
      const current = compileShipVisual(
        ship,
        catalog,
        "deck",
        "federation",
        undefined,
        "r002",
      );
      const interior = deriveInterior(ship, 0, catalog);
      let walked = 0,
        socketContacts = 0,
        doorContacts = 0;
      const contacts = new Map<string, { x: number; y: number; z: number }>();
      // Ordered floor source establishes the intended contact top. Earlier r001
      // cosmetic void grilles are not authoritative pits; R14 deliberately filled
      // those, but every varying bow support top still must match this source.
      for (const l of baseline.layers.filter((l) => l.role === "floor"))
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            const key = `${x},${y}`,
              z = l.bounds[5] - 1;
            if (z > (contacts.get(key)?.z ?? -Infinity))
              contacts.set(key, { x, y, z });
          }
      for (const c of contacts.values()) {
        const x = (c.x + 0.5) / 16,
          y = (c.y + 0.5) / 16;
        if (
          !interior.floors.some(
            (f) => Math.floor(x) === f.cell[0] && Math.floor(y) === f.cell[1],
          )
        )
          continue;
        // Compare the old real pressure/contact plane, not old cosmetic void
        // labels. Existing walls above the plane are outside walking contact.
        if (baseline.cells.has(visualCellKey(c.x, c.y, c.z + 1))) continue;
        const next = current.cells.get(visualCellKey(c.x, c.y, c.z));
        expect(next, `${ship.id}:${c.x},${c.y}`).toBeDefined();
        expect(next!.facet).toBeUndefined();
        expect(next!.normalChart).toBeUndefined();
        expect(
          current.cells.has(visualCellKey(c.x, c.y, c.z + 1)),
          `${ship.id}:${c.x},${c.y},${c.z}`,
        ).toBe(false);
        walked++;
        if (
          interior.sockets.some(
            (o) =>
              x >= o.at[0] &&
              x < o.at[0] + o.size[0] &&
              y >= o.at[1] &&
              y < o.at[1] + o.size[1],
          )
        )
          socketContacts++;
        if (
          interior.doors.some(
            (d) =>
              Math.hypot(x - (d.a[0] + d.b[0]) / 2, y - (d.a[1] + d.b[1]) / 2) <
              0.8,
          )
        )
          doorContacts++;
      }
      expect(walked).toBeGreaterThan(5000);
      expect(socketContacts).toBeGreaterThan(100);
      expect(doorContacts).toBeGreaterThan(100);
      expect(
        current.layers.some((l) => l.id.includes("floor-cover-seat")),
      ).toBe(false);
      expect(
        current.layers.some((l) => l.id.endsWith("floor-circulation-seam")),
      ).toBe(false);
      const circulation = current.layers.filter((l) =>
        l.id.includes(":floor-room-circulation:"),
      );
      expect(circulation.length).toBeGreaterThan(0);
      const circulationRooms = [
        ...new Set(circulation.map((l) => l.id.split(":").at(-1))),
      ];
      let circulationCells = 0;
      for (const l of circulation)
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            const c = current.cells.get(visualCellKey(x, y, l.bounds[5] - 1));
            expect(c?.role).toBe("floor");
            expect(c?.facet).toBeUndefined();
            expect(current.cells.has(visualCellKey(x, y, l.bounds[5]))).toBe(
              false,
            );
            circulationCells++;
          }
      console.log(
        JSON.stringify({
          prefab: ship.id,
          circulationLayers: circulation.length,
          circulationCells,
          circulationRooms,
          completeContactPlanes: true,
        }),
      );
      expect(
        current.layers.some((l) => l.id.includes("floor-cover-binding")),
      ).toBe(true);
      expect(JSON.stringify(ship)).toBe(before);
    }
  }, 20000);
  it("protects Crest actual 3D optical interfaces without blanket raw geometry below them", () => {
    const crest = PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!;
    const r = compileShipVisual(
      crest,
      catalog,
      "deck",
      "federation",
      undefined,
      "r002",
    );
    const guards = referenceOpticalGuardBoxesR002(crest, "deck", catalog);
    const solids = referenceOpticalMatingSolidsR002(
      crest,
      "deck",
      catalog,
      "federation",
    );
    const protectedAt = (z: number) =>
      guards.bounds.some(
        (g) =>
          336 >= g.bounds[0] &&
          336 < g.bounds[3] &&
          17 >= g.bounds[1] &&
          17 < g.bounds[4] &&
          z >= g.bounds[2] &&
          z < g.bounds[5],
      );
    // Exact old native ray column: opaque below-glass pressure is retained, and
    // the original optical/frame union alone determines its raw/clipped rows.
    let qualified = 0,
      raw = 0;
    for (const z of [9, 17, 25, 30]) {
      const c = r.cells.get(visualCellKey(336, 17, z))!;
      expect(c.role).toBe("core");
      if (protectedAt(z)) {
        raw++;
        expect(c.facet).toBeUndefined();
      } else {
        qualified++;
        expect(c.facet?.d).toBe(319);
      }
    }
    expect(qualified).toBeGreaterThan(0);
    expect(raw).toBeGreaterThan(0);
    // Authored regular canopy nose17 gives lower frame20..22, cut upper30..32.
    for (const z of [20, 21, 30]) {
      const c = r.cells.get(visualCellKey(336, 17, z))!;
      expect(c.role).toBe("core");
      expect(c.slot).toBe(
        protectedAt(z) && referenceOpticalMatingCubeR002(336, 17, z, solids)
          ? "trim"
          : "secondary",
      );
      if (protectedAt(z)) expect(c.facet).toBeUndefined();
    }
  }, 15000);
  it("renders the selected bridge cover on its real sloped bow contact plane", () => {
    const r = compileShipVisual(
      doc,
      catalog,
      "deck",
      "federation",
      undefined,
      "r002",
    );
    const bridge = doc.rooms.find((r) => r.type === "bridge")!;
    let covered = 0;
    const heights = new Set<number>();
    for (const l of r.layers.filter(
      (l) => l.id.includes(`floor-cover`) && l.id.endsWith(`:${bridge.id}`),
    )) {
      for (let y = l.bounds[1]; y < l.bounds[4]; y++)
        for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
          const p: [number, number] = [(x + 0.5) / 16, (y + 0.5) / 16];
          const v = doc.volumes.find((v) => l.support === `volume:${v.id}`)!;
          const tile = v.tiles.find((t) =>
            insidePolygon(placedTilePolygon(t), ...p),
          )!;
          if (!tile.bow) continue;
          const [lo] = bowHeights(tile, v.height, p);
          const top =
            Math.floor(lo) + G.bowProfiles.shellThicknessTexels[v.height][0];
          expect(l.bounds[5]).toBe(top);
          const c = r.cells.get(visualCellKey(x, y, top - 1))!;
          expect(c).toBeDefined();
          expect(c.facet).toBeUndefined();
          expect(r.cells.has(visualCellKey(x, y, top))).toBe(false);
          heights.add(top);
          covered++;
        }
    }
    expect(covered).toBeGreaterThan(100);
    expect(heights.size).toBeGreaterThan(1);
  }, 15000);
  it.each(["fed.s.wren", "fed.m.crest"])(
    "seats fitting-adjacent roof fields as surviving open wells over continuous core backing in %s",
    (id) => {
      const ship = PREFAB_SHIPS.find((s) => s.id === id)!;
      const r = compileShipVisual(
        ship,
        catalog,
        "flight",
        "federation",
        undefined,
        "r002",
      );
      const wells = r.layers.filter((l) =>
        l.id.includes(":roof-shoulder-well:"),
      );
      let open = 0;
      for (const l of wells)
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            for (let z = l.bounds[2]; z < l.bounds[5]; z++)
              if (!r.cells.has(visualCellKey(x, y, z))) open++;
            expect(
              [1, 2, 3, 4].some((d) =>
                [d, d + 1].every(
                  (q) =>
                    r.cells.get(visualCellKey(x, y, l.bounds[2] - q))?.role ===
                    "core",
                ),
              ),
            ).toBe(true);
          }
      expect(open).toBeGreaterThan(20);
      expect(
        [...r.cells.values()].some(
          (c) =>
            c.role === "service" &&
            c.slot === "metal" &&
            !r.cells.has(visualCellKey(c.x, c.y, c.z + 1)) &&
            wells.some(
              (l) =>
                c.x >= l.bounds[0] &&
                c.x < l.bounds[3] &&
                c.y >= l.bounds[1] &&
                c.y < l.bounds[4],
            ),
        ),
      ).toBe(true);
    },
    15000,
  );
  it("fingerprints actual finite manufacturing values while keeping r001 identity stable", () => {
    const profile = SHIP_VISUAL_MACRO_PROFILES_R002.federation;
    const before = visualProfilesSha256("r002"),
      legacy = visualProfilesSha256("r001");
    const original = profile.wallTasks.bridge.width;
    try {
      profile.wallTasks.bridge.width = original + 1;
      expect(visualProfilesSha256("r002")).not.toBe(before);
      expect(visualProfilesSha256("r001")).toBe(legacy);
    } finally {
      profile.wallTasks.bridge.width = original;
    }
    expect(visualProfilesSha256("r002")).toBe(before);
    const cut = profile.partitionCut;
    const certificate = Object.values(profile.opticalInterfaces).find(
      (c) => c.sourceFrameBounds.length,
    )!;
    const bound = certificate.sourceFrameBounds[0][2];
    try {
      profile.partitionCut = cut - 1;
      expect(visualProfilesSha256("r002")).not.toBe(before);
      profile.partitionCut = cut;
      certificate.sourceFrameBounds[0][2] = bound + 1 / 16;
      expect(visualProfilesSha256("r002")).not.toBe(before);
      expect(visualProfilesSha256("r001")).toBe(legacy);
    } finally {
      profile.partitionCut = cut;
      certificate.sourceFrameBounds[0][2] = bound;
    }
    expect(visualProfilesSha256("r002")).toBe(before);
  });
  it("retains the delivered r001 profile and exact Wren deck volume", () => {
    expect(visualProfilesSha256()).toBe(
      "8c9a58bc361116c1ab663dcad5dd2b05c06fdf1cd7d9711339cdbc714b6649d6",
    );
    expect(
      visualVolumeSha256(
        compileShipVisual(doc, catalog, "deck", "federation").cells,
      ),
    ).toBe("690ef71372e085b118277198c54b341305b20a60e3ceed3f79050d411bf58dab");
    expect(visualProfilesSha256("r002")).not.toBe(visualProfilesSha256("r001"));
    expect(() => visualProfilesSha256("r003")).toThrow("Unknown");
  });
  it("exposes globally selected room-purpose assemblies over retained two-course pressure cores", () => {
    const functions = new Set<string>();
    for (const ship of [
      doc,
      PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!,
    ]) {
      const before = JSON.stringify(ship),
        r = compileShipVisual(
          ship,
          catalog,
          "deck",
          "federation",
          undefined,
          "r002",
        );
      let opened = 0;
      for (const l of r.layers.filter(
        (l) =>
          l.id.includes(":room-task:") &&
          (l.id.endsWith(":well") || l.id.endsWith(":functional-well")),
      )) {
        const volume = ship.volumes.find((v) => l.support === `volume:${v.id}`);
        const poly = volume?.id
          ? volumeGeometry(volume).outline!.outer.map(
              ([x, y]): [number, number] => [x * 16, y * 16],
            )
          : undefined;
        const room = ship.rooms.find((room) =>
          l.id.includes(`:room-task:${room.id}:`),
        )!;
        const purpose = room.type === "medbay" ? "medical" : room.type;
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++)
            for (let z = l.bounds[2]; z < l.bounds[5]; z++) {
              if (r.cells.has(visualCellKey(x, y, z))) continue;
              opened++;
              functions.add(purpose);
              if (poly) {
                const face = polygonBoundarySample([x + 0.5, y + 0.5], poly);
                expect(face.distance).toBeGreaterThanOrEqual(3);
              } else expect(l.support).toMatch(/^edge:partition:/);
              // The real cavity belongs to the inner facade: walk farther toward
              // the exterior and two continuous support cells precede open air.
              expect(
                [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                ].some(([dx, dy]) =>
                  [1, 2, 3].some((start) =>
                    [start, start + 1].every(
                      (n) =>
                        r.cells.get(visualCellKey(x + dx * n, y + dy * n, z))
                          ?.role === "core",
                    ),
                  ),
                ),
                `${ship.id}:${x},${y},${z}`,
              ).toBe(true);
            }
      }
      expect(opened).toBeGreaterThan(0);
      expect(JSON.stringify(ship)).toBe(before);
    }
    // Optical guard rings and real furniture can exclude a control assembly;
    // never force one through glazing to satisfy a profile-name count. The
    // complete current ships must expose actual eligible task purposes instead.
    // R17 selects one GLOBAL room group; its winning face may be a partition or
    // the perimeter, so the backing gate measures both physical assemblies.
    expect(functions.has("bridge")).toBe(true);
    expect(functions.has("engineering")).toBe(true);
    expect(functions.has("quarters")).toBe(true);
    // These distinct room purposes must own actual surviving open wells, rather
    // than merely appearing in the finite profile table or emitted layer names.
    expect(
      ["medical", "workshop", "galley", "lounge", "cargo"].filter((k) =>
        functions.has(k),
      ).length,
    ).toBeGreaterThanOrEqual(3);
  }, 15000);
  it("keeps joined roof-cluster apertures open above actual two-course pressure support", () => {
    let opened = 0,
      access = 0,
      vent = 0;
    for (const ship of [
      doc,
      PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!,
    ]) {
      const r = compileShipVisual(
        ship,
        catalog,
        "flight",
        "federation",
        undefined,
        "r002",
      );
      for (const l of r.layers.filter((l) =>
        l.id.includes(":roof-cluster-well:"),
      ))
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            expect(r.cells.has(visualCellKey(x, y, l.bounds[5] - 1))).toBe(
              false,
            );
            opened++;
            const backing = r.cells.get(visualCellKey(x, y, l.bounds[2] - 1));
            expect(["core", "frame", "roof", "plate"]).toContain(backing?.role);
            for (const z of [l.bounds[2] - 1, l.bounds[2] - 2])
              expect(r.cells.get(visualCellKey(x, y, z))?.role).toBe("core");
            const insert = r.cells.get(visualCellKey(x, y, l.bounds[2]));
            if (insert?.slot === "accent") access++;
            if (insert?.slot === "metal") vent++;
          }
    }
    expect(opened).toBeGreaterThan(100);
    expect(access).toBeGreaterThan(20);
    expect(vent).toBeGreaterThan(20);
  }, 20000);
  it.each(["fed.s.wren", "fed.m.crest"])(
    "fills complete admitted room runs with unequal purpose fields and final cross-course owners in %s",
    (id) => {
      let groups = 0,
        broadGroups = 0,
        crossCourse = 0,
        oppositeSides = 0;
      let completeAftRun = false;
      const aftRoom = id === "fed.s.wren" ? "engine" : "eng";
      const aftEnd = id === "fed.s.wren" ? 108 : 156;
      const aftRun = `volume:hull:room-task:${aftRoom}:run:volume:hull:5:inward:4:${aftEnd}:3`;
      for (const ship of [PREFAB_SHIPS.find((s) => s.id === id)!]) {
        const result = compileShipVisual(
          ship,
          catalog,
          "deck",
          "federation",
          undefined,
          "r002",
        );
        const byColumn = new Map<string, typeof result.layers>();
        for (const l of result.layers)
          for (let y = l.bounds[1]; y < l.bounds[4]; y++)
            for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
              const key = `${x},${y}`;
              const list = byColumn.get(key) ?? [];
              list.push(l);
              byColumn.set(key, list);
            }
        for (const room of ship.rooms) {
          const selected = result.layers.filter((l) =>
            l.id.includes(`:room-task:${room.id}:run:`),
          );
          if (!selected.length) continue;
          expect(selected.some((l) => l.id.endsWith(":joined-case"))).toBe(
            true,
          );
          expect(selected.some((l) => l.role === "service")).toBe(true);
          // All complete usable faces are admitted; each keeps its own original
          // support family. Different faces are not squeezed into one room badge.
          expect(selected.every((l) => !!l.support)).toBe(true);
          const runs = new Map<string, typeof selected>();
          for (const l of selected) {
            const key = l.id.slice(0, l.id.lastIndexOf(":"));
            runs.set(key, [...(runs.get(key) ?? []), l]);
          }
          for (const [run, ls] of runs) {
            groups++;
            expect(run).toContain(":run:");
            const width = Math.max(
              ...[0, 1].map(
                (axis) =>
                  Math.max(...ls.map((l) => l.bounds[axis + 3])) -
                  Math.min(...ls.map((l) => l.bounds[axis])),
              ),
            );
            if (width >= 64) broadGroups++;
            if (run === aftRun) {
              expect(width).toBe(aftEnd - 4);
              // R23 cooling field is a broad complete opening in this actual
              // continuous aft run, rather than a small service stripe.
              const cooling = ls.filter((l) => l.id.endsWith(":well"));
              expect(cooling.length).toBeGreaterThan(0);
              const coolingAlong = [0, 1].map(
                (axis) =>
                  Math.max(...cooling.map((l) => l.bounds[axis + 3])) -
                  Math.min(...cooling.map((l) => l.bounds[axis])),
              );
              expect(Math.max(...coolingAlong)).toBeGreaterThanOrEqual(32);
              const occupiedTaskKeys = new Set<string>();
              for (const l of ls)
                for (let z = l.bounds[2]; z < l.bounds[5]; z++)
                  for (let y = l.bounds[1]; y < l.bounds[4]; y++)
                    for (let x = l.bounds[0]; x < l.bounds[3]; x++)
                      occupiedTaskKeys.add(visualCellKey(x, y, z));
              for (let y = 4; y < aftEnd; y++)
                for (let z = 6; z < 30; z++)
                  expect(
                    occupiedTaskKeys.has(visualCellKey(3, y, z)),
                    `${aftRun}:${y}:${z}`,
                  ).toBe(true);
              completeAftRun = true;
            }
            const core = result.layers.find(
              (l) => l.id.endsWith(":core") && l.support === ls[0].support,
            );
            if (core) {
              const axis = core.bounds[3] - core.bounds[0] === 2 ? 0 : 1,
                alongAxis = axis === 0 ? 1 : 0;
              const lo = Math.min(...ls.map((l) => l.bounds[alongAxis])),
                hi = Math.max(...ls.map((l) => l.bounds[alongAxis + 3]));
              if (
                Math.floor((lo - core.bounds[alongAxis]) / 32) !==
                Math.floor((hi - 1 - core.bounds[alongAxis]) / 32)
              )
                crossCourse++;
              if (ls.some((l) => l.bounds[axis + 3] <= core.bounds[axis]))
                oppositeSides |= 1;
              if (ls.some((l) => l.bounds[axis] >= core.bounds[axis + 3]))
                oppositeSides |= 2;
            }
          }
          const visited = new Set<string>();
          for (const l of selected)
            for (let z = l.bounds[2]; z < l.bounds[5]; z++)
              for (let y = l.bounds[1]; y < l.bounds[4]; y++)
                for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
                  const cellKey = visualCellKey(x, y, z);
                  if (visited.has(cellKey)) continue;
                  visited.add(cellKey);
                  const relevant = (byColumn.get(`${x},${y}`) ?? []).filter(
                    (a) => z >= a.bounds[2] && z < a.bounds[5],
                  );
                  const owner = relevant[relevant.length - 1];
                  expect(owner.id, cellKey).toContain(`:room-task:${room.id}:`);
                  const c = result.cells.get(cellKey);
                  if (owner.role === "void") {
                    expect(c, cellKey).toBeUndefined();
                    expect(
                      [
                        [1, 0],
                        [-1, 0],
                        [0, 1],
                        [0, -1],
                      ].some(([dx, dy]) =>
                        [1, 2].every(
                          (n) =>
                            result.cells.get(
                              visualCellKey(x + dx * n, y + dy * n, z),
                            )?.role === "core",
                        ),
                      ),
                      cellKey,
                    ).toBe(true);
                  } else {
                    expect(c?.family, cellKey).toBe(owner.support);
                    expect(c?.role, cellKey).toBe(owner.role);
                    expect(c?.slot, cellKey).toBe(owner.slot);
                  }
                }
        }
      }
      expect(groups).toBeGreaterThanOrEqual(3);
      expect(groups).toBe(id === "fed.s.wren" ? 7 : 21);
      // Complete final census admits one long aft run; independent short faces
      // remain covered by the final-owner/backing assertions above.
      expect(broadGroups).toBe(1);
      expect(completeAftRun).toBe(true);
      expect(crossCourse).toBeGreaterThan(0);
      expect(oppositeSides).toBe(3);
    },
    20000,
  );
  it.each(["fed.s.wren", "fed.m.crest"])(
    "attributes new mating pigment only to actual final exposed finish owners in %s",
    (id) => {
      const ship = PREFAB_SHIPS.find((s) => s.id === id)!,
        profile = SHIP_VISUAL_MACRO_PROFILES_R002.federation;
      const pins = profile.opticalMatingPigments;
      let baseline: ReturnType<typeof compileShipVisual>;
      try {
        profile.opticalMatingPigments = {};
        baseline = compileShipVisual(
          ship,
          catalog,
          "deck",
          "federation",
          undefined,
          "r002",
        );
      } finally {
        profile.opticalMatingPigments = pins;
      }
      const current = compileShipVisual(
        ship,
        catalog,
        "deck",
        "federation",
        undefined,
        "r002",
      );
      const changed = [...current.cells.entries()].filter(
        ([k, c]) => c.slot !== baseline.cells.get(k)?.slot,
      );
      expect(changed.length).toBeGreaterThan(0);
      const cols = new Map<string, typeof current.layers>();
      for (const [k] of changed) {
        const [x, y] = k.split(",");
        cols.set(`${x},${y}`, []);
      }
      for (const l of current.layers)
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++)
            cols.get(`${x},${y}`)?.push(l);
      for (const [k, c] of changed) {
        const old = baseline.cells.get(k)!;
        const { slot: oldSlot, ...before } = old,
          { slot: newSlot, ...after } = c;
        expect(after, k).toEqual(before);
        expect(newSlot, k).toBe("trim");
        expect(
          [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1],
          ].some(
            ([x, y, z]) =>
              !current.cells.has(visualCellKey(c.x + x, c.y + y, c.z + z)),
          ),
          k,
        ).toBe(true);
        const owner = (cols.get(`${c.x},${c.y}`) ?? [])
          .filter((l) => c.z >= l.bounds[2] && c.z < l.bounds[5])
          .at(-1)!;
        expect(owner.id, k).toMatch(
          /:diagonal-pressure-case$|:diagonal-inset-lip$|:continuous-sill$|:cassette-rim$|:pressure-backing$|:inset-armor$|:exposed-bay:.*:armor$/,
        );
        expect(owner.id, k).not.toMatch(
          /two-sided-pressure-core|inner-service-backing|:hatch$|:cap$/,
        );
      }
    },
    20000,
  );
  it("matches static fitting wall bounds to the actual cardinal renderer frame and rejects uncertain qualification", () => {
    const sockets = deriveInterior(
      PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!,
      0,
      catalog,
    ).sockets;
    const certsActual =
      SHIP_VISUAL_MACRO_PROFILES_R002.federation.staticWallFittings;
    for (const designId of [
      "pale-studless.kitchen.standard",
      "pale-studless.table.standard",
    ] as const) {
      const actual = sockets.find((o) => o.designId === designId)!;
      const cert = certsActual[designId];
      expect(actual).toBeDefined();
      // Test each real, unmodified actual socket first. Its existing size is part
      // of the source contract, not changed to make a rotated certificate fit.
      const realBounds = referenceStaticWallFittingBoundsR002(
        actual,
        G.deck.floorTopTexels,
      );
      expect(realBounds, designId).toBeDefined();
      for (const [quarter, facing] of (
        ["fore", "port", "aft", "starboard"] as const
      ).entries()) {
        const width = cert.bounds[3] - cert.bounds[0],
          depth = cert.bounds[4] - cert.bounds[1];
        const size: [number, number] =
          quarter % 2 ? [width, depth] : [depth, width];
        const socket = { ...actual, size, facing };
        const anchor: [number, number] = [
          socket.at[0] + size[0] / 2,
          socket.at[1] + size[1] / 2,
        ];
        const matrix = multiply(
          multiply(GLTF_TO_ZUP, mountRotation("interior", "interior")),
          componentMatrix(
            anchor,
            G.deck.floorTopTexels / 16,
            quarter + cert.artQuarterTurns,
          ),
        );
        const points: [number, number, number][] = [];
        for (const x of [cert.bounds[0], cert.bounds[3]])
          for (const y of [cert.bounds[1], cert.bounds[4]])
            for (const z of [cert.bounds[2], cert.bounds[5]])
              points.push(transformPoint(matrix, [x, z, -y]));
        const expected = [0, 1, 2]
          .map(
            (i) =>
              Math.min(...points.map((p) => p[i])) - cert.clearanceCells / 16,
          )
          .concat(
            [0, 1, 2].map(
              (i) =>
                Math.max(...points.map((p) => p[i])) + cert.clearanceCells / 16,
            ),
          );
        const bounds = referenceStaticWallFittingBoundsR002(
          socket,
          G.deck.floorTopTexels,
        )!;
        expect(bounds, `${designId}:${facing}`).toBeDefined();
        for (let i = 0; i < 6; i++)
          expect(bounds[i], `${designId}:${facing}:${i}`).toBeCloseTo(
            expected[i],
            10,
          );
        if (facing === actual.facing) expect(bounds).toEqual(realBounds);
      }
    }
    const source = sockets.find(
      (o) => o.designId === "pale-studless.kitchen.standard",
    )!;
    expect(
      referenceStaticWallFittingBoundsR002(
        { ...source, designId: "unknown" },
        G.deck.floorTopTexels,
      ),
    ).toBeUndefined();
    expect(
      referenceStaticWallFittingBoundsR002(
        { ...source, at: [NaN, 0] },
        G.deck.floorTopTexels,
      ),
    ).toBeUndefined();
    expect(
      referenceStaticWallFittingBoundsR002(
        { ...source, size: [0.1, 0.1] },
        G.deck.floorTopTexels,
      ),
    ).toBeUndefined();
    const certs = structuredClone(
      SHIP_VISUAL_MACRO_PROFILES_R002.federation.staticWallFittings,
    );
    (certs["pale-studless.kitchen.standard"].bounds as unknown as number[])[0] =
      NaN;
    expect(
      referenceStaticWallFittingBoundsR002(
        source,
        G.deck.floorTopTexels,
        certs,
      ),
    ).toBeUndefined();
  });
  it.each(["fed.s.wren", "fed.m.crest"])(
    "authors distinct full-run purpose hardware with final backed ownership in %s",
    (id) => {
      const ship = PREFAB_SHIPS.find((s) => s.id === id)!,
        r = compileShipVisual(
          ship,
          catalog,
          "deck",
          "federation",
          undefined,
          "r002",
        );
      const groups = new Map<string, typeof r.layers>();
      for (const l of r.layers.filter((l) => l.id.includes(":room-task:"))) {
        const k = l.id.slice(0, l.id.lastIndexOf(":"));
        groups.set(k, [...(groups.get(k) ?? []), l]);
      }
      expect(groups.size).toBeGreaterThan(0);
      const byColumn = new Map<string, typeof r.layers>();
      for (const l of r.layers)
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            const k = `${x},${y}`;
            byColumn.set(k, [...(byColumn.get(k) ?? []), l]);
          }
      let wells = 0,
        hardware = 0;
      for (const [group, ls] of groups) {
        expect(group).toMatch(/:room-task:/);
        expect(ls.some((l) => l.role === "service")).toBe(true);
        expect(
          ls.every(
            (l) =>
              l.bounds.every(Number.isInteger) &&
              l.bounds.slice(0, 3).every((v, i) => v < l.bounds[i + 3]),
          ),
        ).toBe(true);
        for (const l of ls)
          for (let z = l.bounds[2]; z < l.bounds[5]; z++)
            for (let y = l.bounds[1]; y < l.bounds[4]; y++)
              for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
                const key = visualCellKey(x, y, z);
                const owners = (byColumn.get(`${x},${y}`) ?? []).filter(
                  (a) => z >= a.bounds[2] && z < a.bounds[5],
                );
                const owner = owners.at(-1)!;
                expect(owner.id, key).toContain(group);
                expect(owner.support, key).toBe(l.support);
                const c = r.cells.get(key);
                if (owner.role === "void") {
                  expect(c, key).toBeUndefined();
                  wells++;
                  expect(
                    [
                      [1, 0],
                      [-1, 0],
                      [0, 1],
                      [0, -1],
                    ].some(([dx, dy]) =>
                      [1, 2].every(
                        (n) =>
                          r.cells.get(visualCellKey(x + dx * n, y + dy * n, z))
                            ?.role === "core",
                      ),
                    ),
                    key,
                  ).toBe(true);
                } else {
                  expect(c?.slot, key).toBe(owner.slot);
                  expect(c?.role, key).toBe(owner.role);
                  if (c?.role === "service") hardware++;
                }
              }
      }
      expect(wells).toBeGreaterThan(10);
      expect(hardware).toBeGreaterThan(10);
    },
    20000,
  );
  it("seats broad exposed armor behind real case returns and backs functional outer wells", () => {
    const kinds = new Set<string>();
    let seats = 0,
      returns = 0;
    for (const ship of [
      doc,
      PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!,
    ]) {
      const r = compileShipVisual(
        ship,
        catalog,
        "deck",
        "federation",
        undefined,
        "r002",
      );
      for (const l of r.layers.filter(
        (l) => l.id.includes(":exposed-bay:") && l.id.endsWith(":armor-seat"),
      )) {
        const volume = ship.volumes.find(
          (v) => l.support === `volume:${v.id}`,
        )!;
        const poly = volumeGeometry(volume).outline!.outer.map(
          ([x, y]): [number, number] => [x * 16, y * 16],
        );
        const x = l.bounds[0],
          y = l.bounds[1];
        const boundary = polygonBoundarySample([x + 0.5, y + 0.5], poly);
        // Axis-aligned assembly rays give exact first-hit face planes without
        // approximating the guarded diagonal clipped polygons.
        if (Math.abs(boundary.normalHint[0] * boundary.normalHint[1]) > 0.001)
          continue;
        let [dx, dy] = boundary.normalHint;
        if (!insidePolygon(poly, x + 0.5 + dx * 2, y + 0.5 + dy * 2)) {
          dx = -dx;
          dy = -dy;
        }
        for (let z = l.bounds[2]; z < l.bounds[5]; z++) {
          if (r.cells.has(visualCellKey(x, y, z))) continue;
          const behind = r.cells.get(visualCellKey(x + dx, y + dy, z));
          if (behind?.slot !== "primary") continue;
          seats++;
          expect(behind.role).toBe("core");
          // Armor first hit is one lattice course inward; both inner support
          // courses exist. Adjacent lower casing hits the original outer plane.
          for (const n of [1, 2])
            expect(
              r.cells.get(visualCellKey(x + dx * n, y + dy * n, z))?.role,
            ).toBe("core");
          const returnCell = r.cells.get(visualCellKey(x, y, l.bounds[2] - 1));
          if (returnCell?.slot === "trim") returns++;
        }
      }
      for (const l of r.layers.filter(
        (l) => l.id.includes(":exposed-bay:") && l.id.endsWith(":well"),
      )) {
        for (let z = l.bounds[2]; z < l.bounds[5]; z++) {
          const x = l.bounds[0],
            y = l.bounds[1];
          if (r.cells.has(visualCellKey(x, y, z))) continue;
          if (
            [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].some(([dx, dy]) =>
              [1, 2].every(
                (n) =>
                  r.cells.get(visualCellKey(x + dx * n, y + dy * n, z))
                    ?.role === "core",
              ),
            )
          )
            kinds.add(l.id.split(":").at(-2)!);
        }
      }
    }
    expect(seats).toBeGreaterThan(100);
    expect(returns).toBeGreaterThan(20);
    expect(kinds.has("vent")).toBe(true);
    expect(kinds.has("access")).toBe(true);
  }, 15000);
  it.each(["fed.s.wren", "fed.m.crest"])(
    "joins unequal task-sized roof cases to the backing and leaves functional recesses visible in %s",
    (id) => {
      const compileStarted = performance.now();
      const ship = PREFAB_SHIPS.find((s) => s.id === id)!,
        r = compileShipVisual(
          ship,
          catalog,
          "flight",
          "federation",
          undefined,
          "r002",
        );
      const compileMs = performance.now() - compileStarted;
      const checksStarted = performance.now();
      const exactFailures: string[] = [];
      const geoms = ship.volumes.map(volumeGeometry);
      const occupied = [
        ...ship.mounts
          .filter((m) => m.attach === "top")
          .map(
            (m) => placeMount(m, catalog.get(m.component), geoms, ship).rect,
          ),
        ...(ship.mountTiles ?? []).map((m) => placeMountTile(m, geoms).rect),
      ];
      const blocked = (x: number, y: number) =>
        occupied.some(
          (b) =>
            (x + 0.5) / 16 >= b[0] &&
            (x + 0.5) / 16 <= b[2] &&
            (y + 0.5) / 16 >= b[1] &&
            (y + 0.5) / 16 <= b[3],
        );
      const cases = r.layers.filter(
        (l) => l.id.includes(":roof-task-case:") && l.support === "volume:hull",
      );
      expect(new Set(cases.map((l) => l.id)).size).toBeGreaterThanOrEqual(2);
      // Ordered compaction may split one positive body into vertical pieces.
      // Measure its full SAME-owner column, not an upper fragment's endpoint.
      const caseBases = new Map<string, number>();
      for (const l of cases)
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            const key = `${l.id}:${x},${y}`;
            caseBases.set(
              key,
              Math.min(caseBases.get(key) ?? Infinity, l.bounds[2]),
            );
          }
      let visible = 0;
      const upperLevels = new Set<number>();
      for (const l of cases)
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            const z = l.bounds[5] - 1,
              cell = r.cells.get(visualCellKey(x, y, z));
            if (
              !cell ||
              cell.role !== "plate" ||
              r.cells.has(visualCellKey(x, y, z + 1)) ||
              blocked(x, y)
            )
              continue;
            visible++;
            upperLevels.add(z);
            const base = caseBases.get(`${l.id}:${x},${y}`)!;
            for (const course of [base - 1, base - 2]) {
              const key = visualCellKey(x, y, course),
                actual = r.cells.get(key)?.role;
              if (actual !== "core")
                exactFailures.push(
                  `${key}: expected CORE backing, actual ${actual}`,
                );
            }
            for (let course = base; course <= z; course++) {
              const key = visualCellKey(x, y, course);
              if (!r.cells.has(key))
                exactFailures.push(
                  `${key}: expected positive case course, actual absent`,
                );
            }
          }
      expect(visible).toBeGreaterThan(1000);
      // R24 changes the actual high roof silhouette, not only pigment/endpoints.
      expect(Math.max(...upperLevels)).toBe(46);
      expect(
        Math.max(...upperLevels) - Math.min(...upperLevels),
      ).toBeGreaterThanOrEqual(5);
      let deepMouths = 0;
      for (const l of r.layers.filter(
        (l) =>
          l.id.includes(":roof-cluster-well:") &&
          l.bounds[2] === 41 &&
          l.bounds[5] === 47,
      ))
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            if (r.cells.has(visualCellKey(x, y, 45))) continue;
            deepMouths++;
            const bottomKey = visualCellKey(x, y, 40),
              bottom = r.cells.get(bottomKey)?.role;
            if (bottom !== "plate")
              exactFailures.push(
                `${bottomKey}: expected PLATE closed bottom, actual ${bottom}`,
              );
            for (const z of [38, 39]) {
              const key = visualCellKey(x, y, z),
                actual = r.cells.get(key)?.role;
              if (actual !== "core")
                exactFailures.push(
                  `${key}: expected CORE mouth backing, actual ${actual}`,
                );
            }
          }
      expect(deepMouths).toBeGreaterThan(20);
      expect(upperLevels.size).toBeGreaterThanOrEqual(2);
      // Actual occupied top cells must expose the promised two-cell step;
      // different box endpoints or a recolor alone do not establish relief.
      expect(
        Math.max(...upperLevels) - Math.min(...upperLevels),
      ).toBeGreaterThanOrEqual(2);
      let open = 0;
      for (const l of r.layers.filter(
        (l) =>
          l.support === "volume:hull" &&
          l.id.endsWith(":roof-functional-pocket"),
      ))
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            if (
              r.cells.has(visualCellKey(x, y, l.bounds[2] + 1)) ||
              blocked(x, y)
            )
              continue;
            open++;
            const backing = [l.bounds[2] - 1, l.bounds[2] - 2].find((z) =>
              r.cells.has(visualCellKey(x, y, z)),
            );
            if (backing === undefined)
              exactFailures.push(
                `${x},${y},${l.bounds[2]}: expected finite functional pocket backing, actual absent`,
              );
            else {
              const cell = r.cells.get(visualCellKey(x, y, backing))!;
              const topCore = cell.role === "core" ? backing : backing - 1;
              for (const z of [topCore, topCore - 1]) {
                const key = visualCellKey(x, y, z),
                  actual = r.cells.get(key)?.role;
                if (actual !== "core")
                  exactFailures.push(
                    `${key}: expected CORE functional pocket backing, actual ${actual}`,
                  );
              }
            }
          }
      expect(open).toBeGreaterThan(100);
      console.log(
        JSON.stringify({
          scope: "R24 exact roof cell checks",
          id,
          compileMs,
          checkMs: performance.now() - checksStarted,
          visible,
          deepMouths,
          open,
          exactFailures,
        }),
      );
      expect(exactFailures).toEqual([]);
    },
    15000,
  );
  it.each(["fed.s.wren", "fed.m.crest"])(
    "leaves two exposed backed roof service routes beside actual fittings and preserves marking fields in %s",
    (id) => {
      const ship = PREFAB_SHIPS.find((d) => d.id === id)!;
      const geoms = ship.volumes.map(volumeGeometry);
      const roof = compileShipVisual(
        ship,
        catalog,
        "flight",
        "federation",
        undefined,
        "r002",
      );
      const obstacles = [
        ...ship.mounts
          .filter((m) => m.attach === "top")
          .map(
            (m) => placeMount(m, catalog.get(m.component), geoms, ship).rect,
          ),
        ...(ship.mountTiles ?? []).map((t) => placeMountTile(t, geoms).rect),
      ];
      const markings = referencePlateDecals(
        ship,
        dressShip(ship, { catalog }).decals,
        "r002",
      )
        .filter((d) => d.normal[2] > 0.99)
        .map((d) => [
          Math.min(...d.corners.map((p) => p[0])),
          Math.min(...d.corners.map((p) => p[1])),
          Math.max(...d.corners.map((p) => p[0])),
          Math.max(...d.corners.map((p) => p[1])),
        ]);
      const hull = geoms.find((g) => g.volume.id === "hull")!;
      const outline = hull.outline!.outer.map(([x, y]): [number, number] => [
        x * 16,
        y * 16,
      ]);
      const mid = (hull.bounds[1] + hull.bounds[3]) * 8;
      const separation = (hull.bounds[3] - hull.bounds[1]) * 16 * 0.17;
      const counts = [0, 0];
      for (const c of roof.cells.values()) {
        if (
          c.family !== "volume:hull" ||
          c.surfaceRole !== "roof" ||
          c.slot === "primary" ||
          c.z < hull.z[1] - 5 ||
          roof.cells.has(visualCellKey(c.x, c.y, c.z + 1)) ||
          Math.abs(c.y - mid) < separation ||
          polygonBoundarySample([c.x + 0.5, c.y + 0.5], outline).distance < 6
        )
          continue;
        const x = (c.x + 0.5) / 16,
          y = (c.y + 0.5) / 16;
        if (
          [...obstacles, ...markings].some(
            (r) =>
              x >= r[0] - 0.125 &&
              x < r[2] + 0.125 &&
              y >= r[1] - 0.125 &&
              y < r[3] + 0.125,
          )
        )
          continue;
        counts[c.y < mid ? 0 : 1]++;
        expect(
          [1, 2, 3, 4].some((n) =>
            roof.cells.has(visualCellKey(c.x, c.y, c.z - n)),
          ),
        ).toBe(true);
      }
      // These are surviving top-facing cells beyond the occupied centreline, not
      // source-layer names or a count of a well hidden beneath an installed turret.
      expect(counts[0]).toBeGreaterThan(200);
      expect(counts[1]).toBeGreaterThan(200);
      for (const layer of roof.layers.filter((l) =>
        l.id.endsWith(":roof-protected-channel"),
      )) {
        const [x, y, , X, Y] = layer.bounds;
        for (let a = x; a < X; a++)
          for (let b = y; b < Y; b++)
            expect(
              markings.some(
                (r) =>
                  (a + 0.5) / 16 >= r[0] &&
                  (a + 0.5) / 16 < r[2] &&
                  (b + 0.5) / 16 >= r[1] &&
                  (b + 0.5) / 16 < r[3],
              ),
            ).toBe(false);
      }
      const deck = compileShipVisual(
        ship,
        catalog,
        "deck",
        "federation",
        undefined,
        "r002",
      );
      expect(
        deck.layers.some(
          (l) => l.id.endsWith(":shaped-end") && !l.id.startsWith("partition:"),
        ),
      ).toBe(false);
      expect(
        deck.layers
          .filter((l) => l.id.startsWith("post:"))
          .every((l) => l.bounds[5] <= 25),
      ).toBe(true);
      // Each bounded case retains its complete deck/flight assembly assertions.
    },
    20000,
  );
});

describe("finite V3 Wren cockpit aperture duties", () => {
  it("keeps two raw face-connected pane courses and the exact retained upper contour in both views", () => {
    const doc = PREFAB_SHIPS.find((s) => s.id === "fed.s.wren")!;
    const catalog = defaultPrefabComponentCatalog();
    for (const view of ["deck", "flight"] as const) {
      const writes = referenceCockpitApertureR002(
        doc,
        view,
        catalog,
        "federation",
      );
      expect(writes).toHaveLength(1000);
      expect(
        new Set(writes.map((l) => l.bounds.slice(0, 3).join(","))).size,
      ).toBe(1000);
      for (const [section, normal, coordinates] of [
        ["south", [1, -1], [158, 159]],
        ["north", [1, 1], [269, 270]],
      ] as const) {
        const selected = writes.filter((l) =>
          l.id.startsWith(`candidate-D:${section}:`),
        );
        const pane = selected.filter((l) => l.role === "core"),
          clear = selected.filter((l) => l.role === "void");
        expect(selected).toHaveLength(500);
        expect(pane).toHaveLength(198);
        expect(clear).toHaveLength(302);
        expect(
          [
            ...new Set(
              pane.map(
                (l) => normal[0] * l.bounds[0] + normal[1] * l.bounds[1],
              ),
            ),
          ].sort(),
        ).toEqual([...coordinates].sort());
        expect(
          pane.every(
            (l) =>
              l.slot === "glass" &&
              l.surfaceRole === "hull" &&
              !l.facet &&
              !l.normalHint &&
              !l.normalChart &&
              !l.normalSide,
          ),
        ).toBe(true);
        expect(
          clear.every(
            (l) =>
              l.slot === "dark" &&
              l.surfaceRole === (view === "flight" ? "hull" : "wall"),
          ),
        ).toBe(true);
        expect(
          selected.every(
            (l) =>
              l.support === "volume:hull" &&
              [0, 1, 2].every((a) => l.bounds[a + 3] - l.bounds[a] === 1),
          ),
        ).toBe(true);
        const keys = new Set(pane.map((l) => l.bounds.slice(0, 3).join(","))),
          reached = new Set<string>(),
          queue = [[...keys][0]];
        let edges = 0;
        for (const key of keys) {
          const p = key.split(",").map(Number);
          for (const n of [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ])
            if (keys.has(p.map((v, a) => v + n[a]).join(","))) edges++;
        }
        while (queue.length) {
          const key = queue.pop()!;
          if (reached.has(key)) continue;
          reached.add(key);
          const p = key.split(",").map(Number);
          for (const n of [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1],
          ]) {
            const next = p.map((v, a) => v + n[a]).join(",");
            if (keys.has(next) && !reached.has(next)) queue.push(next);
          }
        }
        expect(reached.size).toBe(198);
        expect(edges).toBe(367);
        // The accepted whole upper/end contour remains untouched, not seven isolated teeth.
        expect(
          selected.some(
            (l) =>
              l.bounds[2] >= 26 &&
              (section === "south"
                ? l.bounds[0] + l.bounds[1] - 160
                : l.bounds[0] - l.bounds[1] - 49) >= 21,
          ),
        ).toBe(false);
      }
    }
  });
  it("keeps the entire old pair for unsupported profiles, source pins or moved occurrences", () => {
    const doc = PREFAB_SHIPS.find((s) => s.id === "fed.s.wren")!,
      catalog = defaultPrefabComponentCatalog();
    expect(referenceCockpitApertureSourceAdmittedR002("federation")).toBe(true);
    expect(referenceCockpitApertureSourceAdmittedR002("riftjack")).toBe(false);
    expect(
      referenceCockpitApertureR002(doc, "deck", catalog, "riftjack"),
    ).toEqual([]);
    expect(
      referenceCockpitApertureR002(
        PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!,
        "deck",
        catalog,
        "federation",
      ),
    ).toEqual([]);
    const certificate =
        REFERENCE_OPTICAL_INTERFACES_R002["bow.slope1.deck.s2.a1.edge1"],
      original = certificate.assetSha256;
    try {
      certificate.assetSha256 = "0".repeat(64);
      expect(referenceCockpitApertureSourceAdmittedR002("federation")).toBe(
        false,
      );
      expect(
        referenceCockpitApertureR002(doc, "deck", catalog, "federation"),
      ).toEqual([]);
    } finally {
      certificate.assetSha256 = original;
    }
    const macro = SHIP_VISUAL_MACRO_PROFILES_R002.federation,
      oldInterfaces = macro.opticalInterfaces;
    try {
      macro.opticalInterfaces = { ...oldInterfaces };
      delete macro.opticalInterfaces["bow.slope1.deck.s2.a1.edge1"];
      expect(referenceCockpitApertureSourceAdmittedR002("federation")).toBe(
        false,
      );
      expect(
        referenceCockpitApertureR002(doc, "deck", catalog, "federation"),
      ).toEqual([]);
    } finally {
      macro.opticalInterfaces = oldInterfaces;
    }
    const dressed = dressShip(doc, { catalog });
    for (const mutate of [
      (kit: typeof dressed.kit) =>
        kit.map((k) =>
          k.piece === "bow.slope1.deck.s2.a1.edge1"
            ? { ...k, x: k.x + 1 / 16 }
            : k,
        ),
      (kit: typeof dressed.kit) =>
        kit.map((k) =>
          k.piece === "bow.slope1.deck.s2.a1.edge1"
            ? { ...k, mirror: true }
            : k,
        ),
      (kit: typeof dressed.kit) => [
        ...kit,
        kit.find((k) => k.piece === "bow.slope1.deck.s2.a1.edge1")!,
      ],
    ]) {
      const spy = vi
        .spyOn(dresser, "dressShip")
        .mockReturnValue({ ...dressed, kit: mutate(dressed.kit) });
      try {
        expect(
          referenceCockpitApertureR002(doc, "flight", catalog, "federation"),
        ).toEqual([]);
      } finally {
        spy.mockRestore();
      }
    }
  });
});
