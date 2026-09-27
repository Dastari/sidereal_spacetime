import type { ConstructionDocument } from "@sidereal/content/construction";
import type { Point } from "@sidereal/content/ship-layout";
import {
  CONSTRUCTION_INSET_VISUAL_PIN,
  CONSTRUCTION_INSET_VISUALS,
} from "@sidereal/content/construction-inset-visuals";
import { compileLayout } from "./layout-compiler";
import { planInsetNativeBoundary } from "./layout-inset-native-plan";
import { matchNativeFloorTile } from "./layout-native-floor";
import { stableStringify, inside } from "./layout-geometry";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
const constructionHash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
import type { DeckObstacle } from "./construction-collision";
const parts = new Map(CONSTRUCTION_INSET_VISUALS.parts.map((p) => [p.key, p]));
function requireMatch(value: unknown, message: string): asserts value {
  if (!value) throw Error("Inset boundary review: " + message);
}
const rotate = ([x, y]: Point, q: number): Point =>
  (
    [
      [x, y],
      [-y, x],
      [-x, -y],
      [y, -x],
    ] as Point[]
  )[q];
/** Native envelope audit SHA256 8b4a4eb4d837a39b3f82e13e74d9cc48fcc610124fe01d9f38dcdae9cf2e0c85.
 * Full-height static review only. Nominal structural reservation proxies are
 * intentionally separate from authored surfaces. No material strength, pressure,
 * flight, damage or traversal qualification is supplied by this adapter. */
export function planPinnedInsetBoundaries(
  document: ConstructionDocument,
  deckId: string,
) {
  requireMatch(
    stableStringify(document.boundaryKit) ===
      stableStringify(CONSTRUCTION_INSET_VISUAL_PIN),
    "exact visual kit pin required",
  );
  requireMatch(
    !document.roofKit &&
      !document.stairRoom &&
      !document.traversalRoom &&
      !document.airlockRoom &&
      !document.pressureRoom,
    "mixed legacy/physical adapters unsupported",
  );
  const doc = document.layout,
    config = doc.structure;
  requireMatch(
    config?.schema === "sidereal.layout-structure.v2",
    "v2 structure required",
  );
  requireMatch(
    !doc.openings.length &&
      !doc.assembly?.parts.length &&
      !config.navigationReservations.length,
    "openings, retained assembly and navigation reservations unsupported",
  );
  requireMatch(
    !config.armor.length && !Object.keys(config.wallFaces).length,
    "armor and wall-face selections require qualified visual/identity adapters",
  );
  const deck = doc.decks.find((d) => d.id === deckId),
    profile = config.deckProfiles.find((p) => p.deckId === deckId);
  requireMatch(
    deck &&
      profile &&
      !deck.holes.length &&
      deck.ceiling === 102 &&
      profile.floorThickness === 6 &&
      profile.clearHeight === 96 &&
      profile.roofThickness === 4 &&
      profile.serviceVoid === 6 &&
      profile.pitch === 112,
    "exact standard full-height profile without holes required",
  );
  const compiled = compileLayout(doc);
  requireMatch(compiled.valid, "valid current compilation required");
  const walls = compiled.walls.filter((w) => w.deckId === deckId);
  requireMatch(
    walls.every((w) => w.treatment?.heightUnits === 96),
    "full-height opaque boundary required",
  );
  const plan = planInsetNativeBoundary({
    walls,
    deckId,
    elevationUnits: deck.elevation,
    floorThicknessUnits: 6,
    floorPolygons: compiled.tiles
      .filter((t) => t.deckId === deckId)
      .map((t) => t.vertices),
  });
  requireMatch(
    !plan.issues.length,
    plan.issues.map((i) => i.message).join("; "),
  );
  for (const tile of compiled.tiles.filter((t) => t.deckId === deckId))
    requireMatch(
      matchNativeFloorTile(
        tile,
        deck.elevation,
        config.tileStyles[tile.id]?.model,
      ),
      "exact native floor model required",
    );
  const obstacles: DeckObstacle[] = [];
  for (const p of plan.placements) {
    const nativeKey = p.family + "/" + p.profileId + "-q" + p.quarterHeight,
      part = parts.get(nativeKey);
    requireMatch(
      part && part.kind === "wall" && part.heightM === 3,
      "missing exact full-height native wall definition",
    );
    const polygon = part.footprintM as Point[];
    requireMatch(
      polygon.length >= 4 &&
        polygon.length <= 16 &&
        polygon.every(
          (v, i) =>
            v.length === 2 &&
            v.every(
              (n) => Number.isFinite(n) && Number.isSafeInteger(n * 32),
            ) &&
            (v[0] === polygon[(i + 1) % polygon.length][0] ||
              v[1] === polygon[(i + 1) % polygon.length][1]),
        ),
      "unsupported nominal orthogonal footprint",
    );
    // Exact open-cell decomposition preserves the concave notch; no convex hull.
    const xs = [...new Set(polygon.map((v) => v[0]))].sort((a, b) => a - b),
      ys = [...new Set(polygon.map((v) => v[1]))].sort((a, b) => a - b);
    for (let x = 1; x < xs.length; x++)
      for (let y = 1; y < ys.length; y++) {
        if (
          !inside(
            [(xs[x - 1] + xs[x]) / 2, (ys[y - 1] + ys[y]) / 2],
            polygon,
            false,
          )
        )
          continue;
        requireMatch(
          obstacles.length < 2048,
          "collision obstacle budget exceeded",
        );
        const vertices: Point[] = (
          [
            [xs[x - 1], ys[y - 1]],
            [xs[x], ys[y - 1]],
            [xs[x], ys[y]],
            [xs[x - 1], ys[y]],
          ] as Point[]
        ).map((v) => {
          const q = rotate(v, p.quarterTurns);
          return [q[0] + p.originUnits[0] / 32, q[1] + p.originUnits[1] / 32];
        });
        obstacles.push({
          id:
            "inset:" +
            constructionHash(
              new TextEncoder().encode(JSON.stringify([deckId, p.key, x, y])),
            ),
          definitionId: "inset250-r000-nominal-reservation",
          vertices,
        });
      }
  }
  return {
    placements: plan.placements,
    obstacles,
    collisionRepresentation:
      "conservative-nominal-structural-reservation" as const,
    physicalQualification: "unqualified" as const,
    staticWalkingQualification:
      "native-envelope-verified-game-acceptance-pending" as const,
  };
}
