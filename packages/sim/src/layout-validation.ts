import { readLayoutStructure } from "./layout-structure-admission";
import {
  LAYOUT_SCHEMA,
  LAYOUT_LIMITS as L,
  LAYOUT_COMPILER,
  SHAPE_REVISION,
  EXTENDED_SHAPE_REVISION,
  SERVICE_CHANNELS,
  type LayoutDocument,
} from "../../content/src/ship-layout";
import { validateAssembly, type PartCatalog } from "../../content/src/assembly";
const record = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const string = (v: unknown, max = 160): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= max;
const integer = (
  v: unknown,
  min: number = -L.coordinate,
  max: number = L.coordinate,
): v is number =>
  Number.isSafeInteger(v) && Number(v) >= min && Number(v) <= max;
const point = (v: unknown) =>
  Array.isArray(v) && v.length === 2 && v.every((n) => integer(n));
/** Structural admission occurs before geometry or worker allocation. Unsupported bytes remain recoverable. */
export function readLayout(value: unknown): LayoutDocument {
  const fail = (reason: string): never => {
    throw new Error(reason);
  };
  if (!record(value)) return fail("Invalid layout document");
  if (new TextEncoder().encode(JSON.stringify(value)).length > L.bytes)
    fail("Layout exceeds the 1 MiB proposal budget");
  if (value.schema !== LAYOUT_SCHEMA || value.compiler !== LAYOUT_COMPILER)
    fail(
      "Unsupported schema or compiler revision; export the preserved document",
    );
  if (
    !string(value.id) ||
    !string(value.name) ||
    !["ship", "station-module"].includes(value.kind)
  )
    fail("Invalid document identity");
  if (
    !Array.isArray(value.dependencies) ||
    value.dependencies.length > 64 ||
    value.dependencies.some(
      (v: unknown) => !record(v) || !string(v.id) || !string(v.revision),
    )
  )
    fail("Invalid dependencies");
  if (
    !value.dependencies.some(
      (v: any) =>
        v.id === "floor-shapes" &&
        [SHAPE_REVISION, EXTENDED_SHAPE_REVISION].includes(v.revision),
    ) ||
    value.dependencies.some(
      (v: any) =>
        v.id === "floor-shapes" &&
        ![SHAPE_REVISION, EXTENDED_SHAPE_REVISION].includes(v.revision),
    )
  )
    fail("Unknown floor catalog revision; preserve and export this draft");
  if (
    value.source !== null &&
    (!record(value.source) ||
      Object.entries(value.source).some(
        ([k, v]) =>
          ![
            "blueprintId",
            "blueprintRevision",
            "liveId",
            "expectedRevision",
          ].includes(k) || !string(v),
      ))
  )
    fail("Invalid source revision");
  const arrays: Record<string, number> = {
    decks: L.decks,
    tiles: L.tiles,
    partitions: L.edges,
    openings: L.edges,
    rooms: L.tiles,
    fittings: L.fittings,
    routes: L.routeSegments,
    nodes: L.routeSegments,
  };
  const ids = new Set<string>();
  for (const [key, max] of Object.entries(arrays)) {
    if (!Array.isArray(value[key]) || value[key].length > max)
      fail(`${key} budget exceeded or invalid array`);
    for (const item of value[key]) {
      if (!record(item) || !string(item.id) || ids.has(item.id))
        fail(`Invalid or duplicate ${key} identity`);
      ids.add(item.id);
    }
  }
  if (
    !value.decks.length ||
    !value.decks.some((d: any) => d.id === value.playableDeckId)
  )
    fail("Choose one playable planar deck");
  const decks = new Set(value.decks.map((d: any) => d.id));
  for (const key of Object.keys(arrays).filter((k) => k !== "decks"))
    for (const item of value[key])
      if (!decks.has(item.deckId)) fail("Unknown deck reference");
  for (const d of value.decks) {
    if (
      !string(d.name) ||
      !integer(d.order, 0, 7) ||
      !integer(d.elevation) ||
      !integer(d.ceiling, 32, 512) ||
      typeof d.roof !== "boolean" ||
      !Array.isArray(d.holes) ||
      d.holes.length > 128
    )
      fail("Invalid deck");
    for (const h of d.holes) {
      if (!record(h) || !string(h.id) || ids.has(h.id) || !point(h.seed))
        fail("Invalid hole declaration");
      ids.add(h.id);
    }
  }
  if (value.assembly !== undefined) {
    const a = value.assembly;
    if (
      !record(a) ||
      a.schema !== "sidereal.layout-assembly.v1" ||
      !record(a.revisions) ||
      Object.keys(a.revisions).length > L.fittings ||
      Object.entries(a.revisions).some(([k, v]) => !string(k) || !string(v)) ||
      (a.source !== null &&
        (!record(a.source) ||
          !string(a.source.name) ||
          !string(a.source.documentId))) ||
      !Array.isArray(a.parts) ||
      a.parts.length + value.fittings.length > L.fittings
    )
      fail("Invalid visual assembly or unavailable revision");
    // Structural validation is catalog-independent: absent definitions stay recoverable.
    const catalog = {
      schema: "sidereal.part-catalog.v1",
      assets: Object.keys(a.revisions).map((id) => ({ id })),
    } as PartCatalog;
    validateAssembly(
      {
        schema: "sidereal.assembly-draft.v1",
        id: value.id,
        name: value.name,
        parts: a.parts,
      },
      catalog,
    );
    for (const p of a.parts) {
      if (
        ids.has(p.id) ||
        !Object.hasOwn(a.revisions, p.assetId) ||
        p.position.some((n: number) => Math.abs(n) > 256)
      )
        fail("Duplicate visual identity or placement outside 256 m bounds");
      ids.add(p.id);
    }
  }
  for (const t of value.tiles)
    if (
      !["rectangle", "triangle", "trapezoid", "polygon"].includes(t.shape) ||
      ![SHAPE_REVISION, EXTENDED_SHAPE_REVISION].includes(t.revision) ||
      (t.shape === "polygon" && t.revision !== EXTENDED_SHAPE_REVISION) ||
      (t.revision === EXTENDED_SHAPE_REVISION &&
        !value.dependencies.some(
          (d: any) =>
            d.id === "floor-shapes" && d.revision === EXTENDED_SHAPE_REVISION,
        )) ||
      !string(t.material) ||
      !Array.isArray(t.vertices) ||
      t.vertices.length < 3 ||
      t.vertices.length > 8 ||
      !t.vertices.every(point)
    )
      fail("Invalid polygon or unavailable shape revision");
  for (const p of value.partitions)
    if (
      !point(p.a) ||
      !point(p.b) ||
      !["design-sealed", "open-divider"].includes(p.seal)
    )
      fail("Invalid partition");
  for (const o of value.openings)
    if (
      !string(o.partitionId) ||
      !point(o.a) ||
      !point(o.b) ||
      !["door", "passage", "airlock"].includes(o.kind) ||
      !integer(o.clearance, 16, 128) ||
      !integer(o.sill, 0, 128) ||
      (o.setback !== undefined && !integer(o.setback, 1, 128))
    )
      fail("Invalid opening");
  for (const r of value.rooms)
    if (
      !string(r.name) ||
      !string(r.type) ||
      !point(r.seed) ||
      !Array.isArray(r.boundaryIds) ||
      r.boundaryIds.length > L.edges ||
      !r.boundaryIds.every((v: unknown) => string(v)) ||
      !["crew", "visitors", "restricted"].includes(r.access) ||
      !string(r.floorTheme) ||
      !string(r.wallTheme)
    )
      fail("Invalid room");
  for (const f of value.fittings)
    if (
      !string(f.definitionId) ||
      !string(f.revision) ||
      !point(f.position) ||
      !point(f.footprint) ||
      f.footprint.some((n: number) => n < 1) ||
      !integer(f.quarterTurns, 0, 3) ||
      typeof f.reflected !== "boolean" ||
      !integer(f.clearance, 0, 128) ||
      !["equipment", "container"].includes(f.kind) ||
      (f.container !== null &&
        (!record(f.container) ||
          !integer(f.container.columns, 1, 32) ||
          !integer(f.container.rows, 1, 32) ||
          !Array.isArray(f.container.contents) ||
          f.container.contents.length !== 0))
    )
      fail("Invalid fitting; blueprint containers must be empty");
  for (const n of value.nodes)
    if (
      !point(n.point) ||
      !Object.hasOwn(SERVICE_CHANNELS, n.channel) ||
      !["endpoint", "junction"].includes(n.kind) ||
      !["in", "out", "both"].includes(n.direction) ||
      !string(n.medium)
    )
      fail("Invalid typed route node");
  let segments = 0;
  for (const r of value.routes) {
    if (
      !Object.hasOwn(SERVICE_CHANNELS, r.channel) ||
      !string(r.from) ||
      !string(r.to) ||
      !Array.isArray(r.path) ||
      r.path.length < 2 ||
      r.path.length > L.routeSegments + 1 ||
      !r.path.every(point) ||
      (r.capacity !== null &&
        (!Number.isFinite(r.capacity) || r.capacity <= 0 || r.capacity > 1e12))
    )
      fail("Invalid route");
    segments += r.path.length - 1;
  }
  if (segments > L.routeSegments) fail("Utility segment budget exceeded");
  if (
    !record(value.appearance) ||
    !/^#[a-f0-9]{6}$/i.test(value.appearance.primary) ||
    !/^#[a-f0-9]{6}$/i.test(value.appearance.accent) ||
    !string(value.appearance.kit)
  )
    fail("Invalid appearance");
  if (
    value.legacy !== null &&
    (!record(value.legacy) ||
      typeof value.legacy.sourceRaw !== "string" ||
      !Array.isArray(value.legacy.placements) ||
      !Array.isArray(value.legacy.unresolved) ||
      value.legacy.placements.length > L.fittings)
  )
    fail("Invalid preserved assembly source");
  if (value.structure !== undefined) readLayoutStructure(value.structure);
  return value as unknown as LayoutDocument;
}
