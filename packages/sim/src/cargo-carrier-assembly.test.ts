import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  CARGO_CARRIER_REVISION,
  CARGO_CARRIER_RETENTION,
  CARGO_CARRIER_SOURCE,
  SECURED_CARGO_PAYLOADS,
} from "@sidereal/content/cargo-carriers";
import {
  cargoAssemblyTransforms,
  carrierInterface,
  requireSecuredCargoAssembly,
  type SecuredCargoAssembly,
} from "./cargo-carrier-assembly";
import {
  proposeCargoChanges,
  validateCargoStack,
  type CargoGrid,
  type CargoPlacement,
} from "./construction-cargo";

const assembly = (id = "a"): SecuredCargoAssembly => ({
  id,
  carrierId: `${id}-carrier`,
  containerId: `${id}-inventory`,
  placedObjectId: `${id}-payload`,
  instanceId: "instance",
  deckId: "deck",
  carrierSize: "oneMetre",
  payloadAssetId: SECURED_CARGO_PAYLOADS[0].installedAssetId,
  payloadGlbSha256: SECURED_CARGO_PAYLOADS[0].glbSha256,
  interfaceRevision: CARGO_CARRIER_REVISION,
  retentionRevision: CARGO_CARRIER_RETENTION.revision,
  upperFrameLocked: true,
  lifecycle: "active",
  revision: 1n,
});

test("only exact small/red paired geometry and a locked receiver assembly are admitted", () => {
  for (const payload of SECURED_CARGO_PAYLOADS)
    expect(
      requireSecuredCargoAssembly({
        ...assembly(),
        payloadAssetId: payload.installedAssetId,
        payloadGlbSha256: payload.glbSha256,
      }).payload,
    ).toEqual(payload);
  expect(() =>
    requireSecuredCargoAssembly({ ...assembly(), payloadGlbSha256: "other" }),
  ).toThrow();
  expect(() =>
    requireSecuredCargoAssembly({
      ...assembly(),
      payloadAssetId: "medical-small",
    }),
  ).toThrow();
  expect(() =>
    requireSecuredCargoAssembly({ ...assembly(), upperFrameLocked: false }),
  ).toThrow();
  expect(() =>
    requireSecuredCargoAssembly({
      ...assembly(),
      carrierId: assembly().containerId,
    }),
  ).toThrow();
});

test("runtime pins match exact native exports and retained original payloads", () => {
  for (const source of [
    ...Object.values(CARGO_CARRIER_SOURCE),
    ...SECURED_CARGO_PAYLOADS,
  ])
    expect(
      createHash("sha256").update(readFileSync(source.glbPath)).digest("hex"),
    ).toBe(source.glbSha256);
  const proof = JSON.parse(
    readFileSync(
      "assets/art-library/designs/cargo.restraint.standard-small/revisions/r000/a001/qualification.json",
      "utf8",
    ),
  );
  expect(proof.fixedOrientationClosedRetention).toBe(true);
  expect(proof.payloads).toHaveLength(2);
  expect(
    CARGO_CARRIER_RETENTION.receiverWallHeightM -
      CARGO_CARRIER_RETENTION.maximumUpwardTravelM,
  ).toBeGreaterThan(0.008);
});

test("rotation uses the nominal carrier center while preserving all independent identities", () => {
  const a = assembly();
  const first = cargoAssemblyTransforms(a, [-64, 32, 6], 0);
  const reverse = cargoAssemblyTransforms(a, [-64, 32, 6], 2);
  expect(first.payloadOriginM).toEqual([-1.5, 1.5377499908208847, 0.28125]);
  expect(reverse.payloadOriginM[0]).toBeCloseTo(-1.5);
  expect(reverse.payloadOriginM[1]).toBeCloseTo(1.4622500091791153);
  for (const p of [first, reverse])
    expect([p.carrierId, p.containerId, p.payloadPlacedObjectId]).toEqual([
      a.carrierId,
      a.containerId,
      a.placedObjectId,
    ]);
  expect(() => cargoAssemblyTransforms(a, [0, 0, NaN], 0)).toThrow();
});

