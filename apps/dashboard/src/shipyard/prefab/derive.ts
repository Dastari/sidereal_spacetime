/** Cached derivations shared by the plan, stats and validation panels. */
import { readShipPrefab, volumeGeometry, type PrefabIssue, type PrefabVolume, type ShipPrefabDocumentV1, type VolumeGeometry } from "@sidereal/content/ship-prefab";
import type { PrefabSelection } from "./commands";

const geometryCache = new WeakMap<PrefabVolume, VolumeGeometry>();

/** Volume geometry is recomputed only for volumes whose object changed. */
export function geometriesOf(doc: ShipPrefabDocumentV1): VolumeGeometry[] {
  return doc.volumes.map((v) => {
    let g = geometryCache.get(v);
    if (!g) {
      g = volumeGeometry(v);
      geometryCache.set(v, g);
    }
    return g;
  });
}

/** Schema admission (the same strict reader the server uses) as an issue, if it fails. */
export function admissionIssue(doc: ShipPrefabDocumentV1): PrefabIssue | null {
  try {
    readShipPrefab(doc);
    return null;
  } catch (e) {
    return {
      severity: "error",
      code: "document.admission",
      message: String(e instanceof Error ? e.message : e),
      ref: { kind: "document" },
    };
  }
}

export function issueSelection(issue: PrefabIssue): PrefabSelection | null {
  const r = issue.ref;
  if (r.kind === "document") return null;
  if (r.kind === "volume") return r.tile !== undefined ? { kind: "tile", volume: r.id, index: r.tile } : { kind: "volume", id: r.id };
  return { kind: r.kind, id: r.id } as PrefabSelection;
}

export const sameSelection = (a: PrefabSelection | null, b: PrefabSelection | null) => JSON.stringify(a) === JSON.stringify(b);
