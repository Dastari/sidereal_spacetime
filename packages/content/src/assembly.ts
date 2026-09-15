import { validateHullPaint, type HullPaint } from "./hull-paint";
import {
  validateHullDecals,
  MAX_ASSEMBLY_DECALS,
  type HullDecal,
} from "./hull-decals";
/** Asset definitions are reusable; placements carry independent authoring identity.
 * Render batching/instancing never changes this document or merges item IDs.
 */
export type PartCategory =
  | "superstructure"
  | "floor"
  | "wall"
  | "roof"
  | "decoration"
  | "equipment"
  | "cargo"
  | "engine";
export const PART_CATEGORIES: readonly PartCategory[] = [
  "superstructure",
  "floor",
  "wall",
  "roof",
  "decoration",
  "equipment",
  "cargo",
  "engine",
];
/** Presentation fixture, in part-local east/north/up metres. No power grant. */
export interface PartLight {
  position: [number, number, number];
  direction: [number, number, number];
  color: [number, number, number];
  intensity: number;
  range: number;
  angle: number;
}
export interface PartAsset {
  id: string;
  label: string;
  category: PartCategory;
  nodes: string[];
  bounds: { min: number[]; max: number[] };
  lights?: PartLight[];
  thumbnail?: string;
  visual?: {
    url: string;
    sha256: string;
    designId: string;
    revision: number;
    bounds: { min: number[]; max: number[] };
    damagePreview: "unsupported";
    /** Optional named mesh group within one shared Blender-exported kit GLB. */
    nodePrefix?: string;
  };
}
export interface PartPlacement {
  paint?: HullPaint;
  decals?: HullDecal[];
  id: string;
  assetId: string;
  position: [number, number, number];
  rotation: number;
  flipped: boolean;
  removedCells: [number, number, number][];
  /** Imported visual replacements retain their prior local fitting volume.
   * Offset is in the visual's local frame, so moving/rotating/mirroring stays coherent.
   * This is editor fitting metadata, never a server collision or damage grant. */
  fittingProxy?: {
    assetId: string;
    offset: [number, number, number];
    maxZ?: number;
  };
}
export interface AssemblyDocument {
  schema: "sidereal.assembly-draft.v1";
  id: string;
  name: string;
  parts: PartPlacement[];
}
export interface PartCatalog {
  schema: "sidereal.part-catalog.v1";
  assets: PartAsset[];
}
export function validateAssembly(
  value: unknown,
  catalog: PartCatalog,
): AssemblyDocument {
  if (!value || typeof value !== "object") throw new Error("Invalid assembly");
  const d = value as AssemblyDocument;
  if (
    d.schema !== "sidereal.assembly-draft.v1" ||
    typeof d.id !== "string" ||
    typeof d.name !== "string" ||
    !Array.isArray(d.parts) ||
    d.parts.length > 2000
  )
    throw new Error("Invalid assembly document");
  const assets = new Set(catalog.assets.map((a) => a.id)),
    ids = new Set<string>();
  let decalCount = 0;
  for (const p of d.parts) {
    if (
      !p ||
      typeof p.id !== "string" ||
      p.id.length < 1 ||
      p.id.length > 160 ||
      ids.has(p.id) ||
      !assets.has(p.assetId) ||
      !Array.isArray(p.position) ||
      p.position.length !== 3 ||
      !p.position.every((n) => Number.isFinite(n) && Math.abs(n) <= 10000) ||
      !Number.isFinite(p.rotation) ||
      typeof p.flipped !== "boolean"
    )
      throw new Error("Invalid part placement");
    ids.add(p.id);
    validateHullDecals(p.decals);
    validateHullPaint(p.paint);
    decalCount += p.decals?.length ?? 0;
    if (decalCount > MAX_ASSEMBLY_DECALS)
      throw Error("Assembly exceeds 128 hull markings");
    if (
      p.fittingProxy &&
      (!assets.has(p.fittingProxy.assetId) ||
        !Array.isArray(p.fittingProxy.offset) ||
        p.fittingProxy.offset.length !== 3 ||
        !p.fittingProxy.offset.every(
          (n) => Number.isFinite(n) && Math.abs(n) <= 10000,
        ))
    )
      throw new Error("Invalid fitting proxy frame");
    if (
      p.fittingProxy?.maxZ !== undefined &&
      (!Number.isFinite(p.fittingProxy.maxZ) ||
        Math.abs(p.fittingProxy.maxZ) > 10000)
    )
      throw new Error("Invalid fitting proxy top");
    if (
      !Array.isArray(p.removedCells) ||
      p.removedCells.length > 16384 ||
      p.removedCells.some(
        (c) =>
          !Array.isArray(c) || c.length !== 3 || !c.every(Number.isSafeInteger),
      )
    )
      throw new Error("Invalid voxel damage draft");
  }
  return d;
}

