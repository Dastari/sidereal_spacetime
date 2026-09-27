import { type FloorStamp, stampFloor } from "./floor-stamps";
import { WallFitNotes } from "./WallFitNotes";
import { MeasurementReadout } from "./MeasurementReadout";
import type { MeasurementPoint } from "@sidereal/render/layout-measurement";
import {
  applyPlaneOverlayFrame,
  planeOverlayFrame,
} from "./plane-overlay-transform";
import { previewPressureAreas } from "./pressure-preview";
import { PRESSURE_COLORS, PRESSURE_LABELS } from "./PressureAreas";
import { mountEditorCanvas } from "../../editor/mountEditorCanvas";
import { PINNED_FLOOR_KIT } from "@sidereal/sim/construction-transactions";
import {
  deviceServicePortId,
  placedDeviceServices,
} from "@sidereal/content/device-services";
import type { RefObject } from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { PartCatalog } from "@sidereal/content/assembly";
import {
  SERVICE_CHANNELS,
  type LayoutDocument,
  type Point,
  type ServiceChannel,
} from "@sidereal/content/ship-layout";
import {
  fittingPolygon,
  type CompiledLayout,
} from "@sidereal/sim/layout-compiler";
import { inside } from "@sidereal/sim/layout-geometry";
import { PLAN_OVERLAY_TILT_LIMIT } from "@sidereal/render/layout-plane-projection";
import { layoutPreviewPolicy } from "./editor-mode-policy";
import { partitionDragDelta } from "./partition-drag-snap";
import type { ViewState } from "./state";
import { systemsFootprints } from "./systems-footprints";
import type { SharedLayoutViewport } from "./viewport-state";
export type Tool =
  | "select"
  | "measure"
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
  shape?: FloorStamp;
  assetId?: string;
  entityId?: string;
  partitionEndpoint?: "a" | "b";
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
  shape: FloorStamp;
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
    overlay = useRef<SVGSVGElement>(null),
    planeGroup = useRef<SVGGElement>(null),
    overlayGroup = useRef<SVGGElement>(null),
    lastPlaneMatrix = useRef<readonly number[] | null>(null),
    holder = useRef<HTMLDivElement>(null),
    gpuHost = useRef<HTMLDivElement>(null),
    gpu = useRef<HTMLCanvasElement | null>(null),
    preview = useRef<ReturnType<
      (typeof import("@sidereal/render/layout-assembly-preview"))["createAssemblyLayoutPreview"]
    > | null>(null);
  const [wallNotes, setWallNotes] = useState<string[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementPoint[]>([]);
  const [planeScale, setPlaneScale] = useState(1);
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
      partitionEndpoint?: "a" | "b";
      camera: ViewState["camera"];
    } | null>(null),
    [stats, setStats] = useState("Loading 3D preview…");
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
  /** Orthographic views draw the plan SVG at screen scale inside a
   * viewport-sized box (no zoomed matrix3d layer). The perspective projection
   * never warps the SVG at all: the scene draws the floor, grid and hull
   * boundary itself, and the plan SVG only carries pointer input. */
  const [nativePlan, setNativePlan] = useState(view.projection === "3D"),
    nativePlanRef = useRef(nativePlan);
  function syncPlaneOverlay(matrix: readonly number[], tilted: boolean) {
    const wrap = holder.current;
    if (!wrap) return;
    try {
      const frame = tilted
        ? {
            group: "",
            css: "",
            origin: "0px 0px",
            box: { x: 0, y: 0, w: wrap.clientWidth, h: wrap.clientHeight },
            viewBox: `0 0 ${wrap.clientWidth} ${wrap.clientHeight}`,
            clip: "",
            visible: true,
          }
        : planeOverlayFrame(matrix, wrap.clientWidth, wrap.clientHeight);
      applyPlaneOverlayFrame(svg.current, planeGroup.current, frame);
      applyPlaneOverlayFrame(overlay.current, overlayGroup.current, frame);
      if (!tilted) {
        const scale = Math.hypot(matrix[0], matrix[1]) / Math.abs(matrix[15]);
        if (Number.isFinite(scale) && scale > 0)
          setPlaneScale((old) =>
            Math.abs(old - scale) > old * 0.005 ? scale : old,
          );
      }
      delete wrap.dataset.overlayError;
    } catch (error) {
      // The overlay is presentation only; never let it stop the render loop.
      wrap.dataset.overlayError = String(error);
    }
  }
  useEffect(() => {
    if (lastPlaneMatrix.current)
      syncPlaneOverlay(lastPlaneMatrix.current, nativePlanRef.current);
  }, [size.w, size.h, nativePlan]);
  const planeElevation = () =>
    (latest.current.doc.decks.find((d) => d.id === latest.current.view.deckId)
      ?.elevation ?? 0) /
      32 +
    PINNED_FLOOR_KIT.datums.floorTop / 32 +
    0.0025;
  useEffect(() => {
    if (!gpuHost.current || !props.catalog) return;
    const canvas = mountEditorCanvas(
      gpuHost.current,
      "Shared ship layout viewport",
    );
    gpu.current = canvas;
    let disposed = false;
    for (const element of [svg.current, overlay.current]) {
      if (element) element.style.visibility = "hidden";
    }
    const shared = props.sharedViewport.current;
    const initial = shared.documentId === doc.id ? shared.camera : undefined;
    import("@sidereal/render/layout-assembly-preview")
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
            // Read layout-dependent values first, then write styles, so one
            // camera update never forces a synchronous reflow mid-frame.
            const matrix = preview.current.planeTransform(planeElevation());
            lastPlaneMatrix.current = matrix;
            // Any tilt beyond the limit makes the plane projection perspective;
            // then the scene draws the grid and boundary and the SVG steps back.
            const tilted =
              latest.current.view.projection === "3D" ||
              state.camera.beta > PLAN_OVERLAY_TILT_LIMIT;
            if (nativePlanRef.current !== tilted) {
              nativePlanRef.current = tilted;
              setNativePlan(tilted);
            }
            syncPlaneOverlay(matrix, tilted);
          },
          setWallNotes,
          setMeasurements,
        );
        preview.current = viewport;
        viewport.setMeasuring(latest.current.tool === "measure");
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
            layoutPreviewPolicy(p.view),
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
      canvas.remove();
      if (gpu.current === canvas) gpu.current = null;
    };
  }, [props.catalog]);
  useEffect(() => {
    preview.current?.setMeasuring(tool === "measure");
  }, [tool]);
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
        layoutPreviewPolicy(view),
      );
  }, [
    doc,
    result,
    view.deckId,
    view.layers.roof,
    view.layers.floor,
    view.layers.walls,
    view.layers.objects,
    view.layers.exteriorHull,
    view.mode,
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
      if (
        latest.current.tool === "measure" &&
        !(e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"]',
        )
      ) {
        if (e.key === "Escape") preview.current?.clearMeasurements();
        if (e.key === "Backspace") {
          e.preventDefault();
          preview.current?.removeMeasurementPoint();
        }
      }
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
  // The repeating major pattern must contain whole snap cells (including 2 m).
  const majorGrid = Math.max(160, view.grid * 5);
  function routeSnap(p: Point): Point {
    const near = serviceNodes
      .filter((node) => node.channel === props.channel)
      .map((node) => ({
        point: node.point,
        distance: Math.hypot(node.point[0] - p[0], node.point[1] - p[1]),
      }))
      .filter((node) => node.distance <= Math.max(4, view.grid / 2))
      .sort((a, b) => a.distance - b.distance)[0];
    return near?.point ?? snap(p);
  }
  function selectionDragDelta(
    start: Point,
    end: Point,
    entityId?: string,
  ): Point {
    const wall = doc.partitions.find((p) => p.id === entityId);
    return wall
      ? partitionDragDelta(wall, start, end, view.grid, doc.structure?.grid)
      : [snap(end)[0] - snap(start)[0], snap(end)[1] - snap(start)[1]];
  }
  function down(e: ReactPointerEvent<SVGSVGElement>) {
    if (![0, 1, 2].includes(e.button)) return;
    if (
      e.button === 0 &&
      tool !== "measure" &&
      !preview.current?.floorPoint(e.clientX, e.clientY, planeElevation())
    )
      return;
    e.preventDefault();
    setMenu(null);
    e.currentTarget.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e.clientX, e.clientY),
      id =
        tool === "room"
          ? doc.tiles.find(
              (tile) => tile.deckId === view.deckId && inside(p, tile.vertices),
            )?.id
          : ((e.target as Element)
              .closest("[data-entity]")
              ?.getAttribute("data-entity") ??
            // A tilted view has no SVG hit shapes; resolve the floor tile under
            // the picked plane point instead.
            (nativePlan
              ? doc.tiles.find(
                  (t) => t.deckId === view.deckId && inside(p, t.vertices),
                )?.id
              : undefined));
    const endpoint = (e.target as Element)
      .closest("[data-wall-end]")
      ?.getAttribute("data-wall-end");
    const partitionEndpoint =
      e.button === 0 &&
      !space.current &&
      !blocked &&
      tool === "select" &&
      view.mode === "Structure" &&
      (endpoint === "a" || endpoint === "b") &&
      doc.partitions.some(
        (wall) => wall.id === id && wall.deckId === view.deckId,
      )
        ? endpoint
        : undefined;
    let ids =
      tool === "room"
        ? selection.filter((id) => doc.tiles.some((tile) => tile.id === id))
        : selection;
    if (
      e.button === 0 &&
      !space.current &&
      (tool === "select" || tool === "room") &&
      id
    ) {
      ids =
        !partitionEndpoint && (e.shiftKey || tool === "room")
          ? ids.includes(id)
            ? ids.filter((x) => x !== id)
            : [...ids, id]
          : ids.includes(id)
            ? ids
            : [id];
      select(ids);
    } else if (
      e.button === 0 &&
      (tool === "select" || tool === "room") &&
      !space.current &&
      !e.shiftKey
    ) {
      ids = [];
      select([]);
    }
    setDrag({
      start: p,
      end: p,
      screen: [e.clientX, e.clientY],
      ids,
      copy: e.ctrlKey || e.metaKey,
      pan:
        tool === "pan" ||
        e.button === 2 ||
        space.current ||
        (e.button === 1 && view.mode === "Structure"),
      orbit: e.button === 1 && view.mode !== "Structure",
      lastScreen: [e.clientX, e.clientY],
      entityId: id,
      partitionEndpoint,
      camera: { ...view.camera },
    });
  }
  const space = useRef(false);
  function move(e: ReactPointerEvent<SVGSVGElement>) {
    if (tool === "measure" && !drag?.pan && !drag?.orbit)
      preview.current?.measureAt(e.clientX, e.clientY, false);
    const p = local(e.clientX, e.clientY);
    // Re-render the plan only when the snapped hover cell changes; camera
    // drags in particular must not rebuild hundreds of SVG nodes per event.
    if (!drag?.pan && !drag?.orbit) {
      const next = snap(p);
      setPointer((current) =>
        current && current[0] === next[0] && current[1] === next[1]
          ? current
          : next,
      );
    }
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
      tool !== "measure" &&
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
    if (!drag.pan && !drag.orbit && (!blocked || tool === "measure")) {
      if (tool === "measure") {
        if (!moved) preview.current?.measureAt(e.clientX, e.clientY, true);
      } else if (
        ((tool === "select" && !drag.entityId) || tool === "room") &&
        moved
      ) {
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
      } else if (tool !== "room" && (tool !== "select" || moved)) {
        const wallMove =
          tool === "select" &&
          !drag.partitionEndpoint &&
          doc.partitions.find((p) => p.id === drag.entityId);
        const moveDelta = wallMove
          ? selectionDragDelta(drag.start, end, drag.entityId)
          : undefined;
        gesture({
          tool,
          start: wallMove
            ? wallMove.a
            : tool === "route"
              ? routeSnap(drag.start)
              : tool === "hole"
                ? (drag.start.map(Math.round) as Point)
                : snap(drag.start),
          end:
            wallMove && moveDelta
              ? [wallMove.a[0] + moveDelta[0], wallMove.a[1] + moveDelta[1]]
              : tool === "route"
                ? routeSnap(end)
                : snap(end),
          ids: drag.ids,
          copy: drag.copy,
          entityId: drag.entityId,
          partitionEndpoint: drag.partitionEndpoint,
        });
      }
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
      ? stampFloor("ghost", view.deckId, shape, pointer, turns).vertices
      : undefined;
  const delta =
    drag && tool === "select" && drag.entityId
      ? selectionDragDelta(drag.start, drag.end, drag.entityId)
      : [0, 0];
  const pressure = useMemo(
    () =>
      result && view.layers.pressure !== false
        ? previewPressureAreas(doc, result)
        : undefined,
    [doc, result, view.mode, view.layers.pressure],
  );
  const serviceDevices = useMemo(
    () =>
      placedDeviceServices(doc, props.catalog).filter(
        (device) => device.deckId === view.deckId,
      ),
    [doc, props.catalog, view.deckId],
  );
  const serviceDeviceIds = new Set(
    serviceDevices.map((device) => device.placedObjectId),
  );
  const serviceNodes = [
    ...doc.nodes.filter((node) => node.deckId === view.deckId),
    ...serviceDevices.flatMap((device) =>
      device.ports.flatMap((port) => {
        const id = deviceServicePortId(device.placedObjectId, port.id);
        return doc.nodes.some((node) => node.id === id)
          ? []
          : [
              {
                id,
                deckId: device.deckId,
                point: device.position
                  .slice(0, 2)
                  .map((n) => Math.round(n * 32)) as Point,
                channel: port.channel,
                kind: "endpoint" as const,
                direction: port.direction,
                medium: port.channel,
              },
            ];
      }),
    ),
  ];
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
          fill="#45d8f5"
          fillOpacity={selection.includes(t.id) ? 0.18 : 0}
          stroke={selection.includes(t.id) ? "#45d8f5" : "#7793a0"}
          strokeWidth={
            selection.includes(t.id)
              ? 2.4 / view.camera.scale
              : 0.55 / view.camera.scale
          }
          className="layout-floor-tile"
          pointerEvents={view.mode === "Systems" ? "none" : undefined}
        />
      )),
    [
      doc.tiles,
      view.deckId,
      view.layers.floor,
      view.projection,
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
      <div className="editor-gpu-surface" ref={gpuHost} />
      {view.layers.walls && <WallFitNotes notes={wallNotes} />}
      {!doc.tiles.some((tile) => tile.deckId === view.deckId) && (
        <div className="layout-empty-guide">
          <strong>Draw your first deck</strong>
          <span>Choose a floor shape, then click to place it.</span>
        </div>
      )}

      {/unavailable|failed|error/i.test(stats) && (
        <div className="layout-render-stats" role="alert">
          {stats}
        </div>
      )}
      <>
        <svg
          ref={svg}
          className={`layout-plan tool-${tool}`}
          data-gesture-active={!!drag}
          aria-label="Ship floorplan editing canvas"
          role="application"
          tabIndex={0}
          style={{
            transformOrigin: "0 0",
            overflow: "hidden",
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
          <g ref={planeGroup}>
            {!nativePlan && (
              <>
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
                    width={majorGrid}
                    height={majorGrid}
                    patternUnits="userSpaceOnUse"
                  >
                    <rect
                      width={majorGrid}
                      height={majorGrid}
                      fill="url(#layout-grid-fine)"
                    />
                    <path
                      d={`M ${majorGrid} 0 L 0 0 0 ${majorGrid}`}
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
                  {doc.structure && (
                    <g pointerEvents="none" aria-label="Hull size boundary">
                      <rect
                        x={doc.structure.hull.origin[0]}
                        y={doc.structure.hull.origin[1]}
                        width={doc.structure.hull.width}
                        height={doc.structure.hull.length}
                        fill="none"
                        stroke="#36c8f4"
                        strokeDasharray="8 5"
                        strokeWidth="1.5"
                      />
                      <text
                        transform={`translate(${doc.structure.hull.origin[0]},${doc.structure.hull.origin[1] - 10}) scale(1,-1)`}
                        fill="#36c8f4"
                        fontSize="9"
                      >
                        {doc.structure.hull.name} ·{" "}
                        {doc.structure.hull.width / 32} ×{" "}
                        {doc.structure.hull.length / 32} m
                      </text>
                    </g>
                  )}
                  {floorGeometry}
                  {pressure?.areas
                    .filter((a) => a.deckId === view.deckId)
                    .map((a, i) => (
                      <g
                        key={a.id}
                        aria-label={`${a.roomNames.join(", ") || `Area ${i + 1}`}: ${PRESSURE_LABELS[a.status]}`}
                        pointerEvents="none"
                      >
                        {tiles
                          .filter((t) => a.tileIds.includes(t.id))
                          .map((t) => (
                            <polygon
                              key={t.id}
                              points={path(t.vertices)}
                              fill={PRESSURE_COLORS[a.status]}
                              fillOpacity={
                                view.projection === "Top" ? 0.26 : 0.12
                              }
                              stroke={PRESSURE_COLORS[a.status]}
                              strokeWidth="0.6"
                            />
                          ))}
                      </g>
                    ))}
                  {view.layers.labels &&
                    rooms.map((room, i) => (
                      <g key={room.id} pointerEvents="none">
                        {tiles
                          .filter((t) => room.tileIds.includes(t.id))
                          .map((t) => (
                            <polygon
                              key={t.id}
                              points={path(t.vertices)}
                              fill={
                                ["#43767b", "#516c8f", "#6b6684", "#706e53"][
                                  i % 4
                                ]
                              }
                              opacity={
                                pressure
                                  ? 0
                                  : selection.includes(room.id)
                                    ? 0.6
                                    : 0.22
                              }
                            />
                          ))}
                        {selection.includes(room.id) &&
                          result?.edges
                            .filter(
                              (e) =>
                                e.deckId === view.deckId &&
                                e.tileIds.filter((id) =>
                                  room.tileIds.includes(id),
                                ).length === 1,
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
                        data-entity={w.anchorId}
                        pointerEvents={
                          view.mode === "Systems" ? "none" : undefined
                        }
                      >
                        <line
                          x1={w.a[0]}
                          y1={w.a[1]}
                          x2={w.b[0]}
                          y2={w.b[1]}
                          stroke="#06131c"
                          strokeWidth={4}
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
                          strokeWidth={3}
                        />
                        <line
                          x1={w.a[0]}
                          y1={w.a[1]}
                          x2={w.b[0]}
                          y2={w.b[1]}
                          stroke="#c8d6dc"
                          strokeWidth=".8"
                        />
                        {w.source === "partition" &&
                          tool === "select" &&
                          view.mode === "Structure" && (
                            <line
                              x1={w.a[0]}
                              y1={w.a[1]}
                              x2={w.b[0]}
                              y2={w.b[1]}
                              stroke="transparent"
                              strokeWidth="14"
                              vectorEffect="non-scaling-stroke"
                              style={{ cursor: "move" }}
                            >
                              <title>Drag to move the whole wall</title>
                            </line>
                          )}
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
                      const width = Math.hypot(
                          o.b[0] - o.a[0],
                          o.b[1] - o.a[1],
                        ),
                        angle =
                          (Math.atan2(o.b[1] - o.a[1], o.b[0] - o.a[0]) * 180) /
                          Math.PI,
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
                          {(tool === "door" || selected) && (
                            <g
                              transform={`translate(${o.a[0]},${o.a[1]}) rotate(${angle})`}
                              pointerEvents="none"
                            >
                              <rect
                                x="0"
                                y={-o.clearance}
                                width={width}
                                height={o.clearance * 2}
                                fill="#e9b769"
                                fillOpacity=".08"
                                stroke="#e9b769"
                                strokeWidth=".7"
                                strokeDasharray="3 3"
                              />
                              {o.kind !== "passage" && (
                                <path
                                  d={`M0,0 L0,${width} A${width},${width} 0 0 0 ${width},0`}
                                  fill="none"
                                  stroke="#e9b769"
                                  strokeWidth="1"
                                />
                              )}
                            </g>
                          )}
                        </g>
                      );
                    })}
                  {selectedRoom &&
                    result?.edges
                      .filter(
                        (e) =>
                          e.deckId === view.deckId &&
                          e.tileIds.filter((id) =>
                            selectedRoom.tileIds.includes(id),
                          ).length === 1,
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
                  {view.mode === "Systems" &&
                    view.layers.objects &&
                    props.catalog &&
                    systemsFootprints(doc, props.catalog, view.deckId)
                      .filter((f) => serviceDeviceIds.has(f.id))
                      .map((f) => (
                        <g key={`system-${f.id}`} data-entity={f.id}>
                          <polygon
                            points={path(f.polygon)}
                            fill="#081923"
                            fillOpacity="0.88"
                            stroke={
                              selection.includes(f.id) ? "#36c8f4" : "#7395a6"
                            }
                            strokeWidth="1.5"
                          />
                          <text
                            transform={`translate(${f.center[0]},${f.center[1]}) scale(1,-1)`}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize="14"
                            fill="#e4eff7"
                            paintOrder="stroke"
                            stroke="#081923"
                            strokeWidth="2"
                          >
                            <title>{f.name}</title>
                            {f.name
                              .replace(/^(equipment|room)\s+/i, "")
                              .match(/.{1,18}(?:\s|$)|.{1,18}/g)
                              ?.slice(0, 2)
                              .map((line, i) => (
                                <tspan key={i} x="0" dy={i ? 15 : -3}>
                                  {line.trim()}
                                </tspan>
                              ))}
                          </text>
                        </g>
                      ))}
                  {view.layers.objects &&
                    view.mode !== "Systems" &&
                    doc.fittings
                      .filter((f) => f.deckId === view.deckId)
                      .map((f) => (
                        <g
                          key={f.id}
                          data-entity={f.id}
                          pointerEvents={
                            view.mode === "Structure" ? "none" : undefined
                          }
                        >
                          <polygon
                            points={path(fittingPolygon(f))}
                            fill="#6a7981"
                            stroke={
                              selection.includes(f.id) ? "#45d8f5" : "#acbcc4"
                            }
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
                  {view.layers.routes &&
                    (doc.serviceConnections ?? []).map((connection) => {
                      const from = serviceDevices.find(
                        (device) =>
                          device.placedObjectId === connection.fromDeviceId,
                      );
                      const to = serviceDevices.find(
                        (device) =>
                          device.placedObjectId === connection.toDeviceId,
                      );
                      return from && to ? (
                        <line
                          key={connection.id}
                          data-entity={connection.id}
                          aria-label={`${connection.channel} device connection`}
                          x1={from.position[0] * 32}
                          y1={from.position[1] * 32}
                          x2={to.position[0] * 32}
                          y2={to.position[1] * 32}
                          stroke={SERVICE_CHANNELS[connection.channel].color}
                          strokeWidth={
                            selection.includes(connection.id) ? 3 : 1.5
                          }
                          strokeDasharray="2 5"
                          pointerEvents={
                            view.mode === "Structure" ? "none" : undefined
                          }
                        />
                      ) : null;
                    })}
                  {view.layers.routes &&
                    doc.routes
                      .filter((r) => r.deckId === view.deckId)
                      .map((r) => (
                        <g
                          key={r.id}
                          data-entity={r.id}
                          pointerEvents={
                            view.mode === "Structure" ? "none" : undefined
                          }
                        >
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
                  {view.layers.routes &&
                    serviceNodes.map((n) => (
                      <g
                        key={n.id}
                        data-entity={n.id}
                        pointerEvents={
                          view.mode === "Structure" ? "none" : undefined
                        }
                      >
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
                          stroke={
                            selection.includes(r.id) ? "#45d8f5" : "#395563"
                          }
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
                {view.mode === "Structure" &&
                  view.layers.walls &&
                  tool === "select" &&
                  !blocked && (
                    <g transform="scale(1,-1)">
                      {doc.partitions
                        .filter(
                          (p) =>
                            p.deckId === view.deckId &&
                            selection.includes(p.id),
                        )
                        .flatMap((wall) =>
                          (["a", "b"] as const).map((endpoint) => {
                            const at =
                              drag?.entityId === wall.id &&
                              drag.partitionEndpoint === endpoint
                                ? snap(drag.end)
                                : wall[endpoint];
                            return (
                              <g
                                key={`${wall.id}-${endpoint}`}
                                data-entity={wall.id}
                                data-wall-end={endpoint}
                                role="button"
                                tabIndex={0}
                                aria-label={`Move internal wall ${endpoint === "a" ? "start" : "end"}`}
                                style={{
                                  cursor: drag?.partitionEndpoint
                                    ? "grabbing"
                                    : "grab",
                                }}
                                onKeyDown={(e) => {
                                  const step: Record<string, Point> = {
                                    ArrowLeft: [-view.grid, 0],
                                    ArrowRight: [view.grid, 0],
                                    ArrowUp: [0, view.grid],
                                    ArrowDown: [0, -view.grid],
                                  };
                                  const delta = step[e.key];
                                  if (!delta) return;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  gesture({
                                    tool: "select",
                                    start: wall[endpoint],
                                    end: [
                                      wall[endpoint][0] + delta[0],
                                      wall[endpoint][1] + delta[1],
                                    ],
                                    ids: [wall.id],
                                    copy: false,
                                    entityId: wall.id,
                                    partitionEndpoint: endpoint,
                                  });
                                }}
                              >
                                <title>
                                  Drag to resize this wall. Arrow keys move by
                                  one snap increment.
                                </title>
                                <circle
                                  cx={at[0]}
                                  cy={at[1]}
                                  r={8 / planeScale}
                                  fill="#0b2432"
                                  stroke="#45d8f5"
                                  strokeWidth="2"
                                  vectorEffect="non-scaling-stroke"
                                />
                                <circle
                                  cx={at[0]}
                                  cy={at[1]}
                                  r={14 / planeScale}
                                  fill="transparent"
                                  pointerEvents="all"
                                />
                              </g>
                            );
                          }),
                        )}
                    </g>
                  )}
              </>
            )}
          </g>
        </svg>
        <svg
          ref={overlay}
          className="layout-gesture-overlay"
          aria-hidden="true"
          style={{
            transformOrigin: "0 0",
            overflow: "hidden",
          }}
        >
          <g ref={overlayGroup}>
            {!nativePlan && (
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
                {drag?.partitionEndpoint &&
                  (() => {
                    const wall = doc.partitions.find(
                      (p) => p.id === drag.entityId,
                    );
                    if (!wall) return null;
                    const fixed =
                        wall[drag.partitionEndpoint === "a" ? "b" : "a"],
                      end = snap(drag.end);
                    return (
                      <line
                        x1={fixed[0]}
                        y1={fixed[1]}
                        x2={end[0]}
                        y2={end[1]}
                        stroke="#45d8f5"
                        strokeWidth="3"
                        strokeDasharray="6 4"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })()}
                {drag &&
                  tool === "select" &&
                  !drag.pan &&
                  !drag.partitionEndpoint &&
                  doc.partitions.some((p) => p.id === drag.entityId) && (
                    <g
                      data-wall-move-preview={drag.entityId}
                      transform={`translate(${delta[0]},${delta[1]})`}
                      stroke="#45d8f5"
                      strokeWidth="3"
                      strokeDasharray="6 4"
                    >
                      {doc.partitions
                        .filter((p) => drag.ids.includes(p.id))
                        .map((p) => (
                          <line
                            key={p.id}
                            x1={p.a[0]}
                            y1={p.a[1]}
                            x2={p.b[0]}
                            y2={p.b[1]}
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      {doc.openings
                        .filter((o) => drag.ids.includes(o.partitionId))
                        .map((o) => (
                          <line
                            key={o.id}
                            x1={o.a[0]}
                            y1={o.a[1]}
                            x2={o.b[0]}
                            y2={o.b[1]}
                            stroke="#f4b95f"
                            strokeWidth="8"
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                    </g>
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
                  ((tool === "select" && !drag.entityId) ||
                    tool === "room" ||
                    tool === "fill") && (
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
            Dotted links: device connections. Solid lines: physical routes.
          </small>
        </div>
      )}
      {tool === "measure" && (
        <MeasurementReadout
          points={measurements}
          onClear={() => preview.current?.clearMeasurements()}
          onRemove={() => preview.current?.removeMeasurementPoint()}
        />
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
          : ""}
        {selectedRoom && ` · ${selectedRoom.area.toFixed(1)} m² selected`}
      </div>
    </div>
  );
}
