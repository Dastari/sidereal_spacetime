import type { LayoutDocument } from "@sidereal/content/ship-layout";
import {
  onSegment,
  properCross,
  samePoint,
  positiveOverlap,
} from "@sidereal/sim/layout-geometry";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import type { Point } from "@sidereal/content/ship-layout";

export interface LayoutDoorwayRequest {
  openingId: string;
  deckId: string;
  /** Door-frame origin in ship XY / up metres, already at the finished floor top. */
  originM: [number, number, number];
  yawRadians: number;
}
export interface LayoutDoorwayPlan {
  requests: LayoutDoorwayRequest[];
  /** Clip ordinary wall meshes over this full frame span, not just the aperture. */
  wallExclusions: {
    openingId: string;
    deckId: string;
    partitionId: string;
    a: Point;
    b: Point;
  }[];
  issues: { key: string; message: string }[];
}

/** Exact aperture adapter. No stretching, inferred seal status or collision grants. */
export function planLayoutDoorways(
  document: LayoutDocument,
  deckId: string,
): LayoutDoorwayPlan {
  const requests: LayoutDoorwayRequest[] = [],
    issues: LayoutDoorwayPlan["issues"] = [],
    wallExclusions: LayoutDoorwayPlan["wallExclusions"] = [];
  const deck = document.decks.find((d) => d.id === deckId);
  const profile =
    document.structure?.schema === "sidereal.layout-structure.v2"
      ? document.structure.deckProfiles.find((p) => p.deckId === deckId)
      : undefined;
  const seen = new Set<string>();
  const walls =
    document.tiles.length &&
    document.openings.some(
      (opening) => opening.deckId === deckId && opening.kind !== "passage",
    )
      ? compileLayout(document).walls
      : [];
  const reservation = (a: Point, b: Point, halfWidth: number): Point[] => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = (-(b[1] - a[1]) / length) * halfWidth,
      ny = ((b[0] - a[0]) / length) * halfWidth;
    return [
      [a[0] - nx, a[1] - ny],
      [b[0] - nx, b[1] - ny],
      [b[0] + nx, b[1] + ny],
      [a[0] + nx, a[1] + ny],
    ];
  };
  for (const opening of document.openings) {
    if (opening.deckId !== deckId || opening.kind === "passage") continue;
    const fail = (message: string) => issues.push({ key: opening.id, message });
    if (!opening.id || seen.has(opening.id)) {
      fail("Door opening identity must be unique");
      continue;
    }
    seen.add(opening.id);
    const dx = opening.b[0] - opening.a[0],
      dy = opening.b[1] - opening.a[1];
    const length = Math.hypot(dx, dy);
    const partition = document.partitions.find(
      (p) => p.id === opening.partitionId && p.deckId === deckId,
    );
    if (
      !deck ||
      profile?.clearHeight !== 96 ||
      profile.floorThickness !== 6 ||
      opening.sill !== 0 ||
      length !== 40 ||
      (dx !== 0 && dy !== 0)
    ) {
      fail(
        "Native door needs a 1.25 m clear opening and a 3 m wall above the 187.5 mm floor",
      );
      continue;
    }
    if (
      !partition ||
      !onSegment(opening.a, partition.a, partition.b) ||
      !onSegment(opening.b, partition.a, partition.b)
    ) {
      fail(
        "Native door needs a matching straight partition and reserved 375 mm jambs",
      );
      continue;
    }
    const a: [number, number] = [
      opening.a[0] - (dx / length) * 12,
      opening.a[1] - (dy / length) * 12,
    ];
    const b: [number, number] = [
      opening.b[0] + (dx / length) * 12,
      opening.b[1] + (dy / length) * 12,
    ];
    if (
      !onSegment(a, partition.a, partition.b) ||
      !onSegment(b, partition.a, partition.b)
    ) {
      fail("Door frame requires 375 mm of wall beyond both aperture ends");
      continue;
    }
    const reservations =
      document.structure?.schema === "sidereal.layout-structure.v2"
        ? document.structure.boundaryTreatments.filter(
            (treatment) =>
              treatment.deckId === deckId &&
              treatment.source === "partition" &&
              treatment.sourceAnchorId === partition.id &&
              treatment.reservationSide === "center" &&
              (treatment.heightUnits ?? profile.clearHeight) === 96 &&
              ["auto", "bulkhead"].includes(treatment.treatment),
          )
        : [];
    const covered = (start: Point, end: Point) => {
      const axis = dx === 0 ? 1 : 0;
      const points = [
        start,
        end,
        ...reservations
          .flatMap((treatment) => [treatment.a, treatment.b])
          .filter((point) => onSegment(point, start, end)),
      ].sort((p, q) => p[axis] - q[axis]);
      return points.slice(1).every((point, i) => {
        const middle: Point = [
          (points[i][0] + point[0]) / 2,
          (points[i][1] + point[1]) / 2,
        ];
        return (
          samePoint(points[i], point) ||
          reservations.some((treatment) =>
            onSegment(middle, treatment.a, treatment.b),
          )
        );
      });
    };
    if (!covered(a, opening.a) || !covered(opening.b, b)) {
      fail(
        "Native door frame needs explicit centered 250 mm wall reservations at both jambs",
      );
      continue;
    }
    const insideFrame = (point: Point) =>
      onSegment(point, a, b) && !samePoint(point, a) && !samePoint(point, b);
    if (
      document.partitions.some(
        (other) =>
          other.id !== partition.id &&
          other.deckId === deckId &&
          (properCross(a, b, other.a, other.b) ||
            insideFrame(other.a) ||
            insideFrame(other.b)),
      )
    ) {
      fail("Door frame overlaps a wall junction");
      continue;
    }
    if (
      document.openings.some((other) => {
        if (
          other.id === opening.id ||
          other.deckId !== deckId ||
          other.partitionId !== opening.partitionId
        )
          return false;
        const x = other.b[0] - other.a[0],
          y = other.b[1] - other.a[1],
          n = Math.hypot(x, y);
        if (!n) return false;
        const jamb = other.kind === "passage" ? 0 : 12;
        const axis = dx === 0 ? 1 : 0;
        const otherA = other.a[axis] - ((axis === 0 ? x : y) / n) * jamb;
        const otherB = other.b[axis] + ((axis === 0 ? x : y) / n) * jamb;
        return (
          Math.min(Math.max(a[axis], b[axis]), Math.max(otherA, otherB)) >
          Math.max(Math.min(a[axis], b[axis]), Math.min(otherA, otherB))
        );
      })
    ) {
      fail("Door frame overlaps another opening or its reserved jambs");
      continue;
    }
    const frame = reservation(a, b, 4);
    if (
      walls.some(
        (wall) =>
          wall.deckId === deckId &&
          wall.anchorId !== partition.id &&
          !["open", "open-bay"].includes(wall.treatment?.intent ?? "auto") &&
          positiveOverlap(
            frame,
            reservation(
              wall.a,
              wall.b,
              wall.source === "partition" &&
                wall.treatment?.reservationSide === "center"
                ? 4
                : 8,
            ),
          ),
      )
    ) {
      fail(
        "Full native door frame overlaps another wall reservation; move it clear of the corner",
      );
      continue;
    }
    requests.push({
      openingId: opening.id,
      deckId,
      originM: [
        // Internal walls straddle the partition centerline; this native frame
        // occupies local Y=0..0.25 m, so put its outer face 125 mm behind it.
        a[0] / 32 + (dy / length) * 0.125,
        a[1] / 32 - (dx / length) * 0.125,
        (deck.elevation + profile.floorThickness) / 32,
      ],
      yawRadians: Math.atan2(dy, dx),
    });
    wallExclusions.push({
      openingId: opening.id,
      deckId,
      partitionId: opening.partitionId,
      a,
      b,
    });
  }
  return { requests, issues, wallExclusions };
}