export interface AssemblyVoxelSource {
  cellMeters: number;
  layers: { chunks: { origin: number[]; runs: number[] }[] }[];
}
export interface AssemblyVoxelLibrary {
  volumes: Record<string, AssemblyVoxelSource>;
}
export const ASSEMBLY_SNAP_METERS = 1 / 32;
export function snapPlacement(p: PartPlacement): PartPlacement {
  return {
    ...p,
    position: p.position.map(
      (n) => Math.round(n / ASSEMBLY_SNAP_METERS) * ASSEMBLY_SNAP_METERS,
    ) as [number, number, number],
    rotation: Math.round(p.rotation / (Math.PI / 2)) * (Math.PI / 2),
  };
}
const occupancyCache = new WeakMap<
  AssemblyVoxelSource,
  Map<string, number[]>
>();
function occupiedCells(source: AssemblyVoxelSource) {
  let cells = occupancyCache.get(source);
  if (cells) return cells;
  cells = new Map();
  for (const layer of source.layers)
    for (const chunk of layer.chunks) {
      let offset = 0;
      for (let r = 0; r < chunk.runs.length; r += 2) {
        const material = chunk.runs[r],
          count = chunk.runs[r + 1];
        for (let i = offset; material && i < offset + count; i++) {
          const p = [
            chunk.origin[0] + (i % 32),
            chunk.origin[1] + (Math.floor(i / 32) % 32),
            chunk.origin[2] + Math.floor(i / 1024),
          ];
          cells.set(p.join(","), p);
        }
        offset += count;
      }
    }
  occupancyCache.set(source, cells);
  return cells;
}
function transform(
  p: readonly number[],
  placement: PartPlacement,
  inverse = false,
) {
  const c = Math.round(Math.cos(placement.rotation)),
    s = Math.round(Math.sin(placement.rotation)),
    flip = placement.flipped ? -1 : 1;
  if (inverse) {
    const x = p[0] - placement.position[0],
      y = p[1] - placement.position[1];
    return [
      (c * x + s * y) * flip,
      -s * x + c * y,
      p[2] - placement.position[2],
    ];
  }
  return [
    c * p[0] * flip - s * p[1] + placement.position[0],
    s * p[0] * flip + c * p[1] + placement.position[1],
    p[2] + placement.position[2],
  ];
}
function transformedBounds(
  bounds: PartAsset["bounds"],
  placement: PartPlacement,
) {
  const max = [...bounds.max];
  max[2] = Math.min(max[2], placement.fittingProxy?.maxZ ?? Infinity);
  const a = transform(bounds.min, placement),
    b = transform(max, placement);
  return {
    min: a.map((v, i) => Math.min(v, b[i])),
    max: a.map((v, i) => Math.max(v, b[i])),
  };
}
/** Resolve only the independent fitting frame; renderers continue using visual placement. */
export function fittingPlacement(p: PartPlacement): PartPlacement {
  return p.fittingProxy
    ? {
        ...p,
        assetId: p.fittingProxy.assetId,
        position: transform(p.fittingProxy.offset, p) as [
          number,
          number,
          number,
        ],
        fittingProxy:
          p.fittingProxy.maxZ === undefined
            ? undefined
            : {
                assetId: p.fittingProxy.assetId,
                offset: [0, 0, 0],
                maxZ: p.fittingProxy.maxZ,
              },
      }
    : p;
}
/** Narrow-phase occupied-cell test: half-open intervals allow face contact,
 * rotated/flipped hollow modules may interlock even when their AABBs overlap.
 * Validate changed placements only so existing unsupported drafts stay intact. */
