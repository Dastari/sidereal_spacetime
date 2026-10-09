/** Six additive Federation designs. Draft art and balance; no existing ship is revised. */
import type { PrefabLogic, PrefabLogicDevice } from "../ship-logic";
import {
  WAYFARER_ACCESS_DOORS,
  WAYFARER_ACCESS_PHYSICAL,
} from "../wayfarer-access-profile";
import type {
  PrefabMount,
  PrefabFixture,
  ShipPrefabDocumentV1,
} from "../ship-prefab";
import {
  airlockController,
  airlockLogic,
  arcTile,
  armed,
  button,
  door,
  doorActuator,
  edge,
  face,
  fixture,
  module,
  opening,
  polygonTiles,
  prefab,
  rectTiles,
  room,
  top,
  volume,
} from "./builders";

/** Access coordinates are author metres. Renderer and authority derive the same doors. */
export interface FleetAccessPort {
  id: "personnel" | "cargo";
  chamber: string;
  normal: "port" | "starboard" | "fore";
  outer: [number, number];
  inner: [[number, number], [number, number]];
  insideButton: [number, number];
  hallButton: [number, number];
  hallNormal: "port" | "starboard";
  locker?: [number, number];
}

/** Blender piece-local [span, outward depth, height] -> prefab author metres.
 * Blender Y becomes glTF -Z; this is the same basis as accessDoorMatrix.
 */
export function fleetAccessAuthorPoint(
  port: FleetAccessPort,
  span: number,
  depth: number,
): [number, number] {
  const normal: [number, number] =
    port.normal === "port"
      ? [0, 1]
      : port.normal === "starboard"
        ? [0, -1]
        : [1, 0];
  const along: [number, number] = [normal[1], -normal[0]];
  return [
    port.outer[0] + along[0] * span + normal[0] * depth,
    port.outer[1] + along[1] * span + normal[1] * depth,
  ];
}

/** Exact polished r002 fixed frame solids and moving-leaf pocket reservation.
 * Polygons use author XY, heights include the 0.1875 m floor datum. Pocket
 * volumes exclude the clear opening: state-dependent leaves remain door authority.
 */
