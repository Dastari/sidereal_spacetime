import type { Gesture } from "./LayoutCanvas";
import type { LayoutPanelContext } from "./panel-context";
import type { Point } from "@sidereal/content/ship-layout";
import { structuralPartitionSupported } from "@sidereal/sim/layout-structure";
import { onSegment, samePoint } from "@sidereal/sim/layout-geometry";
import { placeTiles } from "./state";
import { uuid } from "./useLayout";
import { wallEdgeSpan } from "./wall-edge-placement";
import { placeStructuralOpening } from "./structural-edits";

export function applyLayoutGesture(g: Gesture, context: LayoutPanelContext) {
  const {
    doc,
    view,
    shape,
    selectedRoom,
    transform,
    commit,
    turns,
    mirrorX,
    mirrorY,
    result,
    editor,
    select,
    roomType,
    setTool,
    reuseNodes,
    channel,
    catalog,
    asset,
  } = context;
  if (!doc) return;
  const deckId = view.deckId,
    shapeName = g.shape ?? shape;
  if (g.tool === "select") {
    const delta: Point = [g.end[0] - g.start[0], g.end[1] - g.start[1]];
    if (selectedRoom) {
      commit((d) => ({
        ...d,
        rooms: d.rooms.map((r) =>
          r.id === selectedRoom.id
            ? { ...r, seed: [r.seed[0] + delta[0], r.seed[1] + delta[1]] }
            : r,
        ),
      }));
    } else transform(g.copy ? "copy" : "move", delta);
    return;
  }
  if (g.tool === "stamp" || g.tool === "fill") {
    const at: Point[] = [];
    if (g.tool === "fill") {
      for (
        let x = Math.min(g.start[0], g.end[0]);
        x <= Math.max(g.start[0], g.end[0]) && at.length < 2049;
        x += 64
      )
        for (
          let y = Math.min(g.start[1], g.end[1]);
          y <= Math.max(g.start[1], g.end[1]) && at.length < 2049;
          y += 64
        )
          at.push([x, y]);
    } else at.push(g.end);
    commit((d) =>
      placeTiles(d, at, shapeName, deckId, turns, mirrorX, mirrorY, uuid),
    );
    return;
  }
  if (g.tool === "partition") {
    if (samePoint(g.start, g.end)) return;
    if (
      !result ||
      !(doc.structure
        ? structuralPartitionSupported(doc, result, {
            id: "preview",
            deckId,
            a: g.start,
            b: g.end,
            seal: "design-sealed",
          })
        : wallEdgeSpan(result.edges, deckId, g.start, g.end))
    ) {
      editor.setError(
        "Walls must follow connected shared floor edges. Drag along the grid lines between floor tiles; tile centres and unsupported spans cannot hold walls.",
      );
      return;
    }
    const id = uuid();
    commit((d) => ({
      ...d,
      partitions: [
        ...d.partitions,
        { id, deckId, a: g.start, b: g.end, seal: "design-sealed" },
      ],
    }));
    select([id]);
    return;
  }
  if (g.tool === "door") {
    if (!doc.structure || !result) {
      editor.setError("Choose a hull size in Structure before placing doors.");
      return;
    }
    const wall = result.structure?.walls.find(
      (w) =>
        w.deckId === deckId &&
        (w.anchorId === g.entityId ||
          w.id === g.entityId ||
          onSegment(g.end, w.a, w.b)),
    );
    if (!wall) {
      editor.setError("Choose an interior or exterior wall to place a door.");
      return;
    }
    const id = uuid();
    try {
      const next = placeStructuralOpening(
        doc,
        result,
        wall.anchorId,
        g.end,
        editor.structuralTools,
        id,
      );
      commit(() => next);
      select([id]);
    } catch (e) {
      editor.setError(String(e));
    }
    return;
  }

  if (g.tool === "room") {
    const id = uuid();
    commit((d) => ({
      ...d,
      rooms: [
        ...d.rooms,
        {
          id,
          deckId,
          name: roomType,
          type: roomType,
          seed: g.start,
          boundaryIds: [],
          access: "crew",
          floorTheme: "Unassigned",
          wallTheme: "Unassigned",
        },
      ],
    }));
    select([id]);
    setTool("select");
    return;
  }
  if (g.tool === "hole") {
    const id = uuid();
    commit((d) => ({
      ...d,
      decks: d.decks.map((deck) =>
        deck.id === deckId
          ? { ...deck, holes: [...deck.holes, { id, seed: g.start }] }
          : deck,
      ),
    }));
    select([id]);
    setTool("select");
    return;
  }
  if (g.tool === "route") {
    if (samePoint(g.start, g.end)) return;
    commit((d) => {
      const node = (p: Point, direction: "in" | "out") => {
        const existing = reuseNodes
          ? d.nodes.find(
              (n) =>
                n.deckId === deckId &&
                n.channel === channel &&
                samePoint(n.point, p),
            )
          : undefined;
        if (existing) {
          existing.kind = "junction";
          existing.direction = "both";
          return existing.id;
        }
        const id = uuid();
        d.nodes.push({
          id,
          deckId,
          point: p,
          channel,
          kind: "endpoint",
          direction,
          medium: channel,
        });
        return id;
      };
      const from = node(g.start, "out"),
        to = node(g.end, "in"),
        path = [g.start, [g.end[0], g.start[1]] as Point, g.end].filter(
          (p, i, a) => i === 0 || !samePoint(p, a[i - 1]),
        );
      d.routes.push({
        id: uuid(),
        deckId,
        channel,
        from,
        to,
        path,
        capacity: null,
      });
      return d;
    });
    return;
  }
  if (g.tool === "object") {
    const selected = g.assetId
      ? catalog?.assets.find((a) => a.id === g.assetId)
      : asset;
    if (!selected) {
      editor.setError("Choose a catalog visual reference first.");
      return;
    }
    const id = uuid(),
      footprint: Point = [
        Math.max(
          16,
          Math.round((selected.bounds.max[0] - selected.bounds.min[0]) * 32),
        ),
        Math.max(
          16,
          Math.round((selected.bounds.max[1] - selected.bounds.min[1]) * 32),
        ),
      ],
      container = /crate|cargo|container/i.test(selected.label);
    commit((d) => ({
      ...d,
      fittings: [
        ...d.fittings,
        {
          id,
          deckId,
          definitionId: selected.id,
          revision: selected.visual?.sha256 ?? "legacy-visual-reference",
          position: g.end,
          quarterTurns: turns,
          reflected: false,
          footprint,
          clearance: 16,
          kind: container ? "container" : "equipment",
          container: container ? { columns: 4, rows: 3, contents: [] } : null,
        },
      ],
    }));
    select([id]);
  }
}
