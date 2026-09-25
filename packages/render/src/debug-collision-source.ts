import type { ConstructionDocument } from "@sidereal/content/construction";
import { CABIN_COLLIDERS } from "../../content/src/interior";
import {
  constrainLabDeck,
  LAB_CREW_CLEARANCE,
} from "../../content/src/pilot-layout";
import type { Point } from "@sidereal/content/ship-layout";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import {
  bindNativeAirlockPlan,
  nativeAirlockCollision,
  type NativeAirlockDocument,
} from "@sidereal/sim/construction-airlock-document";
import { compilePublishedNativeExternalAirlock } from "@sidereal/sim/construction-airlock-published";
import { planNativeBoundaries } from "@sidereal/sim/construction-boundaries";
import { pinnedFamilyCollision } from "@sidereal/sim/construction-boundary-family";
import {
  compileDeckCollision,
  resolveDeckCollision,
  type DeckCollisionFrame,
  type DeckObstacle,
} from "@sidereal/sim/construction-collision";
import {
  doorLeafObstacle,
  type HingedDoorFrame,
} from "@sidereal/sim/construction-door-motion";
import { nativePressureRoomCollision } from "@sidereal/sim/construction-pressure-document";
import { nativeStairRoomCollision } from "@sidereal/sim/construction-stairs-document";
import { compileConstruction } from "@sidereal/sim/construction-transactions";
import { nativeTraversalRoomCollision } from "@sidereal/sim/construction-traversal-document";
import { stableStringify } from "@sidereal/sim/layout-geometry";
import { PRESERVED_FUEL_MOUNT } from "@sidereal/sim/wayfarer-refit-mount";
import { REFIT_FUEL_ATTACHMENT } from "@sidereal/sim/wayfarer-refit-audit";
import {
  QUALIFIED_WAYFARER_SHA256,
  qualifiedWayfarerWalkingBindings,
} from "../../sim/src/wayfarer-walking-bindings";
import type { ConstructionRenderInput } from "./construction-instance";

export interface DebugCollisionAcceptedState {
  deckId?: string;
  doors?: readonly {
    openingId: string;
    fraction: number;
    sealRetraction?: number;
  }[];
}
export interface DebugCollisionSourceResult {
  frames: readonly DeckCollisionFrame[];
  supported: boolean;
  partial: boolean;
  /** Display this limitation with the overlay. These frames never grant access. */
  scope: string;
}
const dynamicScope =
  "Current deck walking collision; moving cargo/carriers and 3D traversal support are not projected";
const requireSource = (condition: unknown, reason: string): void => {
  if (!condition) throw Error(reason);
};
const obstacleSegments = (obstacles: readonly DeckObstacle[]) =>
  obstacles.flatMap((o) =>
    o.vertices.map((a, i) => ({
      id: `${o.id}:${i}`,
      a,
      b: o.vertices[(i + 1) % o.vertices.length],
      halfWidthM: 0,
    })),
  );

/** Compare the admitted, UUID-renamed static document to the actual pinned source.
 * This is visual equivalence only: the client's geometric correspondence is NOT
 * the private server UUID map and must never be used to authorize an instance.
 * Returned obstacle identities deliberately retain their source namespace.
 */
function wayfarerSourceObstacles(
  document: ConstructionDocument,
  deckId: string,
) {
  const source = compileConstruction(WAYFARER_STARTER.documentJson);
  requireSource(
    source.sha256 === WAYFARER_STARTER.sha256 &&
      source.sha256 === QUALIFIED_WAYFARER_SHA256,
    "Wayfarer pinned source hash mismatch",
  );
  const original = JSON.parse(source.canonical) as ConstructionDocument;
  requireSource(
    document.layout.decks.length === 1 &&
      document.layout.decks[0].id === deckId,
    "Wayfarer source requires its single admitted deck",
  );
  const reverse = new Map<string, string>([
    [document.layout.id, original.layout.id],
    [deckId, original.layout.decks[0].id],
  ]);
  const pair = <T extends { id: string }>(
    actual: readonly T[],
    expected: readonly T[],
    omit: string[],
  ) => {
    requireSource(
      actual.length === expected.length,
      "Wayfarer source object count changed",
    );
    const signature = (item: T) =>
      stableStringify(
        Object.fromEntries(
          Object.entries(item).filter(([key]) => !omit.includes(key)),
        ),
      );
    const byGeometry = new Map(
      expected.map((item) => [signature(item), item.id]),
    );
    requireSource(
      byGeometry.size === expected.length,
      "Ambiguous Wayfarer source geometry",
    );
    for (const item of actual) {
      const key = signature(item),
        sourceId = byGeometry.get(key);
      requireSource(
        sourceId && !reverse.has(item.id),
        "Changed or duplicate Wayfarer geometry",
      );
      reverse.set(item.id, sourceId!);
      byGeometry.delete(key);
    }
  };
  pair(document.layout.tiles, original.layout.tiles, ["id", "deckId"]);
  pair(document.layout.assembly?.parts ?? [], original.layout.assembly!.parts, [
    "id",
  ]);
  const restore = (value: unknown): unknown =>
    typeof value === "string"
      ? (reverse.get(value) ?? value)
      : Array.isArray(value)
        ? value.map(restore)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value).map(([key, v]) => [key, restore(v)]),
            )
          : value;
  const restored = restore(document) as ConstructionDocument;
  restored.layout.source = original.layout.source;
  const restoredSource = compileConstruction(JSON.stringify(restored));
  requireSource(
    restoredSource.sha256 === source.sha256,
    "Admitted Wayfarer geometry differs from pinned source",
  );
  return qualifiedWayfarerWalkingBindings(restoredSource, 0.3, 1.8).flatMap(
    (binding) =>
      binding.obstacles.map((obstacle, i): DeckObstacle => ({
        id: `source:${binding.sourceObjectId}:${i}`,
        definitionId: binding.definitionId,
        vertices: obstacle.vertices.map(([x, y]): Point => [x, y]),
      })),
  );
}

