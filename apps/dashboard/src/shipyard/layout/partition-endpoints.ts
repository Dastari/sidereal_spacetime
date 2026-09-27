import type { LayoutDocument, Point } from "@sidereal/content/ship-layout";
import { compileLayout } from "@sidereal/sim/layout-compiler";
import { onSegment, samePoint } from "@sidereal/sim/layout-geometry";
import { structuralPartitionSupported } from "@sidereal/sim/layout-structure";
import { wallEdgeSpan } from "./wall-edge-placement";

/** Translate the wall graph and its attached opening/treatment intent together. */
export function movePartitions(
  doc: LayoutDocument,
  ids: readonly string[],
  delta: Point,
): LayoutDocument {
  const selected = new Set(
    doc.partitions.filter((p) => ids.includes(p.id)).map((p) => p.id),
  );
  if (!selected.size || delta.every((n) => n === 0)) return doc;
  if (!delta.every(Number.isSafeInteger))
    throw Error("Move walls on the structural grid.");
  const next = structuredClone(doc);
  const translate = (p: Point): Point => [p[0] + delta[0], p[1] + delta[1]];
  next.partitions = next.partitions.map((p) =>
    selected.has(p.id) ? { ...p, a: translate(p.a), b: translate(p.b) } : p,
  );
  next.openings = next.openings.map((o) =>
    selected.has(o.partitionId)
      ? { ...o, a: translate(o.a), b: translate(o.b) }
      : o,
  );
  if (next.structure?.schema === "sidereal.layout-structure.v2")
    next.structure.boundaryTreatments = next.structure.boundaryTreatments.map(
      (t) => {
        if (t.source !== "partition" || !selected.has(t.sourceAnchorId))
          return t;
        if (t.native)
          throw Error(
            "This wall is bound to a pinned native assembly. Remove its native binding before moving it.",
          );
        return { ...t, a: translate(t.a), b: translate(t.b) };
      },
    );
  const topology = compileLayout(next);
  for (const wall of next.partitions.filter((p) => selected.has(p.id)))
    if (
      !(next.structure
        ? structuralPartitionSupported(next, topology, wall)
        : wallEdgeSpan(topology.edges, wall.deckId, wall.a, wall.b))
    )
      throw Error(
        "The whole wall must stay on supported internal floor grid lines.",
      );
  const errors = topology.diagnostics.filter((d) => d.severity === "error");
  if (errors.length)
    throw Error([...new Set(errors.map((d) => d.message))].join(" "));
  return next;
}

/** Edit one endpoint without moving attached openings or silently stretching native art. */
export function movePartitionEndpoint(
  doc: LayoutDocument,
  id: string,
  endpoint: "a" | "b",
  point: Point,
): LayoutDocument {
  const wall = doc.partitions.find((p) => p.id === id);
  if (!wall) throw Error("Select an internal wall to move its endpoint.");
  if (samePoint(wall[endpoint], point)) return doc;
  const nextWall = { ...wall, [endpoint]: point },
    topology = compileLayout(doc);
  if (
    !point.every(Number.isSafeInteger) ||
    !(doc.structure
      ? structuralPartitionSupported(doc, topology, nextWall)
      : wallEdgeSpan(topology.edges, wall.deckId, nextWall.a, nextWall.b))
  )
    throw Error(
      "Wall endpoints must stay on supported internal floor grid lines and leave a non-zero wall.",
    );
  for (const opening of doc.openings.filter((o) => o.partitionId === id))
    if (
      ![opening.a, opening.b].every((p) => onSegment(p, nextWall.a, nextWall.b))
    )
      throw Error(
        "This endpoint would detach a door or opening. Move or remove the opening first.",
      );
  const next = structuredClone(doc);
  next.partitions = next.partitions.map((p) => (p.id === id ? nextWall : p));
  if (next.structure?.schema === "sidereal.layout-structure.v2")
    next.structure.boundaryTreatments = next.structure.boundaryTreatments.map(
      (t) => {
        if (
          t.source !== "partition" ||
          t.sourceAnchorId !== id ||
          t.deckId !== wall.deckId
        )
          return t;
        const a = samePoint(t.a, wall[endpoint]) ? point : t.a,
          b = samePoint(t.b, wall[endpoint]) ? point : t.b;
        if (t.native && (!samePoint(a, t.a) || !samePoint(b, t.b)))
          throw Error(
            "This wall endpoint belongs to a pinned native assembly. Remove its native binding before resizing it.",
          );
        // Do not cross a finish seam, reverse its direction or discard a partial treatment.
        const forward =
          (b[0] - a[0]) * (nextWall.b[0] - nextWall.a[0]) +
          (b[1] - a[1]) * (nextWall.b[1] - nextWall.a[1]);
        const wasForward =
          (t.b[0] - t.a[0]) * (wall.b[0] - wall.a[0]) +
          (t.b[1] - t.a[1]) * (wall.b[1] - wall.a[1]);
        if (
          ![a, b].every((p) => onSegment(p, nextWall.a, nextWall.b)) ||
          forward * wasForward <= 0
        )
          throw Error(
            "This endpoint would detach or cross a wall treatment. Adjust that treatment first.",
          );
        return { ...t, a, b };
      },
    );
  const errors = compileLayout(next).diagnostics.filter(
    (d) => d.severity === "error",
  );
  if (errors.length)
    throw Error([...new Set(errors.map((d) => d.message))].join(" "));
  return next;
}