export function fleetAccessPhysicalGeometry(
  doc: Pick<ShipPrefabDocumentV1, "id">,
) {
  return (FEDERATION_FLEET_ACCESS[doc.id] ?? []).map((port) => {
    const variantId = port.id === "cargo" ? "cargo.4m" : "personnel";
    const variant = WAYFARER_ACCESS_DOORS.variants.find(
      (v) => v.id === variantId,
    )!;
    const polygon = (min: readonly number[], max: readonly number[]) => [
      fleetAccessAuthorPoint(port, min[0], min[1]),
      fleetAccessAuthorPoint(port, max[0], min[1]),
      fleetAccessAuthorPoint(port, max[0], max[1]),
      fleetAccessAuthorPoint(port, min[0], max[1]),
    ];
    const frame = WAYFARER_ACCESS_PHYSICAL.frameBlockers[variantId].map(
      (b) => ({
        id: `${port.id}-outer:${b.id}`,
        polygon: polygon(b.min, b.max),
        minZ: b.min[2] + 0.1875,
        maxZ: b.max[2] + 0.1875,
      }),
    );
    // Source JSON preserves sweep metadata beyond the common catalogue type.
    const sweep = (
      variant as typeof variant & {
        sweepBounds: { min: number[]; max: number[]; clearanceM: number };
      }
    ).sweepBounds;
    const half = variant.clearWidthM / 2;
    const pocketRanges = [
      [sweep.min[0] - sweep.clearanceM, -half],
      [half, sweep.max[0] + sweep.clearanceM],
    ];
    const pockets = pocketRanges
      .filter(([lo, hi]) => hi > lo)
      .map(([lo, hi], i) => ({
        id: `${port.id}-outer:pocket-${i}`,
        polygon: polygon(
          [lo, sweep.min[1] - sweep.clearanceM],
          [hi, sweep.max[1] + sweep.clearanceM],
        ),
        minZ: sweep.min[2] + 0.1875,
        maxZ: sweep.max[2] + 0.1875,
      }));
    return {
      id: `${port.id}-outer`,
      port,
      revision: WAYFARER_ACCESS_DOORS.revision,
      clearWidthM: variant.clearWidthM,
      clearHeightM: variant.clearHeightM,
      pieces: Object.values(variant.parts).map((id) =>
        WAYFARER_ACCESS_DOORS.pieces.find((p) => p.id === id)!,
      ),
      frame,
      pockets,
      // The sealed native housing encloses this mechanical recess. This is a
      // structural subtraction, shared with the native role-layer compiler,
      // rather than a camera-only mask. Keep the supporting floor datum intact.
      structuralVoid: {
        id: `${port.id}-outer:leaf-recess`,
        polygon: polygon(
          [sweep.min[0] - sweep.clearanceM, sweep.min[1] - sweep.clearanceM],
          [sweep.max[0] + sweep.clearanceM, sweep.max[1] + sweep.clearanceM],
        ),
        minZ: 0.1875,
        maxZ: sweep.max[2] + 0.1875 + sweep.clearanceM,
      },
    };
  });
}
function access(ports: readonly FleetAccessPort[]) {
  const devices: PrefabLogicDevice[] = [];
  const links: PrefabLogic["links"] = [];
  const mounts: PrefabMount[] = [];
  const fixtures: PrefabFixture[] = [];
  const edges = [];
  for (const p of ports) {
    const insideNormal =
      p.normal === "port"
        ? "starboard"
        : p.normal === "starboard"
          ? "port"
          : "aft";
    const inside = button(`${p.id}-inside`, p.insideButton, insideNormal);
    const outside = button(`${p.id}-outside`, p.insideButton, p.normal);
    const hall = button(`${p.id}-hall`, p.hallButton, p.hallNormal);
    devices.push(
      airlockController(`${p.id}-controller`, 3),
      doorActuator(`${p.id}-inner-actuator`, `${p.id}-inner`),
      doorActuator(`${p.id}-outer-actuator`, `${p.id}-outer`),
      inside,
      outside,
      hall,
    );
    links.push(
      ...airlockLogic(
        `${p.id}-controller`,
        `${p.id}-inner-actuator`,
        `${p.id}-outer-actuator`,
        [
          [inside, "cycle"],
          [outside, "cycle"],
          [hall, "open_inner"],
        ],
      ),
    );
    mounts.push(
      opening(
        `${p.id}-outer`,
        p.id === "cargo" ? "cargo-door.4m" : "airlock.exterior.md",
        p.normal,
        p.outer,
      ),
    );
    edges.push(
      door(
        `${p.id}-inner`,
        ...p.inner,
        p.id === "cargo" ? "door.blast" : "door.airlock",
      ),
    );
    if (p.locker)
      fixtures.push(
        fixture(
          "suit-locker",
          "shipyard.equipment.wall-locker",
          p.locker,
          p.normal === "port" ? "port" : "starboard",
        ),
      );
  }
  return {
    edges,
    mounts,
    fixtures,
    logic: {
      devices,
      links: links.map((link) => ({ ...link, id: link.id.slice(0, 60) })),
    },
  };
}
const personnel = (
  chamber: string,
  outer: [number, number],
  normal: "port" | "starboard",
  inner: FleetAccessPort["inner"],
  insideButton: [number, number],
  hallButton: [number, number],
  locker: [number, number],
): FleetAccessPort => ({
  id: "personnel",
  chamber,
  outer,
  normal,
  inner,
  insideButton,
  hallButton,
  hallNormal: normal,
  locker,
});
const cargo = (
  chamber: string,
  outer: [number, number],
  normal: "port" | "starboard",
  inner: FleetAccessPort["inner"],
  insideButton: [number, number],
  hallButton: [number, number],
): FleetAccessPort => ({
  id: "cargo",
  chamber,
  outer,
  normal,
  inner,
  insideButton,
  hallButton,
  hallNormal: normal,
});

export const FEDERATION_FLEET_ACCESS: Readonly<
  Record<string, readonly FleetAccessPort[]>
> = {
  "fed.s.wren-fleet": [
    personnel(
      "lock",
      [8, 0],
      "starboard",
      [
        [8, 3],
        [10, 3],
      ],
      [9.5, 0],
      [7.5, 3],
      [6.5, 1.5],
    ),
  ],
  "fed.s.petrel-fleet": [
    personnel(
      "lock",
      [10, 0],
      "starboard",
      [
        [9, 5],
        [11, 5],
      ],
      [11.5, 0],
      [11.5, 5],
      [8.5, 3.75],
    ),
  ],
  "fed.m.wayfarer-fleet": [
    personnel(
      "lock",
      [19, 13],
      "port",
      [
        [18, 8],
        [20, 8],
      ],
      [20.5, 13],
      [20.5, 8],
      [17.5, 8.75],
    ),
    cargo(
      "cargo",
      [8, 1],
      "starboard",
      [
        [7, 6],
        [9, 6],
      ],
      [10.5, 1],
      [10.5, 6],
    ),
  ],
  "fed.m.heron-fleet": [
    personnel(
      "lock",
      [14, 0],
      "starboard",
      [
        [13, 8],
        [15, 8],
      ],
      [15.5, 0],
      [15.5, 8],
      [12.5, 6.75],
    ),
    cargo(
      "cargo",
      [8, 0],
      "starboard",
      [
        [7, 8],
        [9, 8],
      ],
      [10.5, 0],
      [10.5, 8],
    ),
  ],
  "fed.l.kestrel-fleet": [
    personnel(
      "lock",
      [17, 14],
      "port",
      [
        [16, 9],
        [18, 9],
      ],
      [18.5, 14],
      [18.5, 9],
      [14.5, 9.75],
    ),
    cargo(
      "cargo",
      [10, 2],
      "starboard",
      [
        [9, 7],
        [11, 7],
      ],
      [12.5, 2],
      [12.5, 7],
    ),
  ],
  "fed.l.albatross-fleet": [
    personnel(
      "lock",
      [31, 24],
      "port",
      [
        [30, 13],
        [32, 13],
      ],
      [32.5, 24],
      [32.5, 13],
      [28.5, 13.75],
    ),
    cargo(
      "cargo",
      [18, 0],
      "starboard",
      [
        [17, 11],
        [19, 11],
      ],
      [20.5, 0],
      [20.5, 11],
    ),
  ],
};