function attachmentObstacles(
  input: ConstructionRenderInput,
  deckId: string,
): DeckObstacle[] {
  const rows = input.attachments ?? [];
  if (!rows.length) return [];
  requireSource(rows.length === 1, "Unsupported refit attachment count");
  const row = rows[0],
    pin = REFIT_FUEL_ATTACHMENT;
  requireSource(
    row.id &&
      row.instanceId === input.instanceId &&
      row.deckId === deckId &&
      row.assetId === pin.assetId &&
      row.assetSha256 === pin.glbSha256 &&
      [row.x, row.y, row.z].every((v, i) => v === pin.positionM[i]),
    "Refit collision requires the exact admitted fuel attachment",
  );
  // The authority's explicit conservative mount, not the visual tank bounds.
  const [width, depth] = PRESERVED_FUEL_MOUNT.footprintM;
  return [
    {
      id: row.id,
      definitionId: row.assetId,
      vertices: [
        [row.x - width / 2, row.y - depth / 2],
        [row.x + width / 2, row.y - depth / 2],
        [row.x + width / 2, row.y + depth / 2],
        [row.x - width / 2, row.y + depth / 2],
      ],
    },
  ];
}

function nativeDoorFrames(
  document: ConstructionDocument,
  deckId: string,
): HingedDoorFrame[] {
  if (document.pressureRoom)
    return [
      { id: document.layout.openings[0].id, origin: [2, 0], quarterTurns: 1 },
    ];
  if (!document.boundaryKit || document.boundaryKit.revision === "r004")
    return [];
  return planNativeBoundaries(document.layout, deckId, {
    floorTopUnits: 6,
  }).doors.map((door) => ({
    id: door.openingId,
    origin: [door.frameStartUnits[0] / 32, door.frameStartUnits[1] / 32],
    quarterTurns: door.quarterTurns,
  }));
}

/** Diagnostic of the exact legacy walk inputs, not a replacement collision solver.
 * Its boundary is a centre-position clamp; fixture boxes are UNEXPANDED. walk()
 * applies the additional .3m axis-aligned actor clearance. No visual mesh is read.
 */
function legacySource(): DebugCollisionSourceResult {
  const shoulderY = 8.325;
  const diagonalY =
    LAB_CREW_CLEARANCE.diagonalSum - LAB_CREW_CLEARANCE.bridgeHalfWidth;
  const x = (y: number) => constrainLabDeck(100, y).x;
  const edge: Point[] = [
    [-4, -8],
    [4, -8],
    [4, shoulderY],
    [LAB_CREW_CLEARANCE.bridgeHalfWidth, shoulderY],
    [x(diagonalY), diagonalY],
    [x(LAB_CREW_CLEARANCE.maxY), LAB_CREW_CLEARANCE.maxY],
    [-x(LAB_CREW_CLEARANCE.maxY), LAB_CREW_CLEARANCE.maxY],
    [-x(diagonalY), diagonalY],
    [-LAB_CREW_CLEARANCE.bridgeHalfWidth, shoulderY],
    [-4, shoulderY],
  ];
  const obstacles = CABIN_COLLIDERS.map((o): DeckObstacle => ({
    id: o.id,
    definitionId: "legacy-cabin-walk-rectangle",
    vertices: [
      [o.x - o.width / 2, o.y - o.depth / 2],
      [o.x + o.width / 2, o.y - o.depth / 2],
      [o.x + o.width / 2, o.y + o.depth / 2],
      [o.x - o.width / 2, o.y + o.depth / 2],
    ],
  }));
  return {
    supported: true,
    partial: true,
    scope:
      "Legacy walking: fixture rectangles and centre clamp; .3m actor expansion is applied by walk, not drawn",
    frames: [
      {
        shipId: "legacy-lab",
        deckId: "legacy-lab-deck",
        fingerprint: "legacy-lab-walk-inputs-v3",
        elevationM: 0,
        floors: [edge],
        obstacles,
        segments: obstacleSegments(obstacles),
      },
    ],
  };
}

