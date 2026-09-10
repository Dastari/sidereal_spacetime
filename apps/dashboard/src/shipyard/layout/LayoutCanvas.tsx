import { PINNED_FLOOR_KIT } from "@sidereal/sim/construction-transactions";
import type { SharedLayoutViewport } from "./viewport-state";
import type { RefObject } from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  FLOOR_SHAPES,
  SERVICE_CHANNELS,
  stampTile,
  type LayoutDocument,
  type Point,
  type Shape,
  type ServiceChannel,
} from "../../../../../packages/content/src/ship-layout";
import {
  fittingPolygon,
  type CompiledLayout,
} from "../../../../../packages/sim/src/layout-compiler";
import type { PartCatalog } from "../../../../../packages/content/src/assembly";
import type { ViewState } from "./state";
export type Tool =
  | "select"
  | "pan"
  | "stamp"
  | "fill"
  | "partition"
  | "door"
  | "room"
  | "route"
  | "object"
  | "hole";
export interface Gesture {
  tool: Tool;
  start: Point;
  end: Point;
  ids: string[];
  copy: boolean;
  shape?: Shape;
  assetId?: string;
  entityId?: string;
}
interface Props {
  sharedViewport: RefObject<SharedLayoutViewport>;
  catalog?: PartCatalog;
  doc: LayoutDocument;
  result?: CompiledLayout;
  view: ViewState;
  setView: (v: ViewState) => void;
  selection: string[];
  select: (ids: string[]) => void;
  tool: Tool;
  shape: Shape;
  turns: number;
  blocked: boolean;
  gesture: (g: Gesture) => void;
  cancel: () => void;
  channel: ServiceChannel;
  actions: { copy: () => void; rotate: () => void; remove: () => void };
}
const path = (points: Point[]) => points.map((p) => p.join(",")).join(" ");
export default function LayoutCanvas(props: Props) {
  const {
    doc,
    result,
    view,
    selection,
    select,
    tool,
    shape,
    turns,
    blocked,
    gesture,
    cancel,
  } = props;
  const svg = useRef<SVGSVGElement>(null),
    holder = useRef<HTMLDivElement>(null),
    gpu = useRef<HTMLCanvasElement>(null),
    preview = useRef<ReturnType<
      (typeof import("../../../../../packages/render/src/layout-assembly-preview"))["createAssemblyLayoutPreview"]
    > | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(
    null,
  );
  const [size, setSize] = useState({ w: 800, h: 600 }),
    [pointer, setPointer] = useState<Point>(),
    [drag, setDrag] = useState<{
      start: Point;
      screen: Point;
      end: Point;
      ids: string[];
      copy: boolean;
      pan: boolean;
      orbit: boolean;
      lastScreen: Point;
      entityId?: string;
      camera: ViewState["camera"];
    } | null>(null),
    [stats, setStats] = useState("Loading 3D preview…"),
    [planeMatrix, setPlaneMatrix] = useState<string>();
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const el = holder.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const planeElevation = () =>
    (latest.current.doc.decks.find((d) => d.id === latest.current.view.deckId)
      ?.elevation ?? 0) /
      32 +
    PINNED_FLOOR_KIT.datums.floorTop / 32 +
    0.0025;
  useEffect(() => {
    if (!gpu.current || !props.catalog) return;
    let disposed = false;
    const shared = props.sharedViewport.current;
    const initial = shared.documentId === doc.id ? shared.camera : undefined;
    import("../../../../../packages/render/src/layout-assembly-preview")
      .then(({ createAssemblyLayoutPreview }) => {
        if (disposed || !gpu.current || !latest.current.catalog) return;
        const viewport = createAssemblyLayoutPreview(
          gpu.current,
          latest.current.catalog,
          setStats,
          initial,
          shared.projection,
          () => {
            if (!preview.current) return;
            const state = props.sharedViewport.current;
            state.documentId = latest.current.doc.id;
            state.camera = preview.current.getCamera();
            state.projection = latest.current.view.projection;
            const matrix = preview.current.planeTransform(planeElevation());
            const css = `matrix3d(${matrix.join(",")})`;
            setPlaneMatrix((previous) => (previous === css ? previous : css));
          },
        );
        preview.current = viewport;
        shared.actions = {
          fit: () => viewport.fit(),
          zoom: (delta) => viewport.zoom(delta),
        };
        const p = latest.current;
        if (p.result)
          viewport.update(
            p.doc,
            p.result,
            p.view.deckId,
            p.view.layers.roof,
            p.view.projection,
            p.catalog,
            p.view.layers.floor,
          );
      })
      .catch((e) =>
        setStats(
          `Assembly preview unavailable: ${String(e)}. Draft preserved.`,
        ),
      );
    return () => {
      disposed = true;
      if (preview.current) {
        shared.documentId = latest.current.doc.id;
        shared.camera = preview.current.getCamera();
        shared.projection = latest.current.view.projection;
        shared.actions = undefined;
        preview.current.dispose();
        preview.current = null;
      }
    };
  }, [props.catalog]);
  useEffect(() => {
    if (result)
      preview.current?.update(
        doc,
        result,
        view.deckId,
        view.layers.roof,
        view.projection,
        props.catalog,
        view.layers.floor,
      );
  }, [
    doc,
    result,
    view.deckId,
    view.layers.roof,
    view.layers.floor,
    view.projection,
    props.catalog,
  ]);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      preview.current?.zoom(e.deltaY);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [view, size]);
  useEffect(() => {
    const stop = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDrag(null);
        setMenu(null);
      }
    };
    window.addEventListener("keydown", stop);
    return () => window.removeEventListener("keydown", stop);
  }, []);
  function local(x: number, y: number): Point {
    return preview.current?.floorPoint(x, y, planeElevation()) ?? [0, 0];
  }
  const snap = (p: Point): Point =>
    p.map((n) => Math.round(n / view.grid) * view.grid) as Point;
  function down(e: ReactPointerEvent<SVGSVGElement>) {
    if (![0, 1, 2].includes(e.button)) return;
    if (
      e.button === 0 &&
      !preview.current?.floorPoint(e.clientX, e.clientY, planeElevation())
    )
      return;
    e.preventDefault();
    setMenu(null);
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e.clientX, e.clientY),
      id =
        (e.target as Element)
          .closest("[data-entity]")
          ?.getAttribute("data-entity") ?? undefined;
    let ids = selection;
    if (e.button === 0 && tool === "select" && id) {
      ids = e.shiftKey
        ? selection.includes(id)
          ? selection.filter((x) => x !== id)
          : [...selection, id]
        : selection.includes(id)
          ? selection
          : [id];
      select(ids);
    } else if (e.button === 0 && tool === "select" && !e.shiftKey) {
      ids = [];
      select([]);
    }
    setDrag({
      start: p,
      end: p,
      screen: [e.clientX, e.clientY],
      ids,
      copy: e.ctrlKey || e.metaKey,
      pan: tool === "pan" || e.button === 2 || space.current,
      orbit: e.button === 1,
      lastScreen: [e.clientX, e.clientY],
      entityId: id,
      camera: { ...view.camera },
    });
  }
  const space = useRef(false);
  function move(e: ReactPointerEvent<SVGSVGElement>) {
    const p = local(e.clientX, e.clientY);
    setPointer(snap(p));
    if (!drag) return;
    if (drag.pan || drag.orbit) {
      const dx = e.clientX - drag.lastScreen[0],
        dy = e.clientY - drag.lastScreen[1];
      if (drag.orbit) preview.current?.orbit(dx, dy);
      else preview.current?.pan(e.clientX, e.clientY, dx, dy, planeElevation());
      setDrag({ ...drag, lastScreen: [e.clientX, e.clientY] });
    } else setDrag({ ...drag, end: p });
  }
  function up(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return;
    if (
      !drag.pan &&
      !drag.orbit &&
      !preview.current?.floorPoint(e.clientX, e.clientY, planeElevation())
    ) {
      setDrag(null);
      return;
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
    const end = local(e.clientX, e.clientY),
      moved =
        Math.hypot(e.clientX - drag.screen[0], e.clientY - drag.screen[1]) > 4;
    if (drag.pan && !moved && e.button === 2 && drag.entityId) {
      select([drag.entityId]);
      setMenu({
        x: Math.min(e.clientX, window.innerWidth - 180),
        y: Math.min(e.clientY, window.innerHeight - 160),
        id: drag.entityId,
      });
    }
    if (!drag.pan && !drag.orbit && !blocked) {
      if (tool === "select" && !drag.entityId && moved) {
        const min = drag.start.map((n, i) => Math.min(n, end[i])),
          max = drag.start.map((n, i) => Math.max(n, end[i]));
        select([
          ...new Set([
            ...drag.ids,
            ...doc.tiles
              .filter(
                (t) =>
                  t.deckId === view.deckId &&
                  t.vertices.some(
                    (p) =>
                      p[0] >= min[0] &&
                      p[0] <= max[0] &&
                      p[1] >= min[1] &&
                      p[1] <= max[1],
                  ),
              )
              .map((t) => t.id),
          ]),
        ]);
      } else if (tool !== "select" || moved)
        gesture({
          tool,
          start:
            tool === "room" || tool === "hole"
              ? (drag.start.map(Math.round) as Point)
              : snap(drag.start),
          end: snap(end),
          ids: drag.ids,
          copy: drag.copy,
          entityId: drag.entityId,
        });
    }
    setDrag(null);
  }
  const tiles = doc.tiles.filter((t) => t.deckId === view.deckId),
    walls = result?.walls.filter((w) => w.deckId === view.deckId) ?? [],
    rooms =
      result?.rooms.filter((r) =>
        doc.rooms.some((d) => d.id === r.id && d.deckId === view.deckId),
      ) ?? [];
  const dim = result
      ? [
          (result.bounds.max[0] - result.bounds.min[0]) / 32,
          (result.bounds.max[1] - result.bounds.min[1]) / 32,
        ]
      : [0, 0],
    selectedRoom = rooms.find((r) => selection.includes(r.id));
  const ghost =
    pointer && tool === "stamp"
      ? stampTile("ghost", view.deckId, shape, pointer, turns).vertices
      : undefined;
  const delta =
    drag && tool === "select" && drag.entityId
      ? [
          snap(drag.end)[0] - snap(drag.start)[0],
          snap(drag.end)[1] - snap(drag.start)[1],
        ]
      : [0, 0];
  const floorGeometry = useMemo(
    () =>
      view.layers.floor &&
      tiles.map((t) => (
        <polygon
          key={t.id}
          data-entity={t.id}
          points={path(t.vertices)}
          transform={
            selection.includes(t.id)
              ? `translate(${delta[0]},${delta[1]})`
              : undefined
          }
          fill={
            view.mode === "Systems"
              ? "#243a47"
              : tiles.length > 512
                ? "#425a68"
                : "url(#layout-deck-surface)"
          }
          fillOpacity={doc.assembly ? 0.16 : 1}
          stroke={selection.includes(t.id) ? "#45d8f5" : "#7793a0"}
          strokeWidth={
            selection.includes(t.id)
              ? 2.4 / view.camera.scale
              : 0.55 / view.camera.scale
          }
          className="layout-floor-tile"
        />
      )),
    [
      doc.tiles,
      view.deckId,
      view.layers.floor,
      view.mode,
      selection,
      delta[0],
      delta[1],
      view.camera.scale,
    ],
  );
  return (
    <div
      className="layout-canvas-wrap"
      ref={holder}
      data-camera={JSON.stringify(view.camera)}
    >
      <div className="layout-canvas-heading">
        <strong>{doc.name}</strong>
        <span>
          {doc.decks.find((d) => d.id === view.deckId)?.name} ·{" "}
          {view.projection === "Top"
            ? "Floorplan schematic"
            : doc.assembly
              ? "Native assembly preview"
              : "Enclosure proxy preview"}
        </span>
      </div>
      <canvas ref={gpu} aria-label="Shared ship layout viewport" tabIndex={0} />
      <div className="layout-render-stats">
        {stats} · Middle drag orbits · Right drag pans · Wheel zooms
      </div>
      <>
        <svg
          ref={svg}
          className={`layout-plan tool-${tool}`}
          data-gesture-active={!!drag}
          aria-label="Ship floorplan editing canvas"
          role="application"
          tabIndex={0}
          viewBox={`0 0 ${size.w} ${size.h}`}
          style={{
            transform: planeMatrix,
            transformOrigin: "0 0",
            overflow: "visible",
            visibility: planeMatrix ? "visible" : "hidden",
          }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => setDrag(null)}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.code === "Space") {
              space.current = true;
              e.preventDefault();
            }
          }}
          onKeyUp={(e) => {
            if (e.code === "Space") space.current = false;
          }}
          onBlur={() => {
            space.current = false;
            setDrag(null);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (
              blocked ||
              !preview.current?.floorPoint(
                e.clientX,
                e.clientY,
                planeElevation(),
              )
            )
              return;
            const data = e.dataTransfer.getData("application/sidereal-layout");
            try {
              const item = JSON.parse(data),
                p = snap(local(e.clientX, e.clientY));
              gesture({
                tool: item.shape ? "stamp" : "object",
                shape: item.shape,
                assetId: item.assetId,
                start: p,
                end: p,
                ids: [],
                copy: false,
              });
            } catch {
              /* Unrelated drag is ignored. */
            }
          }}
        >
          <defs>
            <pattern
              id="layout-grid-fine"
              width={view.grid}
              height={view.grid}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${view.grid} 0 L 0 0 0 ${view.grid}`}
                fill="none"
                stroke="#23404e"
                strokeWidth={0.55 / view.camera.scale}
              />
            </pattern>
            <pattern
              id="layout-grid-major"
              width={160}
              height={160}
              patternUnits="userSpaceOnUse"
            >
              <rect width="160" height="160" fill="url(#layout-grid-fine)" />
              <path
                d="M 64 0 L 0 0 0 64"
                fill="none"
                stroke="#315468"
                strokeWidth={0.7 / view.camera.scale}
              />
            </pattern>
            <pattern
              id="layout-deck-surface"
              width="16"
              height="16"
              patternUnits="userSpaceOnUse"
            >
              <rect width="16" height="16" fill="#425a68" />
              <path
                d="M16 0H0V16"
                fill="none"
                stroke="#4d6572"
                strokeWidth=".6"
              />
            </pattern>
          </defs>
          <rect
            x={-8192}
            y={-8192}
            width={16384}
            height={16384}
            fill="url(#layout-grid-major)"
          />
          <g transform="scale(1,-1)">
            {floorGeometry}
            {(view.mode === "Rooms" || view.mode === "Objects") &&
              rooms.map((room, i) => (
                <g key={room.id} data-entity={room.id}>
                  {tiles
                    .filter((t) => room.tileIds.includes(t.id))
                    .map((t) => (
                      <polygon
                        key={t.id}
                        points={path(t.vertices)}
                        fill={
                          ["#43767b", "#516c8f", "#6b6684", "#706e53"][i % 4]
                        }
                        opacity={selection.includes(room.id) ? 0.6 : 0.22}
                      />
                    ))}
                  {selection.includes(room.id) &&
                    result?.edges
                      .filter(
                        (e) =>
                          e.deckId === view.deckId &&
                          e.tileIds.filter((id) => room.tileIds.includes(id))
                            .length === 1,
                      )
                      .map((e) => (
                        <line
                          key={e.key}
                          x1={e.a[0]}
                          y1={e.a[1]}
                          x2={e.b[0]}
                          y2={e.b[1]}
                          stroke="#45d8f5"
                          strokeWidth={3 / view.camera.scale}
                        />
                      ))}
                </g>
              ))}
            {view.layers.walls &&
              walls.map((w) => (
                <g
                  key={w.key}
                  data-entity={
                    w.source === "partition" ? w.anchorId : undefined
                  }
                >
                  <line
                    x1={w.a[0]}
                    y1={w.a[1]}
                    x2={w.b[0]}
                    y2={w.b[1]}
                    stroke="#06131c"
                    strokeWidth={w.source === "perimeter" ? 11 : 7}
                  />
                  <line
                    x1={w.a[0]}
                    y1={w.a[1]}
                    x2={w.b[0]}
                    y2={w.b[1]}
                    stroke={
                      selection.includes(w.anchorId)
                        ? "#45d8f5"
                        : w.source === "perimeter"
                          ? "#9ab0ba"
                          : "#6f8997"
                    }
                    strokeWidth={w.source === "perimeter" ? 7 : 4}
                  />
                  <line
                    x1={w.a[0]}
                    y1={w.a[1]}
                    x2={w.b[0]}
                    y2={w.b[1]}
                    stroke="#c8d6dc"
                    strokeWidth=".8"
                  />
                </g>
              ))}
            {doc.partitions
              .filter(
                (p) =>
                  p.deckId === view.deckId &&
                  !walls.some((w) => w.anchorId === p.id),
              )
              .map((p) => (
                <line
                  key={p.id}
                  data-entity={p.id}
                  x1={p.a[0]}
                  y1={p.a[1]}
                  x2={p.b[0]}
                  y2={p.b[1]}
                  stroke="#ef8c72"
                  strokeDasharray="6 4"
                  strokeWidth="4"
                />
              ))}
            {doc.openings
              .filter((o) => o.deckId === view.deckId)
              .map((o) => {
                const horizontal = o.a[1] === o.b[1],
                  mid: Point = [(o.a[0] + o.b[0]) / 2, (o.a[1] + o.b[1]) / 2],
                  selected = selection.includes(o.id);
                return (
                  <g key={o.id} data-entity={o.id}>
                    <line
                      x1={o.a[0]}
                      y1={o.a[1]}
                      x2={o.b[0]}
                      y2={o.b[1]}
                      stroke={selected ? "#45d8f5" : "#e9b769"}
                      strokeWidth="6"
                    />
                    {(view.mode === "Rooms" || selected) && (
                      <>
                        <rect
                          x={
                            horizontal
                              ? Math.min(o.a[0], o.b[0])
                              : mid[0] - o.clearance
                          }
                          y={
                            horizontal
                              ? mid[1] - o.clearance
                              : Math.min(o.a[1], o.b[1])
                          }
                          width={
                            horizontal
                              ? Math.abs(o.b[0] - o.a[0])
                              : o.clearance * 2
                          }
                          height={
                            horizontal
                              ? o.clearance * 2
                              : Math.abs(o.b[1] - o.a[1])
                          }
                          fill="#f4b95f"
                          fillOpacity=".09"
                          stroke="#f4b95f"
                          strokeWidth=".7"
                          strokeDasharray="3 3"
                        />
                        <path
                          d={
                            horizontal
                              ? `M${o.a[0]},${o.a[1]} l0,32 a32,32 0 0 0 32,-32`
                              : `M${o.a[0]},${o.a[1]} l32,0 a32,32 0 0 1 -32,32`
                          }
                          fill="none"
                          stroke="#f4b95f"
                          strokeWidth="1"
                        />
                      </>
                    )}
                  </g>
                );
              })}
            {selectedRoom &&
              result?.edges
                .filter(
                  (e) =>
                    e.deckId === view.deckId &&
                    e.tileIds.filter((id) => selectedRoom.tileIds.includes(id))
                      .length === 1,
                )
                .map((e) => (
                  <line
                    key={`selected-${e.key}`}
                    x1={e.a[0]}
                    y1={e.a[1]}
                    x2={e.b[0]}
                    y2={e.b[1]}
                    stroke="#45d8f5"
                    strokeWidth={2 / view.camera.scale}
                    pointerEvents="none"
                  />
                ))}
            {view.layers.objects &&
              doc.fittings
                .filter((f) => f.deckId === view.deckId)
                .map((f) => (
                  <g key={f.id} data-entity={f.id}>
                    <polygon
                      points={path(fittingPolygon(f))}
                      fill="#6a7981"
                      stroke={selection.includes(f.id) ? "#45d8f5" : "#acbcc4"}
                      strokeWidth="2"
                    />
                    <text
                      transform={`translate(${f.position[0] + 8},${f.position[1] + 8}) scale(1,-1)`}
                      fontSize="10"
                      fill="#eef5f7"
                    >
                      {f.kind === "container" ? "□ Cargo" : "◇ Object"}
                    </text>
                  </g>
                ))}
            {view.mode === "Systems" &&
              view.layers.routes &&
              doc.routes
                .filter((r) => r.deckId === view.deckId)
                .map((r) => (
                  <g key={r.id} data-entity={r.id}>
                    <polyline
                      points={path(r.path)}
                      fill="none"
                      stroke="#071923"
                      strokeWidth="7"
                    />
                    <polyline
                      points={path(r.path)}
                      fill="none"
                      stroke={SERVICE_CHANNELS[r.channel].color}
                      strokeWidth={selection.includes(r.id) ? 4 : 2.5}
                      strokeDasharray={SERVICE_CHANNELS[r.channel].dash}
                    />
                  </g>
                ))}
            {view.mode === "Systems" &&
              view.layers.routes &&
              doc.nodes
                .filter((n) => n.deckId === view.deckId)
                .map((n) => (
                  <g key={n.id} data-entity={n.id}>
                    {n.kind === "junction" ? (
                      <rect
                        x={n.point[0] - 4}
                        y={n.point[1] - 4}
                        width="8"
                        height="8"
                        fill={SERVICE_CHANNELS[n.channel].color}
                      />
                    ) : (
                      <circle
                        cx={n.point[0]}
                        cy={n.point[1]}
                        r="4"
                        fill="#071923"
                        stroke={SERVICE_CHANNELS[n.channel].color}
                        strokeWidth="2"
                      />
                    )}
                  </g>
                ))}
            {view.layers.roof &&
              tiles.map((t) => (
                <polygon
                  key={`roof-${t.id}`}
                  points={path(t.vertices)}
                  fill="#91bbc4"
                  fillOpacity=".18"
                  pointerEvents="none"
                />
              ))}
            {doc.decks
              .find((d) => d.id === view.deckId)
              ?.holes.map((h) => (
                <g key={h.id} data-entity={h.id}>
                  <circle
                    cx={h.seed[0]}
                    cy={h.seed[1]}
                    r="8"
                    fill="none"
                    stroke="#f4b95f"
                  />
                  <path
                    d={`M${h.seed[0] - 6} ${h.seed[1] - 6}l12 12m-12 0l12 -12`}
                    stroke="#f4b95f"
                  />
                </g>
              ))}
          </g>
          {view.layers.labels &&
            view.mode !== "Systems" &&
            rooms.map((r) => {
              const room = doc.rooms.find((d) => d.id === r.id)!;
              return (
                <g
                  key={r.id}
                  data-entity={r.id}
                  transform={`translate(${room.seed[0]},${-room.seed[1]})`}
                >
                  <rect
                    x={-room.name.length * 3.1 - 8}
                    y="-10"
                    width={room.name.length * 6.2 + 16}
                    height="21"
                    rx="2"
                    fill="#0b2432"
                    stroke={selection.includes(r.id) ? "#45d8f5" : "#395563"}
                    strokeWidth=".7"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#e3f3fa"
                    fontFamily="Barlow Condensed"
                    fontSize="13"
                  >
                    {room.name}
                  </text>
                </g>
              );
            })}
          {result && (
            <g
              className="layout-dimension"
              transform={`translate(${result.bounds.min[0]},${-result.bounds.min[1] + 35})`}
              fill="#92b6c9"
              fontSize="12"
            >
              <path
                d={`M0 -4v8m0 -4H${dim[0] * 32}m0 -4v8`}
                fill="none"
                stroke="#7a9bac"
                strokeWidth=".8"
              />
              <text x={dim[0] * 16} y="18" textAnchor="middle">
                {dim[0].toFixed(1)} m
              </text>
            </g>
          )}
        </svg>
        <svg
          className="layout-gesture-overlay"
          aria-hidden="true"
          viewBox={`0 0 ${size.w} ${size.h}`}
          style={{
            transform: planeMatrix,
            transformOrigin: "0 0",
            overflow: "visible",
            visibility: planeMatrix ? "visible" : "hidden",
          }}
        >
          <g transform="scale(1,-1)">
            {" "}
            {ghost && (
              <polygon
                points={path(ghost)}
                fill="#45d8f5"
                fillOpacity=".25"
                stroke="#45d8f5"
                strokeWidth={1.5 / view.camera.scale}
                pointerEvents="none"
              />
            )}
            {drag && !drag.pan && ["partition", "route"].includes(tool) && (
              <line
                x1={snap(drag.start)[0]}
                y1={snap(drag.start)[1]}
                x2={snap(drag.end)[0]}
                y2={snap(drag.end)[1]}
                stroke="#45d8f5"
                strokeWidth="3"
                strokeDasharray="6 4"
                pointerEvents="none"
              />
            )}
            {drag &&
              !drag.pan &&
              ((tool === "select" && !drag.entityId) || tool === "fill") && (
                <rect
                  x={Math.min(drag.start[0], drag.end[0])}
                  y={Math.min(drag.start[1], drag.end[1])}
                  width={Math.abs(drag.start[0] - drag.end[0])}
                  height={Math.abs(drag.start[1] - drag.end[1])}
                  fill="#45d8f5"
                  fillOpacity=".12"
                  stroke="#45d8f5"
                  strokeDasharray="5 4"
                  pointerEvents="none"
                />
              )}
          </g>
        </svg>
      </>
      {view.mode === "Systems" && (
        <div className="layout-legend">
          {Object.entries(SERVICE_CHANNELS).map(([name, s]) => (
            <span key={name}>
              <i style={{ background: s.color }} />
              {name}
            </span>
          ))}
          <small>
            ○ Endpoint　■ Explicit junction
            <br />
            Crossings are disconnected. Design routes only.
          </small>
        </div>
      )}
      {menu && (
        <div
          className="layout-context-menu"
          role="menu"
          aria-label="Selected layout object"
          style={{ left: menu.x, top: menu.y }}
        >
          <button role="menuitem" onClick={() => setMenu(null)}>
            Inspect selection
          </button>
          {(doc.tiles.some((t) => t.id === menu.id) ||
            doc.fittings.some((f) => f.id === menu.id)) && (
            <>
              <button
                role="menuitem"
                disabled={blocked}
                onClick={() => {
                  props.actions.copy();
                  setMenu(null);
                }}
              >
                Copy placement
              </button>
              <button
                role="menuitem"
                disabled={blocked}
                onClick={() => {
                  props.actions.rotate();
                  setMenu(null);
                }}
              >
                Rotate 90°
              </button>
            </>
          )}
          <button
            role="menuitem"
            disabled={blocked}
            onClick={() => {
              props.actions.remove();
              setMenu(null);
            }}
          >
            Delete selection
          </button>
        </div>
      )}
      <div className="layout-compass">
        N<br />
        <span>W ─┼─ E</span>
        <br />S
      </div>
      <div className="layout-scale">
        0 <span style={{ width: 160 * view.camera.scale }} /> 5 m
      </div>
      <div className="layout-pointer-readout">
        {pointer
          ? `${(pointer[0] / 32).toFixed(2)}, ${(pointer[1] / 32).toFixed(2)} m`
          : "Local east / north"}
        {selectedRoom && ` · ${selectedRoom.area.toFixed(1)} m² selected`}
      </div>
    </div>
  );
}