/** Machinery reserves keep the engineering doorway and a metre-wide service lane free. */
function plant(
  x: number,
  y: number,
  large = false,
  medium = false,
): PrefabMount[] {
  return [
    module("reactor", large ? "reactor.lg" : "reactor.md", [x, y + 4]),
    module("fuel", "fuel-tank.md", [x, y]),
    module("life", large ? "life-support.md" : "life-support.sm", [
      x + (large ? 4 : 2.5),
      y,
    ]),
    module("coolant", "coolant-pump.md", [x + 2.5, y + 1.5]),
    module(
      "coolant-aux",
      large || medium ? "coolant-pump.md" : "coolant-pump.sm",
      [x + 2.5, y + 2.5],
    ),
    ...(large
      ? [module("coolant-reserve", "coolant-pump.sm", [x + 4.5, y + 2.5])]
      : []),
    module("battery", "battery.sm", [x, y + 2.5]),
  ];
}
function lockContent(id: string) {
  return access(FEDERATION_FLEET_ACCESS[id]);
}

const wrenAccess = lockContent("fed.s.wren-fleet");
export const FLEET_WREN = prefab({
  id: "fed.s.wren-fleet",
  name: "Wren",
  faction: "Federation",
  theme: "federation",
  sizeClass: "S",
  role: "Light courier",
  description:
    "Small two-crew courier: clipped nose, swept stern wings, compact hold and a dedicated personnel airlock.",
  volumes: [
    volume(
      "hull",
      "hull",
      "deck",
      polygonTiles([
        [0, 0],
        [10, 0],
        [14, 2],
        [14, 5],
        [10, 7],
        [0, 7],
      ]),
    ),
    volume(
      "wing-s",
      "plate",
      "wing",
      polygonTiles([
        [0, -1],
        [3, -1],
        [5, 0],
        [0, 0],
      ]),
    ),
    volume(
      "wing-p",
      "plate",
      "wing",
      polygonTiles([
        [0, 7],
        [5, 7],
        [3, 8],
        [0, 8],
      ]),
    ),
  ],
  rooms: [
    room("eng", "ENGINE", "engineering", [0, 0, 4, 7]),
    room("hall", "PASSAGE", "corridor", [4, 3, 10, 5]),
    room("hold", "COURIER HOLD", "cargo", [4, 0, 6, 3]),
    room("lock", "AIRLOCK", "airlock", [6, 0, 10, 3]),
    room("bunks", "CREW CABIN", "quarters", [4, 5, 10, 7]),
    room("bridge", "COCKPIT", "bridge", [10, 0, 14, 7]),
  ],
  edges: [
    ...wrenAccess.edges,
    door("d-eng", [4, 3], [4, 5]),
    door("d-hold", [4, 3], [6, 3]),
    door("d-bunks", [7, 5], [9, 5]),
    door("d-bridge", [10, 3], [10, 5], "door.sliding"),
  ],
  mounts: [
    ...wrenAccess.mounts,
    ...plant(0, 0),
    module("helm", "console.navigation.sm", [11.5, 3]),
    module("core", "computer-core.sm", [10, 1.5]),
    module("bunk", "crew-bunk.sm", [4.5, 6], "starboard"),
    face("main-a", "thrust-block.sm", "aft", [0, 2.5]),
    face("main-b", "thrust-block.sm", "aft", [0, 4.5]),
    face("rcs-a", "rcs.md", "starboard", [0.5, -1]),
    face("rcs-b", "rcs.md", "port", [0.5, 8]),
    face("rcs-c", "rcs.md", "starboard", [9.5, 0]),
    face("rcs-d", "rcs.md", "port", [9.5, 7]),
    top("rad-a", "radiator.md", [0.5, 0.5]),
    top("rad-b", "radiator.md", [0.5, 4.5]),
  ],
  armed: [armed("sensor", "fixed", "SM", [6, 3], "fore", "sensor-dish.sm")],
  fixtures: wrenAccess.fixtures,
  logic: wrenAccess.logic,
  markings: { name: "WREN", number: "OC-21", emblem: "planet" },
});

