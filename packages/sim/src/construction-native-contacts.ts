import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { Point } from "@sidereal/content/ship-layout";

/** Exact delivered native artifacts. This is a contact qualification, not an
 * airtight-room flag, pressure rating, damage adapter, or gas allocation. */
export const NATIVE_CONTACT_PINS = Object.freeze({
  interfaces:
    "4622708cd371c3e4764e28f718279d43f1d9cc8084e40d8384101d17e719a004",
  glb: "c31c946c54d9e797ea592541c7eb728083fc12a2e18b5713c307ece3c5bd1b60",
  validation:
    "7b22c389c3d225bfcecfc0c0cef9ebead494070b4925bbd697d5713b0c0cd841",
  floorGlb: "138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585",
  boundaryInterfaces:
    "136afd89f22c1cbea3ba590fca4ebc4cd81f82615f71fcadcedc2d041b73544b",
});
const hash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
const digest = (value: unknown) =>
  hash(new TextEncoder().encode(JSON.stringify(value)));
function demand(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(`Native floor contacts: ${reason}`);
}
interface Placement {
  partId: string;
  originUnits: Point;
  quarterTurns: number;
}
interface Floor extends Placement {
  native: {
    assetId: string;
    revision: string;
    sha256: string;
    nodePrefix: string;
    sourceToNominal: {
      translation: number[];
      quarterTurns: number;
      reflected: boolean;
    };
  };
}
interface ContactPart {
  id: string;
  assetUuid: string;
  floorPartId: string;
  native: { nodePrefix: string; scale: number[] };
  solidVolumeM3: number;
}
interface Fixture {
  id: string;
  nativeFloors: Floor[];
  nativeWalls: Placement[];
  placements: (Placement & { sourceFloorIndex: number })[];
}
interface Catalog {
  parts: ContactPart[];
  fixtures: Fixture[];
}
export interface NativeContactAssembly {
  instanceId: string;
  deckId: string;
  deckElevationUnits: number;
  floorTopUnits: number;
  geometryFingerprint: string;
  floorGlbSha256: string;
  boundaryInterfacesSha256: string;
  floors: (Floor & { id: string })[];
  walls: (Placement & { id: string })[];
  /** Actual compiled openings, not a caller's permission to cover them. */
  openingIds: string[];
}
export interface NativeContactPlacement {
  id: string;
  sourceFloorId: string;
  assetUuid: string;
  partId: string;
  nodePrefix: string;
  originUnits: Point;
  quarterTurns: number;
  /** Native mesh already includes floor-top coordinates. Add only deck elevation. */
  elevationUnits: number;
  scale: readonly [1, 1, 1];
  solidVolumeM3: number;
}
export interface NativeContactQualification {
  scope: "native-floor-wall-contact-only";
  fixtureId: string;
  instanceId: string;
  deckId: string;
  geometryFingerprint: string;
  assemblyFingerprint: string;
  validationSha256: string;
  placements: NativeContactPlacement[];
  /** Contacts below the walk datum do not displace the above-datum gas prism. */
  excludedAboveFloorGasVolumeM3: 0;
}
const validId = (id: string) =>
  typeof id === "string" && id.length > 0 && id.length <= 128;
const validPoint = (p: Point) =>
  Array.isArray(p) &&
  p.length === 2 &&
  p.every((n) => Number.isSafeInteger(n) && Math.abs(n) <= 8192);
const rotate = (p: Point, q: number): Point => {
  switch (q) {
    case 0:
      return [p[0], p[1]];
    case 1:
      return [-p[1], p[0]];
    case 2:
      return [-p[0], -p[1]];
    default:
      return [p[1], -p[0]];
  }
};
const key = (p: Placement) =>
  JSON.stringify([p.partId, p.originUnits, p.quarterTurns]);
const transform = (p: Placement, q: number, offset: Point): Placement => {
  const r = rotate(p.originUnits, q);
  return {
    partId: p.partId,
    originUnits: [r[0] + offset[0], r[1] + offset[1]],
    quarterTurns: (p.quarterTurns + q) % 4,
  };
};
const nativeKey = (p: Floor) =>
  JSON.stringify([
    p.native.assetId,
    p.native.revision,
    p.native.sha256,
    p.native.nodePrefix,
    p.native.sourceToNominal.translation,
    p.native.sourceToNominal.quarterTurns,
    p.native.sourceToNominal.reflected,
  ]);

/** Load once from server/content-owned exact bytes. Never accept this catalog or
 * NativeContactAssembly from a reducer's client JSON. The caller derives assembly
 * placements from its own pinned native compiler and persisted instance layout.
 * Hash checks bind the supplied report; the offline native validator is still the
 * source of physical evidence and must run as an artifact publication gate. */
