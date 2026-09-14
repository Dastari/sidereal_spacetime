import type { ConstructionDocument } from "@sidereal/content/construction";
import type { Point } from "@sidereal/content/ship-layout";
import visuals from "@sidereal/content/construction-wayfarer-rebuild-visuals.json";
import { CONSTRUCTION_INSET_VISUALS } from "@sidereal/content/construction-inset-visuals";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { verifyWayfarerRebuildSource } from "./wayfarer-rebuild-contract";
import {
  planWayfarerRebuildNative,
  type WayfarerAdditionalNativePart,
} from "./wayfarer-rebuild-native-plan";
import {
  planWayfarerRebuildRetainedWalking,
  checkWayfarerRebuildNativeAccess,
} from "./wayfarer-rebuild-walking";
import {
  compileDeckCollision,
  resolveDeckCollision,
  type DeckObstacle,
} from "./construction-collision";
import { stableStringify } from "./layout-geometry";

export interface WayfarerRebuildVisualRequest {
  id: string;
  key: string;
  originM: [number, number, number];
  quarterTurns: number;
  role: "wall" | "roof";
}
const digest = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(stableStringify(value))));
const spacerKey = "wayfarer-rebuild-r001/internal-span-0.125-q4";
const spacerHash =
  "9ae55fc62ec463eb434ddb7567c625010a96bb469a7a7416c19908ad63d2b390";
const riserKey = "wayfarer-rebuild-r001/cockpit-roof-step";
const riserHash =
  "cf008a583532494febff62ee58ce5cdb2e065d5095a08748efebca54d4ab8922";
const sourceRoot =
  "assets/art-library/designs/shipyard.structure.wayfarer-transition/revisions/";
function expect(value: unknown, message: string): asserts value {
  if (!value) throw Error("Wayfarer rebuilt game: " + message);
}
/** Static walking admission for the exact rebuilt source and a bijective instance
 * identity mapping. This does not qualify pressure, strength, flight or live refit.
 * Native renderers still verify each requested GLB hash before displaying it. */