const petrelAccess = lockContent("fed.s.petrel-fleet");
const petrelTiles = polygonTiles(
  [
    [0, 2],
    [2, 0],
    [15, 0],
    [18, 3],
    [18, 9],
    [15, 12],
    [2, 12],
    [0, 10],
  ],
  (x, y) =>
    (x >= 15 && (y < 3 || y >= 9)) || (x >= 4 && x < 8 && (y < 2 || y >= 10)),
);
petrelTiles.push(
  arcTile(15, 0, 3, "se"),
  arcTile(15, 9, 3, "ne"),
  arcTile(4, 0, 2, "sw", true),
  arcTile(6, 0, 2, "se", true),
  arcTile(4, 10, 2, "nw", true),
  arcTile(6, 10, 2, "ne", true),
);
export const FLEET_PETREL = prefab({
  id: "fed.s.petrel-fleet",
  name: "Petrel",
  faction: "Federation",
  theme: "federation",
  sizeClass: "S",
  role: "Survey cutter",
  description:
    "Rounded observation head and scalloped waist distinguish this survey cutter, with a real lab, medical nook and personnel airlock.",
  volumes: [volume("hull", "hull", "deck", petrelTiles)],
  rooms: [
    room("eng", "ENGINEERING", "engineering", [0, 2, 4, 10]),
    room("hall", "SURVEY SPINE", "corridor", [4, 5, 12, 7]),
    room("lab", "SAMPLE LAB", "workshop", [4, 2, 8, 5]),
    room("lock", "AIRLOCK", "airlock", [8, 0, 12, 5]),
    room("quarters", "CABIN", "quarters", [4, 7, 8, 10]),
    room("med", "MEDICAL NOOK", "medbay", [8, 7, 12, 12]),
    room("bridge", "OBSERVATORY", "bridge", [12, 0, 18, 12]),
  ],
  edges: [
    ...petrelAccess.edges,
    door("d-eng", [4, 5], [4, 7]),
    door("d-lab", [5, 5], [7, 5]),
    door("d-quarters", [5, 7], [7, 7]),
    door("d-med", [9, 7], [11, 7]),
    door("d-bridge", [12, 5], [12, 7], "door.sliding"),
    edge("bridge-glass-p", [12, 7], [12, 9], "wall.glazed"),
    edge("bridge-glass-s", [12, 3], [12, 5], "wall.glazed"),
  ],
  mounts: [
    ...petrelAccess.mounts,
    ...plant(0, 2, false, true).map((m) =>
      m.id === "reactor" ? { ...m, component: "reactor.sm" } : m,
    ),
    module("reactor-backup", "reactor.sm", [0, 8]),
    module("sensors", "console.sensor.sm", [14, 8]),
    module("helm", "console.navigation.sm", [15, 5.5]),
    module("core", "computer-core.md", [12.5, 3]),
    module("bunk", "crew-bunk.sm", [4.5, 8], "starboard"),
    face("main-a", "thrust-block.md", "aft", [0, 3]),
    face("main-b", "thrust-block.md", "aft", [0, 5]),
    face("main-c", "thrust-block.md", "aft", [0, 7]),
    face("main-d", "thrust-block.md", "aft", [0, 9]),
    face("rcs-a", "rcs.md", "starboard", [2.5, 0]),
    face("rcs-b", "rcs.md", "port", [2.5, 12]),
    face("rcs-c", "rcs.md", "starboard", [14, 0]),
    face("rcs-d", "rcs.md", "port", [14, 12]),
    top("rad-a", "radiator.md", [0.5, 2.5]),
    top("rad-b", "radiator.md", [0.5, 6.5]),
    face("rcs-e", "rcs.md", "starboard", [12.5, 0]),
    face("rcs-f", "rcs.md", "port", [12.5, 12]),
  ],
  armed: [],
  fixtures: [
    ...petrelAccess.fixtures,
    fixture(
      "observation-bank-a",
      "shipyard.equipment.bridge-bank",
      [14, 1.5],
      "fore",
    ),
    fixture(
      "observation-bank-b",
      "shipyard.equipment.bridge-bank",
      [16, 7.5],
      "fore",
    ),
    fixture(
      "sample-bench",
      "pale-studless.console.standard",
      [4.5, 2.5],
      "starboard",
    ),
    fixture(
      "medical-bed",
      "shipyard.equipment.medical-bed",
      [8.5, 9],
      "starboard",
    ),
  ],
  logic: petrelAccess.logic,
  markings: { name: "PETREL", number: "OC-22", emblem: "planet" },
});

