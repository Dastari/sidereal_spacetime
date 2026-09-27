import {
  moveMapBody,
  mapBodyRole,
  type SystemMapDocument,
} from "@sidereal/content/system-map";
export const mapZones = (doc: SystemMapDocument) => [
  ...doc.fields,
  ...(doc.zones ?? []),
];
export function subtree(doc: SystemMapDocument, ids: readonly string[]) {
  const selected = new Set(ids);
  for (let i = 0; i < 48; i++)
    for (const z of mapZones(doc))
      if (z.parentId && selected.has(z.parentId)) selected.add(z.id);
  return selected;
}
export function moveMapSelection(
  doc: SystemMapDocument,
  ids: readonly string[],
  dx: number,
  dy: number,
  dh = 0,
) {
  const selected = new Set(ids),
    bodies = new Map(doc.bodies.map((b) => [b.id, b]));
  for (const id of ids) {
    const b = bodies.get(id);
    if (!b) continue;
    let p = b.parentId,
      skip = false;
    const seen = new Set<string>();
    while (p && !seen.has(p)) {
      seen.add(p);
      if (selected.has(p)) skip = true;
      p = bodies.get(p)?.parentId;
    }
    if (!skip)
      moveMapBody(doc, id, { x: b.x + dx, y: b.y + dy, height: b.height + dh });
  }
  const moving = subtree(doc, ids);
  for (const z of mapZones(doc))
    if (moving.has(z.id)) {
      z.x += dx;
      z.y += dy;
      z.height += dh;
    }
}
export function duplicateMapSelection(
  doc: SystemMapDocument,
  ids: readonly string[],
  allocate: () => string,
  offset = 20,
): string[] {
  const selected = subtree(doc, ids),
    remap = new Map(
      mapZones(doc)
        .filter((z) => selected.has(z.id))
        .map((z) => [z.id, allocate()]),
    );
  for (const list of [doc.fields, doc.zones ?? (doc.zones = [])])
    for (const source of [...list])
      if (remap.has(source.id)) {
        const copy = structuredClone(source);
        copy.id = remap.get(source.id)!;
        copy.name = `${source.name.slice(0, 74)} copy`;
        copy.x += offset;
        copy.y += offset;
        if (copy.parentId)
          copy.parentId = remap.get(copy.parentId) ?? copy.parentId;
        list.push(copy as (typeof list)[number] & (typeof doc.fields)[number]);
      }
  return [...remap.values()];
}
export function deleteMapSelection(
  doc: SystemMapDocument,
  ids: readonly string[],
) {
  const selected = subtree(doc, ids);
  doc.fields = doc.fields.filter((z) => !selected.has(z.id));
  doc.zones = doc.zones?.filter((z) => !selected.has(z.id));
}

export function zoneOutline(doc: SystemMapDocument) {
  const all = mapZones(doc),
    seen = new Set<string>(),
    result: { zone: (typeof all)[number]; depth: number }[] = [];
  const visit = (zone: (typeof all)[number], depth: number) => {
    if (seen.has(zone.id)) return;
    seen.add(zone.id);
    result.push({ zone, depth });
    all
      .filter((c) => c.parentId === zone.id)
      .forEach((c) => visit(c, depth + 1));
  };
  all
    .filter(
      (z) =>
        !z.parentId ||
        z.parentId === doc.id ||
        !all.some((p) => p.id === z.parentId),
    )
    .forEach((z) => visit(z, 0));
  all.forEach((z) => visit(z, 0));
  return result;
}

/** Reparenting changes the relationship only; world transforms and IDs stay intact. */
export function reparentMapObject(
  doc: SystemMapDocument,
  id: string,
  parentId: string,
) {
  if (id === parentId) throw Error("An object cannot contain itself.");
  const body = doc.bodies.find((b) => b.id === id);
  if (body) {
    if (body.kind === "star") throw Error("Stars remain at the system root.");
    const parent = doc.bodies.find((b) => b.id === parentId);
    if (
      parentId !== doc.id &&
      (!parent ||
        mapBodyRole(parent, doc.bodies) === "moon" ||
        (mapBodyRole(body, doc.bodies) === "moon" && parent.kind !== "planet"))
    )
      throw Error(
        "Drop a planet on a star, or a moon on a planet in this system.",
      );
    const seen = new Set([id]);
    let current = parent;
    while (current) {
      if (seen.has(current.id))
        throw Error("An object cannot be moved into its own descendants.");
      seen.add(current.id);
      current = doc.bodies.find((b) => b.id === current?.parentId);
    }
    body.parentId = parent?.id ?? null;
    return;
  }
  const zone = mapZones(doc).find((z) => z.id === id);
  if (!zone) throw Error("Live ships cannot be reassigned in the editor.");
  if (parentId !== doc.id && !mapZones(doc).some((z) => z.id === parentId))
    throw Error("Drop a zone on a zone or its system.");
  if (subtree(doc, [id]).has(parentId))
    throw Error("A zone cannot contain its ancestor.");
  zone.parentId = parentId;
}
