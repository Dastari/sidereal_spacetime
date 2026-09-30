/** r002 source recipes: pressure backing, subframe, inset plates and selected equipment bays. */
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
  type ShipVisualLayer,
  type ShipVisualProfileId,
  type ShipVisualView,
} from "@sidereal/content/ship-visual";
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import { polygonBoundarySample } from "./ship-visual-sampler";

import { SHIP_VISUAL_PROFILES_R002 } from "@sidereal/content/ship-visual-r002";

const mod = (n: number, d: number) => ((n % d) + d) % d;
export function shipVisualLayersR002(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  profileId: ShipVisualProfileId,
): ShipVisualLayer[] {
  const profile = SHIP_VISUAL_PROFILES_R002[profileId],
    layers: ShipVisualLayer[] = [];
  let surfaceRole: NonNullable<ShipVisualLayer["surfaceRole"]> = "hull";
  const box = (
    id: string,
    role: ShipVisualLayer["role"],
    slot: ShipKitSlot,
    b: number[],
    support?: string,
  ) => {
    const q = b.map(Math.round) as ShipVisualLayer["bounds"];
    if (q.some((n, i) => i < 3 && n >= q[i + 3])) return;
    layers.push({ id, role, slot, bounds: q, support, surfaceRole });
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
  const assemblies = doc.volumes.map((volume) => ({
    volume,
    geometry: volumeGeometry(volume),
    tiles: volume.tiles.map((tile) => ({
      tile,
      poly: placedTilePolygon(tile),
    })),
  }));
  // Rich bays belong to exposed assembled boundaries. Attached wings hide their parent
  // shell, so assigning functions by global modulo alone puts equipment behind solid art.
  const blockedByAttachment = (
    volumeId: string,
    point: Pt,
    z0: number,
    z1: number,
  ) =>
    assemblies.some(({ volume, geometry, tiles }) => {
      if (
        volume.id === volumeId ||
        !geometry.outline ||
        !insidePolygon(geometry.outline.outer, point[0], point[1]) ||
        geometry.outline.holes.some((h) => insidePolygon(h, point[0], point[1]))
      )
        return false;
      const t = tiles.find(({ poly }) =>
        insidePolygon(poly, point[0], point[1]),
      )?.tile;
      if (!t) return false;
      const [lo, hi] = bowHeights(t, volume.height, point);
      return hi > z0 && lo < z1;
    });
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
          hi = tile.bow ? Math.floor(rawHi / 4) * 4 : Math.ceil(rawHi);
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
        surfaceRole = deck ? "floor" : "hull";
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
        // Three visible depth planes, backed by the same continuous sampled core.
        surfaceRole = "hull";
        // Protective frame is proud; armor is one cell recessed; charcoal service backing
        // remains exposed between plates. Broad bays replace per-voxel vertical striping.
        const along = boundary.alongAxis === 0 ? x : y;
        const phase = mod(along, profile.course);
        const bay = Math.floor(along / profile.course);
        let outward: Pt = [boundary.normalHint[0], boundary.normalHint[1]];
        if (
          insidePolygon(
            poly,
            p[0] + outward[0] * (distance + 1),
            p[1] + outward[1] * (distance + 1),
          )
        )
          outward = [-outward[0], -outward[1]];
        const outside: Pt = [
          (p[0] + outward[0] * (distance + 3)) / 16,
          (p[1] + outward[1] * (distance + 3)) / 16,
        ];
        const exposed =
          distance < 4 &&
          !blockedByAttachment(volume.id, outside, floor + 3, top - 2);
        const centreAlong = (bay * profile.course + profile.course / 2) / 16;
        const context: [number, number] = [
          (p[0] - outward[0] * (distance + 8)) / 16,
          (p[1] - outward[1] * (distance + 8)) / 16,
        ];
        context[boundary.alongAxis] = centreAlong;
        const room = doc.rooms.find(
          (r) =>
            context[0] >= r.rect[0] &&
            context[0] < r.rect[2] &&
            context[1] >= r.rect[1] &&
            context[1] < r.rect[3],
        );
        const nearInterface = interior.doors.some(
          (d) =>
            d.exterior &&
            Math.hypot(
              context[0] - (d.a[0] + d.b[0]) / 2,
              context[1] - (d.a[1] + d.b[1]) / 2,
            ) < 1.15,
        );
        const detailKind = !exposed
          ? 3
          : nearInterface
            ? 2
            : room?.type === "engineering" || room?.type === "workshop"
              ? 0
              : room
                ? 1
                : 0;
        const cassetteStart = Math.floor(profile.course / 2) - 8;
        const cassetteEnd = cassetteStart + 16;
        if (distance < 4) {
          if (distance >= 2)
            column(
              `${family}:pressure-backing`,
              "core",
              "secondary",
              x,
              y,
              floor,
              top,
              family,
            );
          const rib = mod(along, profile.rib) < 3;
          const low = floor + 4,
            high = Math.max(low + 1, top - 4);
          if (distance < 1 && (rib || distance < 0.65)) {
            for (const [z0, z1] of [
              [floor, low],
              [high, top],
            ])
              column(
                `${family}:protective-frame`,
                "frame",
                shellNormal ? "primary" : "trim",
                x,
                y,
                z0,
                z1,
                family,
              );
            if (rib)
              column(
                `${family}:bay-frame`,
                "frame",
                "trim",
                x,
                y,
                low,
                high,
                family,
              );
          }
          if (
            distance >= 1 &&
            distance < 2 &&
            phase >= 4 &&
            phase < profile.course - 4
          ) {
            const plateSlot =
              detailKind === 2 && phase > profile.course * 0.62
                ? "accent"
                : "primary";
            column(
              `${family}:inset-armor`,
              "plate",
              plateSlot,
              x,
              y,
              low,
              high,
              family,
            );
          }
          if (
            detailKind === 0 &&
            phase >= cassetteStart &&
            phase < cassetteEnd &&
            top - floor >= 12
          ) {
            const z0 = floor + 3,
              z1 = Math.min(top - 3, floor + 16);
            if (distance < 3)
              column(
                `${family}:vent-recess`,
                "void",
                "dark",
                x,
                y,
                z0,
                z1,
                family,
              );
            const cheek = phase < cassetteStart + 2 || phase >= cassetteEnd - 2;
            if (distance < 1 && cheek)
              column(
                `${family}:vent-cheek`,
                "frame",
                "primary",
                x,
                y,
                z0,
                z1,
                family,
              );
            if (distance < 1)
              for (const [a, b] of [
                [z0, z0 + 2],
                [z1 - 2, z1],
              ])
                column(
                  `${family}:vent-rim`,
                  "frame",
                  "primary",
                  x,
                  y,
                  a,
                  b,
                  family,
                );
            if (distance >= 1 && distance < 2 && !cheek)
              for (const z of [z0 + 3, z1 - 4])
                column(
                  `${family}:vent-louvre`,
                  "service",
                  "metal",
                  x,
                  y,
                  z,
                  z + 1,
                  family,
                );
          }
          // Purpose-built outer access cassette: proud guards, an open recessed face,
          // inset access lid and a handle. The backing is retained one full cell behind it.
          if (
            detailKind === 1 &&
            phase >= cassetteStart &&
            phase < cassetteEnd &&
            top >= floor + 12
          ) {
            const z0 = floor + 3,
              z1 = Math.min(top - 3, floor + 23);
            if (distance < 3)
              column(
                `${family}:cassette-well`,
                "void",
                "dark",
                x,
                y,
                z0,
                z1,
                family,
              );
            const guard = phase < cassetteStart + 2 || phase >= cassetteEnd - 2;
            if (distance < 1 && guard)
              column(
                `${family}:cassette-guard`,
                "frame",
                "metal",
                x,
                y,
                z0,
                z1,
                family,
              );
            if (distance < 1)
              for (const [a, b] of [
                [z0, z0 + 2],
                [z1 - 2, z1],
              ])
                column(
                  `${family}:cassette-rim`,
                  "frame",
                  "trim",
                  x,
                  y,
                  a,
                  b,
                  family,
                );
            if (
              distance >= 2 &&
              distance < 3 &&
              phase >= cassetteStart + 3 &&
              phase < cassetteEnd - 3
            )
              column(
                `${family}:cassette-lid`,
                "plate",
                "accent",
                x,
                y,
                z0 + 3,
                z1 - 3,
                family,
              );
            if (
              distance >= 1 &&
              distance < 2 &&
              phase >= cassetteEnd - 7 &&
              phase < cassetteEnd - 5
            )
              column(
                `${family}:cassette-handle`,
                "service",
                "metal",
                x,
                y,
                z0 + 5,
                z1 - 5,
                family,
              );
            if (
              distance >= 1 &&
              distance < 2 &&
              (phase === cassetteStart + 4 || phase === cassetteEnd - 5)
            )
              for (const z of [z0 + 3, z1 - 4])
                column(
                  `${family}:cassette-fastener`,
                  "service",
                  "metal",
                  x,
                  y,
                  z,
                  z + 1,
                  family,
                );
          }
          // Chamfer-like skirt has three real lattice courses rather than one thin boundary line.
          if (distance < 3)
            column(
              `${family}:skirt-base`,
              "frame",
              "secondary",
              x,
              y,
              lo,
              Math.min(floor, lo + 2),
              family,
            );
          if (distance >= 1 && distance < 3)
            column(
              `${family}:skirt-step`,
              "frame",
              "secondary",
              x,
              y,
              lo + 2,
              Math.min(floor, lo + 4),
              family,
            );
          if (distance >= 3 && deck && top > floor + 8) {
            surfaceRole = "wall";
            column(
              `${family}:inner-gasket`,
              "core",
              "secondary",
              x,
              y,
              floor + 3,
              top - 3,
              family,
            );
            if (phase > 1 && phase < profile.course - 1)
              column(
                `${family}:inner-lower-panel`,
                "plate",
                "primary",
                x,
                y,
                floor + 4,
                top - 3,
                family,
              );

            if (
              detailKind === 1 &&
              phase >= 9 &&
              phase < 21 &&
              top > floor + 19
            )
              column(
                `${family}:inner-control`,
                "service",
                phase < 17 ? "metal" : "dark",
                x,
                y,
                floor + 16,
                floor + 20,
                family,
              );
            if (
              detailKind === 1 &&
              phase >= 18 &&
              phase < 21 &&
              top > floor + 20
            )
              column(
                `${family}:inner-task-lens`,
                "service",
                "emit_b",
                x,
                y,
                floor + 20,
                floor + 21,
                family,
              );
          }
          surfaceRole = "hull";
          if (distance >= 1 && distance < 3)
            column(
              `${family}:cap`,
              "frame",
              shellNormal ? "primary" : "trim",
              x,
              y,
              Math.max(floor, top - 2),
              top,
              family,
            );
        }
        if ((view === "flight" || !deck) && !bowGlass(tile)) {
          surfaceRole = "roof";
          column(
            `${family}:roof`,
            "roof",
            "secondary",
            x,
            y,
            hi - 2,
            hi - 1,
            family,
          );
          // Nearly joined armor sits on one continuous subframe; only functional spine bays open.
          const u = mod(x, profile.course),
            v = mod(y, 32);
          const bayCentre: Pt = [
            (x - u + profile.course / 2) / 16,
            (y - v + 16) / 16,
          ];
          const service = doc.mounts.some(
            (m) =>
              m.attach === "top" &&
              Math.hypot(bayCentre[0] - m.at[0], bayCentre[1] - m.at[1]) < 1.4,
          );
          const roofKind = mod(
            Math.floor(x / profile.course) + 2 * Math.floor(y / 32),
            5,
          );
          const spineCentre = Math.round((by + bY) / 2);
          const spine =
            Math.abs(y - spineCentre) < 6 && x > bx + 12 && x < bX - 24;
          const spineBay =
            x - u >= bx + 12 && x - u + profile.course <= bX - 24;
          const serviceCassette =
            service &&
            roofKind !== 4 &&
            u >= 6 &&
            u < profile.course - 6 &&
            v >= 6 &&
            v < 26;
          const spineCassette =
            spineBay &&
            spine &&
            roofKind !== 4 &&
            u >= 6 &&
            u < profile.course - 6;
          const cassette = serviceCassette || spineCassette;
          if (u >= 1 && u < profile.course - 1 && v >= 1 && v < 31 && !spine) {
            const plateSlot =
              roofKind === 2 && u > profile.course * 0.5 && v > 16
                ? "accent"
                : "primary";
            column(
              `${family}:roof-armor`,
              "plate",
              plateSlot,
              x,
              y,
              hi - 1,
              hi,
              family,
            );
            // Discrete plate ends are stepped by two cells; broad fields remain joined and quiet.
            const clippedEnd = roofKind % 2 === 0 && u < 3 && v < 3;
            if (
              !clippedEnd &&
              u >= 2 &&
              u < profile.course - 2 &&
              v >= 2 &&
              v < 30
            )
              column(
                `${family}:roof-armor-field`,
                "plate",
                plateSlot,
                x,
                y,
                hi,
                hi + 1,
                family,
              );
          }
          if (spine)
            column(
              `${family}:roof-service-spine`,
              "service",
              "secondary",
              x,
              y,
              hi - 1,
              hi,
              family,
            );
          if (cassette) {
            column(
              `${family}:roof-cassette-well`,
              "void",
              "dark",
              x,
              y,
              hi - 1,
              hi + 2,
              family,
            );
            const localV = serviceCassette ? v - 6 : y - (spineCentre - 6);
            const maxV = serviceCassette ? 20 : 12;
            const rim =
              u < 8 ||
              u >= profile.course - 8 ||
              localV < 2 ||
              localV >= maxV - 2;
            if (rim)
              column(
                `${family}:roof-cassette-rim`,
                "frame",
                "trim",
                x,
                y,
                hi - 1,
                hi + 2,
                family,
              );
            else if (
              (localV >= 3 && localV < 5) ||
              (localV >= maxV - 5 && localV < maxV - 3)
            )
              column(
                `${family}:roof-cassette-fin`,
                "service",
                "metal",
                x,
                y,
                hi - 1,
                hi + 1,
                family,
              );
          }
          if (
            roofKind === 3 &&
            u >= 10 &&
            u < profile.course - 10 &&
            v >= 10 &&
            v < 21 &&
            !cassette &&
            !spine
          ) {
            column(
              `${family}:roof-access-gasket`,
              "frame",
              "secondary",
              x,
              y,
              hi,
              hi + 2,
              family,
            );
            if (u >= 12 && u < profile.course - 12 && v >= 12 && v < 19)
              column(
                `${family}:roof-access-lid`,
                "plate",
                "accent",
                x,
                y,
                hi,
                hi + 1,
                family,
              );
            if (u === profile.course - 13 && v >= 14 && v < 17)
              column(
                `${family}:roof-access-latch`,
                "service",
                "metal",
                x,
                y,
                hi + 1,
                hi + 2,
                family,
              );
          }
        }
        // Bow sill and structural brow: real sampled bands around the optical roof aperture.
        if (
          tile.bow &&
          bowGlass(tile) &&
          distance >= 1 &&
          distance < 3 &&
          !shellNormal
        ) {
          column(
            `${family}:brow`,
            "frame",
            "trim",
            x,
            y,
            hi - 3,
            hi + 1,
            family,
          );
          column(
            `${family}:sill`,
            "frame",
            "trim",
            x,
            y,
            lo,
            Math.min(hi, lo + 4),
            family,
          );
        }
      }
    surfaceRole = "hull";
    // Continuous pressure-skirt and sill segments. Sample the coherent molded source
    // on the global lattice; never decorate a diagonal with one large cube per step.
    for (let y = by - 2; y < bY + 2; y++)
      for (let x = bx - 2; x < bX + 2; x++) {
        const p: Pt = [x + 0.5, y + 0.5],
          boundary = polygonBoundarySample(p, poly);
        const inside = insidePolygon(poly, p[0], p[1]);
        if (
          boundary.distance > (inside ? 1 : 2) ||
          holes.some((h) => insidePolygon(h, p[0], p[1]))
        )
          continue;
        const inward = inside ? 1 : boundary.distance + 1;
        const world: Pt = [
          (p[0] - boundary.normalHint[0] * inward) / 16,
          (p[1] - boundary.normalHint[1] * inward) / 16,
        ];
        const tile = tileCells
          .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
          ?.find((t) => insidePolygon(t.poly, world[0], world[1]))?.tile;
        if (!tile) continue;
        const [rawLo, rawHi] = bowHeights(tile, volume.height, world);
        const lo = Math.floor(rawLo),
          hi = tile.bow ? Math.floor(rawHi / 4) * 4 : Math.ceil(rawHi);
        const floor = tile.bow
          ? lo + G.bowProfiles.shellThicknessTexels[volume.height][0]
          : deck
            ? G.deck.floorTopTexels
            : lo + 2;
        const top =
          view === "deck" && deck ? Math.min(hi, G.deck.shellCutTexels) : hi;
        shellNormal =
          Math.abs(boundary.normalHint[0]) > 0.01 &&
          Math.abs(boundary.normalHint[1]) > 0.01
            ? boundary.normalHint
            : undefined;
        column(
          `${family}:continuous-sill`,
          "frame",
          "secondary",
          x,
          y,
          lo,
          Math.max(lo + 1, floor),
          family,
        );
        if (!inside || boundary.distance < 1)
          column(
            `${family}:continuous-upper-guard`,
            "frame",
            shellNormal ? "primary" : "trim",
            x,
            y,
            Math.max(floor, top - 2),
            top,
            family,
          );
        // Occasional guard posts belong to real bay ends, not every exposed slope cell.
        const along = boundary.alongAxis === 0 ? x : y;
        if (
          !inside &&
          !shellNormal &&
          mod(along, profile.course) < 2 &&
          mod(Math.floor(along / profile.course), 3) !== 2
        )
          column(
            `${family}:outer-bay-guard`,
            "frame",
            "trim",
            x,
            y,
            floor + 3,
            top - 2,
            family,
          );
      }
  }
  shellNormal = undefined;
  surfaceRole = "wall";
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
      box(`${id}:core`, "core", "secondary", core, family);
      const idPhase = [...id].reduce((n, c) => n + c.charCodeAt(0), 0);
      for (let start = 0; start < span; start += profile.course) {
        const end = Math.min(span, start + profile.course),
          width = end - start;
        const kind = mod(Math.floor(start / profile.course) + idPhase, 3);
        const Z = glazed ? ft + 11 : wallCap - 3;
        const surface = (
          side: number,
          u: number,
          U: number,
          z: number,
          Z: number,
          depth = 0,
        ): number[] =>
          vertical
            ? [
                x0 + (side < 0 ? -2 + depth : 1 - depth),
                y0 + u,
                z,
                x0 + (side < 0 ? -1 + depth : 2 - depth),
                y0 + U,
                Z,
              ]
            : [
                x0 + u,
                y0 + (side < 0 ? -2 + depth : 1 - depth),
                z,
                x0 + U,
                y0 + (side < 0 ? -1 + depth : 2 - depth),
                Z,
              ];
        for (const side of [-1, 1]) {
          // Quiet continuous enclosure; a selected functional cavity has three local depth levels.
          box(
            `${id}:lower-enclosure`,
            jamb ? "doorframe" : "plate",
            "primary",
            surface(side, start + 1, end - 1, ft + 3, Z),
            family,
          );
          if (glazed || width < 12 || wallCap < ft + 20) continue;
          const centre = (start + end) / 2;
          // Opposite faces never cut the same pressure-web cell. The back of a useful
          // bay stays a quiet enclosure instead of repeating the same grille everywhere.
          if (side !== (kind === 1 ? 1 : -1)) continue;
          const cavity = (u: number, U: number, z: number, Z: number) => {
            const well = surface(side, u, U, z, Z);
            if (vertical) {
              if (side < 0) well[3] += 1;
              else well[0] -= 1;
            } else {
              if (side < 0) well[4] += 1;
              else well[1] -= 1;
            }
            box(`${id}:functional-well`, "void", "dark", well, family);
            box(
              `${id}:functional-backing`,
              "core",
              "secondary",
              surface(side, u, U, z, Z, 2),
              family,
            );
          };
          if (kind === 0) {
            // Compact horizontal ventilation cassette, with two actual recessed louvers.
            const u = centre - Math.min(width / 3, 10),
              U = centre + Math.min(width / 3, 10);
            box(
              `${id}:vent-surround`,
              "frame",
              "metal",
              surface(side, u, U, ft + 7, ft + 13),
              family,
            );
            cavity(u + 1, U - 1, ft + 8, ft + 12);
            for (const z of [ft + 8, ft + 10])
              box(
                `${id}:vent-fin`,
                "service",
                "secondary",
                surface(side, u + 1, U - 1, z, z + 1, 1),
                family,
              );
          } else if (kind === 1) {
            // Recessed control station with a compact status lens and guarded key cluster.
            box(
              `${id}:control-frame`,
              "frame",
              "trim",
              surface(side, centre - 7, centre + 7, ft + 10, ft + 22),
              family,
            );
            cavity(centre - 6, centre + 6, ft + 11, ft + 21);
            box(
              `${id}:control-face`,
              "service",
              "metal",
              surface(side, centre - 5, centre + 5, ft + 12, ft + 20, 1),
              family,
            );
            box(
              `${id}:control-display`,
              "service",
              "dark",
              surface(side, centre - 4, centre + 3, ft + 15, ft + 19, 1),
              family,
            );
            box(
              `${id}:control-lens`,
              "service",
              "emit_b",
              surface(side, centre + 3, centre + 5, ft + 17, ft + 18, 1),
              family,
            );
            for (let u = centre - 4; u < centre + 3; u += 3)
              box(
                `${id}:control-key`,
                "service",
                "secondary",
                surface(side, u, u + 2, ft + 12, ft + 13),
                family,
              );
          } else {
            // Quiet storage/access bay with a bounded burgundy latch panel and a hinge side.
            box(
              `${id}:access-gasket`,
              "frame",
              "trim",
              surface(side, centre - 8, centre + 8, ft + 6, ft + 16),
              family,
            );
            cavity(centre - 7, centre + 7, ft + 7, ft + 15);
            box(
              `${id}:access-face`,
              "plate",
              "accent",
              surface(side, centre - 7, centre + 7, ft + 7, ft + 15, 1),
              family,
            );
            box(
              `${id}:access-handle`,
              "service",
              "metal",
              surface(side, centre + 3, centre + 5, ft + 9, ft + 13),
              family,
            );
            for (const z of [ft + 8, ft + 13])
              box(
                `${id}:access-hinge`,
                "service",
                "trim",
                surface(side, centre - 7, centre - 5, z, z + 1),
                family,
              );
          }
          if (jamb)
            box(
              `${id}:interface-lens`,
              "service",
              "emit_a",
              surface(side, start + 3, start + 5, wallCap - 7, wallCap - 6),
              family,
            );
        }
      }
      const kick = [...bounds];
      kick[5] = ft + 4;
      box(`${id}:kick`, "frame", "trim", kick, family);
      const capbox = [...bounds];
      capbox[2] = wallCap - 2;
      if (vertical) {
        capbox[0] += 1;
        capbox[3] -= 1;
      } else {
        capbox[1] += 1;
        capbox[4] -= 1;
      }
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
        ? `${l.id}:${l.role}:${l.slot}:${l.surfaceRole}:${l.support}:${l.normalHint?.join(",")}:${y}:${z}:${Z}`
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