const wayfarerAccess = lockContent("fed.m.wayfarer-fleet");
export const FLEET_WAYFARER = prefab({
  id: "fed.m.wayfarer-fleet",
  name: "Wayfarer",
  faction: "Federation",
  theme: "federation",
  sizeClass: "M",
  role: "Expedition ship",
  description:
    "Long sloped bow, twin engine pods and a familiar central spine connect accommodation, lounge, workshop, grow room and isolated cargo bay.",
  volumes: [
    volume(
      "hull",
      "hull",
      "deck",
      polygonTiles([
        [0, 1],
        [20, 1],
        [29, 4],
        [29, 10],
        [20, 13],
        [0, 13],
      ]),
      { spine: true },
    ),
    // The cargo notch clears the full aperture plus the native pod facade overhang.
    volume("pod-s", "hull", "pod", rectTiles(0, -1, 5, 1)),
    volume("pod-p", "hull", "pod", rectTiles(0, 13, 8, 15)),
  ],
  rooms: [
    room("eng", "ENGINEERING", "engineering", [0, 1, 4, 13]),
    room("hall", "CENTRAL SPINE", "corridor", [4, 6, 22, 8]),
    room("cargo", "CARGO LOCK BAY", "cargo", [4, 1, 12, 6]),
    room("shop", "WORKSHOP", "workshop", [12, 1, 16, 6]),
    room("galley", "GALLEY", "galley", [16, 1, 22, 6]),
    room("quarters", "CABINS", "quarters", [4, 8, 10, 13]),
    room("lounge", "CREW LOUNGE", "lounge", [10, 8, 17, 13]),
    room("lock", "PERSONNEL LOCK", "airlock", [17, 8, 22, 13]),
    room("bridge", "BRIDGE", "bridge", [22, 1, 29, 13]),
  ],
  edges: [
    ...wayfarerAccess.edges,
    door("d-eng", [4, 6], [4, 8], "door.blast"),
    door("d-shop", [12, 6], [14, 6]),
    door("d-galley", [18, 6], [20, 6]),
    door("d-quarters", [6, 8], [8, 8]),
    door("d-lounge", [12, 8], [14, 8], "door.sliding"),
    door("d-bridge", [22, 6], [22, 8], "door.sliding"),
  ],
  mounts: [
    ...wayfarerAccess.mounts,
    ...plant(0, 1, false, true),
    module("ammo", "magazine.ballistic.sm", [0, 9]),
    module("helm", "console.navigation.sm", [25, 6.5]),
    module("core", "computer-core.md", [22.5, 4]),
    module("bunk-a", "crew-bunk.sm", [4.5, 9.5], "starboard"),
    module("bunk-b", "crew-bunk.sm", [7, 9.5], "starboard"),
    module("hydro", "hydroponics.sm", [12.5, 2], "port"),
    face("main-s", "thrust-block.lg", "aft", [0, 2.5]),
    face("main-p", "thrust-block.lg", "aft", [0, 11.5]),
    face("rcs-a", "rcs.md", "starboard", [0.5, -1]),
    face("rcs-b", "rcs.md", "port", [0.5, 15]),
    face("rcs-c", "rcs.md", "starboard", [19, 1]),
    face("rcs-d", "rcs.md", "port", [16, 13]),
    top("rad-a", "radiator.lg", [0.5, 1.5]),
    top("rad-b", "radiator.lg", [0.5, 9.5]),
  ],
  armed: [
    armed("sensor", "fixed", "SM", [18, 6], "fore", "sensor-dish.sm"),
    armed("defense", "turret", "MD", [8, 6], "fore", "point-defense.sm"),
  ],
  fixtures: [
    ...wayfarerAccess.fixtures,
    fixture(
      "lounge-sofa-a",
      "shipyard.equipment.lounge-sofa",
      [10.5, 11],
      "starboard",
    ),
    fixture("lounge-sofa-b", "shipyard.equipment.lounge-sofa", [15, 9], "aft"),
    fixture(
      "lounge-table",
      "pale-studless.table.standard",
      [12, 9.5],
      "starboard",
    ),
    fixture(
      "workshop-bench",
      "pale-studless.console.standard",
      [14.5, 2],
      "fore",
    ),
    fixture(
      "expedition-bank",
      "shipyard.equipment.bridge-bank",
      [25, 9],
      "fore",
    ),
    fixture(
      "galley-table",
      "pale-studless.table.standard",
      [19, 2.5],
      "starboard",
    ),
  ],
  logic: wayfarerAccess.logic,
  markings: { name: "WAYFARER", number: "OC-23", emblem: "planet" },
});

