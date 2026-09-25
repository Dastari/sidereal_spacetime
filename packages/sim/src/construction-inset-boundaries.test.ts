import { expect, it } from "vitest";
import {
  emptyLayout,
  stampTile,
  type Point,
} from "@sidereal/content/ship-layout";
import { CONSTRUCTION_INSET_VISUAL_PIN } from "@sidereal/content/construction-inset-visuals";
import { bindConstructionLayout } from "./construction-layout";
import { planPinnedInsetBoundaries } from "./construction-inset-boundaries";
import {
  compileDeckCollision,
  resolveDeckCollision,
  canOccupyDeck,
  sweepDeckCircle,
} from "./construction-collision";
function document(partition = false) {
  const d = emptyLayout("review", "main");
  d.decks[0].ceiling = 102;
  d.tiles = [stampTile("floor", "main", "rectangle", [0, 0])];
  d.tiles[0].vertices = [
    [0, 0],
    [128, 0],
    [128, 128],
    [0, 128],
  ];
  // Four actual 2 m native floors.
  d.tiles = [
    [0, 0],
    [64, 0],
    [0, 64],
    [64, 64],
  ].map(([x, y], i) => {
    const t = stampTile("floor-" + i, "main", "rectangle", [0, 0]);
    t.vertices = [
      [x, y],
      [x + 64, y],
      [x + 64, y + 64],
      [x, y + 64],
    ];
    return t;
  });
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
    boundaryTreatments: [],
  };
  if (partition) {
    d.partitions = [
      {
        id: "divider",
        deckId: "main",
        a: [64, 0],
        b: [64, 128],
        seal: "design-sealed",
      },
    ];
    d.structure.boundaryTreatments = [
      {
        id: "side",
        deckId: "main",
        source: "partition",
        sourceAnchorId: "divider",
        a: [64, 0],
        b: [64, 128],
        treatment: "auto",
        reservationSide: "center",
      },
    ];
  }
  const bound = bindConstructionLayout(d).document;
  bound.boundaryKit = { ...CONSTRUCTION_INSET_VISUAL_PIN };
  return bound;
}
function frame(d: ReturnType<typeof document>) {
  const p = planPinnedInsetBoundaries(d, "main");
  return resolveDeckCollision(
    compileDeckCollision(d.layout, "main", {
      shipId: "test",
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      obstacles: p.obstacles,
    }),
    [],
  );
}
const location = (position: Point) => ({
  shipId: "test",
  deckId: "main",
  position,
});
for (let q = 0; q < 4; q++)
  it("inward wall blocks inside tile at rotation " + q, () => {
    const f = frame(document());
    const turn = ([x, y]: Point): Point =>
      (
        [
          [x, y],
          [4 - y, x],
          [4 - x, 4 - y],
          [y, 4 - x],
        ] as Point[]
      )[q];
    expect(canOccupyDeck(f, location(turn([0.4, 2])), 0.3)).toBe(false);
    expect(canOccupyDeck(f, location(turn([0.6, 2])), 0.3)).toBe(true);
    const start = turn([1, 2]),
      target = turn([0, 2]);
    const moved = sweepDeckCircle(
      f,
      location(start),
      [target[0] - start[0], target[1] - start[1]],
      0.3,
    );
    expect(
      Math.hypot(moved.position[0] - target[0], moved.position[1] - target[1]),
    ).toBeGreaterThanOrEqual(0.55 - 1e-6);
  });
it("centered partition blocks its full reservation", () => {
  const f = frame(document(true));
  expect(canOccupyDeck(f, location([1.6, 2]), 0.3)).toBe(false);
  expect(canOccupyDeck(f, location([1.5, 2]), 0.3)).toBe(true);
});
it("concave footprint decomposition never bridges the notch", () => {
  const d = document();
  d.layout.tiles = d.layout.tiles.slice(0, 3);
  const plan = planPinnedInsetBoundaries(d, "main");
  const corner = plan.placements.find((p) => p.profileId === "concave-90")!;
  expect(corner).toBeDefined();
  const nearNotch: Point = [
    corner.originUnits[0] / 32 + 0.0625,
    corner.originUnits[1] / 32 + 0.0625,
  ];
  expect(
    plan.obstacles.some((o) => {
      const xs = o.vertices.map((v) => v[0]),
        ys = o.vertices.map((v) => v[1]);
      return (
        nearNotch[0] > Math.min(...xs) &&
        nearNotch[0] < Math.max(...xs) &&
        nearNotch[1] > Math.min(...ys) &&
        nearNotch[1] < Math.max(...ys)
      );
    }),
  ).toBe(false);
  expect(() => frame(d)).not.toThrow();
});
it("rejects changed pins, shorter wall profiles and holes", () => {
  const pin = document();
  pin.boundaryKit!.sha256 = "0".repeat(64);
  expect(() => planPinnedInsetBoundaries(pin, "main")).toThrow(
    "exact visual kit pin",
  );
  const short = document();
  if (short.layout.structure?.schema !== "sidereal.layout-structure.v2")
    throw Error();
  short.layout.structure.deckProfiles[0].clearHeight = 48;
  expect(() => planPinnedInsetBoundaries(short, "main")).toThrow(
    "full-height profile",
  );
  const hole = document();
  hole.layout.decks[0].holes = [{ id: "hole", seed: [32, 32] }];
  expect(() => planPinnedInsetBoundaries(hole, "main")).toThrow(
    "without holes",
  );
});

it("rejects armor and wall-face selections instead of silently omitting authored intent", () => {
  const armor = document(),
    faces = document();
  if (
    armor.layout.structure?.schema !== "sidereal.layout-structure.v2" ||
    faces.layout.structure?.schema !== "sidereal.layout-structure.v2"
  )
    throw Error();
  armor.layout.structure.armor.push({
    id: "armor",
    deckId: "main",
    boundaryId: "south",
    footprint: [
      [0, 0],
      [32, 0],
      [32, 4],
      [0, 4],
    ],
    bottom: 6,
    top: 102,
  });
  faces.layout.structure.wallFaces.south = { left: "authored-inner-finish" };
  for (const candidate of [armor, faces])
    expect(() => planPinnedInsetBoundaries(candidate, "main")).toThrow(
      "visual/identity adapters",
    );
  expect(
    planPinnedInsetBoundaries(document(), "main").staticWalkingQualification,
  ).toBe("native-envelope-verified-game-acceptance-pending");
});
