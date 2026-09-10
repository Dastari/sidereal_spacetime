import type { LayoutDocument } from "@sidereal/content/ship-layout";

export interface HullSizeDefinition {
  id: string;
  revision: string;
  name: string;
  width: number;
  length: number;
  height: number;
}
export const HULL_CATALOGUE_SCHEMA = "sidereal.hull-size-catalogue.v1";
export function readHullSizes(value: unknown): HullSizeDefinition[] {
  if (!Array.isArray(value) || value.length > 64)
    throw Error("Hull catalogue supports at most64 sizes");
  const ids = new Set<string>();
  return value.map((row) => {
    if (!row || typeof row !== "object") throw Error("Unsupported hull size");
    const r = row as HullSizeDefinition;
    if (
      [r.id, r.revision, r.name].some(
        (v) => typeof v !== "string" || !v.trim() || v.length > 128,
      ) ||
      ids.has(r.id) ||
      [r.width, r.length, r.height].some(
        (n) => !Number.isInteger(n) || n < 16 || n > 8192,
      )
    )
      throw Error(
        "Hull sizes need unique IDs and bounded positive grid dimensions",
      );
    ids.add(r.id);
    return {
      id: r.id,
      revision: r.revision,
      name: r.name,
      width: r.width,
      length: r.length,
      height: r.height,
    };
  });
}
export function readHullCatalogue(raw: string): HullSizeDefinition[] {
  if (raw.length > 65536) throw Error("Hull catalogue exceeds64KiB");
  const v = JSON.parse(raw);
  if (v?.schema !== HULL_CATALOGUE_SCHEMA)
    throw Error("Unsupported hull catalogue version");
  return readHullSizes(v.sizes);
}
export function writeHullCatalogue(
  storage: Pick<Storage, "getItem" | "setItem">,
  key: string,
  expected: string | null,
  sizes: HullSizeDefinition[],
) {
  const checked = readHullSizes(sizes);
  if (storage.getItem(key) !== expected)
    throw Error(
      "Another editor changed the hull catalogue. Reload it before saving your changes.",
    );
  const raw = JSON.stringify({ schema: HULL_CATALOGUE_SCHEMA, sizes: checked });
  storage.setItem(key, raw);
  return raw;
}
/** A neutral starting envelope derived from the current design, not faction balance. */
export function fittedHullEnvelope(doc: LayoutDocument) {
  const points = doc.tiles.flatMap((t) => t.vertices);
  const x = points.length ? Math.min(...points.map((p) => p[0])) : 0,
    y = points.length ? Math.min(...points.map((p) => p[1])) : 0,
    z = Math.min(0, ...doc.decks.map((d) => d.elevation));
  return {
    origin: [x, y, z] as [number, number, number],
    width: Math.max(
      64,
      Math.ceil(
        ((points.length ? Math.max(...points.map((p) => p[0])) : 64) - x) / 64,
      ) * 64,
    ),
    length: Math.max(
      64,
      Math.ceil(
        ((points.length ? Math.max(...points.map((p) => p[1])) : 64) - y) / 64,
      ) * 64,
    ),
    height: Math.max(96, ...doc.decks.map((d) => d.elevation + d.ceiling - z)),
  };
}