const heronAccess = lockContent("fed.m.heron-fleet");
export const FLEET_HERON = prefab({
  id: "fed.m.heron-fleet",
  name: "Heron",
  faction: "Federation",
  theme: "federation",
  sizeClass: "M",
  role: "Medical tender",
  description:
    "Broad clinical wings, a short command neck, treatment and isolation wards, and an ambulance-sized isolatable cargo bay.",
  volumes: [
    volume("hull", "hull", "deck", [
      ...polygonTiles(
        [
          [0, 4],
          [4, 0],
          [18, 0],
          [18, 4],
          [22, 4],
          [26, 6],
          [26, 12],
          [22, 14],
          [18, 14],
          [18, 18],
          [4, 18],
          [0, 14],
        ],
        (x, y) => x < 4 && (y < 4 || y >= 14),
      ),
      arcTile(0, 0, 4, "sw"),
      arcTile(0, 14, 4, "nw"),
    ]),
  ],
  rooms: [
    room("eng", "LIFE SYSTEMS", "engineering", [0, 4, 4, 14]),
    room("hall", "CLINICAL SPINE", "corridor", [4, 8, 20, 10]),
    room("cargo", "AMBULANCE BAY", "cargo", [4, 0, 12, 8]),
    room("lock", "PERSONNEL LOCK", "airlock", [12, 0, 16, 8]),
    room("galley", "STAFF GALLEY", "galley", [16, 4, 20, 8]),
    room("ward", "TREATMENT WARD", "medbay", [4, 10, 12, 18]),
    room("isolation", "ISOLATION", "medbay", [12, 10, 18, 14]),
    room("quarters", "STAFF CABIN", "quarters", [12, 14, 18, 18]),
    room("bridge", "BRIDGE", "bridge", [20, 4, 26, 14]),
  ],
  edges: [
    ...heronAccess.edges,
    door("d-eng", [4, 8], [4, 10]),
    door("d-galley", [17, 8], [19, 8]),
    door("d-ward", [7, 10], [9, 10], "door.sliding"),
    door("d-isolation", [14, 10], [16, 10], "door.airlock"),
    door("d-quarters", [14, 14], [16, 14]),
    door("d-bridge", [20, 8], [20, 10], "door.sliding"),
  ],
  mounts: [
    ...heronAccess.mounts,
    ...plant(0, 4, false, true),
    module("helm", "console.navigation.sm", [23, 8.5]),
    module("core", "computer-core.md", [20.5, 6]),
    module("bunk-a", "crew-bunk.sm", [12.5, 16], "starboard"),
    module("bunk-b", "crew-bunk.sm", [15, 16], "starboard"),
    face("main-a", "thrust-block.md", "aft", [0, 5.5]),
    face("main-b", "thrust-block.md", "aft", [0, 12.5]),
    face("rcs-a", "rcs.md", "starboard", [5, 0]),
    face("rcs-b", "rcs.md", "port", [5, 18]),
    face("rcs-c", "rcs.md", "starboard", [17, 0]),
    face("rcs-d", "rcs.md", "port", [17, 18]),
    top("rad-a", "radiator.lg", [0.5, 5]),
    top("rad-b", "radiator.lg", [0.5, 10]),
  ],
  armed: [armed("sensor", "fixed", "SM", [18, 8], "fore", "sensor-dish.sm")],
  fixtures: [
    ...heronAccess.fixtures,
    ...[4.25, 7, 9.75].flatMap((x, i) => [
      fixture(
        `ward-bed-s-${i}`,
        "shipyard.equipment.medical-bed",
        [x, 11.5],
        "port",
      ),
      fixture(
        `ward-bed-p-${i}`,
        "shipyard.equipment.medical-bed",
        [x, 16],
        "starboard",
      ),
    ]),
    fixture("ward-station", "pale-studless.console.standard", [6, 14], "port"),
    fixture(
      "ward-monitor-s",
      "pale-studless.console.standard",
      [4.35, 13.5],
      "fore",
    ),
    fixture(
      "ward-monitor-p",
      "pale-studless.console.standard",
      [10.9, 13.5],
      "aft",
    ),
    fixture(
      "isolation-bed-a",
      "shipyard.equipment.medical-bed",
      [12.5, 11.5],
      "port",
    ),
    fixture(
      "isolation-bed-b",
      "shipyard.equipment.medical-bed",
      [15.5, 11.5],
      "port",
    ),
    fixture(
      "clinical-bank",
      "shipyard.equipment.bridge-bank",
      [22, 11],
      "fore",
    ),
  ],
  logic: heronAccess.logic,
  markings: { name: "HERON", number: "OC-24", emblem: "planet" },
});

