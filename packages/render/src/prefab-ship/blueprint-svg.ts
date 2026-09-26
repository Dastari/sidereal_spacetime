/**
 * Top-down blueprint of a prefab ship as an SVG string (no Babylon). Used for Shipyard
 * thumbnails and progress evidence. +X (fore) points right, +Y (port) points up.
 */
import { G, type Pt } from "@sidereal/content/construction-grammar";
import {
  deriveInterior,
  placeMount,
  prefabStats,
  validateShipPrefab,
  volumeGeometry,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";

export interface BlueprintOptions {
  /** Pixels per metre. */
  scale?: number;
  margin?: number;
  title?: boolean;
  stats?: boolean;
}

const ROOM_FILL: Record<string, string> = {
  bridge: "#1e4f7a", cockpit: "#1e4f7a", quarters: "#5a3b2b", lounge: "#5a2b4a", galley: "#5a4b2b", medbay: "#2b5a55",
  hydro: "#2f5a2b", engineering: "#28406b", cargo: "#5a4a22", workshop: "#4a3f35", armory: "#5a2626", corridor: "#2c3445", airlock: "#6b4a1e",
};
const MOUNT_FILL: Record<string, string> = {
  propulsion: "#ff9a3c", weapon: "#ff4d5e", defense: "#6fd3ff", sensor: "#9dff7a", utility: "#ffd166", power: "#c792ff",
  thermal: "#7ae0c8", structure: "#e0e0e0", interior: "#b0c4ff", "cargo-door": "#e0e0e0",
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function prefabBlueprintSvg(doc: ShipPrefabDocumentV1, catalog: PrefabComponentCatalog, options: BlueprintOptions = {}): string {
  const s = options.scale ?? 28;
  const margin = options.margin ?? 2.5;
  const geoms = doc.volumes.map(volumeGeometry);
  const mounts = doc.mounts.map((m) => placeMount(m, catalog.get(m.component), geoms));
  const xs = [...geoms.flatMap((g) => [g.bounds[0], g.bounds[2]]), ...mounts.flatMap((m) => [m.rect[0], m.rect[2]])];
  const ys = [...geoms.flatMap((g) => [g.bounds[1], g.bounds[3]]), ...mounts.flatMap((m) => [m.rect[1], m.rect[3]])];
  const titleH = options.title === false ? 0 : 2.2;
  const statsH = options.stats === false ? 0 : 2.4;
  const x0 = Math.floor(Math.min(...xs) - margin);
  const x1 = Math.ceil(Math.max(...xs) + margin);
  const y0 = Math.floor(Math.min(...ys) - margin - statsH);
  const y1 = Math.ceil(Math.max(...ys) + margin + titleH);
  const W = (x1 - x0) * s;
  const H = (y1 - y0) * s;
  const X = (x: number) => ((x - x0) * s).toFixed(1);
  const Y = (y: number) => ((y1 - y) * s).toFixed(1);
  const path = (loop: readonly Pt[]) => `M${loop.map((p) => `${X(p[0])},${Y(p[1])}`).join("L")}Z`;
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Inter, Arial, sans-serif">`);
  out.push(`<rect width="${W}" height="${H}" fill="#0b1a2e"/>`);
  for (let x = x0; x <= x1; x++) out.push(`<line x1="${X(x)}" y1="0" x2="${X(x)}" y2="${H}" stroke="${x % 5 ? "#12294a" : "#1d3d66"}" stroke-width="${x % 5 ? 1 : 1.5}"/>`);
  for (let y = y0; y <= y1; y++) out.push(`<line x1="0" y1="${Y(y)}" x2="${W}" y2="${Y(y)}" stroke="${y % 5 ? "#12294a" : "#1d3d66"}" stroke-width="${y % 5 ? 1 : 1.5}"/>`);
  // Volumes: plates first, then hull.
  for (const g of [...geoms].sort((a, b) => a.z[1] - b.z[1])) {
    if (!g.outline) continue;
    const d = [path(g.outline.outer), ...g.outline.holes.map(path)].join("");
    const fill = g.volume.kind === "plate" ? "#27496f" : g.volume.height === "deck" ? "#34608f" : "#2d557f";
    out.push(`<path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="#bfe3ff" stroke-width="2"/>`);
  }
  // Rooms, walls and doors.
  const interior = deriveInterior(doc, 0, catalog);
  const cellsByRoom = new Map<string, [number, number][]>();
  for (const f of interior.floors) {
    if (!cellsByRoom.has(f.room)) cellsByRoom.set(f.room, []);
    cellsByRoom.get(f.room)!.push(f.cell);
  }
  for (const r of doc.rooms) for (const [cx, cy] of cellsByRoom.get(r.id) ?? []) out.push(`<rect x="${X(cx)}" y="${Y(cy + 1)}" width="${s}" height="${s}" fill="${ROOM_FILL[r.type] ?? "#333"}" opacity="0.85"/>`);
  const line = (a: Pt, b: Pt, colour: string, width: number, dash = "") =>
    out.push(`<line x1="${X(a[0])}" y1="${Y(a[1])}" x2="${X(b[0])}" y2="${Y(b[1])}" stroke="${colour}" stroke-width="${width}" stroke-linecap="square"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`);
  for (const w of interior.exteriorWalls) line(w.a, w.b, "#e8f4ff", 4);
  for (const w of interior.exteriorSlopes) line(w.a, w.b, "#e8f4ff", 4);
  for (const w of interior.partitions) {
    if (w.type === "wall.glazed" || w.type === "window") line(w.a, w.b, "#7fd8ff", 4, "6 3");
    else if (w.type === "wall.half") line(w.a, w.b, "#e8f4ff", 2, "3 4");
    else line(w.a, w.b, "#d6e6f5", 3);
  }
  for (const d of interior.doors) line(d.a, d.b, d.exterior ? "#ffb14a" : "#56e39f", 5);
  for (const p of interior.posts) out.push(`<rect x="${(+X(p[0]) - 3).toFixed(1)}" y="${(+Y(p[1]) - 3).toFixed(1)}" width="6" height="6" fill="#e8f4ff"/>`);
  for (const so of interior.sockets)
    out.push(`<rect x="${X(so.at[0])}" y="${Y(so.at[1] + so.size[1])}" width="${(so.size[0] * s).toFixed(1)}" height="${(so.size[1] * s).toFixed(1)}" fill="none" stroke="#9fb6d6" stroke-width="1" stroke-dasharray="2 2"/>`);
  for (const r of doc.rooms) {
    const cells = cellsByRoom.get(r.id) ?? [];
    if (!cells.length) continue;
    const cx = cells.reduce((t, c) => t + c[0] + 0.5, 0) / cells.length;
    const cy = cells.reduce((t, c) => t + c[1] + 0.5, 0) / cells.length;
    out.push(`<text x="${X(cx)}" y="${Y(cy)}" fill="#ffffff" font-size="${Math.max(9, s * 0.38)}" font-weight="700" text-anchor="middle" dominant-baseline="middle" opacity="0.9">${esc(r.label)}</text>`);
  }
  if (interior.station) out.push(`<circle cx="${X(interior.station.at[0])}" cy="${Y(interior.station.at[1])}" r="${s * 0.22}" fill="#56e39f" stroke="#0b1a2e" stroke-width="2"/>`);
  for (const sk of doc.skylights)
    out.push(`<rect x="${X(sk.at[0])}" y="${Y(sk.at[1] + sk.size[1])}" width="${sk.size[0] * s}" height="${sk.size[1] * s}" fill="#7fd8ff" opacity="0.35" stroke="#7fd8ff" stroke-width="2"/>`);
  // Mounts.
  for (const m of mounts) {
    const cat = m.spec?.category ?? "unknown";
    const fill = MOUNT_FILL[cat.split(".")[0]] ?? "#ffffff";
    const [rx0, ry0, rx1, ry1] = m.rect;
    const inset = m.mount.attach === "interior" ? 0.08 : 0.04;
    out.push(
      `<rect x="${X(rx0 + inset)}" y="${Y(ry1 - inset)}" width="${((rx1 - rx0 - 2 * inset) * s).toFixed(1)}" height="${((ry1 - ry0 - 2 * inset) * s).toFixed(1)}" rx="3" fill="${fill}" fill-opacity="${m.mount.attach === "interior" ? 0.35 : m.mount.attach === "top" ? 0.18 : 0.75}" stroke="${fill}" stroke-width="2"${m.mount.attach === "top" ? ' stroke-dasharray="5 3"' : ""}/>`,
    );
    if (m.mount.attach === "face" && m.spec) {
      // Face mounts: draw the full part envelope outward from the face as an outline.
      const [nx, ny] = { fore: [1, 0], aft: [-1, 0], port: [0, 1], starboard: [0, -1] }[m.mount.normal!];
      const length = m.spec.category === "propulsion" ? Math.max(1, (m.spec.heightTexels / 16) * 1.9) : 1;
      const along = nx !== 0 ? 1 : 0;
      const w = m.spec.cells[0];
      const lo: [number, number] = [0, 0];
      const hi: [number, number] = [0, 0];
      lo[along] = m.anchor[along] - w / 2;
      hi[along] = m.anchor[along] + w / 2;
      const o = along ? nx : ny;
      lo[1 - along] = Math.min(m.anchor[1 - along], m.anchor[1 - along] + o * length);
      hi[1 - along] = Math.max(m.anchor[1 - along], m.anchor[1 - along] + o * length);
      out.push(`<rect x="${X(lo[0])}" y="${Y(hi[1])}" width="${((hi[0] - lo[0]) * s).toFixed(1)}" height="${((hi[1] - lo[1]) * s).toFixed(1)}" fill="none" stroke="${fill}" stroke-width="1.5" stroke-dasharray="4 3"/>`);
    }
    const label = m.mount.component.replace(/\.(sm|md|lg|xl)$/, (x) => x.toUpperCase());
    const mx = (rx0 + rx1) / 2;
    const my = (ry0 + ry1) / 2;
    if (m.mount.attach !== "interior" || s >= 24)
      out.push(`<text x="${X(mx)}" y="${Y(my)}" fill="#0b1a2e" font-size="${Math.max(7, s * 0.22)}" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(label.split(".")[0].slice(0, 10))}</text>`);
  }
  if (options.title !== false) {
    out.push(`<text x="${s * 0.6}" y="${s * 1.1}" fill="#ffffff" font-size="${s * 0.8}" font-weight="800" letter-spacing="1">${esc(doc.name.toUpperCase())}</text>`);
    out.push(`<text x="${s * 0.6}" y="${s * 1.8}" fill="#8fb3d9" font-size="${s * 0.42}">${esc(`${doc.id} | size ${doc.sizeClass} | ${doc.theme} | ${doc.role}`)}</text>`);
  }
  if (options.stats !== false) {
    const st = prefabStats(doc, catalog);
    const errors = validateShipPrefab(doc, catalog).filter((i) => i.severity === "error").length;
    const t = [
      `${st.lengthM} x ${st.beamM} m`,
      `${(st.massKg / 1000).toFixed(1)} t`,
      `thrust ${(st.thrustN / 1000).toFixed(0)} kN`,
      `${st.accelerationMs2.toFixed(2)} m/s2`,
      `power ${(st.powerGenerationW / 1000).toFixed(0)}/${(st.powerDrawW / 1000).toFixed(0)} kW`,
      `heat ${(st.heatGenerationW / 1000).toFixed(0)}/${(st.heatDissipationW / 1000).toFixed(0)} kW`,
      `crew ${st.crew}`,
      errors ? `${errors} ERRORS` : "valid",
    ].join("   ");
    out.push(`<text x="${s * 0.6}" y="${H - s * 0.8}" fill="${errors ? "#ff6b6b" : "#9fe8b8"}" font-size="${s * 0.42}">${esc(t)}</text>`);
  }
  void G;
  out.push("</svg>");
  return out.join("\n");
}