test("six actual native assemblies support mixed stacks, rotations and removal protection", () => {
  const catalog = [carrierInterface("oneMetre"), carrierInterface("twoMetre")];
  const grid: CargoGrid = {
    id: "grid",
    deckId: "deck",
    footprint: [
      [0, 0],
      [64, 0],
      [64, 64],
      [0, 64],
    ],
    baseZ: 6,
    roofZ: 82,
    horizontalStepUnits: 32,
    snapOrigin: [0, 0],
    acceptedFamilies: [catalog[0]!.bearingFamily],
    maxLoadKg: 5000,
    bearingPatches: [{ id: "floor", rect: [0, 0, 64, 64], maxLoadKg: 5000 }],
    reservedVolumes: [],
  };
  const rows: CargoPlacement[] = [
    {
      containerId: "base",
      interfaceId: "carrier-2m",
      origin: [0, 0, 6],
      quarterTurns: 0,
      payloadMassKg: 100,
      secured: true,
    },
    ...[0, 1].flatMap((x) =>
      [0, 1].map((y) => ({
        containerId: `middle-${x}-${y}`,
        interfaceId: "carrier-1m",
        origin: [x * 32, y * 32, 28] as [number, number, number],
        quarterTurns: x + y,
        payloadMassKg: 100,
        secured: true,
      })),
    ),
    {
      containerId: "top",
      interfaceId: "carrier-2m",
      origin: [0, 0, 50],
      quarterTurns: 3,
      payloadMassKg: 100,
      secured: true,
    },
  ];
  expect(validateCargoStack(grid, catalog, rows).valid).toBe(true);
  expect(validateCargoStack(grid, catalog, rows).gridLoadKg).toBe(800);
  expect(
    proposeCargoChanges(grid, catalog, rows, [
      { kind: "remove", containerId: "middle-1-0" },
    ]).accepted,
  ).toBe(false);
  expect(
    proposeCargoChanges(grid, catalog, rows, [
      { kind: "remove", containerId: "top" },
    ]).accepted,
  ).toBe(true);
  expect(validateCargoStack({ ...grid, roofZ: 71 }, catalog, rows).valid).toBe(
    false,
  );
  expect(
    validateCargoStack(
      grid,
      catalog,
      rows.map((p) =>
        p.containerId === "middle-1-0" ? { ...p, payloadMassKg: 500 } : p,
      ),
    ).valid,
  ).toBe(false);
});

test("native mesh translations rotate both carrier sizes inside their unchanged reservation", () => {
  for (const carrierSize of ["oneMetre", "twoMetre"] as const) {
    const a = { ...assembly(), carrierSize };
    const width = carrierSize === "oneMetre" ? 1 : 2;
    for (const turns of [0, 1, 2, 3]) {
      const result = cargoAssemblyTransforms(a, [-64, 32, 6], turns);
      const angle = (turns * Math.PI) / 2;
      const corners = [
        [0, 0],
        [width, 0],
        [width, width],
        [0, width],
      ].map(([x, y]) => [
        result.carrierMeshOriginM[0] +
          x! * Math.cos(angle) -
          y! * Math.sin(angle),
        result.carrierMeshOriginM[1] +
          x! * Math.sin(angle) +
          y! * Math.cos(angle),
      ]);
      expect(Math.min(...corners.map((p) => p[0]!))).toBeCloseTo(-2);
      expect(Math.max(...corners.map((p) => p[0]!))).toBeCloseTo(-2 + width);
      expect(Math.min(...corners.map((p) => p[1]!))).toBeCloseTo(1);
      expect(Math.max(...corners.map((p) => p[1]!))).toBeCloseTo(1 + width);
      expect(result.carrierOriginM).toEqual([-2, 1, 0.1875]);
      expect(result.receiverMeshOriginM).toEqual(result.carrierMeshOriginM);
      expect(result.carrierPivotLocalM).toEqual([width / 2, width / 2, 0]);
    }
  }
});
