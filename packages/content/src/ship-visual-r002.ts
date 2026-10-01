/** Reference r002 recipes are isolated from the delivered r001 profile table. */
import type { ShipVisualProfile, ShipVisualProfileId } from "./ship-visual";
import { volumeGeometry, type ShipPrefabDocumentV1 } from "./ship-prefab";
import { insidePolygon } from "./construction-grammar";

/** One opt-in footprint for both displayed wing markings and their roof exclusions. */
export function referencePlateDecals<
  T extends {
    kind: string;
    normal: readonly number[];
    corners: [number, number, number][];
  },
>(doc: ShipPrefabDocumentV1, decals: T[], revision?: string): T[] {
  if (revision !== "r002") return decals;
  const plates = doc.volumes
    .filter((v) => v.kind === "plate")
    .map(volumeGeometry);
  return decals.map((d) => {
    if (d.normal[2] < 0.99 || !["number", "emblem"].includes(d.kind)) return d;
    const centre = d.corners.reduce<number[]>(
      (a, p) => a.map((n, i) => n + p[i] / d.corners.length),
      [0, 0, 0],
    );
    if (
      !plates.some(
        (g) =>
          g.outline &&
          insidePolygon(g.outline.outer, centre[0], centre[1]) &&
          !g.outline.holes.some((h) => insidePolygon(h, centre[0], centre[1])),
      )
    )
      return d;
    return {
      ...d,
      corners: d.corners.map((p) => [
        centre[0] + (p[0] - centre[0]) * 0.6,
        centre[1] + (p[1] - centre[1]) * 0.6,
        p[2],
      ]),
    };
  });
}

export const SHIP_VISUAL_PROFILES_R002: Record<
  ShipVisualProfileId,
  ShipVisualProfile
> = {
  federation: {
    id: "federation",
    revision: "r002",
    course: 32,
    rib: 64,
    relief: 2,
    offsetCourses: false,
    nestedRibs: false,
  },
  riftjack: {
    id: "riftjack",
    revision: "r002",
    course: 40,
    rib: 48,
    relief: 2,
    offsetCourses: true,
    nestedRibs: false,
  },
  aurelian: {
    id: "aurelian",
    revision: "r002",
    course: 56,
    rib: 48,
    relief: 2,
    offsetCourses: true,
    nestedRibs: true,
  },
};

/** Certified existing canopy source + retained glass envelopes in piece-local
 * prototype metres (+Z up). The source frame bounds enclose the authored lower/
 * upper frames, end mullions and pressure glazing; opaque keel is not an aperture.
 * Unknown variants deliberately retain the older conservative all-height guard. */
export interface ReferenceOpticalInterface {
  kind: "optical" | "non-optical";
  assetSha256: string;
  sourceFrameBounds: [number, number, number, number, number, number][];
  retainedGlassBounds: [number, number, number, number, number, number][];
}
export const REFERENCE_OPTICAL_INTERFACES_R002: Record<
  string,
  ReferenceOpticalInterface
