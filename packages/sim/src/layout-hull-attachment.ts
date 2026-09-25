import interfaces from "@sidereal/content/ship-hull-interfaces.v1.json";
import type { PartAsset, PartPlacement } from "@sidereal/content/assembly";
import type { LayoutDocument, Point } from "@sidereal/content/ship-layout";
import type { CompiledLayout } from "./layout-compiler";
import { inside } from "./layout-geometry";

export const hullAttachmentProfile = (asset: PartAsset) =>
  interfaces.profiles.find(
    (p) => p.assetId === asset.id && p.nativeSha256 === asset.visual?.sha256,
  );
const rotate = (p: readonly number[], angle: number): Point => [
  p[0] * Math.cos(angle) - p[1] * Math.sin(angle),
  p[0] * Math.sin(angle) + p[1] * Math.cos(angle),
];

/** Match the authored mounting plane to a real perimeter. Geometry bounds and
 * decorative depth never participate in snapping. No scaling or hull nudges. */
export function snapHullAttachment(
  part: PartPlacement,
  asset: PartAsset,
  doc: LayoutDocument,
  compiled: CompiledLayout,
  deckId: string,
  maxDistanceM = 2,
): { part: PartPlacement; wallKey: string } | null {
  const profile = hullAttachmentProfile(asset);
  if (!profile) return null;
  const polygons = doc.tiles
    .filter((t) => t.deckId === deckId)
    .map((t) => t.vertices);
  let best:
    { part: PartPlacement; wallKey: string; distance: number } | undefined;
  for (const wall of compiled.walls) {
    if (wall.deckId !== deckId || wall.source !== "perimeter") continue;
    const a: Point = [wall.a[0] / 32, wall.a[1] / 32],
      b: Point = [wall.b[0] / 32, wall.b[1] / 32];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length + 1e-6 < profile.spanM) continue;
    const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const left: Point = [-tangent[1], tangent[0]];
    const inwardLeft = polygons.some((p) =>
      inside(
        [(middle[0] + left[0] / 64) * 32, (middle[1] + left[1] / 64) * 32],
        p,
      ),
    );
    const outward = left.map((v) => v * (inwardLeft ? -1 : 1));
    const angle =
      Math.atan2(outward[1], outward[0]) -
      Math.atan2(
        profile.outward[1],
        profile.outward[0] * (part.flipped ? -1 : 1),
      );
    const along =
      (part.position[0] - a[0]) * tangent[0] +
      (part.position[1] - a[1]) * tangent[1];
    const half = profile.spanM / 2;
    const offset = Math.max(
      half,
      Math.min(length - half, Math.round((along - half) * 32) / 32 + half),
    );
    const mount: Point = [
      a[0] + tangent[0] * offset,
      a[1] + tangent[1] * offset,
    ];
    const local = rotate(
      [
        profile.attachmentPointM[0] * (part.flipped ? -1 : 1),
        profile.attachmentPointM[1],
      ],
      angle,
    );
    const position: [number, number, number] = [
      mount[0] - local[0],
      mount[1] - local[1],
      ((doc.decks.find((d) => d.id === deckId)?.elevation ?? 0) +
        (doc.structure?.schema === "sidereal.layout-structure.v2"
          ? (doc.structure.deckProfiles.find((p) => p.deckId === deckId)
              ?.floorThickness ?? 6)
          : 6)) /
        32 -
        profile.attachmentPointM[2],
    ];
    const distance = Math.hypot(
      mount[0] - part.position[0],
      mount[1] - part.position[1],
    );
    if (distance > maxDistanceM || (best && distance >= best.distance))
      continue;
    best = {
      part: { ...part, position, rotation: angle },
      wallKey: wall.key,
      distance,
    };
  }
  return best ? { part: best.part, wallKey: best.wallKey } : null;
}