export function placementError(
  candidate: PartPlacement,
  document: AssemblyDocument,
  catalog: PartCatalog,
  library: AssemblyVoxelLibrary,
): string | undefined {
  candidate = fittingPlacement(candidate);
  const asset = catalog.assets.find((a) => a.id === candidate.assetId),
    source = library.volumes[candidate.assetId];
  if (!asset || !source)
    return "Part occupancy is unavailable; the draft is preserved.";
  if (
    candidate.position.some(
      (n) => !Number.isFinite(n) || Math.abs(n) > 10000,
    ) ||
    !Number.isFinite(candidate.rotation)
  )
    return "Placement is outside the supported build bounds.";
  if (
    Math.abs(
      candidate.rotation / (Math.PI / 2) -
        Math.round(candidate.rotation / (Math.PI / 2)),
    ) > 1e-7
  )
    return "Rotate in quarter turns before placing this part.";
  const bounds = transformedBounds(asset.bounds, candidate);
  if ([...bounds.min, ...bounds.max].some((n) => Math.abs(n) > 10000))
    return "Part extends outside the supported build bounds.";
  const removed = new Set(candidate.removedCells.map((c) => c.join(",")));
  for (const visualOther of document.parts) {
    const other = fittingPlacement(visualOther);
    if (other.id === candidate.id) continue;
    const otherAsset = catalog.assets.find((a) => a.id === other.assetId),
      otherSource = library.volumes[other.assetId];
    if (!otherAsset || !otherSource)
      return "Part occupancy is unavailable; the draft is preserved.";
    const otherBounds = transformedBounds(otherAsset.bounds, other);
    if (
      bounds.min.some(
        (n, i) =>
          n >= otherBounds.max[i] - 1e-8 ||
          bounds.max[i] <= otherBounds.min[i] + 1e-8,
      )
    )
      continue;
    if (
      Math.abs(
        other.rotation / (Math.PI / 2) -
          Math.round(other.rotation / (Math.PI / 2)),
      ) > 1e-7
    )
      return "An existing part has an unsupported rotation; preserve or correct its draft first.";
    const otherCells = occupiedCells(otherSource),
      otherRemoved = new Set(other.removedCells.map((c) => c.join(",")));
    for (const [key, cell] of occupiedCells(source)) {
      if (
        removed.has(key) ||
        cell[2] * source.cellMeters >=
          (candidate.fittingProxy?.maxZ ?? Infinity)
      )
        continue;
      const a = transform(
        transform(
          cell.map((n) => n * source.cellMeters),
          candidate,
        ),
        other,
        true,
      );
      const end = cell.map((n) => (n + 1) * source.cellMeters);
      end[2] = Math.min(end[2], candidate.fittingProxy?.maxZ ?? Infinity);
      const b = transform(transform(end, candidate), other, true);
      if (Math.min(a[2], b[2]) >= (other.fittingProxy?.maxZ ?? Infinity) - 1e-8)
        continue;
      const lo = a.map((n, i) =>
        Math.floor((Math.min(n, b[i]) + 1e-8) / otherSource.cellMeters),
      );
      const hi = a.map((n, i) =>
        Math.ceil((Math.max(n, b[i]) - 1e-8) / otherSource.cellMeters),
      );
      for (let z = lo[2]; z < hi[2]; z++)
        for (let y = lo[1]; y < hi[1]; y++)
          for (let x = lo[0]; x < hi[0]; x++) {
            const k = `${x},${y},${z}`;
            if (
              z * otherSource.cellMeters >=
              (other.fittingProxy?.maxZ ?? Infinity)
            )
              continue;
            if (otherCells.has(k) && !otherRemoved.has(k))
              return `Placement overlaps ${otherAsset.label} (${other.id}). Snap to a free face or move the part.`;
          }
    }
  }
}

/** Palette drops begin on the build plane. Raise the base to a nearby occupied
 * support surface (up to half a metre), keeping higher roofs out of deck drops. */
export function snapPlacementToSupport(
  candidate: PartPlacement,
  document: AssemblyDocument,
  catalog: PartCatalog,
  library: AssemblyVoxelLibrary,
): PartPlacement {
  const asset = catalog.assets.find((a) => a.id === candidate.assetId);
  if (!asset) return snapPlacement(candidate);
  const snapped = snapPlacement(candidate),
    bounds = transformedBounds(asset.bounds, snapped);
  let support = bounds.min[2];
  for (const visualOther of document.parts) {
    const other = fittingPlacement(visualOther);
    const otherAsset = catalog.assets.find((a) => a.id === other.assetId),
      source = library.volumes[other.assetId];
    if (!otherAsset || !source || other.id === candidate.id) continue;
    const otherBounds = transformedBounds(otherAsset.bounds, other);
    if (
      [0, 1].some(
        (i) =>
          bounds.min[i] >= otherBounds.max[i] ||
          bounds.max[i] <= otherBounds.min[i],
      )
    )
      continue;
    const removed = new Set(other.removedCells.map((c) => c.join(",")));
    for (const [key, cell] of occupiedCells(source)) {
      if (
        removed.has(key) ||
        cell[2] * source.cellMeters >= (other.fittingProxy?.maxZ ?? Infinity)
      )
        continue;
      const a = transform(
          cell.map((n) => n * source.cellMeters),
          other,
        ),
        b = transform(
          cell.map((n) => (n + 1) * source.cellMeters),
          other,
        );
      const top = Math.min(
        b[2],
        other.position[2] + (other.fittingProxy?.maxZ ?? Infinity),
      );
      if (top <= support || top > bounds.min[2] + 0.5) continue;
      if (
        [0, 1].every(
          (i) =>
            Math.min(a[i], b[i]) < bounds.max[i] - 1e-8 &&
            Math.max(a[i], b[i]) > bounds.min[i] + 1e-8,
        )
      )
        support = top;
    }
  }
  return {
    ...snapped,
    position: [
      snapped.position[0],
      snapped.position[1],
      snapped.position[2] + support - bounds.min[2],
    ],
  };
}
