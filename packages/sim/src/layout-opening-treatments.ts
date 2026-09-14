import type { BoundaryTreatmentOverride } from "@sidereal/content/layout-boundary-treatments";
import type {
  LayoutDocument,
  Opening,
  Point,
} from "@sidereal/content/ship-layout";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { cross, samePoint, stableStringify } from "./layout-geometry";

// Pure geometry must not import the construction compiler, which imports it.
const constructionHash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));

/** Preserve wall intent while an explicit opening edit cuts or restores its span.
 * Native assembly bindings cannot be stretched or divided by a topology edit. */
export function remapOpeningTreatments(
  document: LayoutDocument,
  next: Opening | undefined,
  id = next?.id,
): BoundaryTreatmentOverride[] {
  if (document.structure?.schema !== "sidereal.layout-structure.v2") return [];
  const old = document.openings.find((opening) => opening.id === id),
    opening = next ?? old;
  const original = document.structure.boundaryTreatments;
  if (!opening) return original;
  const axis =
    Math.abs(opening.b[0] - opening.a[0]) >=
    Math.abs(opening.b[1] - opening.a[1])
      ? 0
      : 1;
  const matching = (treatment: BoundaryTreatmentOverride) =>
    treatment.deckId === opening.deckId &&
    treatment.sourceAnchorId === opening.partitionId &&
    cross(opening.a, opening.b, treatment.a) === 0 &&
    cross(opening.a, opening.b, treatment.b) === 0;
  let treatments = [...original];
  const low = (a: Point, b: Point) => Math.min(a[axis], b[axis]);
  const high = (a: Point, b: Point) => Math.max(a[axis], b[axis]);
  if (
    old &&
    (!next ||
      low(old.a, old.b) < low(next.a, next.b) ||
      high(old.a, old.b) > high(next.a, next.b))
  ) {
    const ends = [old.a, old.b].map((point) =>
      treatments.filter(
        (treatment) =>
          matching(treatment) &&
          (samePoint(treatment.a, point) || samePoint(treatment.b, point)),
      ),
    );
    const signature = ({
      id: _id,
      a: _a,
      b: _b,
      ...metadata
    }: BoundaryTreatmentOverride) => stableStringify(metadata);
    if (ends.some((entries) => entries.length > 0)) {
      if (
        ends.some((entries) => entries.length !== 1) ||
        signature(ends[0][0]) !== signature(ends[1][0]) ||
        ends[0][0].native ||
        ends[1][0].native
      )
        throw Error(
          "Restoring this opening needs matching unpinned wall treatments on both ends.",
        );
      const first = ends[0][0],
        second = ends[1][0];
      const points = [first.a, first.b, second.a, second.b].sort(
        (a, b) => a[axis] - b[axis],
      );
      if (first.a[axis] > first.b[axis]) points.reverse();
      treatments = treatments.filter(
        (treatment) => treatment !== first && treatment !== second,
      );
      treatments.push({ ...first, a: points[0], b: points[points.length - 1] });
    }
  }
  if (!next) return treatments;
  return treatments.flatMap((treatment) => {
    if (!matching(treatment)) return [treatment];
    const start = low(treatment.a, treatment.b),
      end = high(treatment.a, treatment.b);
    const cutStart = Math.max(start, low(next.a, next.b)),
      cutEnd = Math.min(end, high(next.a, next.b));
    if (cutStart >= cutEnd) return [treatment];
    if (treatment.native)
      throw Error(
        "A pinned native wall assembly cannot be split by a new opening.",
      );
    const point = (at: number): Point => {
      const fraction =
        (at - treatment.a[axis]) / (treatment.b[axis] - treatment.a[axis]);
      return [
        treatment.a[0] + (treatment.b[0] - treatment.a[0]) * fraction,
        treatment.a[1] + (treatment.b[1] - treatment.a[1]) * fraction,
      ];
    };
    const intervals = [
      [start, cutStart],
      [cutEnd, end],
    ].filter(([a, b]) => a < b);
    if (treatment.a[axis] > treatment.b[axis]) intervals.reverse();
    return intervals.map(([a, b], index) => {
      const vertices =
        treatment.a[axis] <= treatment.b[axis]
          ? [point(a), point(b)]
          : [point(b), point(a)];
      return {
        ...treatment,
        id:
          index === 0
            ? treatment.id
            : "opening-wall-" +
              constructionHash(
                new TextEncoder().encode(
                  stableStringify([treatment.id, next.id, vertices]),
                ),
              ),
        a: vertices[0],
        b: vertices[1],
      };
    });
  });
}