const kestrelAccess = lockContent("fed.l.kestrel-fleet");
export const FLEET_KESTREL = prefab({
  id: "fed.l.kestrel-fleet",
  name: "Kestrel",
  faction: "Federation",
  theme: "federation",
  sizeClass: "L",
  role: "Patrol frigate",
  description:
    "A long armored spear, exposed aft outriggers and four separated engines enclose tactical rooms, armory and a stores lock bay.",
  volumes: [
    volume(
      "hull",
      "hull",
      "deck",
      polygonTiles([
        [0, 4],
        [6, 4],
        [6, 2],
        [20, 2],
        [36, 6],
        [36, 10],
        [20, 14],
        [6, 14],
        [6, 12],
        [0, 12],
      ]),
    ),
    volume("pod-s", "hull", "pod", rectTiles(0, -2, 5, 4)),
    volume("pod-p", "hull", "pod", rectTiles(0, 12, 5, 18)),
    volume("shoulder-s", "plate", "wing", rectTiles(5, 0, 7, 2)),
    volume("shoulder-p", "plate", "wing", rectTiles(5, 14, 7, 16)),
  ],
  rooms: [
    room("eng", "ENGINEERING", "engineering", [0, 4, 6, 12]),
    room("hall", "ARMORED PASSAGE", "corridor", [6, 7, 24, 9]),
    room("cargo", "STORES LOCK BAY", "cargo", [6, 2, 14, 7]),
    room("armory", "ARMORY", "armory", [14, 2, 20, 7]),
    room("tactical", "TACTICAL", "workshop", [20, 2, 24, 7]),
    room("quarters", "CREW BERTHS", "quarters", [6, 9, 14, 14]),
    room("lock", "PERSONNEL LOCK", "airlock", [14, 9, 20, 14]),
    room("ready", "READY ROOM", "lounge", [20, 9, 24, 14]),
    room("bridge", "COMMAND", "bridge", [24, 2, 36, 14]),
  ],
  edges: [
    ...kestrelAccess.edges,
    door("d-eng", [6, 7], [6, 9], "door.blast"),
    door("d-armory", [16, 7], [18, 7], "door.blast"),
    door("d-tactical", [21, 7], [23, 7]),
    door("d-quarters", [9, 9], [11, 9]),
    door("d-ready", [21, 9], [23, 9]),
    door("d-command", [24, 7], [24, 9], "door.blast"),
  ],
  mounts: [
    ...kestrelAccess.mounts,
    ...plant(0, 4, true),
    module("helm", "console.navigation.sm", [30, 7.5]),
    module("core", "computer-core.md", [24.5, 6]),
    module("bunk-a", "crew-bunk.sm", [6.5, 12.5], "starboard"),
    module("bunk-b", "crew-bunk.sm", [9, 12.5], "starboard"),
    module("bunk-c", "crew-bunk.sm", [11.5, 12.5], "starboard"),
    module("ammo", "magazine.ballistic.md", [14.5, 2.5]),
    face("main-s1", "thrust-block.lg", "aft", [0, -0.5]),
    face("main-s2", "thrust-block.lg", "aft", [0, 2.5]),
    face("main-p1", "thrust-block.lg", "aft", [0, 13.5]),
    face("main-p2", "thrust-block.lg", "aft", [0, 16.5]),
    face("rcs-a", "rcs.md", "starboard", [0.5, -2]),
    face("rcs-b", "rcs.md", "port", [0.5, 18]),
    face("rcs-c", "rcs.md", "starboard", [19, 2]),
    face("rcs-d", "rcs.md", "port", [19, 14]),
    top("rad-a", "radiator.lg", [0.5, 4.5]),
    top("rad-b", "radiator.lg", [0.5, 8.5]),
    top("rad-c", "radiator.lg", [8, 2.5]),
  ],
  armed: [
    armed("sensor", "fixed", "MD", [26, 7], "fore", "sensor-dish.md"),
    armed("gun-a", "turret", "LG", [15, 3], "fore", "autocannon.md"),
    armed("gun-b", "turret", "LG", [8, 10], "fore", "autocannon.md"),
  ],
  fixtures: [
    ...kestrelAccess.fixtures,
    fixture(
      "armory-rack-a",
      "shipyard.equipment.wall-locker",
      [17, 2.5],
      "port",
    ),
    fixture(
      "armory-rack-b",
      "shipyard.equipment.wall-locker",
      [18.25, 2.5],
      "port",
    ),
    fixture(
      "armory-rack-c",
      "shipyard.equipment.wall-locker",
      [18.25, 5.5],
      "starboard",
    ),
    fixture(
      "tactical-bank",
      "shipyard.equipment.bridge-bank",
      [20.5, 3.5],
      "starboard",
    ),
    fixture(
      "tactical-console",
      "pale-studless.console.standard",
      [20.5, 4.5],
      "fore",
    ),
    fixture(
      "ready-sofa",
      "shipyard.equipment.lounge-sofa",
      [20.5, 11],
      "starboard",
    ),
    fixture("command-bank", "shipyard.equipment.bridge-bank", [27, 10], "fore"),
    fixture(
      "command-console",
      "shipyard.equipment.command-console",
      [32, 6],
      "fore",
    ),
  ],
  logic: kestrelAccess.logic,
  markings: { name: "KESTREL", number: "OC-25", emblem: "planet" },
});