/** Pure, bounded adapter over already-admitted render inputs. Compile once per
 * document/deck; resolve only when accepted door state changes. Does not import
 * private world tables, mutate gameplay, or derive colliders from art meshes.
 */
export function createDebugCollisionSource(
  construction?: ConstructionRenderInput,
) {
  const input = construction && {
    ...construction,
    attachments: construction.attachments?.map((a) => ({ ...a })),
  };
  const cache = new Map<
    string,
    (state: DebugCollisionAcceptedState) => DebugCollisionSourceResult
  >();
  let document: ConstructionDocument | undefined;
  let lastKey = "",
    lastResult: DebugCollisionSourceResult | undefined;
  function compile(deckId: string) {
    document ??= JSON.parse(
      compileConstruction(input!.documentJson).canonical,
    ) as ConstructionDocument;
    const d = document;
    requireSource(
      d.layout.id === input!.instanceId &&
        d.layout.decks.some((deck) => deck.id === deckId),
      "Admitted construction instance/deck mismatch",
    );
    if (d.airlockRoom) {
      requireSource(
        !input!.attachments?.length,
        "Unsupported airlock attachment",
      );
      const native = d as NativeAirlockDocument;
      const plan = bindNativeAirlockPlan(
        native,
        compilePublishedNativeExternalAirlock,
        input!.instanceId,
      );
      return (
        state: DebugCollisionAcceptedState,
      ): DebugCollisionSourceResult => ({
        supported: true,
        partial: true,
        scope:
          dynamicScope +
          "; native airlock leaves/seals use accepted poses (missing poses stay closed)",
        frames: [
          nativeAirlockCollision(
            native,
            plan,
            (state.doors ?? []).map((door) => ({
              ...door,
              sealRetraction: door.sealRetraction ?? 0,
            })),
          ),
        ],
      });
    }
    const wayfarer =
      d.layout.source?.blueprintRevision === QUALIFIED_WAYFARER_SHA256 ||
      compileConstruction(input!.documentJson).sha256 ===
        QUALIFIED_WAYFARER_SHA256;
    const obstacles = wayfarer
      ? wayfarerSourceObstacles(d, deckId)
      : d.stairRoom
        ? nativeStairRoomCollision(d, deckId)
        : d.traversalRoom
          ? nativeTraversalRoomCollision(d, deckId)
          : d.pressureRoom
            ? nativePressureRoomCollision(d, deckId)
            : d.boundaryKit?.revision === "r004"
              ? pinnedFamilyCollision(d.layout, deckId)
              : [];
    requireSource(
      wayfarer || !input!.attachments?.length,
      "Unqualified refit collision source",
    );
    const added = wayfarer ? attachmentObstacles(input!, deckId) : [];
    const width = d.boundaryKit?.revision === "r001" ? 0.0625 : 0;
    const base = compileDeckCollision(d.layout, deckId, {
      shipId: input!.instanceId,
      perimeterHalfWidthM: width,
      partitionHalfWidthM: d.pressureRoom ? 0.0625 : width,
      obstacles,
    });
    const doors = nativeDoorFrames(d, deckId);
    return (state: DebugCollisionAcceptedState): DebugCollisionSourceResult => {
      const states = state.doors ?? [];
      const frame = resolveDeckCollision(
        base,
        states.map((door) => ({
          openingId: door.openingId,
          passable: door.fraction === 1,
        })),
      );
      // Only accepted physical leaves are drawn. Missing poses retain closed
      // aperture blockers; inventing a leaf rotation would misstate authority.
      const leaves = states.map((state) => {
        const door = doors.find((door) => door.id === state.openingId);
        requireSource(door, "Door has no qualified physical frame");
        return doorLeafObstacle(door!, state.fraction);
      });
      const extra = [...added, ...leaves];
      return {
        supported: true,
        partial: true,
        scope:
          dynamicScope +
          (wayfarer
            ? "; pinned Wayfarer source geometry, admitted fuel mount if installed; source IDs are diagnostic only"
            : "") +
          (states.length < doors.length
            ? "; missing door pose: closed aperture only"
            : ""),
        frames: [
          {
            ...frame,
            obstacles: [...frame.obstacles, ...extra],
            segments: [...frame.segments, ...obstacleSegments(extra)],
          },
        ],
      };
    };
  }
  return {
    resolve(
      state: DebugCollisionAcceptedState = {},
    ): DebugCollisionSourceResult {
      const deckId = state.deckId ?? input?.deckId;
      const key = JSON.stringify([deckId, state.doors]);
      if (lastResult && key === lastKey) return lastResult;
      lastKey = key;
      try {
        if (!input) return (lastResult = legacySource());
        requireSource(deckId, "No admitted collision deck");
        let resolve = cache.get(deckId!);
        if (!resolve) {
          resolve = compile(deckId!);
          cache.set(deckId!, resolve);
        }
        return (lastResult = resolve(state));
      } catch (error) {
        return (lastResult = {
          frames: [],
          supported: false,
          partial: true,
          scope: `Collision source unavailable: ${error instanceof Error ? error.message.slice(0, 160) : "unsupported admitted source"}`,
        });
      }
    },
  };
}