> = {
  "bow.slope1.deck.s2.a0.base": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "bow.slope1.deck.s2.a0.edge1": {
    kind: "optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [
      [0.0, 0.0, 0.8425499999999999, 1.0, 1.0, 1.131484375],
      [0.0, 0.0, 1.0189062500000001, 1.0, 1.0, 1.376171875],
      [0.0, 0.0, 1.5731687499999998, 1.0, 1.0, 2.29375],
      [
        0.03286941678171851, 0.03286941678171842, 1.0929453142083374,
        0.9624349522494646, 0.9624349522494646, 2.1517425322780466,
      ],
      [
        0.8421305832182816, 0.0, 1.0818906250000002, 1.0, 0.03756504775053533,
        1.6676121552219532,
      ],
      [
        0.0, 0.8421305832182815, 1.3651171857916629, 0.037565047750535374, 1.0,
        2.17140625,
      ],
    ],
    retainedGlassBounds: [
      [
        0.03286941722035408, 0.03286941722035408, 1.0929453372955322,
        0.9624349474906921, 0.9624349474906921, 2.151742458343506,
      ],
    ],
  },
  "bow.slope1.deck.s2.a0.roof": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "bow.slope1.deck.s2.a1.base": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "bow.slope1.deck.s2.a1.edge1": {
    kind: "optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [
      [0.0, 0.0, 0.8425499999999999, 1.0, 1.0, 1.131484375],
      [0.0, 0.0, 1.0189062500000001, 1.0, 1.0, 1.376171875],
      [0.0, 0.0, 1.5731687499999998, 1.0, 1.0, 2.29375],
      [
        0.03286941678171851, 0.03286941678171842, 1.0929453142083374,
        0.9624349522494646, 0.9624349522494646, 2.1517425322780466,
      ],
      [
        0.8421305832182816, 0.0, 1.3651171857916629, 1.0, 0.03756504775053533,
        2.17140625,
      ],
      [
        0.0, 0.8421305832182815, 1.0818906250000002, 0.037565047750535374, 1.0,
        1.6676121552219532,
      ],
    ],
    retainedGlassBounds: [
      [
        0.03286941722035408, 0.03286941722035408, 1.0929453372955322,
        0.9624349474906921, 0.9624349474906921, 2.151742458343506,
      ],
    ],
  },
  "bow.slope1.deck.s2.a1.roof": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "bow.slope1.deck.s3.a0.base": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "bow.slope1.deck.s3.a0.edge1": {
    kind: "optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [[0.0, 0.0, 0.8361, 1.0, 1.0, 0.930728125]],
    retainedGlassBounds: [],
  },
  "bow.slope1.deck.s3.a0.roof": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "bow.slope1.deck.s3.a1.base": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "bow.slope1.deck.s3.a1.edge1": {
    kind: "optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [[0.0, 0.0, 0.8361, 1.0, 1.0, 0.930728125]],
    retainedGlassBounds: [],
  },
  "bow.slope1.deck.s3.a1.roof": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "bow.square.deck.s1.a0.base": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "bow.square.deck.s1.a0.edge0": {
    kind: "optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [
      [0.0, 0.0, 0.98875, 1.0, 0.125, 1.20875],
      [0.0, 0.0, 1.27421875, 1.0, 0.125, 1.4937500000000001],
      [0.0, 0.0, 2.17140625, 1.0, 0.125, 2.5625],
      [0.053125, 0.0, 1.382418212890625, 0.946875, 0.125, 2.4067934570312497],
      [0.0, 0.0, 1.4875036621093747, 0.053125, 0.125, 2.42],
      [0.946875, 0.0, 1.376171875, 1.0, 0.125, 2.1846127929687498],
    ],
    retainedGlassBounds: [
      [
        0.05312500149011612, -0.0, 1.382418155670166, 0.9468749761581421, 0.125,
        2.4067933559417725,
      ],
    ],
  },
  "bow.square.deck.s1.a0.edge2": {
    kind: "optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [
      [0.0, 0.875, 0.98875, 1.0, 1.0, 1.20875],
      [0.0, 0.875, 1.27421875, 1.0, 1.0, 1.4937500000000001],
      [0.0, 0.875, 2.17140625, 1.0, 1.0, 2.5625],
      [
        0.05312499999999998, 0.875, 1.382418212890625, 0.946875, 1.0,
        2.40679345703125,
      ],
      [0.946875, 0.875, 1.376171875, 1.0, 1.0, 2.1846127929687498],
      [0.0, 0.875, 1.4875036621093751, 0.05312499999999998, 1.0, 2.42],
    ],
    retainedGlassBounds: [
      [
        0.05312500149011612, 0.875, 1.382418155670166, 0.9468749761581421, 1.0,
        2.4067933559417725,
      ],
    ],
  },
  "bow.square.deck.s1.a0.roof": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "bow.square.deck.s2.a0.base": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "bow.square.deck.s2.a0.roof": {
    kind: "optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [
      [0.0, 0.0, 1.6487500000000002, 1.0, 0.084375, 2.41875],
      [0.915625, 0.0, 1.6487500000000002, 1.0, 1.0, 1.828171875],
      [0.0, 0.915625, 1.6487500000000002, 1.0, 1.0, 2.41875],
      [0.0, 0.0, 2.239328125, 0.084375, 1.0, 2.41875],
      [0.084375, 0.084375, 1.778171875, 0.915625, 0.915625, 2.336203125],
    ],
    retainedGlassBounds: [
      [
        0.08437500149011612, 0.08437500149011612, 1.7781718969345093,
        0.9156249761581421, 0.9156249761581421, 2.336203098297119,
      ],
    ],
  },
  "bow.square.deck.s3.a0.base": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "bow.square.deck.s3.a0.edge1": {
    kind: "optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [[0.875, 0.0, 0.8361, 1.0, 1.0, 0.889693359375]],
    retainedGlassBounds: [],
  },
  "bow.square.deck.s3.a0.roof": {
    kind: "non-optical",
    assetSha256:
      "26c419726567cf0712c41fec54d87e6d81b845be9d3f7d8f0359d82784e1bdbd",
    sourceFrameBounds: [],
    retainedGlassBounds: [],
  },
  "canopy.corner45.deck": {
    kind: "optical",
    assetSha256:
      "70e93b54c5e2da9884a47ba528bf910f06621cd9888bddffe09c57a466228502",
    sourceFrameBounds: [
      [0.04419417382415922, 0.0, 1.3125, 1.46875, 1.0385630848677416, 2.5],
      [
        -0.0625, -0.044194173824159216, 2.4375, 0.1875, 0.13258252147247765,
        2.6875,
      ],
      [0.9722718241315029, 0.0, 1.25, 1.5625, 1.1048543456039803, 1.34375],
    ],
    retainedGlassBounds: [
      [
        0.05596298351883888, -0.0, 1.31922447681427, 1.4601377248764038,
        1.02786386013031, 2.5,
      ],
    ],
  },
  "canopy.corner45.deck.cut": {
    kind: "optical",
    assetSha256:
      "0cdfa670ad2857bfdb33e3818196fe94d5700aa8daebcfcecd13aa3211f19061",
    sourceFrameBounds: [
      [-0.0625, -0.044194173824159216, 1.875, 0.1875, 0.13258252147247765, 2.0],
    ],
    retainedGlassBounds: [],
  },
  "canopy.nav.deck": {
    kind: "optical",
    assetSha256:
      "71b613e304034ebf1b9a0091aa0dbf58b9e7b698c85c4d94287d0a9d4ea3bf7c",
    sourceFrameBounds: [
      [0.25, 1.625, 1.0625, 0.75, 1.6875, 1.25],
      [0.53125, 1.6875, 1.078125, 0.71875, 1.71875, 1.234375],
      [0.5625, 1.71875, 1.109375, 0.6875, 1.75, 1.203125],
      [0.28125, 1.6875, 1.078125, 0.46875, 1.71875, 1.234375],
      [0.3125, 1.71875, 1.109375, 0.4375, 1.75, 1.203125],
    ],
    retainedGlassBounds: [],
  },
  "canopy.slope1.deck": {
    kind: "optical",
    assetSha256:
      "dff525b82261e1be04452d7c0703b841fe26d4a039e37b1bbed4cec8c3438c1a",
    sourceFrameBounds: [
      [
        0.044194173824159244, 0.044194173824159216, 1.3125, 2.0385630848677416,
        2.0385630848677416, 2.5,
      ],
      [
        -0.044194173824159244, -0.044194173824159216, 2.4375,
        1.1325825214724776, 1.1325825214724776, 2.6875,
      ],
      [
        0.9722718241315027, 0.9722718241315027, 1.25, 2.1048543456039805,
        2.1048543456039805, 1.34375,
      ],
      [
        0.9049825262780576, -0.044194173824159216, 1.25, 2.1048543456039805,
        1.1556776455017634, 2.6875,
      ],
      [
        -0.044194173824159244, 0.9049825262780578, 1.25, 1.1556776455017634,
        2.1048543456039805, 2.6875,
      ],
      [0.0, 0.0, 2.5625, 1.0928077650307344, 1.0928077650307344, 2.6875],
      [
        0.08838834764831849, 0.08838834764831843, 2.4375, 1.1811961126790527,
        1.1811961126790527, 2.5625,
      ],
      [
        0.17677669529663698, 0.17677669529663687, 2.3125, 1.2695844603273712,
        1.2695844603273712, 2.4375,
      ],
    ],
    retainedGlassBounds: [
      [
        0.04419417679309845, 0.04419417679309845, 1.3125, 2.0385630130767822,
        2.0385630130767822, 2.5,
      ],
    ],
  },
  "canopy.slope1.deck.cut": {
    kind: "optical",
    assetSha256:
      "a1fd92e7c1bc0f5c578e549b93fc8eed43057707fa5c38e9162843410331d3e8",
    sourceFrameBounds: [
      [
        -0.044194173824159244, -0.044194173824159216, 1.875, 1.1325825214724776,
        1.1325825214724776, 2.0,
      ],
    ],
    retainedGlassBounds: [],
  },
  "canopy.straight.w1.deck": {
    kind: "optical",
    assetSha256:
      "53c1a1f5e469e5703228547bcf00d9bea7093b2df5ff2113c686c2cfa0213c6b",
    sourceFrameBounds: [
      [0.0, 0.0625, 1.3125, 1.0, 1.46875, 2.5],
      [0.0, -0.0625, 2.4375, 1.0, 0.1875, 2.6875],
      [0.0, 1.375, 1.25, 1.0, 1.5625, 1.34375],
      [0.928125, -0.0625, 1.25, 1.0, 1.5625, 2.6875],
      [0.0, -0.0625, 1.25, 0.07187500000000002, 1.5625, 2.6875],
      [0.0, 0.0, 2.5625, 1.0, 0.13125, 2.6875],
      [0.0, 0.125, 2.4375, 1.0, 0.25625, 2.5625],
      [0.0, 0.25, 2.3125, 1.0, 0.38125, 2.4375],
    ],
    retainedGlassBounds: [
      [
        0.0, 0.0679415613412857, 1.3171995878219604, 1.0, 1.4636658430099487,
        2.5,
      ],
    ],
  },
  "canopy.straight.w1.deck.cut": {
    kind: "optical",
    assetSha256:
      "1042c8d569457f2e121f34f7a132f4441b1fe0a79f665da75fb46fb4d9a2acaa",
    sourceFrameBounds: [[0.0, -0.0625, 1.875, 1.0, 0.1875, 2.0]],
    retainedGlassBounds: [],
  },
};