export function planWayfarerRebuildGame(
  document: ConstructionDocument,
  options: { shipId?: string } = {},
) {
  const verified = verifyWayfarerRebuildSource(document);
  const source = verified.source,
    layout = source.layout;
  expect(
    layout.structure?.schema === "sidereal.layout-structure.v2",
    "v2 boundary model required",
  );
  const identities = verified.identities;
  const mapped = (id: string) => {
    const v = identities[id];
    expect(v, "missing instance identity: " + id);
    return v;
  };
  // The import is a bundled asset contract, never an arbitrary caller registry.
  const pack = visuals as {
    schema: string;
    revision: string;
    sourcePins: Record<string, string>;
    parts: {
      key: string;
      sha256: string;
      kind: string;
      heightM: number;
      footprintM: number[][];
      family: string;
      profileId: string;
      url: string;
      placement?: { positionM: number[]; yawRadians: number };
    }[];
  };
  const spacer = pack.parts.find((p) => p.key === spacerKey),
    riser = pack.parts.find((p) => p.key === riserKey);
  expect(
    pack.schema === "sidereal.wayfarer-rebuild-visuals.v1" &&
      pack.revision === "r002",
    "exact visual pack revision required",
  );
  expect(
    spacer?.sha256 === spacerHash &&
      spacer.kind === "wall" &&
      spacer.heightM === 3 &&
      pack.sourcePins[sourceRoot + "r002/internal-span-0.125-q4.glb"] ===
        spacerHash,
    "audited native spacer pin required",
  );
  expect(
    riser?.sha256 === riserHash &&
      riser.kind === "roof" &&
      riser.heightM === 0.5625 &&
      pack.sourcePins[sourceRoot + "r003/wayfarer-transition.glb"] ===
        riserHash,
    "audited native cockpit roof transition pin required",
  );
  expect(
    stableStringify(riser.footprintM) ===
      stableStringify([
        [-3.125, 6.875],
        [3.125, 6.875],
        [3.125, 8.75],
        [3, 8.75],
        [3, 7],
        [-3, 7],
        [-3, 8.75],
        [-3.125, 8.75],
      ]),
    "exact cockpit transition footprint required",
  );
  const native = planWayfarerRebuildNative(
    layout,
    spacer as WayfarerAdditionalNativePart,
  );
  expect(native.ok, native.issues.join("; "));
  const retained = planWayfarerRebuildRetainedWalking(source);
  const deckId = layout.playableDeckId,
    instanceDeckId = mapped(deckId),
    shipId = options.shipId ?? document.layout.id;
  const wallObstacles = native.obstacles.map((o) => ({
    ...o,
    id: "rebuild-wall:" + digest([o.id, o.vertices]),
  }));
  const retainedObstacles = retained.bindings.flatMap((b) =>
    b.obstacles.map((o, i) => ({
      id: `${b.sourceObjectId}:${i}`,
      definitionId: b.definitionId,
      vertices: o.vertices,
    })),
  );
  const reservations = layout.structure.navigationReservations.map((r) => ({
    id: "rebuild-reservation:" + digest(r.id),
    definitionId: "wayfarer-rebuild-nonwalkable",
    vertices: r.vertices.map(([x, y]): Point => [x / 32, y / 32]),
  }));
  expect(
    layout.structure.navigationReservations.every(
      (r) => r.deckId === deckId && r.reason === "nonwalkable",
    ),
    "unsupported navigation reservation",
  );
  const sourceObstacles: DeckObstacle[] = [
    ...wallObstacles,
    ...retainedObstacles,
    ...reservations,
  ];
  const sourceFrame = resolveDeckCollision(
    compileDeckCollision(layout, deckId, {
      shipId: layout.id,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      obstacles: sourceObstacles,
    }),
    [],
  );
  const access = checkWayfarerRebuildNativeAccess(source, sourceFrame);
  const instanceObstacles: DeckObstacle[] = [
    ...native.obstacles.map((o) => ({
      ...o,
      id: "rebuild-wall:" + digest([document.layout.id, o.id, o.vertices]),
    })),
    ...retained.bindings.flatMap((b) =>
      b.obstacles.map((o, i) => ({
        id: `${mapped(b.sourceObjectId)}:${i}`,
        definitionId: b.definitionId,
        vertices: o.vertices,
      })),
    ),
    ...layout.structure.navigationReservations.map((r, i) => ({
      ...reservations[i],
      id: "rebuild-reservation:" + digest([document.layout.id, r.id]),
    })),
  ];
  const instanceFrame = resolveDeckCollision(
    compileDeckCollision(document.layout, instanceDeckId, {
      shipId,
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      obstacles: instanceObstacles,
    }),
    [],
  );
  const nativeVisualRequests: WayfarerRebuildVisualRequest[] =
    native.placements.map((p) => ({
      id:
        "wayfarer-native:" + digest([document.layout.id, p.key, p.originUnits]),
      key: p.nativeKey,
      originM: p.originUnits.map((n) => n / 32) as [number, number, number],
      quarterTurns: p.quarterTurns,
      role: "wall",
    }));
  const preservedRoofFloors = new Set(["floor--1-4", "floor-1-4"]);
  const mainRoofBindings = source.floors
    .filter((f) => !f.id.startsWith("pilot-") && !preservedRoofFloors.has(f.id))
    .map((f) => {
      const key = "roof-r000/" + f.partId;
      expect(!f.reflected, "reflected native roof unsupported");
      expect(
        CONSTRUCTION_INSET_VISUALS.parts.some(
          (p) => p.key === key && p.kind === "roof",
        ),
        "missing native roof profile: " + key,
      );
      const originM: [number, number, number] = [
        f.origin[0] / 32,
        f.origin[1] / 32,
        3.1875,
      ];
      const sourceFloorId = f.id,
        instanceFloorId = mapped(f.id);
      const request: WayfarerRebuildVisualRequest = {
        id: "wayfarer-roof:" + digest([document.layout.id, f.id]),
        key,
        originM,
        quarterTurns: f.quarterTurns,
        role: "roof",
      };
      nativeVisualRequests.push(request);
      return {
        sourceFloorId,
        instanceFloorId,
        deckId: instanceDeckId,
        ...request,
      };
    });
  nativeVisualRequests.push({
    id: "wayfarer-roof:" + digest([document.layout.id, riserKey]),
    key: riserKey,
    originM: [0, 0, 0],
    quarterTurns: 0,
    role: "roof",
  });
  nativeVisualRequests.sort((a, b) => a.id.localeCompare(b.id));
  return {
    sourceSha256: verified.sourceSha256,
    identities,
    sourceObjectCollisionBindings: retained.bindings,
    instanceObjectCollisionBindings: retained.bindings.map((b) => ({
      ...b,
      sourceObjectId: mapped(b.sourceObjectId),
      deckIds: b.deckIds.map(mapped),
    })),
    sourceObstacles,
    instanceObstacles,
    sourceFrame,
    instanceFrame,
    nativeVisualRequests,
    mainRoofBindings,
    nativePlan: native,
    access,
    readiness: {
      staticWalking: true as const,
      pressure: false as const,
      strength: false as const,
      flight: false as const,
      gameAcceptance: false as const,
    },
    nativeSourcePins: { ...pack.sourcePins },
    limitations: [
      "Existing 25 mm native roof bevel seams remain; no watertight enclosure claim",
      "Browser and game acceptance and live conservation checks remain required",
    ] as const,
  };
}
