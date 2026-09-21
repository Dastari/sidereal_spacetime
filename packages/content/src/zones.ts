import type { MapPoint } from "./system-map";
export interface ZoneVector {
  x: number;
  y: number;
}
export interface ZoneAnchor extends ZoneVector {
  in?: ZoneVector;
  out?: ZoneVector;
  mode?: "corner" | "aligned" | "mirrored";
}
export interface ZoneVolume extends MapPoint {
  shape: "ellipsoid" | "box" | "polygon";
  width: number;
  length: number;
  depth: number;
  vertices: ZoneAnchor[];
}
export interface ZoneMetadata {
  id: string;
  name: string;
  parentId?: string;
  color?: string;
  backgroundId?: string;
  feather?: number;
  priority?: number;
}
export interface MapZone extends ZoneVolume, ZoneMetadata {}
export function newMapZone(id: string, x = 0, y = 0): MapZone {
  return {
    id,
    name: "New zone",
    color: "#6ca6cb",
    x,
    y,
    height: 0,
    shape: "box",
    width: 1000,
    length: 1000,
    depth: 500,
    vertices: [],
  };
}