export function createNativeContactMatcher(bytes: {
  interfaces: Uint8Array;
  validation: Uint8Array;
  glb: Uint8Array;
}) {
  for (const kind of ["interfaces", "validation", "glb"] as const)
    demand(
      bytes[kind].byteLength <= 4_194_304 &&
        hash(bytes[kind]) === NATIVE_CONTACT_PINS[kind],
      `wrong ${kind} artifact`,
    );
  // Parsing makes private owned records, so a caller cannot later mutate the catalog.
  const catalog = JSON.parse(
    new TextDecoder().decode(bytes.interfaces),
  ) as Catalog;
  const validation = JSON.parse(new TextDecoder().decode(bytes.validation)) as {
    pass: boolean;
    checks: { pass: boolean }[];
    fixtures: { fixture: string; after: unknown[] }[];
  };
  demand(
    validation.pass &&
      validation.checks.length === 130 &&
      validation.checks.every((c) => c.pass),
    "failed native evidence",
  );
  const parts = new Map(catalog.parts.map((p) => [p.id, p]));
  return (assembly: NativeContactAssembly): NativeContactQualification => {
    demand(
      validId(assembly.instanceId) && validId(assembly.deckId),
      "invalid instance/deck identity",
    );
    demand(
      /^[a-f0-9]{64}$/.test(assembly.geometryFingerprint),
      "invalid geometry binding",
    );
    demand(
      assembly.floorGlbSha256 === NATIVE_CONTACT_PINS.floorGlb &&
        assembly.boundaryInterfacesSha256 ===
          NATIVE_CONTACT_PINS.boundaryInterfaces,
      "incompatible native dependencies",
    );
    demand(
      assembly.floorTopUnits === 6 &&
        Number.isSafeInteger(assembly.deckElevationUnits) &&
        Math.abs(assembly.deckElevationUnits) <= 8192,
      "incompatible floor/deck datum",
    );
    demand(
      assembly.openingIds.length === 0,
      "door/frame/threshold contacts are not qualified by r005",
    );
    demand(
      assembly.floors.length > 0 &&
        assembly.floors.length <= 8 &&
        assembly.walls.length > 0 &&
        assembly.walls.length <= 13,
      "exact fixture work budget",
    );
    const ids = new Set<string>();
    for (const placements of [assembly.floors, assembly.walls]) {
      const occupied = new Set<string>();
      for (const p of placements) {
        demand(
          validId(p.id) && !ids.has(p.id) && validId(p.partId),
          "duplicate/invalid placed identity",
        );
        ids.add(p.id);
        demand(
          validPoint(p.originUnits) &&
            Number.isInteger(p.quarterTurns) &&
            p.quarterTurns >= 0 &&
            p.quarterTurns < 4,
          "unsupported placement transform",
        );
        demand(!occupied.has(key(p)), "duplicate native placement");
        occupied.add(key(p));
      }
    }
    const floors = new Map(assembly.floors.map((p) => [key(p), p]));
    const walls = new Set(assembly.walls.map(key));
    for (const fixture of catalog.fixtures) {
      if (
        fixture.nativeFloors.length !== floors.size ||
        fixture.nativeWalls.length !== walls.size
      )
        continue;
      const anchor = fixture.nativeFloors[0];
      for (let q = 0; q < 4; q++) {
        const a = rotate(anchor.originUnits, q);
        for (const candidate of assembly.floors) {
          if (
            candidate.partId !== anchor.partId ||
            candidate.quarterTurns !== (anchor.quarterTurns + q) % 4
          )
            continue;
          const offset: Point = [
            candidate.originUnits[0] - a[0],
            candidate.originUnits[1] - a[1],
          ];
          const matched = fixture.nativeFloors.map((p) =>
            floors.get(key(transform(p, q, offset))),
          );
          if (
            !matched.every(
              (p, i) =>
                p && nativeKey(p) === nativeKey(fixture.nativeFloors[i]),
            )
          )
            continue;
          if (
            !fixture.nativeWalls.every((p) =>
              walls.has(key(transform(p, q, offset))),
            )
          )
            continue;
          demand(
            validation.fixtures.some(
              (f) => f.fixture === fixture.id && f.after.length === 0,
            ),
            "fixture lacks physical path proof",
          );
          const placements = fixture.placements
            .map((p): NativeContactPlacement => {
              const part = parts.get(p.partId)!;
              const floor = matched[p.sourceFloorIndex]!;
              demand(
                part.floorPartId === floor.partId,
                "contact source floor mismatch",
              );
              const placed = transform(p, q, offset);
              return {
                id: `contact:${digest([assembly.instanceId, assembly.deckId, floor.id, part.id])}`,
                sourceFloorId: floor.id,
                assetUuid: part.assetUuid,
                partId: part.id,
                nodePrefix: part.native.nodePrefix,
                originUnits: placed.originUnits,
                quarterTurns: placed.quarterTurns,
                elevationUnits: assembly.deckElevationUnits,
                scale: [1, 1, 1],
                solidVolumeM3: part.solidVolumeM3,
              };
            })
            .sort((a, b) => a.id.localeCompare(b.id));
          return {
            scope: "native-floor-wall-contact-only",
            fixtureId: fixture.id,
            instanceId: assembly.instanceId,
            deckId: assembly.deckId,
            geometryFingerprint: assembly.geometryFingerprint,
            assemblyFingerprint: digest([
              assembly.geometryFingerprint,
              assembly.deckElevationUnits,
              [...assembly.floors, ...assembly.walls]
                .map((p) => [p.id, key(p)])
                .sort(),
            ]),
            validationSha256: NATIVE_CONTACT_PINS.validation,
            placements,
            excludedAboveFloorGasVolumeM3: 0,
          };
        }
      }
    }
    throw new Error(
      "Native floor contacts: unsupported complete floor/wall mask; author and validate a matching native signature",
    );
  };
}
