/**
 * SVG plan editor for prefab ships. Plan frame: +X fore points right, +Y port points up,
 * 1 m cells with 5 m major lines. The world group is drawn in metres; strokes do not scale.
 */
import { G, placedTilePolygon, type Pt, type ShapeTilePlacement } from "@sidereal/content/construction-grammar";
import {
  deriveInterior,
  placeMount,
  type PrefabComponentCatalog,
  type PrefabMount,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { memo, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import {
  addMount,
  addRoom,
  addSkylight,
  eraseTiles,
  nudgeSelection,
  paintTiles,
  placeEdge,
  tileIndexAt,
  type CommandResult,
  type PrefabSelection,
} from "./commands";
import { geometriesOf } from "./derive";
import { hitTest, type PrefabLayers } from "./hit-test";
import type { ToolState } from "./keymap";
import { mountColour, ROOM_COLOURS } from "./palette";
import {
  checkEdge,
  checkMount,
  checkRoom,
  checkSkylight,
  checkTile,
  edgeCells,
  roomRectFromDrag,
  skylightCandidate,
  snapEdge,
  snapMount,
  tileCandidate,
  type PlacementCheck,
} from "./snapping";
import { mirrorEdge, mirrorRoom, mirrorSkylight, mirrorTile, snapHalf } from "./symmetry";

type Doc = ShipPrefabDocumentV1;

export interface PlanView {
  cx: number;
  cy: number;
  /** Pixels per metre. */
  s: number;
}

export interface PlanCanvasHandle {
  fit(): void;
  focus(p: Pt): void;
  zoom(factor: number): void;
}

export interface PlanStatus {
  text: string;
  tone: "ok" | "bad" | "info";
}

type Stroke =
  | { kind: "pan"; x: number; y: number; view: PlanView }
  | { kind: "paint"; tiles: ShapeTilePlacement[]; keys: Set<string> }
  | { kind: "erase"; points: Pt[] }
  | { kind: "room"; a: Pt; b: Pt }
  | { kind: "move"; sel: PrefabSelection; start: Pt; delta: [number, number] };

const path = (loop: readonly Pt[]) => `M${loop.map((p) => `${p[0]} ${p[1]}`).join("L")}Z`;
const rectPath = (r: readonly number[]) => `M${r[0]} ${r[1]}H${r[2]}V${r[3]}H${r[0]}Z`;

interface Props {
  doc: Doc;
  catalog: PrefabComponentCatalog;
  tools: ToolState;
  selection: PrefabSelection | null;
  select: (s: PrefabSelection | null) => void;
  layers: PrefabLayers;
  commit: (label: string, doc: Doc) => void;
  onStatus: (s: PlanStatus | null) => void;
  handle: Ref<PlanCanvasHandle>;
}

function PlanCanvas({ doc, catalog, tools, selection, select, layers, commit, onStatus, handle }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [view, setView] = useState<PlanView>({ cx: 10, cy: 5, s: 28 });
  const [hover, setHover] = useState<Pt | null>(null);
  const [stroke, setStroke] = useState<Stroke | null>(null);
  const space = useRef(false);
  const fitted = useRef<string | null>(null);
  const mirror = tools.symmetry ? tools.centreline : null;

  // ------------------------------------------------------------ preview document during a drag
  const shown = useMemo<Doc>(() => {
    if (!stroke) return doc;
    if (stroke.kind === "paint") return paintTiles(doc, tools.volume, stroke.tiles, mirror).doc;
    if (stroke.kind === "erase") return eraseTiles(doc, tools.volume, stroke.points, mirror);
    if (stroke.kind === "move" && (stroke.delta[0] || stroke.delta[1])) return nudgeSelection(doc, stroke.sel, stroke.delta[0], stroke.delta[1]).doc;
    return doc;
  }, [doc, stroke, tools.volume, mirror]);
  const geoms = useMemo(() => geometriesOf(shown), [shown]);
  const interior = useMemo(() => deriveInterior(shown, 0, catalog), [shown, catalog]);
  const mounts = useMemo(() => shown.mounts.map((m) => placeMount(m, catalog.get(m.component), geoms)), [shown, catalog, geoms]);

  // ------------------------------------------------------------ view
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(50, e.contentRect.width), h: Math.max(50, e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const toWorld = (clientX: number, clientY: number): Pt => {
    const r = svg.current!.getBoundingClientRect();
    return [view.cx + (clientX - r.left - size.w / 2) / view.s, view.cy - (clientY - r.top - size.h / 2) / view.s];
  };
  const X = (x: number) => size.w / 2 + (x - view.cx) * view.s;
  const Y = (y: number) => size.h / 2 - (y - view.cy) * view.s;

  const fit = () => {
    const xs = [...geoms.flatMap((g) => (g.volume.tiles.length ? [g.bounds[0], g.bounds[2]] : [])), ...mounts.flatMap((m) => [m.rect[0], m.rect[2]])];
    const ys = [...geoms.flatMap((g) => (g.volume.tiles.length ? [g.bounds[1], g.bounds[3]] : [])), ...mounts.flatMap((m) => [m.rect[1], m.rect[3]])];
    if (!xs.length) return setView({ cx: 0, cy: 0, s: 28 });
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const s = Math.max(4, Math.min(90, (size.w - 80) / (x1 - x0 + 2), (size.h - 90) / (y1 - y0 + 2)));
    setView({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s });
  };
  useImperativeHandle(handle, () => ({
    fit,
    focus: (p) => setView((v) => ({ cx: p[0], cy: p[1], s: Math.max(v.s, 24) })),
    zoom: (f) => setView((v) => ({ ...v, s: Math.max(3, Math.min(160, v.s * f)) })),
  }));
  // Fit once per opened document, after the first measured layout.
  useEffect(() => {
    if (fitted.current === doc.id || size.w <= 50) return;
    fitted.current = doc.id;
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, size.w, size.h]);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        const s = Math.max(3, Math.min(160, v.s * Math.exp(-e.deltaY * 0.0015)));
        const wx = v.cx + (px - size.w / 2) / v.s;
        const wy = v.cy - (py - size.h / 2) / v.s;
        return { s, cx: wx - (px - size.w / 2) / s, cy: wy + (py - size.h / 2) / s };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [size.w, size.h]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target as HTMLElement).closest("input,textarea,select")) space.current = true;
      if (e.key === "Escape") setStroke(null);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ------------------------------------------------------------ ghost for the current tool
  const spec = tools.component ? catalog.get(tools.component) : undefined;
  const hoverKey = hover ? `${hover[0].toFixed(2)},${hover[1].toFixed(2)}` : "";
  // validateMount per snapped candidate, not per pixel of pointer motion.
  const mountChecks = useRef(new WeakMap<Doc, Map<string, ReturnType<typeof checkMount>>>());
  const cachedMountCheck = (m: PrefabMount) => {
    let map = mountChecks.current.get(shown);
    if (!map) mountChecks.current.set(shown, (map = new Map()));
    const k = JSON.stringify([m, mirror]);
    let c = map.get(k);
    if (!c) map.set(k, (c = checkMount(shown, catalog, geoms, m, mirror)));
    return c;
  };
  const ghost = useMemo(() => {
    if (!hover || stroke?.kind === "pan" || stroke?.kind === "move") return null;
    type Ghost = { check: PlacementCheck; paths: string[]; lines?: [Pt, Pt][]; label: string };
    const out = (g: Ghost) => g;
    switch (tools.tool) {
      case "hull": {
        const t = tileCandidate(hover, tools.shape, tools.rot, tools.reflected);
        const list = [t];
        if (mirror !== null) list.push(mirrorTile(t, mirror));
        const check = checkTile(shown, tools.volume, t);
        return out({ check, paths: list.map((x) => path(placedTilePolygon(x))), label: `${G.shapeTiles[tools.shape].label} at ${t.x}, ${t.y}` });
      }
      case "erase": {
        const v = shown.volumes.find((x) => x.id === tools.volume);
        if (!v) return null;
        const pts = mirror !== null ? [hover, [hover[0], 2 * mirror - hover[1]] as Pt] : [hover];
        const idx = pts.map((p) => tileIndexAt(v, p[0], p[1])).filter((i) => i >= 0);
        return out({ check: { ok: idx.length > 0, reason: idx.length ? undefined : "No tile of this volume here" }, paths: idx.map((i) => path(placedTilePolygon(v.tiles[i]))), label: "Erase tile" });
      }
      case "room": {
        const rect = stroke?.kind === "room" ? roomRectFromDrag(stroke.a, stroke.b) : roomRectFromDrag(hover, hover);
        const rects = [rect];
        if (mirror !== null) {
          const m = mirrorRoom({ rect }, mirror).rect;
          if (m.join() !== rect.join()) rects.push(m);
        }
        const check = stroke?.kind === "room" ? checkRoom(shown, rect, tools.roomType) : { ok: true };
        return out({ check, paths: rects.map(rectPath), label: `${tools.roomType} ${rect[2] - rect[0]} x ${rect[3] - rect[1]} m` });
      }
      case "edge": {
        const seg = snapEdge(hover, edgeCells(tools.edgeType));
        const lines: [Pt, Pt][] = [[seg.a, seg.b]];
        if (mirror !== null) {
          const m = mirrorEdge(seg, mirror);
          lines.push([m.a, m.b]);
        }
        const check = checkEdge(shown, catalog, seg.a, seg.b, tools.edgeType);
        return out({ check, paths: [], lines, label: `${G.edgeTypes[tools.edgeType].label} ${seg.a.join(",")} to ${seg.b.join(",")}` });
      }
      case "mount": {
        if (!spec) return out({ check: { ok: false, reason: "Pick a component from the palette" }, paths: [], label: "Mount" });
        const cand = snapMount(shown, geoms, spec, tools.mountMode, hover, tools.facing);
        if (!cand) return out({ check: { ok: false, reason: tools.mountMode === "edge" ? "Edge mounts need a walkable deck hull" : "No hull face to mount on" }, paths: [], label: spec.label });
        const m: PrefabMount = { id: "ghost", ...cand };
        const check = cachedMountCheck(m);
        const rects = [placeMount(m, spec, geoms).rect];
        if (check.mirrored) rects.push(placeMount(check.mirrored, spec, geoms).rect);
        const where = cand.attach === "top" ? "roof" : cand.attach === "interior" ? `floor, facing ${cand.normal}` : `${cand.normal} face`;
        return out({ check, paths: rects.map(rectPath), label: `${spec.label} on ${where} at ${cand.at.join(", ")}` });
      }
      case "skylight": {
        const c = skylightCandidate(hover, tools.skylight);
        const list = [c];
        if (mirror !== null) {
          const m = mirrorSkylight({ id: "_", ...c }, mirror);
          if (m.at[1] !== c.at[1]) list.push(m);
        }
        const check = checkSkylight(shown, geoms, c.at, c.size, catalog);
        return out({ check, paths: list.map((s) => rectPath([s.at[0], s.at[1], s.at[0] + s.size[0], s.at[1] + s.size[1]])), label: `Skylight ${c.size.join(" x ")}` });
      }
      default:
        return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverKey, tools, shown, geoms, stroke, catalog, spec, mirror]);
  const hovered = useMemo(
    () => (tools.tool === "select" && hover && !stroke ? hitTest(shown, catalog, geoms, hover, layers, 6 / view.s, undefined) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hoverKey, tools.tool, shown, geoms, layers, stroke, view.s],
  );

  useEffect(() => {
    if (!ghost) onStatus(null);
    else onStatus(ghost.check.ok ? { text: ghost.label, tone: "ok" } : { text: ghost.check.reason ?? "Not allowed here", tone: "bad" });
  }, [ghost, onStatus]);

  // ------------------------------------------------------------ pointer handling
  const apply = (label: string, r: CommandResult) => {
    if (r.doc !== doc) commit(label, r.doc);
    if (r.select) select(r.select);
    if (r.error) onStatus({ text: r.error, tone: "bad" });
  };
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    svg.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toWorld(e.clientX, e.clientY);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && space.current)) {
      setStroke({ kind: "pan", x: e.clientX, y: e.clientY, view });
      return;
    }
    if (e.button !== 0) return;
    switch (tools.tool) {
      case "select": {
        const hit = hitTest(doc, catalog, geoms, p, layers, 6 / view.s, selection?.kind === "tile" ? selection.volume : undefined);
        select(hit);
        if (hit && (hit.kind === "room" || hit.kind === "mount" || hit.kind === "skylight")) setStroke({ kind: "move", sel: hit, start: p, delta: [0, 0] });
        else if (!hit) setStroke({ kind: "pan", x: e.clientX, y: e.clientY, view });
        return;
      }
      case "hull": {
        const t = tileCandidate(p, tools.shape, tools.rot, tools.reflected);
        setStroke({ kind: "paint", tiles: [t], keys: new Set([`${t.x},${t.y}`]) });
        return;
      }
      case "erase":
        setStroke({ kind: "erase", points: [p] });
        return;
      case "room":
        setStroke({ kind: "room", a: p, b: p });
        return;
      case "edge": {
        const seg = snapEdge(p, edgeCells(tools.edgeType));
        const check = checkEdge(doc, catalog, seg.a, seg.b, tools.edgeType);
        const exists = doc.edges.some((x) => x.type === tools.edgeType && [x.a.join(), x.b.join()].sort().join() === [seg.a.join(), seg.b.join()].sort().join());
        if (!check.ok && !exists) return onStatus({ text: check.reason!, tone: "bad" });
        apply(exists ? "Remove edge" : `Place ${G.edgeTypes[tools.edgeType].label.toLowerCase()}`, placeEdge(doc, { ...seg, type: tools.edgeType }, mirror));
        return;
      }
      case "mount": {
        if (!spec) return onStatus({ text: "Pick a component from the palette", tone: "bad" });
        const cand = snapMount(doc, geoms, spec, tools.mountMode, p, tools.facing);
        if (!cand) return;
        const check = checkMount(doc, catalog, geoms, { id: "ghost", ...cand }, mirror);
        if (!check.ok) return onStatus({ text: check.reason!, tone: "bad" });
        apply(`Place ${spec.label}`, addMount(doc, cand, catalog, mirror));
        return;
      }
      case "skylight": {
        const c = skylightCandidate(p, tools.skylight);
        const check = checkSkylight(doc, geoms, c.at, c.size, catalog);
        if (!check.ok) return onStatus({ text: check.reason!, tone: "bad" });
        apply("Add skylight", addSkylight(doc, c, mirror));
        return;
      }
    }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toWorld(e.clientX, e.clientY);
    setHover(p);
    if (!stroke) return;
    if (stroke.kind === "pan") {
      setView({ ...stroke.view, cx: stroke.view.cx - (e.clientX - stroke.x) / stroke.view.s, cy: stroke.view.cy + (e.clientY - stroke.y) / stroke.view.s });
    } else if (stroke.kind === "paint") {
      const t = tileCandidate(p, tools.shape, tools.rot, tools.reflected);
      const k = `${t.x},${t.y}`;
      if (!stroke.keys.has(k)) setStroke({ kind: "paint", tiles: [...stroke.tiles, t], keys: new Set([...stroke.keys, k]) });
    } else if (stroke.kind === "erase") {
      const last = stroke.points[stroke.points.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.25) setStroke({ kind: "erase", points: [...stroke.points, p] });
    } else if (stroke.kind === "room") setStroke({ ...stroke, b: p });
    else if (stroke.kind === "move") {
      const step = stroke.sel.kind === "mount" ? snapHalf : Math.round;
      const delta: [number, number] = [step(p[0] - stroke.start[0]), step(p[1] - stroke.start[1])];
      if (delta[0] !== stroke.delta[0] || delta[1] !== stroke.delta[1]) setStroke({ ...stroke, delta });
    }
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    const s = stroke;
    setStroke(null);
    if (!s) return;
    if (s.kind === "paint") apply(`Paint ${s.tiles.length} tile${s.tiles.length === 1 ? "" : "s"}`, paintTiles(doc, tools.volume, s.tiles, mirror));
    else if (s.kind === "erase") {
      const next = eraseTiles(doc, tools.volume, s.points, mirror);
      if (next !== doc) commit("Erase tiles", next);
    } else if (s.kind === "room") {
      const rect = roomRectFromDrag(s.a, s.b);
      const check = checkRoom(doc, rect, tools.roomType);
      if (!check.ok) return onStatus({ text: check.reason!, tone: "bad" });
      const label = (tools.roomLabel || tools.roomType).toUpperCase().replace(/[^A-Z0-9 ._/'&-]/g, "").slice(0, 32) || "ROOM";
      apply(`Add ${tools.roomType}`, addRoom(doc, { label, type: tools.roomType, rect }, mirror));
    } else if (s.kind === "move" && (s.delta[0] || s.delta[1])) {
      apply(`Move ${s.sel.kind}`, nudgeSelection(doc, s.sel, s.delta[0], s.delta[1]));
    }
  };

  // ------------------------------------------------------------ drawing
  const T = `translate(${size.w / 2 - view.cx * view.s} ${size.h / 2 + view.cy * view.s}) scale(${view.s} ${-view.s})`;
  const wx0 = Math.floor(view.cx - size.w / 2 / view.s) - 1;
  const wx1 = Math.ceil(view.cx + size.w / 2 / view.s) + 1;
  const wy0 = Math.floor(view.cy - size.h / 2 / view.s) - 1;
  const wy1 = Math.ceil(view.cy + size.h / 2 / view.s) + 1;
  const minor = view.s >= 7;
  const gridMinor: string[] = [];
  const gridMajor: string[] = [];
  for (let x = wx0; x <= wx1; x++) (x % 5 === 0 ? gridMajor : minor ? gridMinor : []).push(`M${x} ${wy0}V${wy1}`);
  for (let y = wy0; y <= wy1; y++) (y % 5 === 0 ? gridMajor : minor ? gridMinor : []).push(`M${wx0} ${y}H${wx1}`);

  const limit = G.blueprintSizeClasses[shown.sizeClass];
  const structural = geoms.filter((g) => g.volume.tiles.length);
  const sx0 = structural.length ? Math.min(...structural.map((g) => g.bounds[0])) : 0;
  const sy0 = structural.length ? Math.min(...structural.map((g) => g.bounds[1])) : 0;
  const sx1 = structural.length ? Math.max(...structural.map((g) => g.bounds[2])) : 0;
  const sy1 = structural.length ? Math.max(...structural.map((g) => g.bounds[3])) : 0;
  const over = sx1 - sx0 > limit.maxCells[0] || sy1 - sy0 > limit.maxCells[1];

  const floorsByRoom = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of interior.floors) m.set(f.room, (m.get(f.room) ?? "") + `M${f.cell[0]} ${f.cell[1]}h1v1h-1Z`);
    return m;
  }, [interior]);

  const activeVolume = shown.volumes.find((v) => v.id === tools.volume);
  const showTiles = (tools.tool === "hull" || tools.tool === "erase" || selection?.kind === "tile") && layers.hull;
  const tileVolume = selection?.kind === "tile" && tools.tool === "select" ? shown.volumes.find((v) => v.id === selection.volume) : activeVolume;

  const selectionShape = (sel: PrefabSelection | null): { d?: string; line?: [Pt, Pt] } | null => {
    if (!sel) return null;
    switch (sel.kind) {
      case "volume": {
        const g = geoms.find((x) => x.volume.id === sel.id);
        return g?.outline ? { d: [path(g.outline.outer), ...g.outline.holes.map(path)].join("") } : null;
      }
      case "tile": {
        const t = shown.volumes.find((v) => v.id === sel.volume)?.tiles[sel.index];
        return t ? { d: path(placedTilePolygon(t)) } : null;
      }
      case "room": {
        const r = shown.rooms.find((x) => x.id === sel.id);
        return r ? { d: rectPath(r.rect) } : null;
      }
      case "edge": {
        const e = shown.edges.find((x) => x.id === sel.id);
        return e ? { line: [e.a, e.b] } : null;
      }
      case "mount": {
        const m = mounts.find((x) => x.mount.id === sel.id);
        return m ? { d: rectPath(m.rect) } : null;
      }
      case "skylight": {
        const s = shown.skylights.find((x) => x.id === sel.id);
        return s ? { d: rectPath([s.at[0], s.at[1], s.at[0] + s.size[0], s.at[1] + s.size[1]]) } : null;
      }
    }
  };
  const selShape = selectionShape(selection);
  const hoverShape = hovered && JSON.stringify(hovered) !== JSON.stringify(selection) ? selectionShape(hovered) : null;
  const cursor = stroke?.kind === "pan" ? "grabbing" : tools.tool === "select" ? (hovered ? "pointer" : "grab") : "crosshair";

  return (
    <div className="prefab-plan-wrap">
      <svg
        ref={svg}
        className="prefab-plan"
        role="application"
        aria-label="Ship plan editor. Fore points right, port points up."
        tabIndex={0}
        data-tool={tools.tool}
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setStroke(null)}
        onPointerLeave={() => {
          if (!stroke) setHover(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={T} className="pf-world">
          <path className="pf-grid-minor" d={gridMinor.join("")} />
          <path className="pf-grid-major" d={gridMajor.join("")} />
          <path className="pf-axis" d={`M0 ${wy0}V${wy1}M${wx0} 0H${wx1}`} />
          {structural.length > 0 && (
            <path
              className={`pf-limit${over ? " over" : ""}`}
              d={rectPath([sx0, sy0, sx0 + limit.maxCells[0], sy0 + limit.maxCells[1]])}
            />
          )}
          {layers.hull &&
            [...geoms]
              .sort((a, b) => a.z[1] - b.z[1])
              .map((g) =>
                g.outline ? (
                  <path
                    key={g.volume.id}
                    className={`pf-volume ${g.volume.kind} h-${g.volume.height}${g.volume.id === tools.volume && (tools.tool === "hull" || tools.tool === "erase") ? " active" : ""}`}
                    d={[path(g.outline.outer), ...g.outline.holes.map(path)].join("")}
                  />
                ) : null,
              )}
          {showTiles && tileVolume && (
            <path className="pf-tiles" d={tileVolume.tiles.map((t) => path(placedTilePolygon(t))).join("")} />
          )}
          {layers.hull && geoms.filter((g) => g.islands > 1).map((g) => (
            <path key={`isl-${g.volume.id}`} className="pf-islands" d={g.volume.tiles.map((t) => path(placedTilePolygon(t))).join("")} />
          ))}
          {layers.rooms &&
            shown.rooms.map((r) => (
              <path key={r.id} className="pf-room" style={{ fill: ROOM_COLOURS[r.type] ?? "#3a4656" }} d={floorsByRoom.get(r.id) ?? ""} />
            ))}
          {layers.rooms && shown.rooms.map((r) => <path key={`o-${r.id}`} className="pf-room-rect" d={rectPath(r.rect)} />)}
          {layers.hull && shown.skylights.map((s) => <path key={s.id} className="pf-skylight" d={rectPath([s.at[0], s.at[1], s.at[0] + s.size[0], s.at[1] + s.size[1]])} />)}
          {layers.walls && (
            <>
              <path className="pf-exterior" d={[...interior.exteriorWalls, ...interior.exteriorSlopes].map((w) => `M${w.a[0]} ${w.a[1]}L${w.b[0]} ${w.b[1]}`).join("")} />
              <path className="pf-partition" d={interior.partitions.filter((w) => w.type === "wall.full").map((w) => `M${w.a[0]} ${w.a[1]}L${w.b[0]} ${w.b[1]}`).join("")} />
              <path className="pf-glazed" d={interior.partitions.filter((w) => w.type === "wall.glazed" || w.type === "window").map((w) => `M${w.a[0]} ${w.a[1]}L${w.b[0]} ${w.b[1]}`).join("")} />
              <path className="pf-half" d={interior.partitions.filter((w) => w.type === "wall.half").map((w) => `M${w.a[0]} ${w.a[1]}L${w.b[0]} ${w.b[1]}`).join("")} />
              <path className="pf-door" d={interior.doors.filter((d) => !d.exterior).map((d) => `M${d.a[0]} ${d.a[1]}L${d.b[0]} ${d.b[1]}`).join("")} />
              <path className="pf-door exterior" d={interior.doors.filter((d) => d.exterior).map((d) => `M${d.a[0]} ${d.a[1]}L${d.b[0]} ${d.b[1]}`).join("")} />
              <path className="pf-open" d={shown.edges.filter((e) => e.type === "open").map((e) => `M${e.a[0]} ${e.a[1]}L${e.b[0]} ${e.b[1]}`).join("")} />
              <path className="pf-post" d={interior.posts.map((p) => rectPath([p[0] - 0.09, p[1] - 0.09, p[0] + 0.09, p[1] + 0.09])).join("")} />
            </>
          )}
          {layers.sockets && (
            <>
              <path className="pf-socket" d={interior.sockets.map((so) => rectPath([so.at[0], so.at[1], so.at[0] + so.size[0], so.at[1] + so.size[1]])).join("")} />
              {interior.station && <circle className="pf-station" cx={interior.station.at[0]} cy={interior.station.at[1]} r={0.22} />}
            </>
          )}
          {layers.mounts &&
            mounts.map((m) => {
              const c = mountColour(m.spec?.category);
              const inset = m.mount.attach === "interior" ? 0.06 : 0.03;
              return (
                <path
                  key={m.mount.id}
                  className={`pf-mount ${m.mount.attach}${m.spec ? "" : " unknown"}`}
                  style={{ fill: c, stroke: c }}
                  d={rectPath([m.rect[0] + inset, m.rect[1] + inset, m.rect[2] - inset, m.rect[3] - inset])}
                />
              );
            })}
          {mirror !== null && <path className="pf-symmetry" d={`M${wx0} ${mirror}H${wx1}`} />}
          {hoverShape?.d && <path className="pf-hover" d={hoverShape.d} />}
          {hoverShape?.line && <path className="pf-hover-line" d={`M${hoverShape.line[0][0]} ${hoverShape.line[0][1]}L${hoverShape.line[1][0]} ${hoverShape.line[1][1]}`} />}
          {selShape?.d && <path className="pf-selection" d={selShape.d} />}
          {selShape?.line && <path className="pf-selection-line" d={`M${selShape.line[0][0]} ${selShape.line[0][1]}L${selShape.line[1][0]} ${selShape.line[1][1]}`} />}
          {ghost && (
            <g className={`pf-ghost ${ghost.check.ok ? "ok" : "bad"}${tools.tool === "erase" ? " erase" : ""}`}>
              {ghost.paths.map((d, i) => (
                <path key={i} d={d} />
              ))}
              {ghost.lines?.map(([a, b], i) => <path key={`l${i}`} className="line" d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} />)}
            </g>
          )}
        </g>
        <g className="pf-labels" aria-hidden="true">
          {layers.rooms &&
            view.s >= 9 &&
            interior.labels.map((l) => (
              <text key={l.room} x={X(l.at[0])} y={Y(l.at[1])} className="pf-room-label" style={{ fontSize: Math.min(13, Math.max(9, view.s * 0.34)) }}>
                {l.text}
              </text>
            ))}
          {layers.mounts &&
            view.s >= 26 &&
            mounts.map((m) => (
              <text key={m.mount.id} x={X((m.rect[0] + m.rect[2]) / 2)} y={Y((m.rect[1] + m.rect[3]) / 2)} className="pf-mount-label">
                {m.mount.component.split(".")[0].slice(0, 10)}
              </text>
            ))}
          {structural.length > 0 && (
            <text x={X(sx0) + 4} y={Y(sy0 + limit.maxCells[1]) - 6} className={`pf-limit-label${over ? " over" : ""}`}>
              Size {shown.sizeClass} limit {limit.maxCells[0]} x {limit.maxCells[1]} m
            </text>
          )}
        </g>
      </svg>
      <div className="prefab-compass" aria-hidden="true">
        <span className="fore">Fore</span>
        <span className="port">Port</span>
      </div>
      <div className="prefab-cursor" aria-hidden="true">
        {hover ? `x ${hover[0].toFixed(1)}  y ${hover[1].toFixed(1)} m` : ""}
      </div>
      <div className="prefab-scale" aria-hidden="true">
        <i style={{ width: view.s * 5 }} />
        <span>5 m</span>
      </div>
      {ghost && !ghost.check.ok && hover && tools.tool !== "erase" && ghost.check.reason && (
        <div className="prefab-ghost-tip" role="status" style={{ left: X(hover[0]) + 14, top: Y(hover[1]) + 14 }}>
          {ghost.check.reason}
        </div>
      )}
    </div>
  );
}

export default memo(PlanCanvas);
