import type { ConstructionDocument } from "@sidereal/content/construction";
import { CABIN_COLLIDERS } from "@sidereal/content/interior";
import {
  constrainLabDeck,
  LAB_CREW_CLEARANCE,
} from "@sidereal/content/pilot-layout";
import type { Point } from "@sidereal/content/ship-layout";
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
import { prefabConstructionObstacles } from "@sidereal/sim/prefab-deck-objects";
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
  const input = construction && { ...construction };
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
    const prefab = prefabConstructionObstacles(d as { prefab?: unknown });
    const obstacles = prefab
      ? prefab
      : d.stairRoom
        ? nativeStairRoomCollision(d, deckId)
        : d.traversalRoom
          ? nativeTraversalRoomCollision(d, deckId)
          : d.pressureRoom
            ? nativePressureRoomCollision(d, deckId)
            : d.boundaryKit?.revision === "r004"
              ? pinnedFamilyCollision(d.layout, deckId)
              : [];
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
      const extra = leaves;
      return {
        supported: true,
        partial: true,
        scope:
          dynamicScope +
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
