import type { ReactNode } from "react";
import {
  MAP_BACKGROUNDS,
  type SystemMapDocument,
} from "@sidereal/content/system-map";
import { mapZones } from "./map-commands";
import { useCelestialSnapshots } from "./useCelestialSnapshots";
export function InspectorIdentity({
  doc,
  id,
  name,
  onName,
  children,
}: {
  doc: SystemMapDocument;
  id: string;
  name: string;
  onName?: (name: string) => void;
  children?: ReactNode;
}) {
  const images = useCelestialSnapshots(doc.bodies);
  const body = doc.bodies.find((b) => b.id === id),
    zone = mapZones(doc).find((z) => z.id === id);
  const background = MAP_BACKGROUNDS.find((b) => b.id === doc.backgroundId);
  return (
    <header className="map-inspector-identity">
      <label>
        Name
        <input
          aria-label="Name"
          value={name}
          readOnly={!onName}
          onChange={(e) => onName?.(e.target.value)}
        />
      </label>
      <label>
        Unique ID
        <input aria-label="Unique ID" value={id} readOnly />
      </label>
      <div className="map-selection-preview">
        {body ? (
          images[id] ? (
            <img alt={`${name} asset preview`} src={images[id]} />
          ) : (
            <span>Asset preview unavailable</span>
          )
        ) : zone ? (
          <svg
            viewBox="0 0 200 120"
            role="img"
            aria-label={`${name} boundary preview`}
          >
            <g
              fill={`${zone.color ?? "#6ca6cb"}33`}
              stroke={zone.color ?? "#6ca6cb"}
              strokeWidth="2"
            >
              {zone.shape === "box" ? (
                <rect x="30" y="20" width="140" height="80" />
              ) : zone.shape === "ellipsoid" ? (
                <ellipse cx="100" cy="60" rx="70" ry="40" />
              ) : (
                <ZoneShape zone={zone} />
              )}
            </g>
          </svg>
        ) : id === doc.id ? (
          background?.asset ? (
            <img
              alt={`${background.name} background`}
              src={`/assets/environment/${background.asset}`}
            />
          ) : (
            <div
              className="map-background-stars"
              role="img"
              aria-label="Deep space starfield"
            />
          )
        ) : (
          <svg viewBox="0 0 200 120" role="img" aria-label="Live ship marker">
            <path d="M100 25 125 90 100 77 75 90Z" fill="#a4ddeb" />
          </svg>
        )}
      </div>
      {children}
    </header>
  );
}
import type { MapZone } from "@sidereal/content/zones";
function ZoneShape({ zone }: { zone: MapZone }) {
  if (!zone.vertices.length) return null;
  const points = zone.vertices.flatMap((v) => [
    v,
    ...(v.in ? [{ x: v.x + v.in.x, y: v.y + v.in.y }] : []),
    ...(v.out ? [{ x: v.x + v.out.x, y: v.y + v.out.y }] : []),
  ]);
  const minX = Math.min(...points.map((p) => p.x)),
    minY = Math.min(...points.map((p) => p.y));
  const width = Math.max(1, Math.max(...points.map((p) => p.x)) - minX),
    height = Math.max(1, Math.max(...points.map((p) => p.y)) - minY);
  const scale = Math.min(160 / width, 90 / height);
  const p = (v: { x: number; y: number }) =>
    `${100 + (v.x - minX - width / 2) * scale} ${60 - (v.y - minY - height / 2) * scale}`;
  return (
    <path
      d={
        `M${p(zone.vertices[0])} ` +
        zone.vertices
          .map((a, i) => {
            const b = zone.vertices[(i + 1) % zone.vertices.length];
            return a.out || b.in
              ? `C${p({ x: a.x + (a.out?.x ?? 0), y: a.y + (a.out?.y ?? 0) })} ${p({ x: b.x + (b.in?.x ?? 0), y: b.y + (b.in?.y ?? 0) })} ${p(b)}`
              : `L${p(b)}`;
          })
          .join(" ") +
        "Z"
      }
    />
  );
}