/** Finite manufacturing dimensions, in global lattice cells. These are presentation
 * inputs, not equipment statistics. Their actual values enter the r002 profile hash. */
export interface ShipVisualMacroProfile {
  armorSection: number;
  corner: number;
  bindingHeight: number;
  ventWidth: number;
  ventHeight: number;
  accessWidth: number;
  roofShoulder: number;
  partitionCut: number;
  opticalInterfaces: Record<string, ReferenceOpticalInterface>;
  wallTasks: Record<
    | "engineering"
    | "bridge"
    | "quarters"
    | "living"
    | "medical"
    | "workshop"
    | "galley"
    | "lounge"
    | "cargo",
    {
      width: number;
      height: number;
      bottom: number;
      insert: "vent" | "control" | "access";
      form?:
        | "relay"
        | "instrument"
        | "berth"
        | "workbench"
        | "backsplash"
        | "living"
        | "cargo";
    }
  >;
}
export const SHIP_VISUAL_MACRO_PROFILES_R002: Record<
  ShipVisualProfileId,
  ShipVisualMacroProfile
> = {
  federation: {
    armorSection: 32,
    corner: 2,
    bindingHeight: 3,
    ventWidth: 13,
    ventHeight: 8,
    accessWidth: 15,
    roofShoulder: 3,
    partitionCut: 20,
    opticalInterfaces: REFERENCE_OPTICAL_INTERFACES_R002,
    wallTasks: {
      medical: {
        width: 20,
        height: 16,
        bottom: 2,
        insert: "control",
        form: "instrument",
      },
      workshop: {
        width: 20,
        height: 17,
        bottom: 2,
        insert: "vent",
        form: "workbench",
      },
      galley: {
        width: 20,
        height: 12,
        bottom: 2,
        insert: "access",
        form: "backsplash",
      },
      lounge: {
        width: 18,
        height: 11,
        bottom: 3,
        insert: "access",
        form: "living",
      },
      cargo: {
        width: 20,
        height: 16,
        bottom: 2,
        insert: "access",
        form: "cargo",
      },
      engineering: {
        width: 20,
        height: 17,
        bottom: 2,
        insert: "vent",
        form: "relay",
      },
      bridge: { width: 19, height: 16, bottom: 5, insert: "control" },
      quarters: { width: 18, height: 15, bottom: 4, insert: "access" },
      living: { width: 20, height: 13, bottom: 4, insert: "access" },
    },
  },
  riftjack: {
    armorSection: 36,
    corner: 2,
    bindingHeight: 3,
    ventWidth: 14,
    ventHeight: 8,
    accessWidth: 16,
    roofShoulder: 3,
    partitionCut: 20,
    opticalInterfaces: REFERENCE_OPTICAL_INTERFACES_R002,
    wallTasks: {
      medical: {
        width: 20,
        height: 16,
        bottom: 2,
        insert: "control",
        form: "instrument",
      },
      workshop: {
        width: 20,
        height: 17,
        bottom: 2,
        insert: "vent",
        form: "workbench",
      },
      galley: {
        width: 20,
        height: 12,
        bottom: 2,
        insert: "access",
        form: "backsplash",
      },
      lounge: {
        width: 18,
        height: 11,
        bottom: 3,
        insert: "access",
        form: "living",
      },
      cargo: {
        width: 20,
        height: 16,
        bottom: 2,
        insert: "access",
        form: "cargo",
      },
      engineering: {
        width: 20,
        height: 17,
        bottom: 2,
        insert: "vent",
        form: "relay",
      },
      bridge: { width: 19, height: 16, bottom: 5, insert: "control" },
      quarters: { width: 18, height: 14, bottom: 4, insert: "access" },
      living: { width: 20, height: 13, bottom: 4, insert: "access" },
    },
  },
  aurelian: {
    armorSection: 40,
    corner: 3,
    bindingHeight: 3,
    ventWidth: 14,
    ventHeight: 9,
    accessWidth: 17,
    roofShoulder: 3,
    partitionCut: 20,
    opticalInterfaces: REFERENCE_OPTICAL_INTERFACES_R002,
    wallTasks: {
      medical: {
        width: 20,
        height: 16,
        bottom: 2,
        insert: "control",
        form: "instrument",
      },
      workshop: {
        width: 20,
        height: 17,
        bottom: 2,
        insert: "vent",
        form: "workbench",
      },
      galley: {
        width: 20,
        height: 12,
        bottom: 2,
        insert: "access",
        form: "backsplash",
      },
      lounge: {
        width: 18,
        height: 11,
        bottom: 3,
        insert: "access",
        form: "living",
      },
      cargo: {
        width: 20,
        height: 16,
        bottom: 2,
        insert: "access",
        form: "cargo",
      },
      engineering: {
        width: 20,
        height: 17,
        bottom: 2,
        insert: "vent",
        form: "relay",
      },
      bridge: { width: 20, height: 16, bottom: 5, insert: "control" },
      quarters: { width: 19, height: 15, bottom: 4, insert: "access" },
      living: { width: 21, height: 13, bottom: 4, insert: "access" },
    },
  },
};