const albatrossAccess = lockContent("fed.l.albatross-fleet");
export const FLEET_ALBATROSS = prefab({
  id: "fed.l.albatross-fleet",
  name: "Albatross",
  faction: "Federation",
  theme: "federation",
  sizeClass: "L",
  role: "Freight support",
  description:
    "Forked freighter with a recessed loading nose, wide useful hold, offset planar command pavilion, service shop and independent personnel lock.",
  volumes: [
    volume(
      "hull",
      "hull",
      "deck",
      polygonTiles([
        [0, 4],
        [4, 0],
        [42, 0],
        [42, 8],
        [34, 8],
        [34, 16],
        [42, 16],
        [42, 24],
        [4, 24],
        [0, 20],
      ]),
    ),
  ],
  rooms: [
    room("eng", "POWER PLANT", "engineering", [0, 4, 8, 20]),
    room("hall", "SERVICE SPINE", "corridor", [8, 11, 34, 13]),
    room("cargo", "FREIGHT LOCK BAY", "cargo", [8, 0, 28, 11]),
    room("galley", "MESS", "galley", [8, 13, 16, 18]),
    room("shop", "SERVICE WORKSHOP", "workshop", [8, 18, 16, 24]),
    room("quarters", "CREW QUARTERS", "quarters", [16, 13, 28, 18]),
    room("stores", "RESERVE HOLD", "cargo", [16, 18, 28, 24]),
    room("lock", "PERSONNEL LOCK", "airlock", [28, 13, 34, 24]),
    room("bridge", "COMMAND PAVILION", "bridge", [28, 0, 42, 8]),
    room("ops", "LOAD CONTROL", "workshop", [28, 8, 34, 11]),
    room("forward-hold", "FORWARD HOLD", "cargo", [34, 16, 42, 24]),
  ],
  edges: [
    ...albatrossAccess.edges,
    door("d-eng", [8, 11], [8, 13], "door.blast"),
    door("d-mess", [10, 13], [12, 13]),
    door("d-shop", [10, 18], [12, 18]),
    door("d-quarters", [21, 13], [23, 13]),
    door("d-stores", [21, 18], [23, 18], "door.blast"),
    door("d-ops", [30, 11], [32, 11]),
    door("d-command", [30, 8], [32, 8], "door.sliding"),
    door("d-forward-hold", [34, 19], [34, 21], "door.blast"),
  ],
  mounts: [
    ...albatrossAccess.mounts,
    ...plant(0, 4, true),
    module("helm", "console.navigation.sm", [38, 3.5]),
    module("core", "computer-core.md", [28.5, 2]),
    module("bunk-a", "crew-bunk.sm", [16.5, 15], "starboard"),
    module("bunk-b", "crew-bunk.sm", [19, 15], "starboard"),
    module("bunk-c", "crew-bunk.sm", [21.5, 15], "starboard"),
    module("bunk-d", "crew-bunk.sm", [24, 15], "starboard"),
    module("fuel-aux", "fuel-tank.lg", [4.5, 8.5]),
    module("ammo", "magazine.ballistic.sm", [0, 13]),
    face("main-a", "thrust-block.lg", "aft", [0, 6]),
    face("main-b", "thrust-block.lg", "aft", [0, 10]),
    face("main-c", "thrust-block.lg", "aft", [0, 14]),
    face("main-d", "thrust-block.lg", "aft", [0, 18]),
    face("rcs-a", "rcs.md", "starboard", [5, 0]),
    face("rcs-b", "rcs.md", "port", [5, 24]),
    face("rcs-c", "rcs.md", "starboard", [40, 0]),
    face("rcs-d", "rcs.md", "port", [40, 24]),
    top("rad-a", "radiator.lg", [0.5, 4.5]),
    top("rad-b", "radiator.lg", [0.5, 9]),
    top("rad-c", "radiator.lg", [0.5, 15]),
    top("clamp", "docking-clamp.md", [35, 16]),
    top("tractor", "tractor-projector.md", [30, 8]),
  ],
  armed: [
    armed("sensor", "fixed", "SM", [35, 3], "fore", "sensor-dish.sm"),
    armed("defense", "turret", "MD", [12, 11], "fore", "point-defense.sm"),
  ],
  fixtures: [
    ...albatrossAccess.fixtures,
    ...[2, 5, 8].flatMap((y, i) => [
      fixture(`freight-s-${i}`, "cargo.standard.medium", [8.5, y], "fore"),
      fixture(`freight-p-${i}`, "cargo.standard.medium", [25.5, y], "aft"),
      fixture(
        `freight-paired-${i}`,
        "cargo.standard.medium",
        [26.75, y],
        "aft",
      ),
    ]),
    fixture(
      "load-control-bank",
      "shipyard.equipment.bridge-bank",
      [28.5, 8.5],
      "fore",
    ),
    fixture(
      "service-bench",
      "pale-studless.console.standard",
      [8.5, 21],
      "fore",
    ),
    fixture(
      "mess-table",
      "pale-studless.table.standard",
      [13, 15],
      "starboard",
    ),
    fixture(
      "command-bank",
      "shipyard.equipment.bridge-bank",
      [34, 5.5],
      "fore",
    ),
    fixture(
      "command-console",
      "shipyard.equipment.command-console",
      [34, 1.5],
      "fore",
    ),
  ],
  logic: albatrossAccess.logic,
  markings: { name: "ALBATROSS", number: "OC-26", emblem: "planet" },
});

export const FEDERATION_FLEET: readonly ShipPrefabDocumentV1[] = [
  FLEET_WREN,
  FLEET_PETREL,
  FLEET_WAYFARER,
  FLEET_HERON,
  FLEET_KESTREL,
  FLEET_ALBATROSS,
];
