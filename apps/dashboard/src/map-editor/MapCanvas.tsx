import { portraitRadiusFraction } from "@sidereal/content/celestial-assets";
import { diskVisible, visibleCirclePath, showOrbit } from "./map-viewport";
import type { MapZone } from "@sidereal/content/zones";
import { mapZones, subtree } from "./map-commands";
import { cubicAt, setZoneHandle } from "@sidereal/sim/zone-path";
import { useCelestialSnapshots } from "./useCelestialSnapshots";
import { MapBackground } from "./MapBackground";
import { systemCenter } from "@sidereal/sim/space-background";
import { useRef, useState, useEffect, type PointerEvent } from "react";
import {
  mapBodyRole,
  type SystemMapDocument,
  type FieldAsteroid,
} from "@sidereal/content/system-map";
export interface MapShip {
  shipId: string;
  systemId: string;
  name: string;
  x: number;
  y: number;
  heading: number;
}
export interface Camera {
  x: number;
  y: number;
  span: number;
}
export const meters = (n: number) =>
  Math.abs(n) >= 1000 ? `${+(n / 1000).toFixed(2)} km` : `${+n.toFixed(2)} m`;
export default function MapCanvas({
  doc,
  ships,
  asteroids,
  selection,
  onSelect,
  onMove,
  onVertex,
  tool,
  selections,
  pointIndex,
  onPointSelect,
  onHandle,
  onInsert,
  onMarquee,
  cancelToken,
  camera,
  setCamera,
  layers,
  drawing,
  onDraw,
  creationShape,
  onCreateBounds,
}: {
  creationShape: "box" | "ellipsoid" | null;
  onCreateBounds: (
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => void;
  doc: SystemMapDocument;
  ships: MapShip[];
  asteroids: FieldAsteroid[];
  selection: string;
  onSelect: (id: string, additive?: boolean) => void;
  selections: string[];
  tool: "select" | "direct" | "pan";
  pointIndex: number | null;
  cancelToken: number;
  onPointSelect: (i: number) => void;
  onHandle: (
    id: string,
    index: number,
    side: "in" | "out",
    x: number,
    y: number,
    independent: boolean,
  ) => void;
  onInsert: (id: string, index: number, t: number) => void;
  onMarquee: (ids: string[], additive: boolean) => void;
  onMove: (id: string, x: number, y: number) => void;
  onVertex: (id: string, index: number, x: number, y: number) => void;
  camera: Camera;
  setCamera: (c: Camera) => void;
  layers: {
    bodies: boolean;
    ships: boolean;
    fields: boolean;
    grid: boolean;
    orbits: boolean;
  };
  drawing: { x: number; y: number }[] | null;
  onDraw: (p: { x: number; y: number }) => void;
}) {
  const thumbnails = useCelestialSnapshots(doc.bodies);
  const svg = useRef<SVGSVGElement>(null),
    [ratio, setRatio] = useState(1.5),
    [cursor, setCursor] = useState({ x: 0, y: 0 }),
    [drag, setDrag] = useState<{
      id: string;
      vertex?: number;
      side?: "in" | "out";
      pointer: number;
      additive: boolean;
      independent: boolean;
      screen: { x: number; y: number };
      moved: boolean;
      start: { x: number; y: number };
      original: { x: number; y: number };
      preview: { x: number; y: number };
    } | null>(null);
  const [space, setSpace] = useState(false);
  useEffect(() => {
    setDrag(null);
  }, [cancelToken]);
  useEffect(() => {
    const up = () => setSpace(false);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", up);
    };
  }, []);
  useEffect(() => {
    const target = svg.current;
    if (!target) return;
    const observer = new ResizeObserver(() => {
      const r = target.getBoundingClientRect();
      if (r.height) setRatio(r.width / r.height);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  useEffect(() => {
    const target = svg.current;
    if (!target) return;
    let frame = 0,
      pending: Camera | null = null;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = target.getBoundingClientRect(),
        c = pending ?? cameraRef.current;
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = 0.5 - (event.clientY - rect.top) / rect.height;
      const aspect = rect.width / rect.height;
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const span = Math.max(
        10,
        Math.min(
          2e9,
          c.span * Math.exp(Math.max(-600, Math.min(600, delta)) * 0.001),
        ),
      );
      pending = {
        span,
        x: c.x + x * (c.span - span),
        y: c.y + (y * (c.span - span)) / aspect,
      };
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0;
          if (pending) setCamera(pending);
          pending = null;
        });
    };
    target.addEventListener("wheel", wheel, { passive: false });
    return () => {
      target.removeEventListener("wheel", wheel);
      cancelAnimationFrame(frame);
    };
  }, [setCamera]);
  // Subtract the f64 camera origin before SVG conversion. Large raw SVG/font coordinates are clamped by browsers.
  const height = 1000 / ratio,
    scale = 1000 / camera.span,
    minX = camera.x - camera.span / 2,
    minY = camera.y - camera.span / ratio / 2;
  const px = (x: number) => (x - camera.x) * scale + 500,
    py = (y: number) => height / 2 - (y - camera.y) * scale;
  const viewport = { width: 1000, height };
  const point = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return {
      x: camera.x + ((e.clientX - r.left) / r.width - 0.5) * camera.span,
      y:
        camera.y -
        (((e.clientY - r.top) / r.height - 0.5) * camera.span) / ratio,
    };
  };
  const start = (
    e: PointerEvent<SVGElement>,
    id: string,
    original: { x: number; y: number },
    vertex?: number,
    side?: "in" | "out",
  ) => {
    if (drawing || creationShape || space || tool === "pan" || e.button !== 0)
      return;
    e.preventDefault();
    e.stopPropagation();
    svg.current!.setPointerCapture(e.pointerId);
    svg.current!.focus();
    if (!selections.includes(id) || (e.shiftKey && vertex === undefined))
      onSelect(id, e.shiftKey);
    if (vertex !== undefined) onPointSelect(vertex);
    setDrag({
      id,
      vertex,
      side,
      pointer: e.pointerId,
      additive: e.shiftKey,
      independent: e.altKey,
      screen: { x: e.clientX, y: e.clientY },
      moved: false,
      start: point(e),
      original,
      preview: original,
    });
  };
  const moving = subtree(doc, selections);
  for (let i = 0; i < doc.bodies.length; i++)
    for (const b of doc.bodies)
      if (b.parentId && moving.has(b.parentId)) moving.add(b.id);
  const position = (id: string, x: number, y: number) =>
    drag &&
    drag.id !== "pan" &&
    drag.id !== "marquee" &&
    drag.vertex === undefined &&
    (id === drag.id || moving.has(id))
      ? {
          x: x + drag.preview.x - drag.original.x,
          y: y + drag.preview.y - drag.original.y,
        }
      : { x, y };
  const step = 10 ** Math.floor(Math.log10(camera.span / 8)),
    linesX: number[] = [],
    linesY: number[] = [];
  for (
    let x = Math.ceil(minX / step) * step;
    x <= minX + camera.span;
    x += step
  )
    linesX.push(x);
  for (
    let y = Math.ceil(minY / step) * step;
    y <= minY + camera.span / ratio;
    y += step
  )
    linesY.push(y);
  const fieldShape = (f: MapZone) => {
    if (drag?.id === f.id && drag.vertex !== undefined && drag.side) {
      f = { ...f, vertices: structuredClone(f.vertices) };
      const a = f.vertices[drag.vertex];
      setZoneHandle(
        a,
        drag.side,
        { x: drag.preview.x - f.x - a.x, y: drag.preview.y - f.y - a.y },
        drag.independent,
      );
    }
    const p = position(f.id, f.x, f.y);
    return f.shape === "ellipsoid" ? (
      <ellipse
        cx={px(p.x)}
        cy={py(p.y)}
        rx={(f.width / 2) * scale}
        ry={(f.length / 2) * scale}
      />
    ) : f.shape === "box" ? (
      <rect
        x={px(p.x - f.width / 2)}
        y={py(p.y + f.length / 2)}
        width={f.width * scale}
        height={f.length * scale}
      />
    ) : (
      <path
        d={
          f.vertices
            .map((v, i) => {
              const q =
                drag?.id === f.id && drag.vertex === i && !drag.side
                  ? { x: drag.preview.x - p.x, y: drag.preview.y - p.y }
                  : v;
              const n = f.vertices[(i + 1) % f.vertices.length];
              const next =
                drag?.id === f.id &&
                drag.vertex === (i + 1) % f.vertices.length &&
                !drag.side
                  ? { x: drag.preview.x - p.x, y: drag.preview.y - p.y }
                  : n;
              const out =
                drag?.id === f.id && drag.vertex === i && drag.side === "out"
                  ? {
                      x: drag.preview.x - p.x - q.x,
                      y: drag.preview.y - p.y - q.y,
                    }
                  : v.out;
              const incoming =
                drag?.id === f.id &&
                drag.vertex === (i + 1) % f.vertices.length &&
                drag.side === "in"
                  ? {
                      x: drag.preview.x - p.x - next.x,
                      y: drag.preview.y - p.y - next.y,
                    }
                  : n.in;
              const move =
                i === 0 ? `M ${px(p.x + q.x)} ${py(p.y + q.y)} ` : "";
              return (
                move +
                (out || incoming
                  ? `C ${px(p.x + q.x + (out?.x ?? 0))} ${py(p.y + q.y + (out?.y ?? 0))} ${px(p.x + next.x + (incoming?.x ?? 0))} ${py(p.y + next.y + (incoming?.y ?? 0))} ${px(p.x + next.x)} ${py(p.y + next.y)} `
                  : `L ${px(p.x + next.x)} ${py(p.y + next.y)} `)
              );
            })
            .join("") + "Z"
        }
      />
    );
  };
  const labels = new Set<string>(),
    placed: { x: number; y: number }[] = [];
  for (const b of [...doc.bodies].sort(
    (a, b) =>
      Number(b.id === selection) - Number(a.id === selection) ||
      Number(mapBodyRole(a, doc.bodies) === "moon") -
        Number(mapBodyRole(b, doc.bodies) === "moon"),
  )) {
    const p = { x: px(b.x), y: py(b.y) };
    if (
      !placed.some((q) => Math.abs(q.x - p.x) < 125 && Math.abs(q.y - p.y) < 20)
    ) {
      labels.add(b.id);
      placed.push(p);
    }
  }
  return (
    <div className="map-chart">
      <MapBackground doc={doc} camera={camera} ratio={ratio} />
      <svg
        onContextMenu={(e) => e.preventDefault()}
        ref={svg}
        data-gesture-active={!!drag}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.code === "Space") {
            e.preventDefault();
            setSpace(true);
          }
        }}
        role="img"
        aria-label="System map — top-down spatial grid"
        viewBox={`0 0 1000 ${height}`}
        onPointerDown={(e) => {
          e.currentTarget.focus();
          const p = point(e);
          if (drawing && !space && tool !== "pan" && e.button === 0) {
            onDraw(p);
            return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({
            id:
              space || tool === "pan" || e.button !== 0
                ? "pan"
                : creationShape
                  ? "create"
                  : "marquee",
            pointer: e.pointerId,
            additive: e.shiftKey,
            independent: false,
            screen: { x: e.clientX, y: e.clientY },
            moved: false,
            start: p,
            original: creationShape ? p : { x: camera.x, y: camera.y },
            preview: creationShape ? p : { x: camera.x, y: camera.y },
          });
        }}
        onPointerMove={(e) => {
          const p = point(e);
          setCursor(p);
          if (drag && drag.pointer === e.pointerId) {
            const dx = p.x - drag.start.x,
              dy = p.y - drag.start.y;
            if (drag.id === "pan")
              setCamera({ ...camera, x: camera.x - dx, y: camera.y - dy });
            else
              setDrag({
                ...drag,
                moved:
                  drag.moved ||
                  Math.hypot(
                    e.clientX - drag.screen.x,
                    e.clientY - drag.screen.y,
                  ) > 3,
                preview: {
                  x:
                    drag.id === "marquee" || drag.id === "create"
                      ? p.x
                      : Math.round(drag.original.x + dx),
                  y:
                    drag.id === "marquee" || drag.id === "create"
                      ? p.y
                      : Math.round(drag.original.y + dy),
                },
              });
          }
        }}
        onPointerUp={(e) => {
          if (!drag || drag.pointer !== e.pointerId) return;
          if (drag.id === "create") {
            if (drag.moved) onCreateBounds(drag.start, drag.preview);
          } else if (drag.id === "marquee") {
            const within = (p: { x: number; y: number }) =>
              p.x >= Math.min(drag.start.x, drag.preview.x) &&
              p.x <= Math.max(drag.start.x, drag.preview.x) &&
              p.y >= Math.min(drag.start.y, drag.preview.y) &&
              p.y <= Math.max(drag.start.y, drag.preview.y);
            onMarquee(
              drag.moved
                ? [
                    ...(layers.bodies ? doc.bodies : []),
                    ...(layers.fields ? mapZones(doc) : []),
                  ]
                    .filter(within)
                    .map((z) => z.id)
                : [],
              drag.additive,
            );
          } else if (drag.moved && drag.id !== "pan") {
            if (drag.vertex !== undefined && drag.side)
              onHandle(
                drag.id,
                drag.vertex,
                drag.side,
                drag.preview.x,
                drag.preview.y,
                drag.independent,
              );
            else if (drag.vertex !== undefined)
              onVertex(drag.id, drag.vertex, drag.preview.x, drag.preview.y);
            else onMove(drag.id, drag.preview.x, drag.preview.y);
          }
          setDrag(null);
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => setDrag(null)}
        onLostPointerCapture={() => setDrag(null)}
      >
        <defs>
          <clipPath id="zone-root-clip">
            <circle
              cx={px(systemCenter(doc).x)}
              cy={py(systemCenter(doc).y)}
              r={doc.radius * scale}
            />
          </clipPath>
          {mapZones(doc).map((f) => (
            <clipPath key={f.id} id={`zone-clip-${f.id}`}>
              <g
                clipPath={`url(#${f.parentId && f.parentId !== doc.id ? `zone-clip-${f.parentId}` : "zone-root-clip"})`}
              >
                {fieldShape(f)}
              </g>
            </clipPath>
          ))}
        </defs>
        <rect width={1000} height={height} fill="transparent" />
        {drag?.id === "create" && (
          <g className="map-drawing" fill="#71ddf320">
            {creationShape === "ellipsoid" ? (
              <ellipse
                cx={(px(drag.start.x) + px(drag.preview.x)) / 2}
                cy={(py(drag.start.y) + py(drag.preview.y)) / 2}
                rx={(Math.abs(drag.preview.x - drag.start.x) * scale) / 2}
                ry={(Math.abs(drag.preview.y - drag.start.y) * scale) / 2}
              />
            ) : (
              <rect
                x={Math.min(px(drag.start.x), px(drag.preview.x))}
                y={Math.min(py(drag.start.y), py(drag.preview.y))}
                width={Math.abs(drag.preview.x - drag.start.x) * scale}
                height={Math.abs(drag.preview.y - drag.start.y) * scale}
              />
            )}
          </g>
        )}
        {layers.grid && (
          <g className="map-grid">
            {linesX.map((x, i) => (
              <g key={x}>
                <path d={`M ${px(x)} 0 v ${height}`} />
                {i % Math.max(1, Math.ceil(linesX.length / 10)) === 0 && (
                  <text x={px(x) + 4} y={15} fontSize={11}>
                    {meters(x)}
                  </text>
                )}
              </g>
            ))}
            {linesY.map((y) => (
              <path key={y} d={`M 0 ${py(y)} h 1000`} />
            ))}
          </g>
        )}
        <path
          className="map-system-boundary"
          d={visibleCirclePath(
            px(systemCenter(doc).x),
            py(systemCenter(doc).y),
            doc.radius * scale,
            viewport,
          )}
          style={{ stroke: doc.color ?? "#6ca6cb" }}
        />
        {layers.fields &&
          mapZones(doc).map((f) => (
            <g
              key={f.id}
              clipPath={`url(#${f.parentId && f.parentId !== doc.id ? `zone-clip-${f.parentId}` : "zone-root-clip"})`}
              aria-label={f.name}
              className={`map-field ${selections.includes(f.id) ? "selected" : ""}`}
              style={{
                stroke: f.color ?? "#6ca6cb",
                fill: (f.color ?? "#6ca6cb") + "20",
              }}
              onDoubleClick={(e) => {
                if (
                  tool !== "direct" ||
                  f.shape !== "polygon" ||
                  f.vertices.length >= 64
                )
                  return;
                e.stopPropagation();
                const p = point(e);
                let best = { distance: Infinity, index: 0, t: 0.5 };
                f.vertices.forEach((a, i) => {
                  const b = f.vertices[(i + 1) % f.vertices.length];
                  for (let step = 1; step < 100; step++) {
                    const t = step / 100,
                      q =
                        a.out || b.in
                          ? cubicAt(a, b, t)
                          : {
                              x: a.x + (b.x - a.x) * t,
                              y: a.y + (b.y - a.y) * t,
                            };
                    const distance = Math.hypot(
                      q.x + f.x - p.x,
                      q.y + f.y - p.y,
                    );
                    if (distance < best.distance)
                      best = { distance, index: i, t };
                  }
                });
                if (best.distance * scale < 15)
                  onInsert(f.id, best.index, best.t);
              }}
              onPointerDown={(e) => start(e, f.id, { x: f.x, y: f.y })}
            >
              {fieldShape(f)}
              <text x={px(f.x)} y={py(f.y + f.length / 2) - 8} fontSize={14}>
                {f.name}
              </text>
            </g>
          ))}
        {layers.fields && (
          <g className="map-asteroids" pointerEvents="none">
            {asteroids
              .filter((a) =>
                diskVisible(
                  px(a.x),
                  py(a.y),
                  Math.max(a.radius * scale, 1.5),
                  viewport,
                ),
              )
              .map((a) => (
                <circle
                  key={a.id}
                  cx={px(a.x)}
                  cy={py(a.y)}
                  r={Math.max(a.radius * scale, 1.5)}
                />
              ))}
          </g>
        )}
        {layers.orbits && (
          <g className="map-orbits" pointerEvents="none">
            {doc.bodies.map((b) => {
              const parent = doc.bodies.find((p) => p.id === b.parentId);
              if (!parent) return null;
              const q = position(b.id, b.x, b.y),
                p = position(parent.id, parent.x, parent.y);
              const radius = Math.hypot(q.x - p.x, q.y - p.y) * scale;
              if (!showOrbit(radius, parent.kind !== "star")) return null;
              const path = visibleCirclePath(
                px(p.x),
                py(p.y),
                radius,
                viewport,
              );
              if (!path) return null;
              return (
                <path
                  key={b.id}
                  d={path}
                  className={
                    parent.kind === "star" ? "planet-orbit" : "moon-orbit"
                  }
                />
              );
            })}
          </g>
        )}
        {layers.bodies &&
          doc.bodies.map((b) => {
            const p = position(b.id, b.x, b.y),
              r = Math.max(
                b.radius * scale,
                mapBodyRole(b, doc.bodies) === "moon" ? 8 : 14,
              );
            const imageRadius = r / portraitRadiusFraction(b.appearance);
            if (!diskVisible(px(p.x), py(p.y), imageRadius, viewport))
              return null;
            return (
              <g
                key={b.id}
                className={`map-body ${mapBodyRole(b, doc.bodies)} ${selections.includes(b.id) ? "selected" : ""}`}
                aria-label={b.name}
                onPointerDown={(e) => start(e, b.id, { x: b.x, y: b.y })}
              >
                <circle
                  className={
                    thumbnails[b.id] ? "map-portrait-outline" : undefined
                  }
                  cx={px(p.x)}
                  cy={py(p.y)}
                  r={r}
                />
                {thumbnails[b.id] ? (
                  <image
                    className="map-body-image"
                    href={thumbnails[b.id]}
                    x={px(p.x) - imageRadius}
                    y={py(p.y) - imageRadius}
                    width={imageRadius * 2}
                    height={imageRadius * 2}
                  >
                    <title>
                      {b.name} · asset portrait: {b.appearance}
                    </title>
                  </image>
                ) : (
                  <title>{b.name} · asset portrait unavailable</title>
                )}
                {labels.has(b.id) &&
                  px(p.x) + r < 1000 &&
                  px(p.x) + r > -100 &&
                  py(p.y) > -20 &&
                  py(p.y) < height + 20 && (
                    <text x={px(p.x) + r + 5} y={py(p.y) + 4} fontSize={13}>
                      {b.name}
                    </text>
                  )}
              </g>
            );
          })}
        {layers.ships &&
          ships.map((s) => (
            <g
              key={s.shipId}
              className="map-ship"
              onPointerDown={(e) => {
                e.stopPropagation();
                onSelect(s.shipId);
              }}
              aria-label={`Live ship ${s.name}`}
            >
              <path
                transform={`translate(${px(s.x)} ${py(s.y)}) rotate(${(-s.heading * 180) / Math.PI})`}
                d="M 0 -9 L 6 7 L 0 4 L -6 7 Z"
              />
              <text x={px(s.x) + 9} y={py(s.y)} fontSize={13}>
                {s.name}
              </text>
            </g>
          ))}
        {layers.fields &&
          tool === "direct" &&
          mapZones(doc)
            .filter((f) => f.id === selection && f.shape === "polygon")
            .flatMap((f) =>
              f.vertices.map((v, i) => {
                const p =
                  drag?.id === f.id && drag.vertex === i && !drag.side
                    ? drag.preview
                    : { x: f.x + v.x, y: f.y + v.y };
                return (
                  <g key={`${f.id}:${i}`}>
                    {i === pointIndex &&
                      (["in", "out"] as const).map((side) => {
                        const h = v[side];
                        if (!h) return null;
                        const q =
                          drag?.id === f.id &&
                          drag.vertex === i &&
                          drag.side === side
                            ? drag.preview
                            : { x: p.x + h.x, y: p.y + h.y };
                        return (
                          <g key={side}>
                            <line
                              x1={px(p.x)}
                              y1={py(p.y)}
                              x2={px(q.x)}
                              y2={py(q.y)}
                              stroke="#8fc9ed"
                            />
                            <circle
                              aria-label={`${side} handle ${i + 1}`}
                              cx={px(q.x)}
                              cy={py(q.y)}
                              r={4}
                              fill="#87cceb"
                              onPointerDown={(e) => start(e, f.id, q, i, side)}
                            />
                          </g>
                        );
                      })}
                    <circle
                      aria-label={`Anchor ${i + 1}`}
                      className="map-vertex"
                      cx={px(p.x)}
                      cy={py(p.y)}
                      r={i === pointIndex ? 7 : 5}
                      onPointerDown={(e) => start(e, f.id, p, i)}
                    />
                  </g>
                );
              }),
            )}
        {drag?.id === "marquee" && drag.moved && (
          <rect
            x={px(Math.min(drag.start.x, drag.preview.x))}
            y={py(Math.max(drag.start.y, drag.preview.y))}
            width={Math.abs(drag.preview.x - drag.start.x) * scale}
            height={Math.abs(drag.preview.y - drag.start.y) * scale}
            fill="#72b8d522"
            stroke="#8bd9fa"
            pointerEvents="none"
          />
        )}
        {drawing && (
          <g className="map-drawing">
            <polyline
              points={[...drawing, cursor]
                .map((p) => `${px(p.x)},${py(p.y)}`)
                .join(" ")}
            />
            {drawing.map((p, i) => (
              <circle key={i} cx={px(p.x)} cy={py(p.y)} r={4} />
            ))}
          </g>
        )}
      </svg>
      <div className="map-coordinates">
        X {meters(cursor.x)} · Y {meters(cursor.y)}{" "}
        <span>Grid {meters(step)} · top down</span>
      </div>
    </div>
  );
}
