import { useRef, useState, useEffect, type PointerEvent } from "react";
import {
  mapBodyRole,
  type SystemMapDocument,
  type FieldAsteroid,
  type AsteroidField,
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
  camera,
  setCamera,
  layers,
  drawing,
  onDraw,
}: {
  doc: SystemMapDocument;
  ships: MapShip[];
  asteroids: FieldAsteroid[];
  selection: string;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onVertex: (id: string, index: number, x: number, y: number) => void;
  camera: Camera;
  setCamera: (c: Camera) => void;
  layers: { bodies: boolean; ships: boolean; fields: boolean; grid: boolean };
  drawing: { x: number; y: number }[] | null;
  onDraw: (p: { x: number; y: number }) => void;
}) {
  const svg = useRef<SVGSVGElement>(null),
    [ratio, setRatio] = useState(1.5),
    [cursor, setCursor] = useState({ x: 0, y: 0 }),
    [drag, setDrag] = useState<{
      id: string;
      vertex?: number;
      start: { x: number; y: number };
      original: { x: number; y: number };
      preview: { x: number; y: number };
    } | null>(null);
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
  // Subtract the f64 camera origin before SVG conversion. Large raw SVG/font coordinates are clamped by browsers.
  const height = 1000 / ratio,
    scale = 1000 / camera.span,
    minX = camera.x - camera.span / 2,
    minY = camera.y - camera.span / ratio / 2;
  const px = (x: number) => (x - camera.x) * scale + 500,
    py = (y: number) => height / 2 - (y - camera.y) * scale;
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
  ) => {
    if (drawing) return;
    e.stopPropagation();
    svg.current!.setPointerCapture(e.pointerId);
    onSelect(id);
    setDrag({ id, vertex, start: point(e), original, preview: original });
  };
  const position = (id: string, x: number, y: number) =>
    drag?.id === id && drag.vertex === undefined ? drag.preview : { x, y };
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
  const fieldShape = (f: AsteroidField) => {
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
      <polygon
        points={f.vertices
          .map((v, i) => {
            const q =
              drag?.id === f.id && drag.vertex === i
                ? drag.preview
                : { x: p.x + v.x, y: p.y + v.y };
            return `${px(q.x)},${py(q.y)}`;
          })
          .join(" ")}
      />
    );
  };
  const labels = new Set<string>(),
    placed: { x: number; y: number }[] = [];
  for (const b of [...doc.bodies].sort(
    (a, b) =>
      Number(b.id === selection) - Number(a.id === selection) ||
      Number(mapBodyRole(a) === "moon") - Number(mapBodyRole(b) === "moon"),
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
      <svg
        ref={svg}
        role="img"
        aria-label="System map — top-down spatial grid"
        viewBox={`0 0 1000 ${height}`}
        onPointerDown={(e) => {
          const p = point(e);
          if (drawing) {
            onDraw(p);
            return;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({
            id: "pan",
            start: p,
            original: { x: camera.x, y: camera.y },
            preview: { x: camera.x, y: camera.y },
          });
        }}
        onPointerMove={(e) => {
          const p = point(e);
          setCursor(p);
          if (drag) {
            const dx = p.x - drag.start.x,
              dy = p.y - drag.start.y;
            if (drag.id === "pan")
              setCamera({ ...camera, x: camera.x - dx, y: camera.y - dy });
            else
              setDrag({
                ...drag,
                preview: {
                  x: Math.round(drag.original.x + dx),
                  y: Math.round(drag.original.y + dy),
                },
              });
          }
        }}
        onPointerUp={() => {
          if (drag && drag.id !== "pan") {
            if (drag.vertex !== undefined)
              onVertex(drag.id, drag.vertex, drag.preview.x, drag.preview.y);
            else onMove(drag.id, drag.preview.x, drag.preview.y);
          }
          setDrag(null);
        }}
        onPointerCancel={() => setDrag(null)}
        onWheel={(e) => {
          setCamera({
            ...camera,
            span: Math.max(
              10,
              Math.min(2e8, camera.span * Math.exp(e.deltaY * 0.001)),
            ),
          });
        }}
      >
        <rect width={1000} height={height} fill="var(--map-space)" />
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
        <circle
          className="map-system-boundary"
          cx={px(doc.center.x)}
          cy={py(doc.center.y)}
          r={doc.radius * scale}
        />
        {layers.fields &&
          doc.fields.map((f) => (
            <g
              key={f.id}
              aria-label={f.name}
              className={`map-field ${selection === f.id ? "selected" : ""}`}
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
            {asteroids.map((a) => (
              <circle
                key={a.id}
                cx={px(a.x)}
                cy={py(a.y)}
                r={Math.max(a.radius * scale, 1.5)}
              />
            ))}
          </g>
        )}
        {layers.bodies &&
          doc.bodies.map((b) => {
            const p = position(b.id, b.x, b.y),
              r = Math.max(b.radius * scale, 5);
            return (
              <g
                key={b.id}
                className={`map-body ${mapBodyRole(b)} ${selection === b.id ? "selected" : ""}`}
                aria-label={b.name}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelect(b.id);
                }}
                onPointerDown={(e) => start(e, b.id, { x: b.x, y: b.y })}
              >
                <circle
                  className="true-radius"
                  cx={px(p.x)}
                  cy={py(p.y)}
                  r={b.radius * scale}
                />
                <circle cx={px(p.x)} cy={py(p.y)} r={r} />
                {labels.has(b.id) && (
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
          doc.fields
            .filter((f) => f.id === selection && f.shape === "polygon")
            .flatMap((f) =>
              f.vertices.map((v, i) => (
                <circle
                  key={`${f.id}:${i}`}
                  className="map-vertex"
                  cx={px(
                    drag?.id === f.id && drag.vertex === i
                      ? drag.preview.x
                      : f.x + v.x,
                  )}
                  cy={py(
                    drag?.id === f.id && drag.vertex === i
                      ? drag.preview.y
                      : f.y + v.y,
                  )}
                  r={5}
                  onPointerDown={(e) =>
                    start(e, f.id, { x: f.x + v.x, y: f.y + v.y }, i)
                  }
                />
              )),
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
