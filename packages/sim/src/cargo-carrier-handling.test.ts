import { expect, test } from "vitest";
import { carrierInterface } from "./cargo-carrier-assembly";
import { planCargoCarrierHandling } from "./cargo-carrier-handling";
import type { CargoGrid, CargoPlacement } from "./construction-cargo";
import type { DeckCollisionFrame } from "./construction-collision";
function fixture() {
  const interfaces = [
    carrierInterface("oneMetre"),
    carrierInterface("twoMetre"),
  ];
  const grid: CargoGrid = {
    id: "cargo",
    deckId: "deck",
    footprint: [
      [0, 0],
      [192, 0],
      [192, 128],
      [0, 128],
    ],
    baseZ: 6,
    roofZ: 82,
    horizontalStepUnits: 32,
    snapOrigin: [0, 0],
    acceptedFamilies: [interfaces[0]!.bearingFamily],
    maxLoadKg: 5000,
    bearingPatches: [{ id: "floor", rect: [0, 0, 192, 128], maxLoadKg: 5000 }],
    reservedVolumes: [],
  };
  const placements: CargoPlacement[] = [
    {
      containerId: "base",
      interfaceId: "carrier-2m",
      origin: [0, 0, 6],
      quarterTurns: 0,
      payloadMassKg: 0,
      secured: true,
    },
    ...[0, 1, 2, 3].map((i) => ({
      containerId: "middle" + i,
      interfaceId: "carrier-1m",
      origin: [(i % 2) * 32, Math.floor(i / 2) * 32, 28] as [
        number,
        number,
        number,
      ],
      quarterTurns: 0,
      payloadMassKg: 5,
      secured: true,
    })),
    {
      containerId: "top",
      interfaceId: "carrier-2m",
      origin: [0, 0, 50],
      quarterTurns: 0,
      payloadMassKg: 10,
      secured: true,
    },
  ];
  const structure: DeckCollisionFrame = {
    shipId: "instance",
    deckId: "deck",
    fingerprint: "test-qualification-6x4",
    elevationM: 0.1875,
    floors: [
      [
        [-1, -1],
        [7, -1],
        [7, 5],
        [-1, 5],
      ],
    ],
    segments: [],
    obstacles: [],
  };
  const move = (
    containerId: string,
    origin: CargoPlacement["origin"],
    quarterTurns = 0,
  ) => {
    const i = placements.findIndex((p) => p.containerId === containerId),
      target = { ...placements[i]!, origin, quarterTurns };
    const p = planCargoCarrierHandling({
      grid,
      interfaces,
      placements,
      containerId,
      target,
      structure,
    });
    placements[i] = target;
    return p;
  };
  return { grid, interfaces, placements, structure, move };
}
test("unloads the actual 2m/four1m/2m interfaces to staging and rebuilds with stable payload identities", () => {
  const f = fixture(),
    before = structuredClone(f.placements);
  expect(() => f.move("base", [128, 0, 6])).toThrow("Unload supported cargo");
  const top = f.move("top", [96, 0, 6]);
  expect(top.waypoints.some((p) => p[2] === 51)).toBe(true);
  for (let i = 0; i < 4; i++) f.move("middle" + i, [i * 32, 96, 6]);
  expect(f.placements.every((p) => p.origin[2] === 6)).toBe(true);
  for (let i = 3; i >= 0; i--) f.move("middle" + i, before[i + 1]!.origin);
  f.move("top", before[5]!.origin);
  expect(f.placements).toEqual(before);
});
test("rotation requires its swept envelope, not only equal start/end squares", () => {
  const f = fixture();
  expect(() => f.move("top", [0, 0, 50], 1)).toThrow("sweep");
  f.move("top", [96, 0, 6]);
  expect(() => f.move("top", [96, 32, 6], 1)).not.toThrow();
});
test("ceiling clearance is checked during the lift even when final placements fit", () => {
  const f = fixture();
  f.grid.roofZ = 72;
  expect(() => f.move("top", [96, 0, 6])).toThrow("ceiling clearance");
});
test("cannot move through a wall or an enclosed floor hole between clear endpoints", () => {
  const f = fixture();
  f.structure.segments = [
    { id: "wall", a: [2.5, -1], b: [2.5, 5], halfWidthM: 0.0625 },
  ];
  expect(() => f.move("top", [96, 0, 6])).toThrow("sweep");
});
