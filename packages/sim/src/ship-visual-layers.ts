/** Complete grammar-derived visual chassis. No caller in authority imports this module. */
import {
  G,
  insidePolygon,
  placedTilePolygon,
  type Pt,
} from "@sidereal/content/construction-grammar";
import { bowGlass, bowHeights } from "@sidereal/content/bow-profiles";
import {
  deriveInterior,
  volumeGeometry,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import {
  SHIP_VISUAL_PROFILES,
  type ShipVisualLayer,
  type ShipVisualProfileId,
  type ShipVisualView,
} from "@sidereal/content/ship-visual";
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import { polygonBoundarySample } from "./ship-visual-sampler";

const mod = (n: number, d: number) => ((n % d) + d) % d;
export function shipVisualLayers(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  profileId: ShipVisualProfileId,
): ShipVisualLayer[] {
  const profile = SHIP_VISUAL_PROFILES[profileId],
    layers: ShipVisualLayer[] = [];
  const box = (
    id: string,
    role: ShipVisualLayer["role"],
    slot: ShipKitSlot,
    b: number[],
    support?: string,
  ) => {
    const q = b.map(Math.round) as ShipVisualLayer["bounds"];
    if (q.some((n, i) => i < 3 && n >= q[i + 3])) return;
    layers.push({ id, role, slot, bounds: q, support });
  };
  let shellNormal: [number, number, number] | undefined;
  const column = (
    id: string,
    role: ShipVisualLayer["role"],
    slot: ShipKitSlot,
    x: number,
    y: number,
    z0: number,
    z1: number,
    support: string,
  ) => {
    const before = layers.length;
    box(id, role, slot, [x, y, z0, x + 1, y + 1, z1], support);
    if (
      shellNormal &&
      layers.length > before &&
      !["floor", "roof", "void", "service"].includes(role)
    )
      layers[layers.length - 1].normalHint = shellNormal;
  };
  const interior = deriveInterior(doc, 0, catalog);
  for (const volume of doc.volumes) {
    const geom = volumeGeometry(volume);
    if (!geom.outline) continue;
    const poly = geom.outline.outer.map(([x, y]): Pt => [x * 16, y * 16]);
    const holes = geom.outline.holes.map((h) =>
      h.map(([x, y]): Pt => [x * 16, y * 16]),
    );
    const [bx, by, bX, bY] = geom.bounds.map((v) => Math.round(v * 16));
    const tileCells = new Map<
      string,
      { tile: (typeof volume.tiles)[number]; poly: Pt[] }[]
    >();
    for (const tile of volume.tiles) {
      const poly = placedTilePolygon(tile),
        xs = poly.map((p) => p[0]),
        ys = poly.map((p) => p[1]);
      for (
        let y = Math.floor(Math.min(...ys));
        y < Math.ceil(Math.max(...ys));
        y++
      )
        for (
          let x = Math.floor(Math.min(...xs));
          x < Math.ceil(Math.max(...xs));
          x++
        ) {
          const key = `${x},${y}`;
          tileCells.set(key, [...(tileCells.get(key) ?? []), { tile, poly }]);
        }
    }
    const deck = G.heightClasses[volume.height].walkable;
    const family = `volume:${volume.id}`;
    for (let y = by; y < bY; y++)
      for (let x = bx; x < bX; x++) {
        const p: Pt = [x + 0.5, y + 0.5];
        if (
          !insidePolygon(poly, p[0], p[1]) ||
          holes.some((h) => insidePolygon(h, p[0], p[1]))
        )
          continue;
        const world: Pt = [p[0] / 16, p[1] / 16];
        const tile = tileCells
          .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
          ?.find((t) => insidePolygon(t.poly, world[0], world[1]))?.tile;
        if (!tile) continue;
        const [rawLo, rawHi] = bowHeights(tile, volume.height, world);
        const lo = Math.floor(rawLo),
          hi = Math.ceil(rawHi);
        const floor = tile.bow
          ? lo + G.bowProfiles.shellThicknessTexels[volume.height][0]
          : deck
            ? G.deck.floorTopTexels
            : lo + 2;
        const top =
          view === "deck" && deck ? Math.min(hi, G.deck.shellCutTexels) : hi;
        const boundary = polygonBoundarySample(p, poly),
          distance = boundary.distance;
        shellNormal =
          distance < 4 &&
          Math.abs(boundary.normalHint[0]) > 0.001 &&
          Math.abs(boundary.normalHint[1]) > 0.001
            ? boundary.normalHint
            : undefined;
        // Continuous keel/floor and roof backings are sampled before courses, never carved by seams.
        column(
          `${family}:keel`,
          deck ? "floor" : "core",
          deck ? "dark" : "secondary",
          x,
          y,
          lo,
          Math.max(lo + 1, floor),
          family,
        );
        const floorPhase = mod(
          x + (profile.offsetCourses && mod(Math.floor(y / 16), 2) ? 16 : 0),
          32,
        );
        if (deck && view === "deck" && floorPhase > 0 && mod(y, 16) > 0)
          column(
            `${family}:floor-course`,
            "floor",
            "secondary",
            x,
            y,
            floor - 1,
            floor,
            family,
          );
        if (deck && view === "deck" && !tile.bow) {
          const room = doc.rooms.find(
            (r) =>
              world[0] >= r.rect[0] &&
              world[0] < r.rect[2] &&
              world[1] >= r.rect[1] &&
              world[1] < r.rect[3],
          );
          const u = mod(x, 32),
            v = mod(y, 16);
          const service =
            room?.type === "engineering" ||
            (room?.type === "corridor" &&
              Math.abs(world[1] - (room.rect[1] + room.rect[3]) / 2) < 0.25);
          if (service && u >= 8 && u < 24 && v >= 3 && v < 13) {
            column(
              `${family}:floor-access`,
              "void",
              "dark",
              x,
              y,
              floor - 1,
              floor,
              family,
            );
            if (u === 8 || u === 23 || v === 3 || v === 12 || mod(x, 4) === 0)
              column(
                `${family}:floor-grille`,
                "service",
                "metal",
                x,
                y,
                floor - 1,
                floor,
                family,
              );
          }
        }
        // A global band follows every slope/arc. Bow height comes from the existing approved cross-section.
        if (distance < 4) {
          if (distance >= profile.relief)
            column(`${family}:shell`, "core", "dark", x, y, floor, top, family);
          const along = boundary.alongAxis === 0 ? x : y;
          const rib =
            mod(along, profile.rib) < 2 ||
            (profile.nestedRibs && mod(along, profile.rib) === 5);
          const zRail = 2;
          if (distance < profile.relief) {
            const phase = mod(
              along + (profile.offsetCourses ? Math.floor(top / 12) * 7 : 0),
              profile.course,
            );
            let run = floor,
              previous: ShipKitSlot | null = null,
              previousRole: ShipVisualLayer["role"] = "plate";
            for (let z = floor; z <= top; z++) {
              const rail = z < floor + zRail || z >= top - 2;
              const seam = phase < 1;
              const slot: ShipKitSlot | null =
                z === top
                  ? null
                  : rail || rib
                    ? "trim"
                    : seam
                      ? null
                      : "primary";
              const role = rail || rib ? "frame" : "plate";
              if (slot !== previous || role !== previousRole || z === top) {
                if (previous)
                  column(
                    `${family}:course`,
                    previousRole,
                    previous,
                    x,
                    y,
                    run,
                    z,
                    family,
                  );
                run = z;
                previous = slot;
                previousRole = role;
              }
            }
          }
        }
        if (deck && distance < 4) {
          const along = boundary.alongAxis === 0 ? x : y;
          const phase = mod(along, profile.course);
          if (distance >= 3)
            column(
              `${family}:inner-recess`,
              "void",
              "dark",
              x,
              y,
              floor + 4,
              Math.max(floor + 5, top - 3),
              family,
            );
          // Shared inward service bay: offset plates sit over a continuous pressure backing.
          if (distance >= 3 && phase > 2 && phase < profile.course - 2) {
            column(
              `${family}:inner-panel`,
              "plate",
              "primary",
              x,
              y,
              floor + 5,
              Math.max(floor + 6, top - 3),
              family,
            );
            if (phase >= 5 && phase < profile.course - 5) {
              column(
                `${family}:inner-service`,
                "void",
                "dark",
                x,
                y,
                floor + 9,
                Math.min(top - 7, floor + 23),
                family,
              );
              if (
                phase === 5 ||
                phase === profile.course - 6 ||
                mod(phase, 7) === 0
              )
                column(
                  `${family}:inner-guard`,
                  "frame",
                  "metal",
                  x,
                  y,
                  floor + 9,
                  Math.min(top - 7, floor + 23),
                  family,
                );
            }
            if (phase >= profile.course - 10 && phase < profile.course - 5)
              column(
                `${family}:inner-status`,
                "service",
                "emit_b",
                x,
                y,
                Math.max(floor + 6, top - 7),
                Math.max(floor + 7, top - 5),
                family,
              );
          }
          if (top > floor + 3)
            column(
              `${family}:cap-full`,
              "frame",
              tile.bow ? "primary" : "trim",
              x,
              y,
              top - 2,
              top,
              family,
            );
          if (
            distance < profile.relief &&
            phase >= 6 &&
            phase < 18 &&
            top > floor + 18
          ) {
            // Manufacturer access cassette and louvres are real geometry in the outer shell.
            column(
              `${family}:access-frame`,
              "service",
              "metal",
              x,
              y,
              floor + 8,
              floor + 18,
              family,
            );
            if (phase > 7 && phase < 16) {
              column(
                `${family}:access-recess`,
                "void",
                "dark",
                x,
                y,
                floor + 10,
                floor + 16,
                family,
              );
              if (mod(along, 3) === 0)
                column(
                  `${family}:access-fin`,
                  "service",
                  "trim",
                  x,
                  y,
                  floor + 10,
                  floor + 16,
                  family,
                );
            }
          }
        }
        if ((view === "flight" || !deck) && !bowGlass(tile)) {
          column(`${family}:roof`, "roof", "dark", x, y, hi - 2, hi, family);
          // Finite service islands adjacent to installed systems, quiet panel fields elsewhere.
          const service = doc.mounts.some(
            (m) => Math.hypot(world[0] - m.at[0], world[1] - m.at[1]) < 1.25,
          );
          const u = mod(x, profile.course),
            v = mod(y, 16);
          if (service && u >= 4 && u < profile.course - 4 && v >= 4 && v < 12) {
            const frame = u < 6 || u >= profile.course - 6 || v < 6 || v >= 10;
            if (frame)
              column(
                `${family}:roof-service-frame`,
                "frame",
                "trim",
                x,
                y,
                hi,
                hi + 3,
                family,
              );
            else if (mod(y, 3) === 0)
              column(
                `${family}:roof-louvre`,
                "service",
                "metal",
                x,
                y,
                hi,
                hi + 1,
                family,
              );
          } else if (u > 1 && v > 1)
            column(
              `${family}:roof-course`,
              "plate",
              u >= profile.course - 6 ? "secondary" : "primary",
              x,
              y,
              hi,
              hi + 2,
              family,
            );
        }
        // Bow sill and structural brow: real sampled bands around the optical roof aperture.
        if (tile.bow && bowGlass(tile) && distance < 5) {
          column(
            `${family}:brow`,
            "frame",
            "trim",
            x,
            y,
            hi - 2,
            hi + 2,
            family,
          );
          column(
            `${family}:sill`,
            "frame",
            "primary",
            x,
            y,
            lo,
            Math.min(hi, lo + 4),
            family,
          );
        }
      }
  }
  shellNormal = undefined;
  if (view === "deck") {
    const ft = G.deck.floorTopTexels,
      cap = G.deck.interiorCutTexels + ft;
    const edge = (
      id: string,
      a: Pt,
      b: Pt,
      jamb = false,
      glazed = false,
      half = false,
    ) => {
      const wallCap = half ? ft + 14 : cap;
      const ax = a[0] * 16,
        ay = a[1] * 16,
        bx = b[0] * 16,
        by = b[1] * 16;
      const vertical = Math.abs(ax - bx) < 1e-6,
        span = Math.hypot(bx - ax, by - ay);
      if (!vertical && Math.abs(ay - by) > 1e-6) return; // sampled exterior polygon band already owns slope edges
      const x0 = Math.min(ax, bx),
        y0 = Math.min(ay, by),
        x1 = Math.max(ax, bx),
        y1 = Math.max(ay, by);
      const bounds = vertical
        ? [x0 - 2, y0, ft, x1 + 2, y1, wallCap]
        : [x0, y0 - 2, ft, x1, y1 + 2, wallCap];
      const family = `edge:${id}`;
      const core = [...bounds];
      if (vertical) {
        core[0] += 1;
        core[3] -= 1;
      } else {
        core[1] += 1;
        core[4] -= 1;
      }
      box(`${id}:core`, "core", "dark", core, family);
      for (let start = 0; start < span; start += profile.course) {
        const end = Math.min(span, start + profile.course);
        const Z = glazed ? ft + 11 : wallCap - 3;
        for (const side of [-1, 1]) {
          const q = vertical
            ? [
                x0 + (side < 0 ? -2 : 1),
                y0 + start + 1,
                ft + 6,
                x0 + (side < 0 ? -1 : 2),
                y0 + end - 1,
                Z,
              ]
            : [
                x0 + start + 1,
                y0 + (side < 0 ? -2 : 1),
                ft + 6,
                x0 + end - 1,
                y0 + (side < 0 ? -1 : 2),
                Z,
              ];
          box(
            `${id}:plate`,
            jamb ? "doorframe" : "plate",
            "primary",
            q,
            family,
          );
          // Deep inset cassette framed by the supporting core. Compact status lenses only at interfaces.
          if (end - start >= 16) {
            const bayWidth = glazed || jamb ? 8 : Math.min(22, end - start - 6);
            const u = start + Math.floor((end - start - bayWidth) / 2);
            const serviceTop = Math.min(Z - 1, ft + 24);
            if (serviceTop <= ft + 9) continue;
            const s = vertical
              ? [
                  x0 + (side < 0 ? -2 : 1),
                  y0 + u,
                  ft + 8,
                  x0 + (side < 0 ? -1 : 2),
                  y0 + u + bayWidth,
                  serviceTop,
                ]
              : [
                  x0 + u,
                  y0 + (side < 0 ? -2 : 1),
                  ft + 8,
                  x0 + u + bayWidth,
                  y0 + (side < 0 ? -1 : 2),
                  serviceTop,
                ];
            box(`${id}:cassette`, "service", "metal", s, family);
            const inset = [...s];
            if (vertical) {
              inset[1] += 1;
              inset[4] -= 1;
            } else {
              inset[0] += 1;
              inset[3] -= 1;
            }
            inset[2] += 1;
            inset[5] -= 1;
            box(`${id}:cassette-recess`, "void", "dark", inset, family);
            // Actual recessed grille courses sit over the core; their perimeter carries fasteners.
            for (let z = inset[2] + 1; z < inset[5]; z += 3) {
              const fin = [...inset];
              fin[2] = z;
              fin[5] = z + 1;
              box(`${id}:cassette-grille`, "service", "secondary", fin, family);
            }
            for (const high of [false, true]) {
              const screw = [...s];
              const axis = vertical ? 1 : 0;
              screw[axis] = high ? s[axis + 3] - 2 : s[axis] + 1;
              screw[axis + 3] = screw[axis] + 1;
              screw[2] = s[2] + 1;
              screw[5] = screw[2] + 1;
              box(`${id}:cassette-fastener`, "service", "trim", screw, family);
            }
            if (jamb) {
              const l = [...s];
              l[2] = cap - 6;
              l[5] = cap - 4;
              box(`${id}:status`, "service", "emit_a", l, family);
            }
          }
        }
      }
      const kick = [...bounds];
      kick[5] = ft + 4;
      box(`${id}:kick`, "frame", "trim", kick, family);
      const capbox = [...bounds];
      capbox[2] = wallCap - 3;
      box(`${id}:cap`, "frame", "trim", capbox, family);
      if (glazed) {
        const carve = [...bounds];
        carve[2] = ft + 13;
        carve[5] = cap - 3;
        box(`${id}:glass-aperture`, "void", "dark", carve, family);
      }
    };
    for (const [i, w] of interior.partitions.entries())
      edge(
        `partition:${i}`,
        w.a,
        w.b,
        false,
        w.type === "wall.glazed" ||
          w.type === "window" ||
          w.variant === "glazed",
        w.type === "wall.half" || w.variant === "half",
      );
    // Existing door widths and travel remain intact: only side jambs occupy the module.
    for (const d of interior.doors) {
      if (d.exterior) continue;
      const dx = d.b[0] - d.a[0],
        dy = d.b[1] - d.a[1],
        len = Math.hypot(dx, dy),
        u: Pt = [dx / len, dy / len];
      const p = (t: number): Pt => [d.a[0] + u[0] * t, d.a[1] + u[1] * t];
      edge(`${d.id}:left`, d.a, p(0.375), true);
      edge(`${d.id}:right`, p(len - 0.375), d.b, true);
    }
    for (const [i, p] of interior.posts.entries())
      box(
        `post:${i}`,
        "frame",
        "trim",
        [p[0] * 16 - 2, p[1] * 16 - 2, ft, p[0] * 16 + 2, p[1] * 16 + 2, cap],
        `post:${i}`,
      );
  }
  // Preserve all published exterior apertures through the sampled shell; the authored frame owns them.
  for (const d of interior.doors.filter((d) => d.exterior)) {
    const dx = d.b[0] - d.a[0],
      dy = d.b[1] - d.a[1],
      len = Math.hypot(dx, dy),
      margin = 0.375;
    const a: Pt = [d.a[0] + (dx / len) * margin, d.a[1] + (dy / len) * margin],
      b: Pt = [d.b[0] - (dx / len) * margin, d.b[1] - (dy / len) * margin];
    if (Math.abs(dx) < 1e-6)
      box(`${d.id}:opening`, "void", "dark", [
        a[0] * 16 - 5,
        Math.min(a[1], b[1]) * 16,
        G.deck.floorTopTexels,
        a[0] * 16 + 5,
        Math.max(a[1], b[1]) * 16,
        view === "flight"
          ? 37
          : G.deck.interiorCutTexels + G.deck.floorTopTexels,
      ]);
    else if (Math.abs(dy) < 1e-6)
      box(`${d.id}:opening`, "void", "dark", [
        Math.min(a[0], b[0]) * 16,
        a[1] * 16 - 5,
        G.deck.floorTopTexels,
        Math.max(a[0], b[0]) * 16,
        a[1] * 16 + 5,
        view === "flight"
          ? 37
          : G.deck.interiorCutTexels + G.deck.floorTopTexels,
      ]);
  }
  return compactColumns(layers);
}

/** Merge adjacent source columns before sampling, preserving volume/layer priority order. */
export function compactColumns(
  layers: readonly ShipVisualLayer[],
): ShipVisualLayer[] {
  const groups = new Map<string, ShipVisualLayer[]>();
  for (const l of layers) {
    const [x, y, z, X, Y, Z] = l.bounds;
    const key =
      X - x === 1 && Y - y === 1
        ? `${l.id}:${l.role}:${l.slot}:${l.support}:${l.normalHint?.join(",")}:${y}:${z}:${Z}`
        : `unique:${groups.size}`;
    const g = groups.get(key);
    if (g) g.push(l);
    else groups.set(key, [l]);
  }
  const out: ShipVisualLayer[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.bounds[0] - b.bounds[0]);
    let run = {
      ...g[0],
      bounds: [...g[0].bounds] as ShipVisualLayer["bounds"],
    };
    for (let i = 1; i < g.length; i++) {
      if (run.bounds[3] === g[i].bounds[0]) run.bounds[3] = g[i].bounds[3];
      else {
        out.push(run);
        run = {
          ...g[i],
          bounds: [...g[i].bounds] as ShipVisualLayer["bounds"],
        };
      }
    }
    out.push(run);
  }
  return out;
}
