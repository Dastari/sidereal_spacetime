/** r002 source recipes: pressure backing, subframe, inset plates and selected equipment bays. */
import {
  G,
  insidePolygon,
  placedTilePolygon,
  type Pt,
} from "@sidereal/content/construction-grammar";
import { interiorArtQuarterTurns } from "@sidereal/content/ship-furniture";
import { bowGlass, bowHeights } from "@sidereal/content/bow-profiles";
import { mountTileAccepts } from "@sidereal/content/ship-mount-tiles";
import {
  deriveInterior,
  deckApproachZones,
  volumeGeometry,
  placeMount,
  placeMountTile,
  type PrefabComponentCatalog,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import {
  type ShipVisualLayer,
  type ShipVisualProfileId,
  type ShipVisualView,
} from "@sidereal/content/ship-visual";
import type { ShipKitSlot } from "@sidereal/content/ship-kit";
import {
  polygonBoundarySample,
  sampleShipVisualLayers,
  visualCellKey,
} from "./ship-visual-sampler";
import { dressShip } from "./ship-dresser";
import { createRetainedWallBoundaryR002 } from "./ship-visual-r002-retained-wall-boundary";
import { referenceBowFrameR002 } from "./ship-visual-r002-bow-frame";
import { referenceBowTransitionR002 } from "./ship-visual-r002-bow-transition";

import {
  SHIP_VISUAL_PROFILES_R002,
  SHIP_VISUAL_MACRO_PROFILES_R002,
  referencePlateDecals,
  referenceCockpitApertureSourceAdmittedR002,
  REFERENCE_OPTICAL_INTERFACES_R002,
  type ShipVisualMacroProfile,
} from "@sidereal/content/ship-visual-r002";

/** Actual selected component bounds and complete linked tile occurrence admission.
 * Only the current static renderer pose is certified; future sweep is not implied. */
export function referenceRoofOperatingBoundsR002(
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  certificates:
    | NonNullable<ShipVisualMacroProfile["architecture"]>["roofFixedPose"]
    | undefined,
) {
  const components = new Map<string, number[]>(),
    tiles = new Map<string, number[]>();
  if (!certificates) return { components, tiles };
  const dressed = dressShip(doc, { catalog }).components;
  const geoms = doc.volumes.map(volumeGeometry);
  for (const c of dressed) {
    const p = c.placement,
      cert = certificates[c.component],
      sources = doc.mounts.filter((m) => m.id === c.mount);
    const tile =
      p.mount.tile === undefined
        ? undefined
        : (doc.mountTiles ?? []).filter((t) => t.id === p.mount.tile);
    if (
      sources.length !== 1 ||
      sources[0] !== p.mount ||
      (tile !== undefined && tile.length !== 1) ||
      p.mount.attach !== "top" ||
      !cert ||
      cert.frame !== "top" ||
      cert.motion !== "fixed-pose" ||
      !/^[a-f0-9]{64}$/.test(cert.assetSha256) ||
      cert.bounds.length !== 6 ||
      !cert.bounds.every(Number.isFinite) ||
      ![0, 1, 2].every((i) => cert.bounds[i] <= cert.bounds[i + 3]) ||
      !Number.isFinite(cert.clearanceCells) ||
      cert.clearanceCells < 0 ||
      !Number.isFinite(cert.muzzleCells) ||
      cert.muzzleCells < 0 ||
      !p.spec ||
      p.spec.attach[0] !== "top" ||
      p.spec.id !== c.component ||
      !p.spec.visual ||
      !Number.isInteger(p.quarterTurns) ||
      ![0, 1, 2, 3].includes(p.quarterTurns) ||
      ![...p.anchor, p.anchorZ].every(Number.isFinite)
    )
      continue;
    const corners: number[][] = [];
    const angle = (p.quarterTurns * Math.PI) / 2,
      C = Math.round(Math.cos(angle)),
      S = Math.round(Math.sin(angle));
    for (const x of [cert.bounds[0], cert.bounds[3]])
      for (const z of [
        cert.bounds[2] - cert.muzzleCells / 16,
        cert.bounds[5],
      ]) {
        const X = -z,
          Y = -x;
        corners.push([
          (p.anchor[0] + C * X - S * Y) * 16,
          (p.anchor[1] + S * X + C * Y) * 16,
        ]);
      }
    components.set(c.mount, [
      Math.min(...corners.map((p) => p[0])) - cert.clearanceCells,
      Math.min(...corners.map((p) => p[1])) - cert.clearanceCells,
      Math.max(...corners.map((p) => p[0])) + cert.clearanceCells,
      Math.max(...corners.map((p) => p[1])) + cert.clearanceCells,
    ]);
  }
  for (const tile of doc.mountTiles ?? []) {
    const attached = doc.mounts.filter((m) => m.tile === tile.id);
    if (
      (doc.mountTiles ?? []).filter((t) => t.id === tile.id).length !== 1 ||
      ![1, 2, 4].includes(attached.length) ||
      new Set(attached.map((m) => m.id)).size !== attached.length ||
      new Set(attached.map((m) => m.component)).size !== 1 ||
      !tile.at.every(Number.isFinite) ||
      !["fore", "port", "aft", "starboard"].includes(tile.facing) ||
      !["fixed", "turret"].includes(tile.kind) ||
      !["SM", "MD", "LG", "XL"].includes(tile.size) ||
      attached.some((m) => {
        const spec = catalog.get(m.component),
          actual = dressed.filter((c) => c.mount === m.id);
        return (
          m.attach !== "top" ||
          !spec ||
          !mountTileAccepts(
            tile.kind,
            tile.size,
            attached.length,
            spec.sizeClass,
          ) ||
          !m.at.every(Number.isFinite) ||
          m.at[0] !== tile.at[0] ||
          m.at[1] !== tile.at[1] ||
          actual.length !== 1 ||
          actual[0].placement.mount !== m ||
          !components.has(m.id)
        );
      })
    )
      continue;
    const placement = placeMountTile(tile, geoms);
    if (
      !placement.host ||
      ![...placement.rect, ...placement.z].every(Number.isFinite) ||
      ![0, 1].every((i) => placement.rect[i] < placement.rect[i + 2]) ||
      attached.some(
        (m) =>
          dressed.find((c) => c.mount === m.id)!.placement.host !==
          placement.host,
      )
    )
      continue;
    const apron = placement.rect.map((n) => n * 16),
      union = [apron, ...attached.map((m) => components.get(m.id)!)];
    tiles.set(tile.id, [
      Math.min(...union.map((b) => b[0])),
      Math.min(...union.map((b) => b[1])),
      Math.max(...union.map((b) => b[2])),
      Math.max(...union.map((b) => b[3])),
    ]);
  }
  return { components, tiles };
}

/** Actual source-frame + retained-glass guard union, transformed from the same
 * dresser placement used by rendering. Quantize OUTWARD before Chebyshev padding. */
export function referenceOpticalGuardBoxesR002(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  interfaces = REFERENCE_OPTICAL_INTERFACES_R002,
) {
  const bounds: {
    piece: string;
    kind: "source" | "retained";
    bounds: ShipVisualLayer["bounds"];
  }[] = [];
  let unknownVariant = false;
  for (const k of dressShip(doc, { catalog }).kit) {
    if (k.view !== "both" && k.view !== view) continue;
    if (
      ![k.x, k.y, k.z, k.rotDeg].every(Number.isFinite) ||
      (k.mirror !== undefined && typeof k.mirror !== "boolean")
    ) {
      // Uncertain placement cannot borrow an unrelated neighbouring certificate.
      unknownVariant = true;
      continue;
    }
    const spec = interfaces[k.piece];
    if (!spec) {
      if (k.piece.startsWith("canopy.") || k.piece.startsWith("bow."))
        unknownVariant = true;
      continue;
    }
    if (spec.kind === "non-optical") continue;
    const angle = (k.rotDeg * Math.PI) / 180,
      C = Math.cos(angle),
      S = Math.sin(angle);
    for (const [kind, boxes] of [
      ["source", spec.sourceFrameBounds],
      ["retained", spec.retainedGlassBounds],
    ] as const)
      for (const b of boxes) {
        const corners: number[][] = [];
        for (const X of [b[0], b[3]])
          for (const Y of [b[1], b[4]])
            for (const Z of [b[2], b[5]]) {
              const x = k.mirror ? -X : X;
              corners.push([k.x + C * x - S * Y, k.y + S * x + C * Y, k.z + Z]);
            }
        const lo = [0, 1, 2].map(
          (i) => Math.floor(Math.min(...corners.map((p) => p[i])) * 16) - 2,
        );
        const hi = [0, 1, 2].map(
          (i) => Math.ceil(Math.max(...corners.map((p) => p[i])) * 16) + 2,
        );
        bounds.push({
          piece: k.piece,
          kind,
          bounds: [...lo, ...hi] as ShipVisualLayer["bounds"],
        });
      }
  }
  return { bounds, unknownVariant };
}

/** Source Z-up bounds already undo GLTF_TO_ZUP. Interior/interior mountRotation
 * is identity; cardinal facing plus the authored extra turn matches buildObjects.
 * Unknown, operator, malformed or changed orientation remains conservative XY. */
export function referenceStaticWallFittingBoundsR002(
  socket: ReturnType<typeof deriveInterior>["sockets"][number],
  floorTexels: number,
  certificates = SHIP_VISUAL_MACRO_PROFILES_R002.federation.staticWallFittings,
): number[] | undefined {
  const c = certificates[socket.designId as keyof typeof certificates];
  if (
    !c ||
    socket.control ||
    c.bounds.length !== 6 ||
    !c.bounds.every(Number.isFinite) ||
    !/^[a-f0-9]{64}$/.test(c.assetSha256) ||
    c.bounds.some((v, i) => i < 3 && v >= c.bounds[i + 3]) ||
    c.artQuarterTurns !== interiorArtQuarterTurns(socket.designId) ||
    !Number.isInteger(c.clearanceCells) ||
    c.clearanceCells < 2 ||
    ![...socket.at, ...socket.size, floorTexels].every(Number.isFinite) ||
    socket.size.some((v) => v <= 0)
  )
    return undefined;
  const q = { fore: 0, port: 1, aft: 2, starboard: 3 }[socket.facing];
  if (q === undefined) return undefined;
  const angle = ((q + c.artQuarterTurns) * Math.PI) / 2,
    C = Math.cos(angle),
    S = Math.sin(angle);
  const anchor = [
    socket.at[0] + socket.size[0] / 2,
    socket.at[1] + socket.size[1] / 2,
  ];
  const corners: number[][] = [];
  for (const x of [c.bounds[0], c.bounds[3]])
    for (const y of [c.bounds[1], c.bounds[4]])
      // Match componentMatrix's fixed COMPONENT_TO_PREFAB basis before the
      // facing/art rotation: authored +Y becomes prefab +X, +X becomes -Y.
      corners.push([anchor[0] + C * y + S * x, anchor[1] + S * y - C * x]);
  const size = [
    Math.max(...corners.map((p) => p[0])) -
      Math.min(...corners.map((p) => p[0])),
    Math.max(...corners.map((p) => p[1])) -
      Math.min(...corners.map((p) => p[1])),
  ];
  if (size.some((v, i) => Math.abs(v - socket.size[i]) > 1e-6))
    return undefined;
  const pad = c.clearanceCells / 16;
  return [
    Math.min(...corners.map((p) => p[0])) - pad,
    Math.min(...corners.map((p) => p[1])) - pad,
    floorTexels / 16 + c.bounds[2] - pad,
    Math.max(...corners.map((p) => p[0])) + pad,
    Math.max(...corners.map((p) => p[1])) + pad,
    floorTexels / 16 + c.bounds[5] + pad,
  ];
}

type MatingPigmentSolid = {
  piece: string;
  sourcePart: number;
  bounds: number[];
  axes: { normal: number[]; min: number; max: number }[];
  /** Conservative pigment-only fallback; never a geometry/RAW descriptor. */
  veto?: true;
};

/** Exact finite convex-source attribution ONLY. No geometry/guard eligibility. */
export function referenceOpticalMatingSolidsR002(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  profileId: ShipVisualProfileId,
): MatingPigmentSolid[] {
  const macro = SHIP_VISUAL_MACRO_PROFILES_R002[profileId];
  const solids: MatingPigmentSolid[] = [];
  const cross = (a: number[], b: number[]) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const sub = (a: number[], b: number[]) => a.map((n, i) => n - b[i]);
  const dot = (a: number[], b: number[]) =>
    a.reduce((n, x, i) => n + x * b[i], 0);
  for (const k of dressShip(doc, { catalog }).kit) {
    if (k.view !== "both" && k.view !== view) continue;
    const original = macro.opticalInterfaces[k.piece];
    if (!original && /^(?:bow\.|canopy\.)/.test(k.piece)) return [];
    if (
      ![k.x, k.y, k.z, k.rotDeg].every(Number.isFinite) ||
      (k.mirror !== undefined && typeof k.mirror !== "boolean")
    )
      return [];
    if (original?.kind !== "optical") continue;
    const C = Math.cos((k.rotDeg * Math.PI) / 180),
      S = Math.sin((k.rotDeg * Math.PI) / 180);
    const transform = ([X, Y, Z]: readonly number[]) => {
      const x = k.mirror ? -X : X;
      return [k.x + C * x - S * Y, k.y + S * x + C * Y, k.z + Z];
    };
    const vetoPiece = () => {
      // Bounds are deliberately conservative only for PIGMENT veto. The same
      // certified neighbor must not repaint a cube touching an uncertain piece.
      if (original.sourceFrameBounds.length === 0) return false;
      for (const b of original.sourceFrameBounds) {
        if (
          b.length !== 6 ||
          !b.every(Number.isFinite) ||
          b.some((v, i) => i < 3 && v > b[i + 3])
        )
          return false;
        const points: number[][] = [];
        for (const X of [b[0], b[3]])
          for (const Y of [b[1], b[4]])
            for (const Z of [b[2], b[5]]) points.push(transform([X, Y, Z]));
        if (points.some((p) => !p.every(Number.isFinite))) return false;
        solids.push({
          piece: k.piece,
          sourcePart: -1,
          veto: true,
          axes: [],
          bounds: [
            ...[0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))),
            ...[0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))),
          ],
        });
      }
      return true;
    };
    const spec = macro.opticalMatingPigments[k.piece];
    if (
      ["canopy.corner45.deck", "canopy.corner45.deck.cut"].includes(k.piece) ||
      !spec ||
      spec.assetSha256 !== original.assetSha256 ||
      !Array.isArray(spec.parts) ||
      spec.parts.length === 0
    ) {
      if (!vetoPiece()) return [];
      continue;
    }
    const qualified: MatingPigmentSolid[] = [];
    let uncertain = false;
    for (const part of spec.parts) {
      if (
        !part ||
        !Array.isArray(part.vertices) ||
        !Array.isArray(part.triangles) ||
        !Number.isSafeInteger(part.sourcePart) ||
        part.sourcePart < 0 ||
        part.vertices.length < 4 ||
        part.triangles.length < 4 ||
        part.vertices.some(
          (p) =>
            !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite),
        ) ||
        part.triangles.some(
          (t) =>
            !Array.isArray(t) ||
            t.length !== 3 ||
            t.some(
              (i) =>
                !Number.isSafeInteger(i) || i < 0 || i >= part.vertices.length,
            ),
        )
      ) {
        uncertain = true;
        break;
      }
      const points = part.vertices.map(transform);
      if (points.some((p) => !p.every(Number.isFinite))) {
        uncertain = true;
        break;
      }
      const origin = points[0];
      const normals: number[][] = [],
        edgeAxes: number[][] = [];
      const edges = new Map<string, number>();
      let volume = 0;
      for (const t of part.triangles) {
        const [a, b, c] = t.map((i) => points[i]);
        const ab = sub(b, a),
          ac = sub(c, a),
          n = cross(ab, ac);
        const length = Math.hypot(...n);
        if (!Number.isFinite(length) || length < 1e-12) {
          uncertain = true;
          break;
        }
        normals.push(n.map((v) => v / length));
        volume +=
          dot(sub(a, origin), cross(sub(b, origin), sub(c, origin))) / 6;
        for (let i = 0; i < 3; i++) {
          const u = t[i],
            v = t[(i + 1) % 3],
            key = `${u}:${v}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
          const edge = sub(points[v], points[u]);
          for (const axis of [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ])
            edgeAxes.push(cross(edge, axis));
        }
      }
      if (
        uncertain ||
        !Number.isFinite(volume) ||
        Math.abs(volume) < 1e-12 ||
        [...edges].some(([e, n]) => {
          const [a, b] = e.split(":");
          return n !== 1 || edges.get(`${b}:${a}`) !== 1;
        })
      ) {
        uncertain = true;
        break;
      }
      const sign = Math.sign(volume);
      if (
        part.triangles.some((t, i) =>
          points.some(
            (p) => sign * dot(normals[i], sub(p, points[t[0]])) > 1e-8,
          ),
        )
      ) {
        uncertain = true;
        break;
      }
      // All convex SAT axes: both solids' face normals and every edge cross.
      // Extra tessellation diagonals are safe redundant axes, not missing axes.
      const axes = new Map<string, MatingPigmentSolid["axes"][number]>();
      for (const a of [
        ...normals,
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        ...edgeAxes,
      ]) {
        const length = Math.hypot(...a);
        if (length < 1e-12) continue;
        const n = a.map((v) => v / length),
          projections = points.map((p) => dot(n, p));
        axes.set(n.join(","), {
          normal: n,
          min: Math.min(...projections),
          max: Math.max(...projections),
        });
      }
      qualified.push({
        piece: k.piece,
        sourcePart: part.sourcePart,
        bounds: [
          ...[0, 1, 2].map((i) => Math.min(...points.map((p) => p[i]))),
          ...[0, 1, 2].map((i) => Math.max(...points.map((p) => p[i]))),
        ],
        axes: [...axes.values()],
      });
    }
    // Never partially borrow another part after a malformed piece certificate.
    if (!uncertain) solids.push(...qualified);
    else if (!vetoPiece()) return [];
  }
  return solids;
}

/** Whole voxel cube, not its centre or corners. Mirroring does not affect SAT. */
export function referenceOpticalMatingCubeR002(
  x: number,
  y: number,
  z: number,
  solids: readonly MatingPigmentSolid[],
): boolean {
  const low = [x / 16, y / 16, z / 16],
    high = [(x + 1) / 16, (y + 1) / 16, (z + 1) / 16];
  if (![...low, ...high].every(Number.isFinite)) return false;
  const touchesBounds = (s: MatingPigmentSolid) =>
    ![0, 1, 2].some(
      (i) => high[i] < s.bounds[i] - 1e-9 || low[i] > s.bounds[i + 3] + 1e-9,
    );
  if (solids.some((s) => s.veto && touchesBounds(s))) return false;
  return solids.some((s) => {
    if (s.veto) return false;
    if (
      [0, 1, 2].some(
        (i) => high[i] < s.bounds[i] - 1e-9 || low[i] > s.bounds[i + 3] + 1e-9,
      )
    )
      return false;
    return s.axes.every(({ normal: n, min, max }) => {
      const a = n.reduce((v, q, i) => v + q * (q >= 0 ? low[i] : high[i]), 0);
      const b = n.reduce((v, q, i) => v + q * (q >= 0 ? high[i] : low[i]), 0);
      return b >= min - 1e-9 && a <= max + 1e-9;
    });
  });
}

/** The accepted V3 aperture duty mask, confined to two verified Wren occurrences.
 * Glass occupies two raw normal courses; retained sill, eyebrow and true ends
 * remain the original source. This is presentation, not authoritative pressure.
 */
export function referenceCockpitApertureR002(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  profileId: ShipVisualProfileId,
): ShipVisualLayer[] {
  if (doc.id !== "fed.s.wren" || profileId !== "federation") return [];
  const sections = [
    {
      id: "south",
      piece: "bow.slope1.deck.s2.a1.edge1",
      frame: [10, 1, 0, 270],
      bounds: [158, -3, 178, 18],
      start: [160, 0],
      tangent: [1, 1],
      normal: [1, -1],
      offsets: [154, 160],
      pane: 159,
    },
    {
      id: "north",
      piece: "bow.slope1.deck.s2.a0.edge1",
      frame: [10, 6, 0, 0],
      bounds: [158, 94, 178, 115],
      start: [160, 112],
      tangent: [1, -1],
      normal: [1, 1],
      offsets: [266, 271],
      pane: 270,
    },
  ];
  if (!referenceCockpitApertureSourceAdmittedR002(profileId)) return [];
  const kit = dressShip(doc, { catalog }).kit;
  // A missing, moved, mirrored, duplicated or uncertain source keeps BOTH old
  // sections. Never combine a partial aperture with a retained pane occurrence.
  for (const section of sections) {
    const matches = kit.filter((k) => k.piece === section.piece);
    if (
      matches.length !== 1 ||
      matches[0].view !== "both" ||
      (matches[0].mirror ?? false) !== false ||
      [matches[0].x, matches[0].y, matches[0].z, matches[0].rotDeg].some(
        (v, i) => v !== section.frame[i],
      )
    )
      return [];
  }
  // Exact original occupied footprint in the admitted V3 table. The wider
  // guide prism also includes empty air; it must not author new VOID duties there.
  const occupiedRows = [
    [4, 163, 164],
    [5, 162, 165],
    [6, 161, 166],
    [7, 162, 167],
    [8, 163, 168],
    [9, 164, 169],
    [10, 165, 170],
    [11, 166, 171],
    [12, 167, 172],
    [13, 168, 171],
    [14, 169, 170],
  ];
  const result: ShipVisualLayer[] = [];
  for (const section of sections) {
    for (let y = section.bounds[1]; y < section.bounds[3]; y++)
      for (let x = section.bounds[0]; x < section.bounds[2]; x++) {
        const sourceY = section.id === "south" ? y : 111 - y;
        const row = occupiedRows.find((r) => r[0] === sourceY);
        if (!row || x < row[1] || x >= row[2]) continue;
        const normal = section.normal[0] * x + section.normal[1] * y;
        if (normal < section.offsets[0] || normal >= section.offsets[1])
          continue;
        const centre =
          ((x + 0.5 - section.start[0]) * section.tangent[0] +
            (y + 0.5 - section.start[1]) * section.tangent[1]) /
          Math.SQRT2;
        const lower = centre - 1 / Math.SQRT2,
          upper = centre + 1 / Math.SQRT2;
        if (lower < 4.5 || upper > 16 * Math.SQRT2 - 4.5) continue;
        for (let z = 16; z < 28; z++) {
          if (z >= 26 && lower >= 21 / Math.SQRT2 - 1e-10) continue;
          const pane = normal === section.pane || normal === section.pane - 1;
          result.push({
            id: `candidate-D:${section.id}:${pane ? "proposed-raw-pane" : "proposed-clear-through-thickness"}`,
            role: pane ? "core" : "void",
            slot: pane ? "glass" : "dark",
            support: "volume:hull",
            bounds: [x, y, z, x + 1, y + 1, z + 1],
            surfaceRole: pane || view === "flight" ? "hull" : "wall",
          });
        }
      }
  }
  return result;
}

const mod = (n: number, d: number) => ((n % d) + d) % d;
export function shipVisualLayersR002(
  doc: ShipPrefabDocumentV1,
  view: ShipVisualView,
  catalog: PrefabComponentCatalog,
  profileId: ShipVisualProfileId,
): ShipVisualLayer[] {
  const profile = SHIP_VISUAL_PROFILES_R002[profileId],
    macro = SHIP_VISUAL_MACRO_PROFILES_R002[profileId],
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
  let sidePlane: ShipVisualLayer["normalSide"] | undefined;
  let facetPlane: ShipVisualLayer["facet"] | undefined;
  let roofChart: { id: string; normal: [number, number, number] } | undefined;
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
    if (facetPlane && layers.length > before && role !== "void")
      layers[layers.length - 1].facet = facetPlane;
    if (sidePlane && layers.length > before && role !== "void")
      layers[layers.length - 1].normalSide = sidePlane;
    if (roofChart && layers.length > before) {
      layers[layers.length - 1].normalChart = roofChart.id;
      layers[layers.length - 1].normalHint = roofChart.normal;
    } else if (
      shellNormal &&
      layers.length > before &&
      !["floor", "roof", "void", "service"].includes(role)
    )
      layers[layers.length - 1].normalHint = shellNormal;
  };
  const interior = deriveInterior(doc, 0, catalog);
  // One selected manufactured cover per utility/living room, not a deck-wide
  // metre grid. Existing sockets and approaches own their exact plan clearances.
  const approaches = deckApproachZones(
    interior.doors,
    interior.station?.at ?? null,
    (x, y) =>
      interior.floors.some(
        (f) => Math.floor(x) === f.cell[0] && Math.floor(y) === f.cell[1],
      ),
  );
  const occupiedFloorRects = [
    ...interior.sockets.map((o) => [
      o.at[0],
      o.at[1],
      o.at[0] + o.size[0],
      o.at[1] + o.size[1],
    ]),
    ...approaches.map((a) => a.rect),
  ];
  const supportedFloorPlan = new Set<string>();
  for (const v of doc.volumes) {
    if (!G.heightClasses[v.height].walkable) continue;
    const holes = volumeGeometry(v).outline?.holes ?? [];
    for (const t of v.tiles) {
      const poly = placedTilePolygon(t);
      for (
        let y = Math.floor(Math.min(...poly.map((p) => p[1])) * 16);
        y < Math.ceil(Math.max(...poly.map((p) => p[1])) * 16);
        y++
      )
        for (
          let x = Math.floor(Math.min(...poly.map((p) => p[0])) * 16);
          x < Math.ceil(Math.max(...poly.map((p) => p[0])) * 16);
          x++
        ) {
          const p: Pt = [(x + 0.5) / 16, (y + 0.5) / 16];
          if (
            insidePolygon(poly, ...p) &&
            !holes.some((h) => insidePolygon(h, ...p))
          )
            supportedFloorPlan.add(`${x},${y}`);
        }
    }
  }
  const floorCovers: {
    bounds: number[];
    kind: "vent" | "access";
    room: string;
  }[] = [];
  for (const room of doc.rooms) {
    if (
      ![
        "engineering",
        "workshop",
        "cargo",
        "galley",
        "lounge",
        "medbay",
        "bridge",
      ].includes(room.type)
    )
      continue;
    const originalWidth = [
      "bridge",
      "engineering",
      "workshop",
      "galley",
    ].includes(room.type)
      ? 24
      : 20;
    const width = macro.architecture
      ? Math.min(
          macro.architecture.floorCover[0],
          Math.floor((room.rect[2] - room.rect[0]) * 16) - 10,
        )
      : originalWidth;
    const depth = macro.architecture
      ? Math.min(
          room.type === "cargo" ? 28 : macro.architecture.floorCover[1],
          Math.floor((room.rect[3] - room.rect[1]) * 16) - 10,
        )
      : room.type === "cargo"
        ? 28
        : 16;
    if (width < 16 || depth < 16) continue;
    const candidates: { bounds: number[]; score: number }[] = [];
    const cx = (room.rect[0] + room.rect[2]) * 8,
      cy = (room.rect[1] + room.rect[3]) * 8;
    for (
      let y = Math.ceil(room.rect[1] * 16 + 4);
      y + depth < room.rect[3] * 16 - 4;
      y += 4
    )
      for (
        let x = Math.ceil(room.rect[0] * 16 + 4);
        x + width < room.rect[2] * 16 - 4;
        x += 4
      ) {
        const b = [x, y, x + width, y + depth];
        let fullSupport = true;
        for (let Y = b[1]; Y < b[3] && fullSupport; Y++)
          for (let X = b[0]; X < b[2]; X++)
            if (!supportedFloorPlan.has(`${X},${Y}`)) {
              fullSupport = false;
              break;
            }
        if (!fullSupport) continue;
        if (
          occupiedFloorRects.some(
            (r) =>
              b[0] / 16 < r[2] + 1 / 16 &&
              b[2] / 16 > r[0] - 1 / 16 &&
              b[1] / 16 < r[3] + 1 / 16 &&
              b[3] / 16 > r[1] - 1 / 16,
          )
        )
          continue;
        candidates.push({
          bounds: b,
          score:
            Math.hypot(x + width / 2 - cx, y + depth / 2 - cy) +
            (interior.sockets.some((o) => o.room === room.id)
              ? Math.min(
                  ...interior.sockets
                    .filter((o) => o.room === room.id)
                    .map((o) =>
                      Math.hypot(
                        x + width / 2 - (o.at[0] + o.size[0] / 2) * 16,
                        y + depth / 2 - (o.at[1] + o.size[1] / 2) * 16,
                      ),
                    ),
                ) * 0.65
              : 0),
        });
      }
    candidates.sort(
      (a, b) =>
        a.score - b.score ||
        a.bounds[1] - b.bounds[1] ||
        a.bounds[0] - b.bounds[0],
    );
    const selected = candidates.slice(0, 1);
    const second = candidates.find(
      (c) =>
        selected.length &&
        !(
          c.bounds[0] < selected[0].bounds[2] + 3 &&
          c.bounds[2] > selected[0].bounds[0] - 3 &&
          c.bounds[1] < selected[0].bounds[3] + 3 &&
          c.bounds[3] > selected[0].bounds[1] - 3
        ),
    );
    if (
      second &&
      ["bridge", "engineering", "workshop", "galley", "lounge"].includes(
        room.type,
      )
    )
      selected.push(second);
    for (const c of selected)
      floorCovers.push({
        bounds: c.bounds,
        kind:
          room.type === "engineering" || room.type === "workshop"
            ? "vent"
            : "access",
        room: room.id,
      });
  }
  const roomCirculation = floorCovers.flatMap((cover) => {
    const room = doc.rooms.find((r) => r.id === cover.room)!;
    const centre: Pt = [
      (cover.bounds[0] + cover.bounds[2]) / 2,
      (cover.bounds[1] + cover.bounds[3]) / 2,
    ];
    const doors = interior.doors
      .map((d) => [(d.a[0] + d.b[0]) * 8, (d.a[1] + d.b[1]) * 8] as Pt)
      .filter(
        (p) =>
          p[0] >= room.rect[0] * 16 - 0.5 &&
          p[0] <= room.rect[2] * 16 + 0.5 &&
          p[1] >= room.rect[1] * 16 - 0.5 &&
          p[1] <= room.rect[3] * 16 + 0.5,
      )
      .sort(
        (a, b) =>
          Math.hypot(a[0] - centre[0], a[1] - centre[1]) -
          Math.hypot(b[0] - centre[0], b[1] - centre[1]),
      );
    if (!doors.length) return [];
    const from = doors[0],
      horizontal =
        Math.abs(from[0] - centre[0]) >= Math.abs(from[1] - centre[1]);
    const bend: Pt = horizontal ? [centre[0], from[1]] : [from[0], centre[1]];
    return [
      {
        room: room.id,
        segments: [
          [from, bend],
          [bend, centre],
        ] as [Pt, Pt][],
      },
    ];
  });
  const analyticCharts = new Map<string, [number, number, number]>();
  const assemblies = doc.volumes.map((volume) => ({
    volume,
    geometry: volumeGeometry(volume),
    tiles: volume.tiles.map((tile) => ({
      tile,
      poly: placedTilePolygon(tile),
    })),
  }));
  // Reuse the same transformed, catalog-qualified footprints as the actual dresser.
  // Raw mount.at is neither an anchor nor a tile-carried item's occupied rectangle.
  const geoms = assemblies.map((a) => a.geometry);
  // Guard the complete frame and moving-leaf sweep, not a radius at its centre.
  // The renderer slides each leaf .95 widths from its closed half-width centre;
  // its outside edge therefore reaches 1.95w+.005. Two cells also cover the
  // Chebyshev neighbour ring and the full cube footprint of any candidate facet.
  const rawPaddingM = 2 / 16;
  const doorGuards = interior.doors.map((d) => {
    const dx = d.b[0] - d.a[0],
      dy = d.b[1] - d.a[1];
    const span = Math.hypot(dx, dy);
    const leafWidth = Math.max(0.6, (span - 0.75) / 2);
    return {
      centre: [(d.a[0] + d.b[0]) / 2, (d.a[1] + d.b[1]) / 2] as Pt,
      along: [dx / span, dy / span] as Pt,
      halfSpan: Math.max(span / 2, 1.95 * leafWidth + 0.005) + rawPaddingM,
      halfDepth: 5 / 16 + rawPaddingM,
    };
  });
  const frameGuards = doc.mounts
    .filter((m) => m.attach === "edge")
    .map((m) => placeMount(m, catalog.get(m.component), geoms, doc).rect);
  const opticalGuards = assemblies.flatMap((a) =>
    a.tiles.filter(({ tile }) => bowGlass(tile)).map(({ poly }) => poly),
  );
  const opticalEdges = [
    ...interior.exteriorSlopes.filter((e) => e.glass),
    ...[...interior.exteriorWalls, ...interior.partitions].filter(
      (e) =>
        e.type === "window" ||
        e.type === "wall.glazed" ||
        e.variant === "glazed",
    ),
  ];
  const protectedInterface = (p: Pt) =>
    doorGuards.some((g) => {
      const dx = p[0] - g.centre[0],
        dy = p[1] - g.centre[1];
      return (
        Math.abs(dx * g.along[0] + dy * g.along[1]) <= g.halfSpan &&
        Math.abs(-dx * g.along[1] + dy * g.along[0]) <= g.halfDepth
      );
    }) ||
    frameGuards.some(
      (r) =>
        p[0] >= r[0] - rawPaddingM &&
        p[0] <= r[2] + rawPaddingM &&
        p[1] >= r[1] - rawPaddingM &&
        p[1] <= r[3] + rawPaddingM,
    ) ||
    opticalEdges.some((e) => {
      const dx = e.b[0] - e.a[0],
        dy = e.b[1] - e.a[1],
        span = Math.hypot(dx, dy);
      const u = ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / span;
      const v = Math.abs(-(p[0] - e.a[0]) * dy + (p[1] - e.a[1]) * dx) / span;
      return (
        u >= -rawPaddingM && u <= span + rawPaddingM && v <= 0.25 + rawPaddingM
      );
    }) ||
    opticalGuards.some(
      (poly) =>
        insidePolygon(poly, ...p) ||
        polygonBoundarySample(p, poly).distance <= rawPaddingM,
    );

  const opticalBoxes = referenceOpticalGuardBoxesR002(
    doc,
    view,
    catalog,
    macro.opticalInterfaces,
  );
  const opticalCellProtected = (x: number, y: number, z: number) => {
    const p: Pt = [(x + 0.5) / 16, (y + 0.5) / 16];
    if (
      opticalBoxes.bounds.some(
        (g) =>
          x >= g.bounds[0] &&
          x < g.bounds[3] &&
          y >= g.bounds[1] &&
          y < g.bounds[4] &&
          z >= g.bounds[2] &&
          z < g.bounds[5],
      )
    )
      return true;
    if (!protectedInterface(p)) return false;
    // Doors/equipment and uncertified optical variants retain the complete old guard.
    const hard =
      doorGuards.some((g) => {
        const X = p[0] - g.centre[0],
          Y = p[1] - g.centre[1];
        return (
          Math.abs(X * g.along[0] + Y * g.along[1]) <= g.halfSpan &&
          Math.abs(-X * g.along[1] + Y * g.along[0]) <= g.halfDepth
        );
      }) ||
      frameGuards.some(
        (r) =>
          p[0] >= r[0] - rawPaddingM &&
          p[0] <= r[2] + rawPaddingM &&
          p[1] >= r[1] - rawPaddingM &&
          p[1] <= r[3] + rawPaddingM,
      );
    if (hard || opticalBoxes.unknownVariant) return true;
    const candidates = opticalBoxes.bounds.filter(
      (g) =>
        x >= g.bounds[0] &&
        x < g.bounds[3] &&
        y >= g.bounds[1] &&
        y < g.bounds[4],
    );
    if (!candidates.length) return true;
    // Uncertified windows/interior glazed walls do not borrow a neighbouring canopy's certification.
    if (
      opticalEdges.some(
        (e) =>
          !("glass" in e) &&
          (() => {
            const dx = e.b[0] - e.a[0],
              dy = e.b[1] - e.a[1],
              L = Math.hypot(dx, dy);
            const u = ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / L,
              v = Math.abs(-(p[0] - e.a[0]) * dy + (p[1] - e.a[1]) * dx) / L;
            return (
              u >= -rawPaddingM &&
              u <= L + rawPaddingM &&
              v <= 0.25 + rawPaddingM
            );
          })(),
      )
    )
      return true;
    return candidates.some((g) => z >= g.bounds[2] && z < g.bounds[5]);
  };

  // Static object certificates use the same source-centred cardinal frame as
  // buildObjects. Everything with head/operator/moving or unknown geometry keeps
  // its complete conservative XY exclusion, independently of catalog height.
  const staticFittings = interior.sockets.map((socket) => ({
    socket,
    bounds: referenceStaticWallFittingBoundsR002(
      socket,
      G.deck.floorTopTexels,
      macro.staticWallFittings,
    ),
  }));

  // The conservative original interface/approach set applies to the WHOLE cube,
  // including boundary contact. It is not a physical collision certificate.
  const epsilon = 1e-10;
  const wallCubeBounds = (x: number, y: number, z: number) => [
    x / 16,
    y / 16,
    z / 16,
    (x + 1) / 16,
    (y + 1) / 16,
    (z + 1) / 16,
  ];
  const wallAabbTouches = (cube: number[], bounds: number[]) =>
    [0, 1, 2].every(
      (a) =>
        cube[a] <= bounds[a + 3] + epsilon &&
        cube[a + 3] >= bounds[a] - epsilon,
    );
  const wallXyBounds = (r: number[], pad = 0) => [
    r[0] - pad,
    r[1] - pad,
    -Infinity,
    r[2] + pad,
    r[3] + pad,
    Infinity,
  ];
  const wallOrientedTouches = (
    cube: number[],
    centre: readonly number[],
    along: readonly number[],
    halfSpan: number,
    halfDepth: number,
  ) => {
    const half = [(cube[3] - cube[0]) / 2, (cube[4] - cube[1]) / 2],
      delta = [
        (cube[0] + cube[3]) / 2 - centre[0],
        (cube[1] + cube[4]) / 2 - centre[1],
      ],
      perp = [-along[1], along[0]];
    return [[1, 0], [0, 1], along, perp].every(
      (axis) =>
        Math.abs(delta[0] * axis[0] + delta[1] * axis[1]) <=
        half[0] * Math.abs(axis[0]) +
          half[1] * Math.abs(axis[1]) +
          halfSpan * Math.abs(along[0] * axis[0] + along[1] * axis[1]) +
          halfDepth * Math.abs(perp[0] * axis[0] + perp[1] * axis[1]) +
          epsilon,
    );
  };
  const pointSegmentDistance = (
    p: readonly number[],
    a: readonly number[],
    b: readonly number[],
  ) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = dx * dx + dy * dy,
      t = length
        ? Math.max(
            0,
            Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length),
          )
        : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const segmentsDistance = (
    a: readonly number[],
    b: readonly number[],
    c: readonly number[],
    d: readonly number[],
  ) => {
    const cross = (
      p: readonly number[],
      q: readonly number[],
      r: readonly number[],
    ) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const intersects =
      Math.max(Math.min(a[0], b[0]), Math.min(c[0], d[0])) <=
        Math.min(Math.max(a[0], b[0]), Math.max(c[0], d[0])) + epsilon &&
      Math.max(Math.min(a[1], b[1]), Math.min(c[1], d[1])) <=
        Math.min(Math.max(a[1], b[1]), Math.max(c[1], d[1])) + epsilon &&
      cross(a, b, c) * cross(a, b, d) <= epsilon &&
      cross(c, d, a) * cross(c, d, b) <= epsilon;
    return intersects
      ? 0
      : Math.min(
          pointSegmentDistance(a, c, d),
          pointSegmentDistance(b, c, d),
          pointSegmentDistance(c, a, b),
          pointSegmentDistance(d, a, b),
        );
  };
  const wallPolygonTouches = (
    cube: number[],
    poly: readonly Pt[],
    pad: number,
  ) => {
    const ring = [
      [cube[0], cube[1]],
      [cube[3], cube[1]],
      [cube[3], cube[4]],
      [cube[0], cube[4]],
    ];
    if (
      ring.some((p) => insidePolygon(poly, p[0], p[1])) ||
      poly.some(
        (p) =>
          p[0] >= cube[0] - epsilon &&
          p[0] <= cube[3] + epsilon &&
          p[1] >= cube[1] - epsilon &&
          p[1] <= cube[4] + epsilon,
      )
    )
      return true;
    return ring.some((p, i) =>
      poly.some(
        (q, j) =>
          segmentsDistance(
            p,
            ring[(i + 1) % 4],
            q,
            poly[(j + 1) % poly.length],
          ) <=
          pad + epsilon,
      ),
    );
  };

  const protectedWallCache = new Map<string, boolean>();
  const protectedWallCube = (x: number, y: number, z: number) => {
    const key = visualCellKey(x, y, z),
      cached = protectedWallCache.get(key);
    if (cached !== undefined) return cached;
    const cube = wallCubeBounds(x, y, z);
    const protectedCell =
      staticFittings.some((f) =>
        wallAabbTouches(
          cube,
          f.bounds ??
            wallXyBounds([
              f.socket.at[0] - 1 / 16,
              f.socket.at[1] - 1 / 16,
              f.socket.at[0] + f.socket.size[0] + 1 / 16,
              f.socket.at[1] + f.socket.size[1] + 1 / 16,
            ]),
        ),
      ) ||
      approaches.some((a) => wallAabbTouches(cube, wallXyBounds(a.rect))) ||
      doorGuards.some((g) =>
        wallOrientedTouches(cube, g.centre, g.along, g.halfSpan, g.halfDepth),
      ) ||
      frameGuards.some((r) =>
        wallAabbTouches(cube, wallXyBounds(r, rawPaddingM)),
      ) ||
      opticalEdges.some((e) => {
        const dx = e.b[0] - e.a[0],
          dy = e.b[1] - e.a[1],
          span = Math.hypot(dx, dy);
        return wallOrientedTouches(
          cube,
          [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2],
          [dx / span, dy / span],
          span / 2 + rawPaddingM,
          0.25 + rawPaddingM,
        );
      }) ||
      opticalGuards.some((poly) =>
        wallPolygonTouches(cube, poly, rawPaddingM),
      ) ||
      opticalBoxes.bounds.some((g) =>
        wallAabbTouches(
          cube,
          g.bounds.map((v) => v / 16),
        ),
      );
    protectedWallCache.set(key, protectedCell);
    return protectedCell;
  };

  const retainedWallBoundary = createRetainedWallBoundaryR002(
    doc,
    interior,
    approaches,
    profileId,
    protectedInterface,
  );

  // Select a purpose on a whole usable wall run, after real assembly exclusions.
  // Room centroids can fall in a doorway; they are a preference, never eligibility.
  const wallTaskKey = (
    room: ShipPrefabDocumentV1["rooms"][number],
  ): keyof typeof macro.wallTasks => {
    switch (room.type) {
      case "engineering":
        return "engineering";
      case "workshop":
        return "workshop";
      case "bridge":
        return "bridge";
      case "cargo":
        return "cargo";
      case "airlock":
        return "airlock";
      case "medbay":
        return "medical";
      case "quarters":
        return "quarters";
      case "galley":
        return "galley";
      case "lounge":
        return "lounge";
      default:
        return "living";
    }
  };
  const wallTaskRuns = (a: Pt, b: Pt, side: Pt) => {
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      span = Math.hypot(dx, dy);
    const ux = dx / span,
      uy = dy / span;
    const roomAt = (q: number) => {
      const face: Pt = [(a[0] + ux * q) / 16, (a[1] + uy * q) / 16];
      const probe: Pt = [face[0] + side[0] * 0.35, face[1] + side[1] * 0.35];
      if (
        protectedInterface(face) ||
        approaches.some(
          (a) =>
            probe[0] >= a.rect[0] &&
            probe[0] <= a.rect[2] &&
            probe[1] >= a.rect[1] &&
            probe[1] <= a.rect[3],
        )
      )
        return undefined;
      let requiredBottom = 0;
      for (const f of staticFittings) {
        const o = f.socket;
        // The whole wall-owned footprint is one course either side of face,
        // not only the room probe used for identifying the adjacent room.
        const touches = f.bounds
          ? face[0] >= f.bounds[0] - 2 / 16 &&
            face[0] <= f.bounds[3] + 2 / 16 &&
            face[1] >= f.bounds[1] - 2 / 16 &&
            face[1] <= f.bounds[4] + 2 / 16
          : probe[0] >= o.at[0] - 1 / 16 &&
            probe[0] <= o.at[0] + o.size[0] + 1 / 16 &&
            probe[1] >= o.at[1] - 1 / 16 &&
            probe[1] <= o.at[1] + o.size[1] + 1 / 16;
        if (!touches) continue;
        if (!f.bounds) return undefined;
        requiredBottom = Math.max(
          requiredBottom,
          Math.ceil(f.bounds[5] * 16) - G.deck.floorTopTexels,
        );
      }
      const room = doc.rooms.find(
        (r) =>
          r.type !== "corridor" &&
          probe[0] >= r.rect[0] &&
          probe[0] < r.rect[2] &&
          probe[1] >= r.rect[1] &&
          probe[1] < r.rect[3],
      );
      return room ? { room, requiredBottom } : undefined;
    };
    const runs: {
      room: ShipPrefabDocumentV1["rooms"][number];
      u: number;
      U: number;
      bottom: number;
    }[] = [];
    for (let q = 4; q < span - 4; q++) {
      const candidate = roomAt(q + 0.5);
      if (!candidate) continue;
      const { room, requiredBottom } = candidate;
      const last = runs[runs.length - 1];
      if (
        last?.room.id === room.id &&
        last.U === q &&
        last.bottom === requiredBottom
      ) {
        last.U++;
        last.bottom = Math.max(last.bottom, requiredBottom);
      } else runs.push({ room, u: q, U: q + 1, bottom: requiredBottom });
    }
    const selected: {
      room: ShipPrefabDocumentV1["rooms"][number];
      key: keyof typeof macro.wallTasks;
      u: number;
      U: number;
      bottom: number;
      runWidth: number;
    }[] = [];
    for (const run of runs) {
      // Keep every whole admitted run, splitting at actual height-clearance
      // changes. A room centre does not justify discarding most of a useful wall.
      if (run.U - run.u < 16) continue;
      const key = wallTaskKey(run.room);
      selected.push({
        room: run.room,
        key,
        u: run.u,
        U: run.U,
        bottom: Math.max(run.bottom, macro.wallTasks[key].bottom),
        runWidth: run.U - run.u,
      });
    }
    return selected;
  };
  const wallTaskCache = new Map<string, ReturnType<typeof wallTaskRuns>>();
  const wallTasksFor = (id: string, a: Pt, b: Pt, side: Pt) => {
    const key = `${id}:${side.join(",")}`;
    if (!wallTaskCache.has(key))
      wallTaskCache.set(key, wallTaskRuns(a, b, side));
    return wallTaskCache.get(key)!;
  };

  // R17 collects complete assemblies independently of envelope emission order.
  // Complete admitted runs across all faces are allocated without corner overlap.
  // Selection happens after generic walls/posts have their final ownership.
  type PendingWallTask = {
    room: ShipPrefabDocumentV1["rooms"][number];
    key: keyof typeof macro.wallTasks;
    u: number;
    U: number;
    bottom: number;
    runWidth: number;
    face: string;
    support: string;
    layers: ShipVisualLayer[];
    geometry: { a: Pt; b: Pt; side: Pt };
  };
  const pendingWallTasks = new Map<string, PendingWallTask>();
  const deferWallTask = (
    chosen: ReturnType<typeof wallTaskRuns>[number],
    face: string,
    support: string,
    start: number,
    geometry: { a: Pt; b: Pt; side: Pt },
  ) => {
    const taskLayers = layers.splice(start);
    if (!taskLayers.length) return;
    const id = `${chosen.room.id}:${face}:${chosen.u}:${chosen.U}:${chosen.bottom}`;
    let pending = pendingWallTasks.get(id);
    if (!pending) {
      pending = { ...chosen, face, support, layers: [], geometry };
      pendingWallTasks.set(id, pending);
    }
    pending.layers.push(
      ...taskLayers.map((l) => ({
        ...l,
        id: `${l.id.slice(0, l.id.lastIndexOf(":"))}:room-task:${chosen.room.id}:${l.id.slice(l.id.lastIndexOf(":") + 1)}`,
      })),
    );
  };

  const roofObstacles = [
    ...doc.mounts
      .filter((m) => m.attach === "top")
      .map((m) => placeMount(m, catalog.get(m.component), geoms, doc).rect),
    ...(doc.mountTiles ?? []).map((t) => placeMountTile(t, geoms).rect),
  ].map((r) => r.map((n) => n * 16));
  const roofOperating = referenceRoofOperatingBoundsR002(
    doc,
    catalog,
    macro.architecture?.roofFixedPose,
  );
  const operatingBounds = [
    ...roofOperating.components.values(),
    ...roofOperating.tiles.values(),
  ];
  const roofMarkings = referencePlateDecals(
    doc,
    dressShip(doc, { catalog }).decals,
    "r002",
  )
    .filter((d) => d.normal[2] > 0.99)
    .map((d) => [
      Math.min(...d.corners.map((p) => p[0])) * 16,
      Math.min(...d.corners.map((p) => p[1])) * 16,
      Math.max(...d.corners.map((p) => p[0])) * 16,
      Math.max(...d.corners.map((p) => p[1])) * 16,
    ]);
  const inRect = (x: number, y: number, r: number[], padding = 0) =>
    x >= r[0] - padding &&
    x < r[2] + padding &&
    y >= r[1] - padding &&
    y < r[3] + padding;
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
    const tileRoofCharts = new Map<
      (typeof volume.tiles)[number],
      { id: string; normal: [number, number, number]; dx: number; dy: number }
    >();
    const innerBackings: {
      x: number;
      y: number;
      z0: number;
      z1: number;
      normal?: [number, number, number];
    }[] = [];
    for (const tile of volume.tiles) {
      const poly = placedTilePolygon(tile),
        xs = poly.map((p) => p[0]),
        ys = poly.map((p) => p[1]);
      if (tile.bow) {
        const world: Pt = [
          xs.reduce((a, b) => a + b, 0) / xs.length,
          ys.reduce((a, b) => a + b, 0) / ys.length,
        ];
        const z = bowHeights(tile, volume.height, world)[1];
        const dx =
          bowHeights(tile, volume.height, [world[0] + 1 / 16, world[1]])[1] - z;
        const dy =
          bowHeights(tile, volume.height, [world[0], world[1] + 1 / 16])[1] - z;
        const intercept = z - dx * world[0] * 16 - dy * world[1] * 16;
        const id = `volume:${volume.id}:roof-plane:${dx.toFixed(6)}:${dy.toFixed(6)}:${intercept.toFixed(6)}`;
        let normal = analyticCharts.get(id);
        if (!normal) {
          const length = Math.hypot(dx, dy, 1);
          normal = [-dx / length, -dy / length, 1 / length];
          analyticCharts.set(id, normal);
        }
        tileRoofCharts.set(tile, { id, normal, dx, dy });
      }
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
    // Joined housings take their purpose and occupied aperture from actual equipment,
    // not room rectangles. The visible shoulders join the same tray beside those apertures.
    const pendingRoofClusterLayers: ShipVisualLayer[] = [];
    const roofFixtureBounds: {
      id: string;
      source: "component" | "tile";
      kind: "utility" | "control";
      bounds: number[];
    }[] = [];
    const roofCases: {
      id: string;
      bounds: number[];
      kind: "utility" | "habitation" | "control";
      fixtures: number[][];
      broadSide: "low" | "high";
      massing: boolean;
    }[] = [];
    if (deck) {
      const mounted = [
        ...doc.mounts
          .filter((m) => m.attach === "top")
          .map((m) => ({
            id: m.id,
            source: "component" as const,
            kind: m.component.startsWith("radiator.")
              ? ("utility" as const)
              : ("control" as const),
            bounds: placeMount(
              m,
              catalog.get(m.component),
              geoms,
              doc,
            ).rect.map((n) => n * 16),
          })),
        ...(doc.mountTiles ?? []).map((m) => ({
          id: m.id,
          source: "tile" as const,
          kind: "control" as const,
          bounds: placeMountTile(m, geoms).rect.map((n) => n * 16),
        })),
      ].filter((m) =>
        insidePolygon(
          poly,
          (m.bounds[0] + m.bounds[2]) / 2,
          (m.bounds[1] + m.bounds[3]) / 2,
        ),
      );
      roofFixtureBounds.push(...mounted);
      const utility = mounted.filter((m) => m.kind === "utility");
      const control = mounted
        .filter((m) => m.kind === "control")
        .sort((a, b) => a.bounds[0] - b.bounds[0] || a.id.localeCompare(b.id));
      const groups = [
        utility,
        control.slice(0, Math.max(1, Math.ceil(control.length / 2))),
        control.slice(Math.max(1, Math.ceil(control.length / 2))),
      ].filter((a) => a.length);
      for (const [index, items] of groups.entries()) {
        const kind = items[0].kind;
        const padX = kind === "utility" ? 5 : 8;
        const padLeft = index === 1 ? 18 : 7,
          padRight = index === 2 ? 18 : 7;
        roofCases.push({
          id: `${kind}:${items
            .map((m) => m.id)
            .sort()
            .join("+")}`,
          kind,
          massing:
            !!macro.architecture?.roofMassing &&
            items.every((m) =>
              roofOperating[m.source === "tile" ? "tiles" : "components"].has(
                m.id,
              ),
            ),
          fixtures: items.map((m) => [...m.bounds]),
          broadSide: index === 2 ? "high" : "low",
          bounds: [
            Math.max(
              bx + 3,
              Math.floor(Math.min(...items.map((m) => m.bounds[0]))) - padX,
            ),
            index === 2
              ? Math.max(
                  by + 4,
                  Math.floor(Math.min(...items.map((m) => m.bounds[1]))) -
                    padLeft,
                )
              : by + 4,
            Math.min(
              bX - 3,
              Math.ceil(Math.max(...items.map((m) => m.bounds[2]))) + padX,
            ),
            index === 1
              ? Math.min(
                  bY - 4,
                  Math.ceil(Math.max(...items.map((m) => m.bounds[3]))) +
                    padRight,
                )
              : bY - 4,
          ],
        });
      }
      // One deliberately unequal calm cover fills an exposed gap, retaining source markings.
      const candidates: { bounds: number[]; score: number }[] = [];
      for (let y = by + 5; y + 22 < bY - 5; y += 8)
        for (let x = bx + 6; x + 34 < bX - 6; x += 8) {
          const bounds = [x, y, x + 34, y + 22];
          if (
            [
              ...roofObstacles,
              ...roofMarkings,
              ...roofCases.map((c) => c.bounds),
            ].some(
              (r) =>
                bounds[0] < r[2] + 2 &&
                bounds[2] > r[0] - 2 &&
                bounds[1] < r[3] + 2 &&
                bounds[3] > r[1] - 2,
            )
          )
            continue;
          if (
            ![
              [x, y],
              [x + 34, y],
              [x, y + 22],
              [x + 34, y + 22],
            ].every(
              ([X, Y]) =>
                insidePolygon(poly, X, Y) &&
                !holes.some((h) => insidePolygon(h, X, Y)),
            )
          )
            continue;
          candidates.push({
            bounds,
            score: Math.abs(x - bx - (bX - bx) * 0.65),
          });
        }
      candidates.sort((a, b) => a.score - b.score || a.bounds[1] - b.bounds[1]);
      if (candidates[0])
        roofCases.push({
          id: "exposed-cover",
          kind: "habitation",
          massing: false,
          fixtures: [],
          broadSide: "high",
          bounds: candidates[0].bounds,
        });
    }
    const routeCandidates = [
      Math.round(by + (bY - by) * 0.25),
      Math.round(by + (bY - by) * 0.75),
    ];
    const exposedScore = (y: number) => {
      let n = 0;
      for (let x = bx + 8; x < bX - 8; x++)
        if (
          insidePolygon(poly, x + 0.5, y + 0.5) &&
          !holes.some((h) => insidePolygon(h, x + 0.5, y + 0.5)) &&
          ![...roofObstacles, ...roofMarkings].some((r) => inRect(x, y, r, 5))
        )
          n++;
      return n;
    };
    const routeYs =
      deck && bY - by >= 48
        ? routeCandidates
        : [
            routeCandidates.sort(
              (a, b) => exposedScore(b) - exposedScore(a),
            )[0],
          ];
    const trayCassetteX = new Map<number, number | undefined>();
    const roofPatches: { bounds: number[]; kind: "vent" | "access" }[] = [];
    for (const routeY of routeYs) {
      const candidates: {
        bounds: number[];
        kind: "vent" | "access";
        score: number;
      }[] = [];
      for (let at = Math.ceil((bx + 8) / 32) * 32; at + 24 < bX - 8; at += 32) {
        const bounds = [at, routeY - 7, at + 24, routeY + 7];
        if (
          [...roofObstacles, ...roofMarkings].some(
            (r) =>
              bounds[0] < r[2] + 3 &&
              bounds[2] > r[0] - 3 &&
              bounds[1] < r[3] + 3 &&
              bounds[3] > r[1] - 3,
          )
        )
          continue;
        if (
          ![
            [bounds[0], bounds[1]],
            [bounds[2], bounds[1]],
            [bounds[0], bounds[3]],
            [bounds[2], bounds[3]],
          ].every(
            ([x, y]) =>
              insidePolygon(poly, x, y) &&
              !holes.some((h) => insidePolygon(h, x, y)),
          )
        )
          continue;
        const centre: Pt = [(at + 12) / 16, routeY / 16];
        const room = doc.rooms.find(
          (r) =>
            centre[0] >= r.rect[0] &&
            centre[0] < r.rect[2] &&
            centre[1] >= r.rect[1] &&
            centre[1] < r.rect[3],
        );
        const vent = room?.type === "engineering" || room?.type === "workshop";
        candidates.push({
          bounds,
          kind:
            vent || roofPatches.some((p) => p.kind === "access")
              ? "vent"
              : "access",
          score: vent ? 3 : room ? 2 : 1,
        });
      }
      const selected = candidates
        .sort((a, b) => b.score - a.score || a.bounds[0] - b.bounds[0])
        .filter((_, i) => i < 2);
      roofPatches.push(
        ...(deck
          ? selected.map((p, i) => ({
              ...p,
              kind:
                p.kind === "access" &&
                (i > 0 || roofPatches.some((q) => q.kind === "access"))
                  ? ("vent" as const)
                  : p.kind,
            }))
          : selected.slice(0, 1)),
      );
      trayCassetteX.set(routeY, selected[0]?.bounds[0]);
    }
    // Two unequal service fields belong beside actual equipment cases, on exposed
    // shoulders. They do not tile the whole roof or replace the working routes.
    const shoulderFields: {
      id: string;
      kind: "vent" | "access";
      bounds: number[];
    }[] = [];
    if (deck)
      for (const c of roofFixtureBounds) {
        if (
          shoulderFields.some(
            (f) => f.kind === (c.kind === "utility" ? "vent" : "access"),
          )
        )
          continue;
        const vent = c.kind === "utility",
          width = vent ? 20 : 14,
          depth = vent ? 12 : 10;
        const [a, b, A, B] = c.bounds;
        const candidates = [
          [a + 3, b - depth - 3, a + 3 + width, b - 3],
          [A - width - 3, B + 3, A - 3, B + depth + 3],
          [a - width - 3, b + 4, a - 3, b + 4 + depth],
          [A + 3, B - depth - 4, A + width + 3, B - 4],
        ];
        for (const bounds of candidates) {
          let clear = true;
          for (let y = bounds[1]; y < bounds[3] && clear; y++)
            for (let x = bounds[0]; x < bounds[2]; x++) {
              const p: Pt = [x + 0.5, y + 0.5];
              if (
                !insidePolygon(poly, ...p) ||
                polygonBoundarySample(p, poly).distance < 4 ||
                holes.some((h) => insidePolygon(h, ...p)) ||
                [
                  ...roofObstacles,
                  ...roofMarkings,
                  ...shoulderFields.map((f) => f.bounds),
                ].some((r) => inRect(...p, r, 2)) ||
                routeYs.some((route) => Math.abs(y - route) < 8)
              ) {
                clear = false;
                break;
              }
              const world: Pt = [p[0] / 16, p[1] / 16];
              const tile = tileCells
                .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
                ?.find((t) => insidePolygon(t.poly, ...world))?.tile;
              if (!tile || tile.bow) {
                clear = false;
                break;
              }
            }
          if (!clear) continue;
          shoulderFields.push({
            id: c.id,
            kind: vent ? "vent" : "access",
            bounds,
          });
          break;
        }
      }
    // Candidate limits terminate at actual supported flanks, not a percentage of
    // the beam. Resolve shared cells by nearest real fixture before shaping any
    // cover, then retain face-connected finish footprints rooted at that apron.
    const admittedRoofCases = new Map<string, (typeof roofCases)[number]>();
    const candidateRoofCases = new Map<string, (typeof roofCases)[number][]>();
    const distanceToFixture = (
      c: (typeof roofCases)[number],
      x: number,
      y: number,
    ) =>
      Math.min(
        ...c.fixtures.map(([a, b, A, B]) =>
          Math.max(a - x, x - A, b - y, y - B, 0),
        ),
      );
    for (const c of roofCases) {
      if (!c.fixtures.length) continue;
      for (let y = c.bounds[1]; y < c.bounds[3]; y++)
        for (let x = c.bounds[0]; x < c.bounds[2]; x++) {
          const p: Pt = [x + 0.5, y + 0.5],
            world: Pt = [p[0] / 16, p[1] / 16];
          const tile = tileCells
            .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
            ?.find((t) => insidePolygon(t.poly, ...world))?.tile;
          if (
            !tile ||
            tile.bow ||
            !insidePolygon(poly, ...p) ||
            holes.some((h) => insidePolygon(h, ...p)) ||
            polygonBoundarySample(p, poly).distance < 4 ||
            [
              ...roofObstacles,
              ...roofMarkings,
              ...roofPatches.map((p) => p.bounds),
              // R23 replaces these decorative podiums with their connected
              // fixture-owned case; operating apertures and routes stay excluded.
              ...(macro.architecture
                ? []
                : shoulderFields.map((f) => f.bounds)),
            ].some((r) => inRect(...p, r, 2)) ||
            routeYs.some((y0) => Math.abs(y - y0) < 8)
          )
            continue;
          const key = `${x},${y}`;
          candidateRoofCases.set(key, [
            ...(candidateRoofCases.get(key) ?? []),
            c,
          ]);
        }
    }
    const winners = new Map<string, (typeof roofCases)[number]>();
    for (const [key, cs] of candidateRoofCases) {
      const [x, y] = key.split(",").map(Number);
      winners.set(
        key,
        [...cs].sort(
          (a, b) =>
            distanceToFixture(a, x + 0.5, y + 0.5) -
              distanceToFixture(b, x + 0.5, y + 0.5) ||
            a.id.localeCompare(b.id),
        )[0],
      );
    }
    for (const c of roofCases) {
      const remaining = new Set(
        [...winners].filter(([, owner]) => owner === c).map(([key]) => key),
      );
      let component = 0;
      while (remaining.size) {
        const first = remaining.values().next().value!;
        remaining.delete(first);
        const keys = [first];
        let head = 0,
          hasOwnApron = false;
        while (head < keys.length) {
          const [x, y] = keys[head++].split(",").map(Number),
            distance = distanceToFixture(c, x + 0.5, y + 0.5);
          if (distance >= 2 && distance < 6) hasOwnApron = true;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const key = `${x + dx},${y + dy}`;
            if (remaining.delete(key)) keys.push(key);
          }
        }
        if (!hasOwnApron) continue;
        const points = keys.map((k) => k.split(",").map(Number));
        const bounds = [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
          Math.max(...points.map((p) => p[0])) + 1,
          Math.max(...points.map((p) => p[1])) + 1,
        ];
        if (bounds[2] - bounds[0] < 8 || bounds[3] - bounds[1] < 8) continue;
        const body = { ...c, id: `${c.id}:body:${component++}`, bounds };
        for (const key of keys) admittedRoofCases.set(key, body);
      }
    }
    // Tall presentation is a separate finite subfootprint. Rejected/unknown
    // occurrences retain their ENTIRE previous low body, not a partial fallback.
    const massingCells = new Set<string>();
    for (const body of new Set(admittedRoofCases.values())) {
      if (!body.massing) continue;
      const remaining = new Set(
        [...admittedRoofCases]
          .filter(([key, owner]) => {
            if (owner !== body) return false;
            const [x, y] = key.split(",").map(Number);
            return !operatingBounds.some((r) => inRect(x + 0.5, y + 0.5, r));
          })
          .map(([key]) => key),
      );
      while (remaining.size) {
        const first = remaining.values().next().value!;
        remaining.delete(first);
        const keys = [first];
        let cursor = 0;
        while (cursor < keys.length) {
          const [x, y] = keys[cursor++].split(",").map(Number);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            if (remaining.delete(`${x + dx},${y + dy}`))
              keys.push(`${x + dx},${y + dy}`);
        }
        const present = new Set(keys),
          width = macro.architecture!.roofMassing!.connection;
        const broadApron = keys.some((key) => {
          const [x, y] = key.split(",").map(Number),
            d = distanceToFixture(body, x + 0.5, y + 0.5);
          if (d < 2 || d >= 8) return false;
          return [
            [1, 0],
            [0, 1],
          ].some(([dx, dy]) =>
            Array.from(
              { length: width },
              (_, i) => i - Math.floor(width / 2),
            ).every(
              (n) =>
                present.has(`${x + dx * n},${y + dy * n}`) &&
                distanceToFixture(body, x + dx * n + 0.5, y + dy * n + 0.5) < 8,
            ),
          );
        });
        if (!broadApron) continue;
        // Erode by a complete width×width box, connect only that broad spine,
        // then restore its supported boxes. A one-cell neck cannot carry a cheek.
        const offsets = Array.from(
          { length: width },
          (_, i) => i - Math.floor(width / 2),
        );
        const broadCenters = new Set(
          keys.filter((key) => {
            const [x, y] = key.split(",").map(Number);
            return offsets.every((dx) =>
              offsets.every((dy) => present.has(`${x + dx},${y + dy}`)),
            );
          }),
        );
        const connected: string[] = [];
        for (const key of broadCenters) {
          const [x, y] = key.split(",").map(Number);
          if (distanceToFixture(body, x + 0.5, y + 0.5) < 8 + width / 2)
            connected.push(key);
        }
        for (const key of connected) broadCenters.delete(key);
        let at = 0;
        while (at < connected.length) {
          const [x, y] = connected[at++].split(",").map(Number);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ])
            if (broadCenters.delete(`${x + dx},${y + dy}`))
              connected.push(`${x + dx},${y + dy}`);
        }
        for (const key of connected) {
          const [x, y] = key.split(",").map(Number);
          for (const dx of offsets)
            for (const dy of offsets) massingCells.add(`${x + dx},${y + dy}`);
        }
      }
    }
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
          hi = tile.bow ? Math.floor(rawHi) : Math.ceil(rawHi);
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
        if (deck && view === "deck") {
          column(
            `${family}:floor-field`,
            "floor",
            "secondary",
            x,
            y,
            floor - 1,
            floor,
            family,
          );
          {
            const room = doc.rooms.find(
              (r) =>
                world[0] >= r.rect[0] &&
                world[0] < r.rect[2] &&
                world[1] >= r.rect[1] &&
                world[1] < r.rect[3],
            );
            const cover = floorCovers.find(
              (c) =>
                x >= c.bounds[0] &&
                x < c.bounds[2] &&
                y >= c.bounds[1] &&
                y < c.bounds[3],
            );
            if (cover) {
              const [a, b, A, B] = cover.bounds;
              const edge = Math.min(x - a, A - 1 - x, y - b, B - 1 - y);
              // Flush service-cover ownership changes the visible field, never the actual
              // walking/contact top. The old decorative seam void was a false physical pit.
              const corner =
                Math.min(x - a, A - 1 - x) + Math.min(y - b, B - 1 - y) < 2;
              if (edge === 0 || corner) {
                surfaceRole = "hull";
                column(
                  `${family}:floor-cover-binding:${cover.room}`,
                  "floor",
                  macro.architecture?.roofMassing ? "primary" : "trim",
                  x,
                  y,
                  floor - 1,
                  floor,
                  family,
                );
                surfaceRole = "floor";
              } else {
                const tooling =
                  cover.kind === "access" && x - a > 3 && x - a < 9;
                // Flush manufactured access lids borrow the existing hull finish.
                // Their occupied contact plane and FLOOR role remain unchanged.
                surfaceRole = "hull";
                column(
                  `${family}:floor-cover:${cover.room}`,
                  "floor",
                  macro.architecture?.roofMassing
                    ? edge < 2 ||
                      (x - a >= Math.floor((A - a) * 0.61) &&
                        x - a < Math.floor((A - a) * 0.61) + 2)
                      ? "primary"
                      : "trim"
                    : tooling
                      ? "trim"
                      : "primary",
                  x,
                  y,
                  floor - 1,
                  floor,
                  family,
                );
                surfaceRole = "floor";
                if (
                  cover.kind === "vent" &&
                  x > a + 3 &&
                  x < A - 4 &&
                  y > b + 3 &&
                  y < B - 4 &&
                  (macro.architecture?.roofMassing
                    ? [
                        Math.floor((A - a) * 0.3),
                        Math.floor((A - a) * 0.65),
                      ].some((at) => x - a >= at && x - a < at + 3)
                    : mod(x - a, 5) < 2)
                )
                  column(
                    `${family}:floor-cover-fin:${cover.room}`,
                    "floor",
                    "metal",
                    x,
                    y,
                    floor - 1,
                    floor,
                    family,
                  );
                if (
                  cover.kind === "access" &&
                  x >= A - 5 &&
                  x < A - 3 &&
                  y >= b + 5 &&
                  y < b + 9
                )
                  column(
                    `${family}:floor-cover-latch:${cover.room}`,
                    "floor",
                    "metal",
                    x,
                    y,
                    floor - 1,
                    floor,
                    family,
                  );
              }
            } else if (
              interior.doors.some((d) => {
                const dx = d.b[0] - d.a[0],
                  dy = d.b[1] - d.a[1];
                const length = Math.hypot(dx, dy);
                if (!length) return false;
                const along =
                  ((world[0] - d.a[0]) * dx + (world[1] - d.a[1]) * dy) /
                  length;
                const across =
                  Math.abs(
                    (world[0] - d.a[0]) * dy - (world[1] - d.a[1]) * dx,
                  ) / length;
                return (
                  along >= 0.375 && along < length - 0.375 && across < 1 / 16
                );
              })
            ) {
              // A flush protected threshold belongs to the existing opening,
              // not a decorative grid. Contact height and floor occupancy stay exact.
              surfaceRole = "hull";
              column(
                `${family}:floor-door-threshold`,
                "floor",
                "trim",
                x,
                y,
                floor - 1,
                floor,
                family,
              );
              surfaceRole = "floor";
            } else if (
              room &&
              room.type !== "corridor" &&
              roomCirculation.some(
                (route) =>
                  route.room === room.id &&
                  route.segments.some(([a, b]) => {
                    const horizontal = a[1] === b[1],
                      along = horizontal ? x + 0.5 : y + 0.5,
                      across = horizontal ? y + 0.5 - a[1] : x + 0.5 - a[0];
                    const start = Math.min(
                        horizontal ? a[0] : a[1],
                        horizontal ? b[0] : b[1],
                      ),
                      end = Math.max(
                        horizontal ? a[0] : a[1],
                        horizontal ? b[0] : b[1],
                      );
                    return (
                      end - start >= 8 &&
                      along >= start + 2 &&
                      along < end - 2 &&
                      Math.abs(Math.abs(across) - 5) <= 0.5
                    );
                  }),
              ) &&
              !occupiedFloorRects.some(
                (r) =>
                  world[0] >= r[0] - 1 / 16 &&
                  world[0] <= r[2] + 1 / 16 &&
                  world[1] >= r[1] - 1 / 16 &&
                  world[1] <= r[3] + 1 / 16,
              )
            ) {
              // Flush approach-to-service seams share the actual support plane.
              // They terminate before equipment and never create contact pits.
              surfaceRole = "hull";
              column(
                `${family}:floor-room-circulation:${room.id}`,
                "floor",
                "trim",
                x,
                y,
                floor - 1,
                floor,
                family,
              );
              surfaceRole = "floor";
            } else if (room?.type === "corridor") {
              // Two deliberate circulation seams follow this room's long axis,
              // rather than bordering every metre of an otherwise calm deck.
              const horizontal =
                room.rect[2] - room.rect[0] >= room.rect[3] - room.rect[1];
              const q = horizontal ? y : x,
                centre = Math.round(
                  ((horizontal
                    ? room.rect[1] + room.rect[3]
                    : room.rect[0] + room.rect[2]) /
                    2) *
                    16,
                );
              if (
                Math.abs(q - centre) === 5 &&
                !approaches.some(
                  (a) =>
                    world[0] >= a.rect[0] &&
                    world[0] <= a.rect[2] &&
                    world[1] >= a.rect[1] &&
                    world[1] <= a.rect[3],
                )
              ) {
                surfaceRole = "hull";
                column(
                  `${family}:floor-circulation-binding`,
                  "floor",
                  "trim",
                  x,
                  y,
                  floor - 1,
                  floor,
                  family,
                );
                surfaceRole = "floor";
              }
            }
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
          if (!shellNormal && distance < 1 && (rib || distance < 0.65)) {
            for (const [z0, z1] of [
              [floor, low],
              [high, top],
            ])
              column(
                `${family}:protective-frame`,
                "frame",
                "trim",
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
            distance < (shellNormal ? 3 : 2) &&
            (shellNormal || (phase >= 4 && phase < profile.course - 4))
          ) {
            // A diagonal is one coherent neutral enclosure, not alternating narrow pale slats.
            const plateSlot = shellNormal
              ? "trim"
              : detailKind === 2 && phase > profile.course * 0.62
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
            if (distance < 1 && !shellNormal)
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
            if (distance < 1 && !shellNormal)
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
          // One continuous quiet pressure return; stacked contrast courses made fine teeth dominant.
          if (distance < 3)
            column(
              `${family}:skirt-base`,
              "frame",
              "secondary",
              x,
              y,
              lo,
              floor,
              family,
            );
          if (distance >= 2 && deck && top > floor + 8) {
            surfaceRole = "wall";
            // Outward attachment occlusion cannot suppress the occupied room's inward equipment.
            // The middle pressure course stays solid between the two facade recesses.
            if (distance < 3)
              innerBackings.push({
                x,
                y,
                z0: floor + 3,
                z1: top - 3,
                normal: shellNormal,
              });
            if (distance >= 3) {
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
              if (
                boundary.edgeT * boundary.edgeLength > 2 &&
                (1 - boundary.edgeT) * boundary.edgeLength > 2
              )
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
                !shellNormal &&
                top >= floor + 27 &&
                (nearInterface ||
                  room?.type === "bridge" ||
                  room?.type === "engineering" ||
                  room?.type === "workshop" ||
                  (room && mod(bay, 2) === 0))
              ) {
                const inwardKind =
                  nearInterface || room?.type === "bridge"
                    ? 1
                    : room?.type === "engineering" || room?.type === "workshop"
                      ? 0
                      : room?.type === "quarters" ||
                          room?.type === "lounge" ||
                          room?.type === "cargo"
                        ? 2
                        : mod(bay, 3);
                const left = inwardKind === 1 ? 4 : 9,
                  right = Math.min(
                    profile.course - 3,
                    left + (inwardKind === 0 ? 18 : 15),
                  );
                const z0 = floor + (inwardKind === 1 ? 7 : 5),
                  z1 = floor + 20;
                if (phase >= left - 3 && phase < right + 3)
                  column(
                    `${family}:inner-casing-seat`,
                    "void",
                    "dark",
                    x,
                    y,
                    z0 - 2,
                    z1 + 2,
                    family,
                  );
                if (phase >= left - 2 && phase < right + 2) {
                  const cut = Math.max(
                    0,
                    2 - Math.min(phase - (left - 2), right + 1 - phase),
                  );
                  column(
                    `${family}:inner-manufactured-casing`,
                    "plate",
                    "primary",
                    x,
                    y,
                    z0 - 1 + cut,
                    z1 + 1 - cut,
                    family,
                  );
                  if (phase >= left && phase < right)
                    column(
                      `${family}:inner-casing-kicker`,
                      "frame",
                      "trim",
                      x,
                      y,
                      z0 - 1,
                      z0 + 1,
                      family,
                    );
                }
                if (phase >= left && phase < right) {
                  const border = phase < left + 2 || phase >= right - 2;
                  if (!border) {
                    column(
                      `${family}:inner-service-well`,
                      "void",
                      "dark",
                      x,
                      y,
                      z0 + 2,
                      z1 - 2,
                      family,
                    );
                    // Short protected inserts occupy selected positions in the well; most of it stays open.
                    if (inwardKind === 0) {
                      for (const z of [z0 + 4, z1 - 5])
                        column(
                          `${family}:inner-vent-fin`,
                          "service",
                          "metal",
                          x,
                          y,
                          z,
                          z + 1,
                          family,
                        );
                    } else if (inwardKind === 1) {
                      if (phase < left + 7)
                        column(
                          `${family}:inner-control-housing`,
                          "service",
                          "metal",
                          x,
                          y,
                          z0 + 3,
                          z1 - 3,
                          family,
                        );
                      if (phase >= left + 4 && phase < left + 6)
                        column(
                          `${family}:inner-control-lens`,
                          "service",
                          "emit_a",
                          x,
                          y,
                          z0 + 7,
                          z0 + 9,
                          family,
                        );
                      if (phase >= right - 5 && phase < right - 3)
                        column(
                          `${family}:inner-control-keybank`,
                          "service",
                          "primary",
                          x,
                          y,
                          z0 + 4,
                          z0 + 6,
                          family,
                        );
                    } else {
                      if (phase < right - 5)
                        column(
                          `${family}:inner-access-lid`,
                          "plate",
                          "accent",
                          x,
                          y,
                          z0 + 3,
                          z1 - 3,
                          family,
                        );
                      if (phase >= right - 5 && phase < right - 3)
                        column(
                          `${family}:inner-access-latch`,
                          "service",
                          "metal",
                          x,
                          y,
                          z0 + 6,
                          z1 - 5,
                          family,
                        );
                    }
                  }
                  if (phase === left + 1 || phase === right - 2)
                    for (const z of [z0 + 1, z1 - 2])
                      column(
                        `${family}:inner-service-fastener`,
                        "service",
                        "metal",
                        x,
                        y,
                        z,
                        z + 1,
                        family,
                      );
                }
                // A room task header has an opaque protective housing, not an exposed glow strip.
                if (phase >= 4 && phase < profile.course - 5) {
                  column(
                    `${family}:inner-task-header`,
                    "frame",
                    "trim",
                    x,
                    y,
                    floor + 22,
                    floor + 26,
                    family,
                  );
                  if (phase >= 6 && phase < profile.course - 7)
                    column(
                      `${family}:inner-task-lens`,
                      "service",
                      inwardKind === 0 ? "emit_b" : "emit_a",
                      x,
                      y,
                      floor + 23,
                      floor + 24,
                      family,
                    );
                }
                if (phase === left - 2)
                  column(
                    `${family}:inner-vertical-task-lens`,
                    "service",
                    "emit_b",
                    x,
                    y,
                    z0 + 3,
                    z1 - 3,
                    family,
                  );
              }
            }
          }
          surfaceRole = "hull";
          if (distance >= 2 && distance < 3)
            column(
              `${family}:cap`,
              "frame",
              "secondary",
              x,
              y,
              Math.max(floor, top - 1),
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
          const chart = tileRoofCharts.get(tile);
          const slopedPatch = chart && Math.hypot(chart.dx, chart.dy) > 1e-6;
          if (slopedPatch) {
            roofChart = chart;
            // A clipped analytic plate exists before rasterization. Its fine treads share one
            // continuous pigment/skin; flat-roof cards, wells and hatches never stamp the slope.
            column(
              `${family}:sloped-pressure-skin`,
              "core",
              "secondary",
              x,
              y,
              hi - 1,
              hi,
              family,
            );
            if (distance >= 2)
              column(
                `${family}:sloped-roof-plate`,
                "plate",
                "primary",
                x,
                y,
                hi,
                hi + 1,
                family,
              );
            roofChart = undefined;
          } else {
            // A housed pressure tray, not independent cards on a thin sheet. Two broad
            // shoulders overlap along a real assembly joint and protect one recessed service
            // channel. Every pocket terminates before the source footprint ends/holes.
            const centreY = routeYs.reduce(
              (best, y) =>
                Math.abs(y - p[1]) < Math.abs(best - p[1]) ? y : best,
              routeYs[0],
            );
            const channelHalf = 4;
            const fromEnd = Math.min(x - bx, bX - 1 - x);
            const marked = roofMarkings.some((r) => inRect(p[0], p[1], r, 1));
            const mountClear = !roofObstacles.some((r) =>
              inRect(p[0], p[1], r, 2),
            );
            const channel =
              Math.abs(y - centreY) < channelHalf &&
              fromEnd >= 8 &&
              mountClear &&
              !marked;
            const serviceBelt =
              Math.abs(y - centreY) < channelHalf + 4 &&
              fromEnd >= 6 &&
              mountClear &&
              !marked;
            const joint = Math.round(bx + (bX - bx) * 0.58);
            const foreShoulder = x >= joint;
            const enclosure = admittedRoofCases.get(`${x},${y}`);
            const localX = enclosure
              ? Math.min(x - enclosure.bounds[0], enclosure.bounds[2] - 1 - x)
              : Infinity;
            const localY = enclosure
              ? Math.min(y - enclosure.bounds[1], enclosure.bounds[3] - 1 - y)
              : Infinity;
            const caseEdge = Math.min(localX, localY);
            const shapedCase =
              enclosure && localX + localY >= 2 && mountClear && !marked;
            // A machinery bay is a joined apron around real protected apertures,
            // with one broad unequal cheek and a lower service side. It is not a
            // rectangular raised card with a universal dark border/spine.
            const caseLongX = enclosure
              ? enclosure.bounds[2] - enclosure.bounds[0] >=
                enclosure.bounds[3] - enclosure.bounds[1]
              : true;
            const acrossCase = enclosure
              ? caseLongX
                ? y - enclosure.bounds[1]
                : x - enclosure.bounds[0]
              : 0;
            const caseWidth = enclosure
              ? caseLongX
                ? enclosure.bounds[3] - enclosure.bounds[1]
                : enclosure.bounds[2] - enclosure.bounds[0]
              : 0;
            const alongCase = enclosure
              ? caseLongX
                ? x - enclosure.bounds[0]
                : y - enclosure.bounds[1]
              : 0;
            const caseLength = enclosure
              ? caseLongX
                ? enclosure.bounds[2] - enclosure.bounds[0]
                : enclosure.bounds[3] - enclosure.bounds[1]
              : 0;
            const apertureDistance = enclosure?.fixtures.length
              ? Math.min(
                  ...enclosure.fixtures.map(([a, b, A, B]) =>
                    Math.max(a - p[0], p[0] - A, b - p[1], p[1] - B, 0),
                  ),
                )
              : Infinity;
            const cheekWidth = Math.max(
              5,
              Math.floor(
                caseWidth * (enclosure?.kind === "utility" ? 0.36 : 0.48),
              ),
            );
            const broadCheek =
              enclosure?.broadSide === "high"
                ? acrossCase >= caseWidth - cheekWidth
                : acrossCase < cheekWidth;
            const caseEnd = Math.min(alongCase, caseLength - 1 - alongCase);
            // Mount returns stay inside the three admitted finish courses.
            // Existing fore-shoulder/overlap local44 owners remain unchanged;
            // this new task assembly does not add another elevated rail.
            const apertureReturn =
              apertureDistance >= 2 && apertureDistance < 6;
            const joinedReturn = apertureReturn;
            const caseSpine =
              !broadCheek &&
              !apertureReturn &&
              acrossCase >= 3 &&
              acrossCase < caseWidth - 3;
            const cheekCourse = hi;
            // Three unequal positive bodies belong to the actual connected bay:
            // protected mount return, broad case, and lower service shoulder.
            // All broad covers stay in the existing three non-core courses.
            const serviceCover = alongCase >= Math.floor(caseLength * 0.62);
            const coverTop = caseSpine
              ? serviceCover
                ? hi - 1
                : hi
              : cheekCourse;

            const endInset = fromEnd < 4 ? 2 : 0;
            const shoulder = distance >= 2 + endInset && !serviceBelt;
            column(
              `${family}:roof-subframe`,
              "frame",
              deck ? "trim" : "secondary",
              x,
              y,
              hi - 3,
              hi - 1,
              family,
            );
            if (shoulder) {
              // Offset front/rear case ends have broad 2–3 cell shoulders. Only the
              // genuine overlap joint gets a stepped lip, never each lattice-height tread.
              column(
                `${family}:roof-housed-shoulder`,
                "plate",
                // The calm outer case is pale; trim belongs to its contained
                // service side, not every walkable-height-class flight flank.
                serviceBelt ? "trim" : "primary",
                x,
                y,
                hi - 3,
                !deck && foreShoulder ? hi + 1 : hi - 1,
                family,
              );
              if (
                !deck &&
                !marked &&
                x >= joint - 2 &&
                x < joint + 2 &&
                distance >= 4 &&
                !serviceBelt
              )
                column(
                  `${family}:roof-shoulder-overlap`,
                  "plate",
                  "primary",
                  x,
                  y,
                  hi - 2,
                  hi + 1,
                  family,
                );
            }
            const architecturalCase =
              !!macro.architecture && deck && shoulder && !!shapedCase;
            const massing =
              architecturalCase && massingCells.has(`${x},${y}`)
                ? macro.architecture?.roofMassing
                : undefined;
            const mouthLeft = enclosure ? enclosure.bounds[0] + 5 : 0,
              mouthRight = enclosure
                ? Math.min(enclosure.bounds[2] - 5, mouthLeft + 28)
                : 0,
              mouthBottom = enclosure ? enclosure.bounds[1] + 5 : 0,
              mouthTop = enclosure
                ? Math.min(enclosure.bounds[3] - 5, mouthBottom + 20)
                : 0;
            const inHighShell = (X: number, Y: number) =>
              !!enclosure &&
              admittedRoofCases.get(`${X},${Y}`) === enclosure &&
              massingCells.has(`${X},${Y}`) &&
              ((enclosure.broadSide === "high"
                ? (caseLongX
                    ? Y - enclosure.bounds[1]
                    : X - enclosure.bounds[0]) >=
                  caseWidth - cheekWidth
                : (caseLongX
                    ? Y - enclosure.bounds[1]
                    : X - enclosure.bounds[0]) < cheekWidth) ||
                (X >= mouthLeft - 3 &&
                  X < mouthRight + 3 &&
                  Y >= mouthBottom - 3 &&
                  Y < mouthTop + 3));
            const highHousing = !!massing && inHighShell(x, y);
            if (architecturalCase) {
              const start = layers.length;
              // Retire the old visible finish, including its independent
              // decorative podium cap. Original CORE [hi-5,hi-3) stays intact.
              column(
                `${family}:roof-architecture-retire:${enclosure.id}`,
                "void",
                "dark",
                x,
                y,
                hi - 3,
                massing ? hi + massing.high : hi + 1,
                family,
              );
              const step = macro.architecture!.roofStep;
              const lowShoulder = !broadCheek && !apertureReturn;
              const connector = caseEdge < 3 || caseEnd < 5 || apertureReturn;
              const upper = massing
                ? highHousing
                  ? hi + massing.high
                  : connector
                    ? hi + massing.low
                    : hi + massing.medium
                : connector
                  ? hi - 1
                  : lowShoulder
                    ? hi - step
                    : hi;
              column(
                `${family}:roof-task-case:${enclosure.id}`,
                "plate",
                massing
                  ? highHousing
                    ? "primary"
                    : connector
                      ? "trim"
                      : "primary"
                  : lowShoulder
                    ? "trim"
                    : "primary",
                x,
                y,
                hi - 3,
                upper,
                family,
              );
              // Whole supported footprint, one finite body: top occupied cells
              // hi-1 / hi-2 / hi-3 form unequal cover, return and service planes.
              // All final writes run after generic skins so no hidden taller cap
              // survives on top of this deliberately lower positive shoulder.
              pendingRoofClusterLayers.push(...layers.splice(start));
            }
            if (deck && shoulder && shapedCase && !architecturalCase) {
              // Broad clipped returns only at this real assembly boundary. The
              // raised skin joins its lower pressure tray through two shoulder
              // courses; the service route remains an actual contained recess.
              column(
                `${family}:roof-task-case:${enclosure.id}`,
                "plate",
                caseSpine && serviceCover ? "trim" : "primary",
                x,
                y,
                hi - 3,
                // Positive broad stepped returns join the body to its apron.
                caseEdge < 2 || caseEnd < 3 ? hi - 1 : coverTop,
                family,
              );
              if (
                caseEdge >= 3 &&
                enclosure.kind === "habitation" &&
                x < enclosure.bounds[0] + 7 &&
                y < enclosure.bounds[1] + 18
              )
                column(
                  `${family}:roof-control-access:${enclosure.id}`,
                  "plate",
                  "accent",
                  x,
                  y,
                  hi,
                  hi + 1,
                  family,
                );
            }
            if (
              deck &&
              shoulder &&
              shapedCase &&
              caseEdge >= 3 &&
              !serviceBelt
            ) {
              const [a, b, A, B] = enclosure.bounds;
              // One offset inset beside each real cluster. The long clear side is
              // selected by the same footprint, so the opening joins its case and
              // cannot cover the already-working equipment/service apertures.
              const across = y - b;
              const pocketWidth = Math.min(28, Math.floor((A - a) * 0.48));
              const pocketLeft = a + (enclosure.kind === "utility" ? 5 : 8);
              const pocketBottom =
                enclosure.broadSide === "low"
                  ? Math.max(4, Math.floor((B - b) * 0.54))
                  : 4;
              const pocketTop = Math.min(B - b - 4, pocketBottom + 14);
              const pocket =
                pocketWidth >= 12 &&
                [-3, -2, -1, 0, 1, 2, 3].every((dx) =>
                  [-3, -2, -1, 0, 1, 2, 3].every(
                    (dy) =>
                      admittedRoofCases.get(`${x + dx},${y + dy}`) ===
                      enclosure,
                  ),
                ) &&
                (architecturalCase ||
                  !shoulderFields.some((f) => inRect(p[0], p[1], f.bounds))) &&
                x >= pocketLeft &&
                x < pocketLeft + pocketWidth &&
                across >= pocketBottom &&
                across < pocketTop &&
                !joinedReturn;
              const deepMouth =
                !!massing &&
                mouthRight - mouthLeft >= 12 &&
                mouthTop - mouthBottom >= 10 &&
                x >= mouthLeft &&
                x < mouthRight &&
                y >= mouthBottom &&
                y < mouthTop &&
                [-3, -2, -1, 0, 1, 2, 3].every((dx) =>
                  [-3, -2, -1, 0, 1, 2, 3].every((dy) =>
                    inHighShell(x + dx, y + dy),
                  ),
                ) &&
                !joinedReturn;
              if (massing ? deepMouth : pocket) {
                const pocketStart = layers.length;
                column(
                  `${family}:roof-cluster-well:${enclosure.id}`,
                  "void",
                  "dark",
                  x,
                  y,
                  massing ? hi - 2 : hi - 3,
                  massing ? hi + massing.high : architecturalCase ? hi : hi + 1,
                  family,
                );
                // The existing two CORE courses [hi-5,hi-3) form the finite
                // well floor. No invented extra finish bottom hides the depth.
                if (
                  enclosure.kind === "utility" &&
                  (massing
                    ? [
                        mouthBottom + 3,
                        mouthBottom +
                          Math.floor((mouthTop - mouthBottom) * 0.5),
                        mouthTop - 5,
                      ].some((at) => y >= at && y < at + 3)
                    : architecturalCase
                      ? Array.from(
                          { length: macro.architecture!.roofThermalRibs },
                          (_, i) =>
                            pocketBottom +
                            Math.floor(
                              ((i + 0.5) * (pocketTop - pocketBottom)) /
                                macro.architecture!.roofThermalRibs,
                            ),
                        ).some((at) => across >= at && across < at + 2)
                      : mod(across - pocketBottom, 6) < 2)
                )
                  column(
                    `${family}:roof-cluster-vent:${enclosure.id}`,
                    "service",
                    "metal",
                    x,
                    y,
                    massing ? hi - 2 : hi - 3,
                    massing ? hi + 1 : hi - 2,
                    family,
                  );
                else if (
                  enclosure.kind !== "utility" &&
                  x >= pocketLeft + 3 &&
                  x < pocketLeft + pocketWidth - 3 &&
                  across >= pocketBottom + 2 &&
                  across < pocketTop - 2
                )
                  column(
                    `${family}:roof-cluster-access:${enclosure.id}`,
                    "plate",
                    "accent",
                    x,
                    y,
                    hi - 3,
                    massing ? hi : hi - 2,
                    family,
                  );
                pendingRoofClusterLayers.push(...layers.splice(pocketStart));
              }
            }
            const field = shoulderFields.find((f) =>
              inRect(p[0], p[1], f.bounds),
            );
            if (
              deck &&
              field &&
              shoulder &&
              !serviceBelt &&
              !architecturalCase
            ) {
              const [a, b, A, B] = field.bounds;
              const edge = Math.min(x - a, A - 1 - x, y - b, B - 1 - y);
              const corner =
                Math.min(x - a, A - 1 - x) + Math.min(y - b, B - 1 - y);
              if (corner >= 2) {
                column(
                  `${family}:roof-shoulder-enclosure:${field.id}`,
                  "plate",
                  "primary",
                  x,
                  y,
                  hi - 2,
                  hi + 1,
                  family,
                );
                if (edge >= 2) {
                  column(
                    `${family}:roof-shoulder-well:${field.id}`,
                    "void",
                    "dark",
                    x,
                    y,
                    hi - 1,
                    hi + 1,
                    family,
                  );
                  column(
                    `${family}:roof-shoulder-backing:${field.id}`,
                    "frame",
                    "trim",
                    x,
                    y,
                    hi - 2,
                    hi - 1,
                    family,
                  );
                  if (
                    field.kind === "vent" &&
                    x >= a + 4 &&
                    x < A - 4 &&
                    mod(y - b, 5) < 2
                  )
                    column(
                      `${family}:roof-shoulder-louver:${field.id}`,
                      "service",
                      "metal",
                      x,
                      y,
                      hi - 1,
                      hi,
                      family,
                    );
                  else if (field.kind === "access") {
                    column(
                      `${family}:roof-shoulder-access:${field.id}`,
                      "plate",
                      "trim",
                      x,
                      y,
                      hi - 1,
                      hi,
                      family,
                    );
                    if (x >= A - 6 && x < A - 4 && y >= b + 4 && y < b + 6)
                      column(
                        `${family}:roof-shoulder-latch:${field.id}`,
                        "service",
                        "metal",
                        x,
                        y,
                        hi,
                        hi + 1,
                        family,
                      );
                  }
                }
              }
            }
            if (channel) {
              column(
                `${family}:roof-protected-channel`,
                "void",
                "dark",
                x,
                y,
                hi - 3,
                hi + 2,
                family,
              );
              // Continuous pressure floor remains below the 3-cell well. Two service
              // sections have distinct functions, not an A/B/C/D wallpaper cadence.
              const cassetteX =
                trayCassetteX.get(centreY) ?? Number.NEGATIVE_INFINITY;
              const cassette = x >= cassetteX && x < cassetteX + 12;
              if (cassette) {
                column(
                  `${family}:roof-access-cassette`,
                  "service",
                  "trim",
                  x,
                  y,
                  hi - 3,
                  hi - 1,
                  family,
                );
                if (
                  x >= cassetteX + 8 &&
                  x < cassetteX + 10 &&
                  Math.abs(y - centreY) < 2
                )
                  column(
                    `${family}:roof-access-latch`,
                    "service",
                    "metal",
                    x,
                    y,
                    hi - 1,
                    hi,
                    family,
                  );
              } else if (
                !macro.architecture &&
                x > joint + 8 &&
                x < bX - 10 &&
                mod(x - joint, 6) < 2
              ) {
                column(
                  `${family}:roof-cooling-louver`,
                  "service",
                  "trim",
                  x,
                  y,
                  hi - 3,
                  hi - 1,
                  family,
                );
              }
            } else if (serviceBelt) {
              column(
                `${family}:roof-channel-guard`,
                "frame",
                "trim",
                x,
                y,
                hi - 3,
                hi,
                family,
              );
            }
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
    // Final whole-cluster pocket overlay follows ALL generic casing heights.
    // Otherwise compacting first appearances of unequal case courses can move a
    // later occupied course over an earlier column's intended aperture.
    layers.push(...pendingRoofClusterLayers);
    // Seal the continuous tray after facade voids too: an outboard route can share
    // columns with a side cassette, whose later compacted void must never pierce it.
    surfaceRole = "roof";
    shellNormal = undefined;
    roofChart = undefined;
    if (view === "flight" || !deck)
      for (let y = by; y < bY; y++)
        for (let x = bx; x < bX; x++) {
          const p: Pt = [x + 0.5, y + 0.5],
            world: Pt = [p[0] / 16, p[1] / 16];
          if (
            !insidePolygon(poly, p[0], p[1]) ||
            holes.some((h) => insidePolygon(h, p[0], p[1]))
          )
            continue;
          const tile = tileCells
            .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
            ?.find((t) => insidePolygon(t.poly, world[0], world[1]))?.tile;
          if (!tile || tile.bow) continue;
          const hi = Math.ceil(bowHeights(tile, volume.height, world)[1]);
          column(
            `${family}:roof-pressure-tray`,
            "core",
            "secondary",
            x,
            y,
            hi - 5,
            hi - 3,
            family,
          );
        }
    // Functional pockets are an explicit final overlay after all continuous route
    // courses. Per-column compaction must not reorder a later route void over a lid.
    surfaceRole = "roof";
    shellNormal = undefined;
    roofChart = undefined;
    if (view === "flight" || !deck)
      for (const patch of roofPatches) {
        const [a, b, A, B] = patch.bounds;
        for (let y = b; y < B; y++)
          for (let x = a; x < A; x++) {
            const p: Pt = [x + 0.5, y + 0.5];
            const world: Pt = [p[0] / 16, p[1] / 16];
            if (
              !insidePolygon(poly, p[0], p[1]) ||
              holes.some((h) => insidePolygon(h, p[0], p[1]))
            )
              continue;
            const tile = tileCells
              .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
              ?.find((t) => insidePolygon(t.poly, world[0], world[1]))?.tile;
            if (
              !tile ||
              tile.bow ||
              roofMarkings.some((r) => inRect(p[0], p[1], r, 1)) ||
              roofObstacles.some((r) => inRect(p[0], p[1], r, 2))
            )
              continue;
            const hi = Math.ceil(bowHeights(tile, volume.height, world)[1]);
            const edgeX = Math.min(x - a, A - 1 - x),
              edgeY = Math.min(y - b, B - 1 - y);
            if (edgeX + edgeY < 3) continue;
            const rim = edgeX < 2 || edgeY < 2;
            column(
              `${family}:roof-functional-pocket`,
              "void",
              "dark",
              x,
              y,
              hi - 2,
              hi + 2,
              family,
            );
            if (rim)
              column(
                `${family}:roof-pocket-housing`,
                "frame",
                "trim",
                x,
                y,
                hi - 3,
                hi + 1,
                family,
              );
            else if (patch.kind === "access") {
              column(
                `${family}:roof-offset-access`,
                "service",
                "accent",
                x,
                y,
                hi - 2,
                hi - 1,
                family,
              );
              if (x >= A - 6 && x < A - 4 && y >= b + 5 && y < B - 5)
                column(
                  `${family}:roof-pocket-latch`,
                  "service",
                  "metal",
                  x,
                  y,
                  hi - 1,
                  hi,
                  family,
                );
            } else if (mod(x - a, 6) < 2)
              column(
                `${family}:roof-pocket-fin`,
                "service",
                "metal",
                x,
                y,
                hi - 2,
                hi,
                family,
              );
          }
      }
    // Seal the middle course after all facade voids. This is a distinct final source layer,
    // so column compaction cannot reorder an outer cassette void over pressure backing.
    surfaceRole = "wall";
    for (const backing of innerBackings) {
      shellNormal = backing.normal;
      column(
        `${family}:inner-service-backing`,
        "core",
        "secondary",
        backing.x,
        backing.y,
        backing.z0,
        backing.z1,
        family,
      );
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
          !inside ||
          boundary.distance > 1 ||
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
          hi = tile.bow ? Math.floor(rawHi) : Math.ceil(rawHi);
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
    const roofServiceFootprint = new Set<string>();
    for (const l of layers.filter(
      (l) =>
        l.support === family &&
        (l.id.endsWith(":roof-protected-channel") ||
          l.id.endsWith(":roof-functional-pocket")),
    ))
      for (let y = l.bounds[1]; y < l.bounds[4]; y++)
        for (let x = l.bounds[0]; x < l.bounds[3]; x++)
          roofServiceFootprint.add(`${x},${y}`);
    // Emitted void names can be buried by later occupied subframes. Only actual
    // surviving backed wells/function protect an edge from source reconstruction.
    const beforeBoundary = sampleShipVisualLayers(
      compactColumns(layers.filter((l) => l.support === family)),
    );
    const survivingService = new Set<string>();
    const serviceColumns = new Map<string, ShipVisualLayer[]>();
    for (const l of layers.filter(
      (l) =>
        l.support === family &&
        [":roof-protected-channel", ":roof-functional-pocket"].some((s) =>
          l.id.endsWith(s),
        ),
    ))
      for (let y = l.bounds[1]; y < l.bounds[4]; y++)
        for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
          const key = `${x},${y}`;
          serviceColumns.set(key, [...(serviceColumns.get(key) ?? []), l]);
        }
    for (const key of roofServiceFootprint) {
      const [x, y] = key.split(",").map(Number);
      if (
        serviceColumns.get(key)?.some((l) => {
          const bottom = l.bounds[2];
          const open =
            !beforeBoundary.has(visualCellKey(x, y, bottom)) &&
            !beforeBoundary.has(visualCellKey(x, y, bottom + 1));
          const functionPresent = [bottom, bottom + 1, bottom + 2].some(
            (z) =>
              beforeBoundary.get(visualCellKey(x, y, z))?.role === "service",
          );
          // A local pocket may overlap the existing one-cell-deeper service
          // route. Check its actual floor, not the nominal overlay's bottom.
          const sealedSupport = [bottom - 1, bottom - 2].some((z) => {
            const c = beforeBoundary.get(visualCellKey(x, y, z));
            if (!c || !["core", "frame", "roof", "plate"].includes(c.role))
              return false;
            const topCore = c.role === "core" ? z : z - 1;
            return [topCore, topCore - 1].every(
              (q) =>
                beforeBoundary.get(visualCellKey(x, y, q))?.role === "core",
            );
          });
          return (open && sealedSupport) || functionPresent;
        })
      )
        survivingService.add(key);
    }
    // R13 reconstructs the actual old exposed owners, instead of dressing another
    // sloping row over cassette-rim/subframe/pressure-tray. Tall and shallow sections
    // are distinct; the nonwalkable five-cell tray never inherits the seven-cell gate.
    for (let y = by; y < bY; y++)
      for (let x = bx; x < bX; x++) {
        const p: Pt = [x + 0.5, y + 0.5];
        if (
          !insidePolygon(poly, ...p) ||
          holes.some((h) => insidePolygon(h, ...p))
        )
          continue;
        const boundary = polygonBoundarySample(p, poly);
        if (boundary.distance >= 4) continue;
        const world: Pt = [p[0] / 16, p[1] / 16];
        const tile = tileCells
          .get(`${Math.floor(world[0])},${Math.floor(world[1])}`)
          ?.find((t) => insidePolygon(t.poly, ...world))?.tile;
        if (!tile || bowGlass(tile)) continue;
        const [rawLo, rawHi] = bowHeights(tile, volume.height, world),
          lo = Math.floor(rawLo),
          hi = tile.bow ? Math.floor(rawHi) : Math.ceil(rawHi);
        const floor = tile.bow
          ? lo + G.bowProfiles.shellThicknessTexels[volume.height][0]
          : deck
            ? G.deck.floorTopTexels
            : lo + 2;
        const top =
          view === "deck" && deck ? Math.min(hi, G.deck.shellCutTexels) : hi;
        const endDistance =
          Math.min(boundary.edgeT, 1 - boundary.edgeT) * boundary.edgeLength;
        const a = poly[boundary.edgeIndex],
          b = poly[(boundary.edgeIndex + 1) % poly.length];
        const dx = b[0] - a[0],
          dy = b[1] - a[1];
        let out: Pt = [boundary.normalHint[0], boundary.normalHint[1]];
        if (
          insidePolygon(
            poly,
            p[0] + out[0] * (boundary.distance + 2),
            p[1] + out[1] * (boundary.distance + 2),
          )
        )
          out = [-out[0], -out[1]];
        const signed: [number, number, number] = [
          Math.sign(out[0]),
          Math.sign(out[1]),
          0,
        ];
        const diagonal =
          Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-6 && Math.abs(dx) > 1e-6;
        const intercept = Math.round(signed[0] * a[0] + signed[1] * a[1]) - 1;
        const q = signed[0] * p[0] + signed[1] * p[1];
        // One original OUTER occupied row owns the entire manufactured casing.
        // Palette/height returns never select a parallel inboard clipping plane.
        // Chebyshev raw rings protect source holes, true segment ends and attached
        // volume interfaces. Current damage subsequently recomputes exact shared faces.
        const rawGuard =
          endDistance < 3 ||
          holes.some((h) => polygonBoundarySample(p, h).distance <= 2) ||
          assemblies.some(
            (other) =>
              other.volume.id !== volume.id &&
              [-1, 0, 1].some((X) =>
                [-1, 0, 1].some((Y) =>
                  insidePolygon(
                    other.geometry.outline?.outer ?? [],
                    world[0] + X / 16,
                    world[1] + Y / 16,
                  ),
                ),
              ),
          );
        const plane = (d: number): ShipVisualLayer["facet"] =>
          diagonal && !rawGuard && q === d
            ? { id: `${family}:case:${boundary.edgeIndex}:${d}`, a: signed, d }
            : undefined;
        shellNormal = undefined;
        sidePlane = undefined;
        roofChart = undefined;
        surfaceRole = deck && view === "deck" ? "wall" : "hull";
        facetPlane = undefined;
        if (survivingService.has(`${x},${y}`)) {
          // Keep actual well/bank geometry; only its original external pressure
          // side uses the same manufactured plane. Aperture caps stay axis-hard.
          const facet = plane(intercept);
          if (facet)
            for (let z = lo; z < top; z++) {
              const c = beforeBoundary.get(visualCellKey(x, y, z));
              if (
                !c ||
                !["core", "frame"].includes(c.role) ||
                c.slot !== "secondary"
              )
                continue;
              layers.push({
                id: `${family}:retained-route-pressure-side`,
                role: c.role,
                slot: c.slot,
                bounds: [x, y, z, x + 1, y + 1, z + 1],
                support: family,
                surfaceRole: c.surfaceRole,
                facet,
              });
            }
          continue;
        }
        const outerFinish = (z0: number, z1: number) => {
          if (
            boundary.distance >= 2 ||
            protectedInterface(world) ||
            z1 - z0 < 5
          )
            return;
          const along = boundary.edgeT * boundary.edgeLength;
          const start =
            Math.floor(along / macro.armorSection) * macro.armorSection;
          const end = Math.min(boundary.edgeLength, start + macro.armorSection);
          const centre = (start + end) / 2;
          const probe: Pt = [
            (a[0] + (dx * centre) / boundary.edgeLength - out[0] * 8) / 16,
            (a[1] + (dy * centre) / boundary.edgeLength - out[1] * 8) / 16,
          ];
          const room = doc.rooms.find(
            (r) =>
              probe[0] >= r.rect[0] &&
              probe[0] < r.rect[2] &&
              probe[1] >= r.rect[1] &&
              probe[1] < r.rect[3],
          );
          const outside: Pt = [
            world[0] + (out[0] * 3) / 16,
            world[1] + (out[1] * 3) / 16,
          ];
          const exposed = !blockedByAttachment(volume.id, outside, z0, z1);
          const projectedRoom = room
            ? (((room.rect[0] + room.rect[2]) * 8 - a[0]) * dx +
                ((room.rect[1] + room.rect[3]) * 8 - a[1]) * dy) /
              boundary.edgeLength
            : Infinity;
          const selected =
            exposed && projectedRoom >= start && projectedRoom < end;
          const kind =
            selected && ["engineering", "workshop"].includes(room!.type)
              ? "vent"
              : selected &&
                  ["bridge", "cargo", "quarters", "lounge", "galley"].includes(
                    room!.type,
                  )
                ? "access"
                : "armor";
          const u = along - start;
          const corner = Math.max(0, macro.corner - Math.min(u, end - along));
          const low = z0 + macro.bindingHeight + Math.ceil(corner),
            high = z1 - macro.bindingHeight - Math.ceil(corner);
          const owned = `${family}:exposed-bay:${boundary.edgeIndex}:${start}:${kind}`;
          const savedSurface = surfaceRole;
          surfaceRole = "hull";
          // Retain the support identity below the shallow top package. Visible
          // armor pigment need not turn continuous pressure cells into decor.
          const finish = (
            name: string,
            slot: ShipKitSlot,
            low: number,
            high: number,
          ) => {
            for (let z = low; z < high; z++)
              column(
                name,
                !deck && z >= hi - 3 ? "frame" : "core",
                slot,
                x,
                y,
                z,
                z + 1,
                family,
              );
          };
          finish(`${owned}:case`, "trim", z0, z1);
          if (high > low) {
            // Axis-aligned bays retain their actual one-course armor seat and
            // finite lower/upper returns. Only the signed45 boundary shares its
            // FIRST outer row: eroding that row would double total recession.
            if (!diagonal && boundary.distance < 1)
              column(
                `${owned}:armor-seat`,
                "void",
                "dark",
                x,
                y,
                low,
                deck ? high : Math.min(high, hi - 5),
                family,
              );
            // Broad armor and its upper/lower bindings share the actual FIRST
            // OUTER plane. Recess depth belongs to selected backed service wells,
            // not to an outboard parallel rail left around every quiet armor bay.
            const oldFacet = facetPlane;
            facetPlane = plane(intercept);
            if (diagonal || boundary.distance >= 1)
              finish(`${owned}:armor`, "primary", low, high);
            facetPlane = oldFacet;
          }
          if (kind === "armor" || high - low < 5) {
            surfaceRole = savedSurface;
            return;
          }
          const width = kind === "vent" ? macro.ventWidth : macro.accessWidth;
          const left = Math.max(3, (end - start - width) * 0.32),
            right = left + width;
          const bottom = Math.max(low + 1, z0 + 5),
            ceiling = Math.min(
              high - 1,
              bottom + macro.ventHeight,
              deck ? high : hi - 5,
            );
          if (u < left || u >= right || ceiling <= bottom) {
            surfaceRole = savedSurface;
            return;
          }
          if (!deck || boundary.distance < 1)
            column(
              `${owned}:well`,
              "void",
              "dark",
              x,
              y,
              bottom,
              ceiling,
              family,
            );
          // Every insert remains inside the original finish courses. Two deeper
          // continuous role-core courses back the actual open well.
          const savedFacet = facetPlane;
          facetPlane = undefined;
          if (
            (deck ? boundary.distance < 1 : boundary.distance >= 1) &&
            kind === "vent" &&
            Math.floor(u - left) % 6 < 2
          )
            column(
              `${owned}:louver`,
              "service",
              "metal",
              x,
              y,
              bottom,
              ceiling,
              family,
            );
          else if (boundary.distance >= 1 && kind === "access") {
            column(
              `${owned}:hatch`,
              deck ? "core" : "plate",
              "accent",
              x,
              y,
              bottom,
              ceiling,
              family,
            );
            if (!deck && u >= right - 4 && u < right - 2)
              column(
                `${owned}:latch`,
                "service",
                "metal",
                x,
                y,
                bottom + 2,
                Math.min(ceiling, bottom + 4),
                family,
              );
          }
          facetPlane = savedFacet;
          surfaceRole = savedSurface;
        };
        const inwardFinish = () => {
          if (
            !deck ||
            view !== "deck" ||
            boundary.distance < 3 ||
            protectedInterface(world) ||
            endDistance < 3 ||
            top - floor < 13
          )
            return;
          const oldSurface = surfaceRole;
          surfaceRole = "wall";
          facetPlane = undefined;
          const along = boundary.edgeT * boundary.edgeLength;
          const probe: Pt = [
            (p[0] - out[0] * 8) / 16,
            (p[1] - out[1] * 8) / 16,
          ];
          const room = doc.rooms.find(
            (r) =>
              probe[0] >= r.rect[0] &&
              probe[0] < r.rect[2] &&
              probe[1] >= r.rect[1] &&
              probe[1] < r.rect[3],
          );
          // The inward face owns one existing course, independent of the outer
          // case reconstruction. Two pressure courses separate opposing seats.
          column(
            `${family}:inward-enclosure`,
            "plate",
            "primary",
            x,
            y,
            floor + 3,
            top - 2,
            family,
          );
          column(
            `${family}:inward-kicker`,
            "frame",
            "trim",
            x,
            y,
            floor + 1,
            floor + 3,
            family,
          );
          if (!room) {
            surfaceRole = oldSurface;
            return;
          }
          const emitInwardTask = (
            chosen: ReturnType<typeof wallTaskRuns>[number],
            legacy: boolean,
          ) => {
            const { key, u: left, U: right } = chosen;
            const task = legacy
              ? retainedWallBoundary.inputs.wallTasks[
                  key as keyof typeof retainedWallBoundary.inputs.wallTasks
                ]
              : macro.wallTasks[key];
            const bottom = floor + chosen.bottom,
              ceiling = legacy
                ? Math.min(top - 3, bottom + task.height)
                : top - 2;
            if (
              right - left < 12 ||
              ceiling - bottom <
                (legacy
                  ? task.insert === "control"
                    ? 13
                    : 11
                  : key === "medical" || key === "galley"
                    ? 8
                    : 11) ||
              along < left ||
              along >= right
            ) {
              return;
            }
            const taskStart = layers.length;
            const cut = Math.max(
              0,
              (legacy ? retainedWallBoundary.inputs.corner : macro.corner) -
                Math.min(along - left, right - along),
            );
            const lower = bottom + Math.ceil(cut),
              upper = ceiling - Math.ceil(cut);
            const owned = `${family}:inward-task:${room.id}:${key}`;
            column(
              `${owned}:seat`,
              "void",
              "dark",
              x,
              y,
              bottom,
              ceiling,
              family,
            );
            column(
              `${owned}:clipped-casing`,
              "plate",
              "primary",
              x,
              y,
              lower,
              upper,
              family,
            );
            if (
              along >= left + 2 &&
              along < right - 2 &&
              upper - lower >= (task.insert === "control" ? 12 : 10)
            ) {
              column(
                `${owned}:well`,
                "void",
                "dark",
                x,
                y,
                lower + 3,
                upper - 3,
                family,
              );
              if (task.insert === "vent") {
                for (const z of [lower + 4, upper - 5])
                  column(
                    `${owned}:louver`,
                    "service",
                    "metal",
                    x,
                    y,
                    z,
                    z + 1,
                    family,
                  );
              } else if (task.insert === "control") {
                if (along < right - 5)
                  column(
                    `${owned}:keybank`,
                    "service",
                    "metal",
                    x,
                    y,
                    lower + 3,
                    lower + 5,
                    family,
                  );
              } else if (along < right - 5) {
                column(
                  `${owned}:access`,
                  "plate",
                  key === "quarters" ? "accent" : "trim",
                  x,
                  y,
                  lower + 4,
                  upper - 4,
                  family,
                );
              }
              if (along >= right - 4 && along < right - 3)
                column(
                  `${owned}:task-lens`,
                  "service",
                  "emit_b",
                  x,
                  y,
                  lower + 5,
                  upper - 4,
                  family,
                );
              // Selected room assemblies share pressure support, but their visible
              // hardware is not the same rectangular access lid in every room.
              const split = left + Math.floor((right - left) * 0.65);
              if (task.form === "relay" || task.form === "workbench") {
                if (along >= split && along < split + 1)
                  column(
                    `${owned}:split-binding`,
                    "frame",
                    "trim",
                    x,
                    y,
                    lower + 3,
                    upper - 3,
                    family,
                  );
                if (along >= split + 2 && along < right - 3)
                  for (let z = lower + 4; z < upper - 3; z += 3)
                    column(
                      `${owned}:protected-relay`,
                      "service",
                      task.form === "relay" ? "accent" : "metal",
                      x,
                      y,
                      z,
                      z + 1,
                      family,
                    );
              } else if (task.form === "instrument") {
                if (along >= left + 4 && along < left + (right - left) * 0.55)
                  column(
                    `${owned}:medical-monitor`,
                    "service",
                    "emit_a",
                    x,
                    y,
                    lower + 7,
                    Math.min(upper - 3, lower + 9),
                    family,
                  );
                if (along >= split && along < split + 1)
                  column(
                    `${owned}:storage-binding`,
                    "frame",
                    "primary",
                    x,
                    y,
                    lower + 3,
                    upper - 3,
                    family,
                  );
              } else if (task.form === "backsplash" || task.form === "living") {
                if (along >= left + 3 && along < right - 3) {
                  column(
                    `${owned}:utility-shelf`,
                    "service",
                    "metal",
                    x,
                    y,
                    lower + 4,
                    lower + 5,
                    family,
                  );
                  column(
                    `${owned}:warm-task-lens`,
                    "service",
                    "emit_b",
                    x,
                    y,
                    upper - 4,
                    upper - 3,
                    family,
                  );
                }
              } else if (
                task.form === "cargo" &&
                ((along >= left + 4 && along < left + 6) ||
                  (along >= right - 6 && along < right - 4))
              )
                column(
                  `${owned}:cargo-latch`,
                  "service",
                  "metal",
                  x,
                  y,
                  lower + 4,
                  upper - 4,
                  family,
                );
            }
            if (
              task.insert === "control" &&
              along >= left + 3 &&
              along < right - 3
            )
              column(
                `${owned}:header`,
                "service",
                "emit_a",
                x,
                y,
                upper - 2,
                upper - 1,
                family,
              );
            column(
              `${owned}:lower-binding`,
              "frame",
              "trim",
              x,
              y,
              lower,
              lower + 2,
              family,
            );
            if (legacy)
              retainedWallBoundary.collect(
                chosen as ReturnType<
                  typeof retainedWallBoundary.forFace
                >[number],
                `${family}:${boundary.edgeIndex}:inward`,
                family,
                layers.splice(taskStart),
              );
            else
              deferWallTask(
                chosen,
                `${family}:${boundary.edgeIndex}:inward`,
                family,
                taskStart,
                { a, b, side: [-out[0], -out[1]] },
              );
          };
          const selected = wallTasksFor(
            `${family}:${boundary.edgeIndex}`,
            a,
            b,
            [-out[0], -out[1]],
          ).find((t) => t.room.id === room.id && along >= t.u && along < t.U);
          if (selected) emitInwardTask(selected, false);
          const original = retainedWallBoundary
            .forFace(`${family}:${boundary.edgeIndex}`, a, b, [
              -out[0],
              -out[1],
            ])
            .find((t) => t.room.id === room.id && along >= t.u && along < t.U);
          if (original) emitInwardTask(original, true);
          surfaceRole = oldSurface;
        };
        if (deck && boundary.distance >= 1 && boundary.distance < 3) {
          // Reassert the two central pressure planes after the legacy decorative
          // recipe. Each face then owns at most its one outer finish course.
          column(
            `${family}:two-sided-pressure-core`,
            "core",
            "secondary",
            x,
            y,
            floor,
            top - 1,
            family,
          );
        }
        if (!deck) {
          if (hi - lo < 5) continue;
          column(
            `${family}:shallow-case-clear`,
            "void",
            "dark",
            x,
            y,
            hi - 3,
            hi + 2,
            family,
          );
          facetPlane = plane(intercept);
          column(
            `${family}:shallow-keel-support`,
            "core",
            "secondary",
            x,
            y,
            lo,
            hi - 3,
            family,
          );
          column(
            `${family}:shallow-pressure-tray`,
            "core",
            "secondary",
            x,
            y,
            hi - 5,
            hi - 3,
            family,
          );
          column(
            `${family}:shallow-neutral-subframe`,
            "frame",
            boundary.distance >= 2 ? "primary" : "trim",
            x,
            y,
            hi - 3,
            hi - 1,
            family,
          );
          outerFinish(lo + 2, hi - 1);
          facetPlane = undefined;
          if (boundary.distance < 4) {
            facetPlane = plane(intercept);
            column(
              `${family}:shallow-offset-armor`,
              "plate",
              "primary",
              x,
              y,
              hi - 1,
              hi,
              family,
            );
            facetPlane = undefined;
          }
          // Local overlap ends are finite manufacturing joints, not a repeated guard.
          if (endDistance >= 3 && endDistance < 7 && boundary.distance >= 3)
            column(
              `${family}:shallow-case-end`,
              "plate",
              "primary",
              x,
              y,
              hi - 1,
              hi + 1,
              family,
            );
        } else if (diagonal && top > floor + 3) {
          // Old lower sill and exposed pressure backing share the same actual XY
          // finish plane. The walkable floor/contact course itself remains raw.
          facetPlane = plane(intercept);
          column(
            `${family}:diagonal-lower-support`,
            "core",
            "secondary",
            x,
            y,
            lo,
            Math.max(lo, floor - 1),
            family,
          );
          facetPlane = undefined;
          column(
            `${family}:diagonal-contact-course`,
            "core",
            "secondary",
            x,
            y,
            floor - 1,
            floor,
            family,
          );
          column(
            `${family}:diagonal-case-clear`,
            "void",
            "dark",
            x,
            y,
            floor,
            top + 1,
            family,
          );
          facetPlane = plane(intercept);
          column(
            `${family}:diagonal-pressure-case`,
            "core",
            "secondary",
            x,
            y,
            floor,
            top - 1,
            family,
          );
          outerFinish(floor, top - 1);
          facetPlane = undefined;
          if (boundary.distance < 4) {
            facetPlane = plane(intercept);
            column(
              `${family}:diagonal-inset-lip`,
              "core",
              "primary",
              x,
              y,
              top - macro.bindingHeight,
              top,
              family,
            );
            facetPlane = undefined;
          }
        } else if (top > floor + 3) {
          outerFinish(floor, top - 1);
        }
        inwardFinish();
      }
    facetPlane = undefined;
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
      const wallCap = half
        ? ft + 14
        : jamb || glazed
          ? cap
          : ft + macro.partitionCut;
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
      for (let start = 0; start < span; start += profile.course) {
        const end = Math.min(span, start + profile.course);
        const Z = glazed ? ft + 11 : wallCap - 1;
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
        const casing = (
          name: string,
          slot: ShipKitSlot,
          side: number,
          u: number,
          U: number,
          z: number,
          Z: number,
          depth = 0,
        ) => {
          u = Math.max(1, u);
          U = Math.min(span - 1, U);
          // A recessed seat outside the clipped housing makes its shaped silhouette
          // visible. It removes only decor: the central role-core course remains.
          box(
            `${id}:${name}-seat`,
            "void",
            "dark",
            surface(side, u - 1, U + 1, z - 1, Math.min(Z + 1, wallCap - 1)),
            family,
          );
          // This is a local assembly footprint, not a repeating perimeter guard.
          for (let q = Math.floor(u); q < Math.ceil(U); q++) {
            const cut = Math.max(0, 2 - Math.min(q - u, U - 1 - q));
            box(
              `${id}:${name}`,
              "plate",
              slot,
              surface(side, q, q + 1, z + cut, Z - cut, depth),
              family,
            );
          }
        };
        for (const side of [-1, 1]) {
          // Quiet continuous enclosure; a selected functional cavity has three local depth levels.
          box(
            `${id}:lower-enclosure`,
            jamb ? "doorframe" : "plate",
            "primary",
            surface(
              side,
              start === 0 ? 1 : start,
              end === span ? end - 1 : end,
              ft + 3,
              Z,
              0,
            ),
            family,
          );
          const emitPartitionTask = (
            chosen: ReturnType<typeof wallTaskRuns>[number],
            legacy: boolean,
          ) => {
            const { key, u, U } = chosen;
            const task = legacy
              ? retainedWallBoundary.inputs.wallTasks[
                  key as keyof typeof retainedWallBoundary.inputs.wallTasks
                ]
              : macro.wallTasks[key];
            const bottom = ft + chosen.bottom,
              ceiling = legacy ? Math.min(Z, bottom + task.height) : Z;
            const minimumHeight = legacy
              ? task.insert === "control"
                ? 13
                : 11
              : key === "medical" || key === "galley"
                ? 8
                : 11;
            if (U - u < 13 || ceiling - bottom < minimumHeight) return;
            const taskStart = layers.length;
            casing(
              `task-${key}-casing`,
              "primary",
              side,
              u,
              U,
              bottom,
              ceiling,
            );
            // One outer course of a four-course partition is a seat; BOTH central
            // pressure courses remain core. No claimed two-course cavity through it.
            const well = surface(side, u + 2, U - 2, bottom + 3, ceiling - 3);
            box(`${id}:functional-well`, "void", "dark", well, family);
            box(
              `${id}:functional-backing`,
              "core",
              "secondary",
              surface(side, u + 2, U - 2, bottom + 3, ceiling - 3, 1),
              family,
            );
            box(
              `${id}:task-lower-binding`,
              "frame",
              "trim",
              surface(side, u + 1, U - 1, bottom, bottom + 2),
              family,
            );
            if (task.insert === "vent") {
              for (const z of [bottom + 4, ceiling - 5])
                box(
                  `${id}:task-protected-louver`,
                  "service",
                  "metal",
                  surface(side, u + 3, U - 3, z, z + 1),
                  family,
                );
              box(
                `${id}:task-amber-strip`,
                "service",
                "emit_b",
                surface(side, U - 4, U - 3, bottom + 5, ceiling - 4),
                family,
              );
            } else if (task.insert === "control") {
              box(
                `${id}:task-screen-backing`,
                "core",
                "dark",
                surface(side, u + 3, U - 6, bottom + 7, ceiling - 3, 1),
                family,
              );
              box(
                `${id}:task-screen-housing`,
                "service",
                "trim",
                surface(side, u + 2, U - 5, bottom + 6, bottom + 7),
                family,
              );
              for (let q = u + 3; q < U - 6; q += 4)
                box(
                  `${id}:task-keybank`,
                  "service",
                  "metal",
                  surface(
                    side,
                    q,
                    Math.min(q + 2, U - 6),
                    bottom + 3,
                    bottom + 5,
                  ),
                  family,
                );
              box(
                `${id}:task-cyan-header`,
                "service",
                "emit_a",
                surface(side, u + 3, U - 4, ceiling - 2, ceiling - 1),
                family,
              );
              box(
                `${id}:task-status-lens`,
                "service",
                "emit_b",
                surface(side, U - 4, U - 3, bottom + 8, bottom + 10),
                family,
              );
            } else {
              const red = key === "quarters";
              box(
                `${id}:task-access-face`,
                "plate",
                red ? "accent" : "trim",
                surface(side, u + 3, U - 5, bottom + 4, ceiling - 4),
                family,
              );
              box(
                `${id}:task-access-handle`,
                "service",
                "metal",
                surface(
                  side,
                  U - 7,
                  U - 5,
                  bottom + 6,
                  Math.min(ceiling - 4, bottom + 10),
                ),
                family,
              );
              box(
                `${id}:task-reading-lens`,
                "service",
                "emit_b",
                surface(side, U - 4, U - 3, bottom + 5, ceiling - 3),
                family,
              );
            }
            if (task.form === "workbench" || task.form === "relay") {
              const spine = u + Math.floor((U - u) * 0.65);
              box(
                `${id}:task-${task.form}-divider`,
                "frame",
                "trim",
                surface(side, spine, spine + 1, bottom + 3, ceiling - 3),
                family,
              );
              for (let z = bottom + 4; z < ceiling - 3; z += 3)
                box(
                  `${id}:task-${task.form}-control-bank`,
                  "service",
                  task.form === "relay" ? "accent" : "metal",
                  surface(side, spine + 2, U - 3, z, z + 1),
                  family,
                );
            } else if (task.form === "instrument") {
              box(
                `${id}:task-medical-monitor`,
                "service",
                "emit_a",
                surface(
                  side,
                  u + 4,
                  u + Math.floor((U - u) * 0.55),
                  bottom + 9,
                  Math.min(ceiling - 3, bottom + 11),
                ),
                family,
              );
              box(
                `${id}:task-medical-storage-seam`,
                "frame",
                "primary",
                surface(
                  side,
                  u + Math.floor((U - u) * 0.6),
                  u + Math.floor((U - u) * 0.6) + 1,
                  bottom + 3,
                  ceiling - 3,
                ),
                family,
              );
            } else if (task.form === "backsplash" || task.form === "living") {
              box(
                `${id}:task-${task.form}-shelf`,
                "service",
                "metal",
                surface(side, u + 3, U - 3, bottom + 4, bottom + 5),
                family,
              );
              box(
                `${id}:task-${task.form}-warm-header`,
                "service",
                "emit_b",
                surface(side, u + 3, U - 3, ceiling - 3, ceiling - 2),
                family,
              );
            } else if (task.form === "cargo") {
              for (const q of [u + 4, U - 6])
                box(
                  `${id}:task-cargo-latch`,
                  "service",
                  "metal",
                  surface(side, q, q + 2, bottom + 4, ceiling - 4),
                  family,
                );
            }

            if (legacy)
              retainedWallBoundary.collect(
                chosen as ReturnType<
                  typeof retainedWallBoundary.forFace
                >[number],
                `${family}:${side}`,
                family,
                layers.splice(taskStart),
              );
            else
              deferWallTask(chosen, `${family}:${side}`, family, taskStart, {
                a: [ax, ay],
                b: [bx, by],
                side: vertical ? [side, 0] : [0, side],
              });
          };
          if (!glazed && span >= 16 && !jamb)
            for (const chosen of wallTasksFor(
              family,
              [ax, ay],
              [bx, by],
              vertical ? [side, 0] : [0, side],
            ).filter((t) => (t.u + t.U) / 2 >= start && (t.u + t.U) / 2 < end))
              emitPartitionTask(chosen, false);
          if (!glazed && span >= 13 && wallCap >= ft + 20 && !jamb) {
            const original = retainedWallBoundary
              .forFace(
                family,
                [ax, ay],
                [bx, by],
                vertical ? [side, 0] : [0, side],
              )
              .find((t) => (t.u + t.U) / 2 >= start && (t.u + t.U) / 2 < end);
            if (original) emitPartitionTask(original, true);
          }
          if (glazed || span < 16 || jamb) continue;
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
      kick[5] = ft + 2;
      box(`${id}:kick`, "frame", "trim", kick, family);
      const capbox = [...bounds];
      capbox[2] = wallCap - 1;
      if (vertical) {
        capbox[0] += 1;
        capbox[3] -= 1;
      } else {
        capbox[1] += 1;
        capbox[4] -= 1;
      }
      box(`${id}:cap`, "frame", "trim", capbox, family);
      for (const [u, U] of jamb || span < 16
        ? []
        : [
            [0, Math.min(3, span)],
            [Math.max(0, span - 3), span],
          ])
        box(
          `${id}:shaped-end`,
          "frame",
          "trim",
          vertical
            ? [x0 - 2, y0 + u, ft + 2, x0 + 2, y0 + U, wallCap]
            : [x0 + u, y0 - 2, ft + 2, x0 + U, y0 + 2, wallCap],
          family,
        );
      if (glazed) {
        const carve = [...bounds];
        carve[2] = ft + 13;
        carve[5] = cap - 3;
        box(`${id}:glass-aperture`, "void", "dark", carve, family);
      }
      if (!jamb && !glazed && !half && wallCap < ft + 22) {
        for (let q = 0; q < span; q++) {
          const face: Pt = vertical
            ? [x0 / 16, (y0 + q + 0.5) / 16]
            : [(x0 + q + 0.5) / 16, y0 / 16];
          const socket = interior.sockets.some((o) => {
            const r = [
              o.at[0],
              o.at[1],
              o.at[0] + o.size[0],
              o.at[1] + o.size[1],
            ];
            return (
              face[0] >= r[0] - 0.1875 &&
              face[0] <= r[2] + 0.1875 &&
              face[1] >= r[1] - 0.1875 &&
              face[1] <= r[3] + 0.1875
            );
          });
          if (!socket && !protectedInterface(face)) continue;
          const full = vertical
            ? [x0 - 2, y0 + q, ft, x0 + 2, y0 + q + 1, ft + 22]
            : [x0 + q, y0 - 2, ft, x0 + q + 1, y0 + 2, ft + 22];
          const backed = [...full];
          if (vertical) {
            backed[0]++;
            backed[3]--;
          } else {
            backed[1]++;
            backed[4]--;
          }
          // Full vertical support meets the low cutaway; no floating top/header island.
          box(
            `${id}:attachment-island-return`,
            "frame",
            "trim",
            [...full.slice(0, 2), ft + 20, ...full.slice(3, 5), ft + 22],
            family,
          );
          box(
            `${id}:attachment-island-core`,
            "core",
            "secondary",
            backed,
            family,
          );
        }
      }
    };
    // The dressing contract emits metre pieces. Join only contiguous collinear
    // pieces of identical structural type before placing two-metre visual bays; gaps/doors stay gaps.
    const wallRuns = new Map<string, typeof interior.partitions>();
    for (const w of interior.partitions) {
      const vertical = Math.abs(w.a[0] - w.b[0]) < 1e-6;
      const fixed = vertical ? w.a[0] : w.a[1];
      const key = `${vertical}:${fixed}:${w.type}:${w.variant === "glazed" || w.variant === "half" ? w.variant : "solid"}`;
      const a: Pt = vertical
        ? [fixed, Math.min(w.a[1], w.b[1])]
        : [Math.min(w.a[0], w.b[0]), fixed];
      const b: Pt = vertical
        ? [fixed, Math.max(w.a[1], w.b[1])]
        : [Math.max(w.a[0], w.b[0]), fixed];
      wallRuns.set(key, [...(wallRuns.get(key) ?? []), { ...w, a, b }]);
    }
    let runIndex = 0;
    for (const walls of wallRuns.values()) {
      const axis = Math.abs(walls[0].a[0] - walls[0].b[0]) < 1e-6 ? 1 : 0;
      walls.sort((a, b) => a.a[axis] - b.a[axis]);
      let run = { ...walls[0] };
      const emit = () =>
        edge(
          `partition:run:${runIndex++}`,
          run.a,
          run.b,
          false,
          run.type === "wall.glazed" ||
            run.type === "window" ||
            run.variant === "glazed",
          run.type === "wall.half" || run.variant === "half",
        );
      for (const w of walls.slice(1)) {
        if (Math.abs(run.b[axis] - w.a[axis]) < 1e-6) run = { ...run, b: w.b };
        else {
          emit();
          run = { ...w };
        }
      }
      emit();
    }
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
        [
          p[0] * 16 - 2,
          p[1] * 16 - 2,
          ft,
          p[0] * 16 + 2,
          p[1] * 16 + 2,
          ft + 22,
        ],
        `post:${i}`,
      );
  }
  if (pendingWallTasks.size || retainedWallBoundary.hasTasks()) {
    const envelope = sampleShipVisualLayers(compactColumns(layers));
    // Finish original room-global selection BEFORE clipping its ordered writes.
    // These are original wall primitives, including authored clears, not a
    // sampled old-ship replay or a list of individually failed cells.
    for (const l of retainedWallBoundary.finish(envelope)) {
      for (let y = l.bounds[1]; y < l.bounds[4]; y++)
        for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
          let first = -1;
          const flush = (end: number) => {
            if (first >= 0) {
              layers.push({ ...l, bounds: [x, y, first, x + 1, y + 1, end] });
              first = -1;
            }
          };
          for (let z = l.bounds[2]; z < l.bounds[5]; z++) {
            const contained =
              !l.polygon ||
              (insidePolygon(l.polygon, x + 0.5, y + 0.5) &&
                !l.holes?.some((h) => insidePolygon(h, x + 0.5, y + 0.5)) &&
                (l.band === undefined ||
                  polygonBoundarySample([x + 0.5, y + 0.5], l.polygon)
                    .distance <= l.band));
            if (contained && protectedWallCube(x, y, z)) {
              if (first < 0) first = z;
            } else flush(z);
          }
          flush(l.bounds[5]);
        }
    }
    const allocated = new Set<string>();
    const tasks: PendingWallTask[] = [];
    for (const original of pendingWallTasks.values()) {
      const { a, b } = original.geometry,
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = Math.hypot(dx, dy);
      const tangent = [dx / length, dy / length],
        axis = Math.abs(dx) >= Math.abs(dy) ? 0 : 1;
      const templates = new Map<string, ShipVisualLayer>(),
        columns = new Map<number, string[]>(),
        blocked = new Set<number>();
      for (const l of original.layers)
        for (let z = l.bounds[2]; z < l.bounds[5]; z++)
          for (let y = l.bounds[1]; y < l.bounds[4]; y++)
            for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
              const key = visualCellKey(x, y, z),
                old = envelope.get(key);
              if (old?.role === "core") continue;
              // Complete end-seat cubes stop at the selected run; a one-cell casing
              // margin is not permission to cross the next doorway or glazed course.
              const q = [0, 1].flatMap((i) =>
                [0, 1].map(
                  (j) =>
                    (x + i - a[0]) * tangent[0] + (y + j - a[1]) * tangent[1],
                ),
              );
              if (
                Math.min(...q) < original.u - epsilon ||
                Math.max(...q) > original.U + epsilon
              )
                continue;
              templates.set(key, {
                ...l,
                bounds: [x, y, z, x + 1, y + 1, z + 1],
              });
              const physical = axis === 0 ? x : y;
              if (protectedWallCube(x, y, z)) blocked.add(physical);
            }
      for (const key of templates.keys()) {
        const point = key.split(",").map(Number),
          physical = point[axis];
        if (blocked.has(physical)) continue;
        const list = columns.get(physical) ?? [];
        list.push(key);
        columns.set(physical, list);
      }
      const ordered = [...columns.keys()].sort((a, b) => a - b);
      for (let i = 0; i < ordered.length;) {
        let j = i + 1;
        while (j < ordered.length && ordered[j] === ordered[j - 1] + 1) j++;
        const lower = ordered[i],
          upper = ordered[j - 1] + 1;
        if (upper - lower >= 16) {
          const safeLayers = ordered
            .slice(i, j)
            .flatMap((q) => columns.get(q)!.map((key) => templates.get(key)!));
          let u = Infinity,
            U = -Infinity;
          for (const l of safeLayers)
            for (const x of [l.bounds[0], l.bounds[3]])
              for (const y of [l.bounds[1], l.bounds[4]]) {
                const q = (x - a[0]) * tangent[0] + (y - a[1]) * tangent[1];
                u = Math.min(u, q);
                U = Math.max(U, q);
              }
          tasks.push({ ...original, u, U, layers: safeLayers });
        }
        i = j;
      }
    }
    tasks.sort(
      (a, b) =>
        a.room.id.localeCompare(b.room.id) ||
        a.face.localeCompare(b.face) ||
        a.u - b.u,
    );
    for (const task of tasks) {
      const footprint = new Map<string, ShipVisualLayer>();
      let safe = true;
      for (const l of task.layers) {
        for (let z = l.bounds[2]; z < l.bounds[5]; z++)
          for (let y = l.bounds[1]; y < l.bounds[4]; y++)
            for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
              const key = visualCellKey(x, y, z),
                old = envelope.get(key);
              // Core/backing is retained verbatim; room machinery owns only the
              // existing outer finish course. A seat never fills unsupported air.
              if (old?.role === "core") continue;
              if (!old) {
                if (l.role !== "void") safe = false;
                continue;
              }
              if (
                old.family !== task.support ||
                ["frame", "doorframe", "glass"].includes(old.role) ||
                allocated.has(key)
              ) {
                safe = false;
                continue;
              }
              footprint.set(key, l);
            }
      }
      if (!safe || !footprint.size) continue;
      const points = [...footprint.keys()].map((k) => k.split(",").map(Number));
      const bounds = [0, 1, 2]
        .map((a) => Math.min(...points.map((p) => p[a])))
        .concat([0, 1, 2].map((a) => Math.max(...points.map((p) => p[a])) + 1));
      const axis = bounds[3] - bounds[0] >= bounds[4] - bounds[1] ? 0 : 1;
      const width = bounds[axis + 3] - bounds[axis],
        height = bounds[5] - bounds[2];
      const low = height < 11;
      if (
        width < 16 ||
        height < (task.key === "medical" || task.key === "galley" ? 8 : 11)
      )
        continue;
      // Unequal fields share one finite casing, its lower binding and a local
      // header. Long admitted runs are never reclamped to a room-centre badge.
      const fieldWidths = macro.architecture?.wallFields;
      const fieldTotal = fieldWidths?.reduce((sum, n) => sum + n, 0) ?? 1;
      const joints =
        width >= 64
          ? [
              0,
              Math.floor(
                width * (fieldWidths ? fieldWidths[0] / fieldTotal : 0.47),
              ),
              Math.floor(
                width *
                  (fieldWidths
                    ? (fieldWidths[0] + fieldWidths[1]) / fieldTotal
                    : 0.78),
              ),
              width,
            ]
          : width >= 32
            ? [0, Math.floor(width * 0.64), width]
            : [0, width];
      const out: ShipVisualLayer[] = [];
      for (const [key, template] of footprint) {
        const [x, y, z] = key.split(",").map(Number),
          u = (axis === 0 ? x : y) - bounds[axis],
          v = z - bounds[2];
        const panel = Math.max(
          0,
          joints.findIndex((end, i) => i > 0 && u < end) - 1,
        );
        const left = joints[panel],
          right = joints[panel + 1],
          q = u - left,
          W = right - left;
        const edge = Math.min(u, width - 1 - u),
          edgeV = Math.min(v, height - 1 - v);
        let role: ShipVisualLayer["role"] = "plate",
          slot: ShipKitSlot = "primary",
          part = "joined-case";
        const use = (
          name: string,
          r: ShipVisualLayer["role"],
          s: ShipKitSlot,
        ) => {
          part = name;
          role = r;
          slot = s;
        };
        if (edge + edgeV < 2) use("corner-seat", "void", "dark");
        else if (v < 2) use("continuous-lower-binding", "frame", "trim");
        else if (joints.slice(1, -1).some((a) => u === a || u === a + 1))
          use("overlap-shoulder", "plate", "trim");
        else {
          const well = q >= 3 && q < W - 3 && v >= 3 && v < height - 3;
          if (well) {
            // Broad unequal case fronts occupy the field. The one-course
            // recess is a contained service opening, not the entire first bay.
            // Deep equipment openings belong to the existing authored hosts.
            const serviceWidth = Math.min(W - 4, panel === 0 ? 18 : 11);
            const serviceInset =
              q >= 4 && q < serviceWidth && v >= 4 && v < height - 4;
            if (macro.architecture) {
              // The complete useful field owns the existing finish course.
              // Its real depth is ONE cell; deep cases are authored hosts.
              const openField = q >= 3 && q < W - 3 && v >= 3 && v < height - 3;
              const lowerBank = v >= 4 && v < 6;
              const upperBank = v >= height - 8 && v < height - 6;
              switch (task.key) {
                case "engineering":
                  if (panel === 0 && openField) {
                    const cassetteWidth = Math.min(
                        24,
                        Math.max(14, Math.floor(W * 0.36)),
                      ),
                      cassetteLeft = Math.floor((W - cassetteWidth) * 0.43),
                      cassetteRight = cassetteLeft + cassetteWidth;
                    if (q < cassetteLeft - 2 || q >= cassetteRight + 2) {
                      use("well", "void", "dark");
                      const blockBottom = v >= 4 && v < Math.min(height - 4, 8),
                        blockTop =
                          v >= Math.max(9, height - 9) && v < height - 4;
                      if (
                        (q < cassetteLeft - 2 && blockBottom) ||
                        (q >= cassetteRight + 2 && blockTop)
                      )
                        use("cooling-machine-block", "service", "metal");
                    } else {
                      use("central-service-cassette", "plate", "primary");
                      if (
                        q >= cassetteLeft + 3 &&
                        q < cassetteRight - 3 &&
                        v >= 6 &&
                        v < height - 6
                      )
                        use("cassette-access-field", "plate", "trim");
                      if (
                        q >= cassetteRight - 5 &&
                        q < cassetteRight - 2 &&
                        v >= 6 &&
                        v < 9
                      )
                        use("cassette-actuator", "service", "metal");
                    }
                    if (lowerBank || upperBank)
                      use("cooling-case-shoulder", "plate", "primary");
                  } else if (panel === 1) {
                    use("distribution-case", "plate", "trim");
                    if (q >= 4 && q < Math.min(W - 4, 9))
                      use("distribution-cassette", "plate", "primary");
                    if (q >= W - 8 && q < W - 5 && v >= 5 && v < height - 5)
                      use("contained-distribution-status", "service", "emit_b");
                  } else if (panel > 1 && v < height - 6) {
                    use("service-access-cover", "plate", "trim");
                    if (q >= W - 7 && q < W - 5 && v >= 5 && v < 9)
                      use("service-access-handle", "service", "metal");
                  }
                  break;
                case "workshop":
                  if (panel === 0 && openField) {
                    use("well", "void", "dark");
                    if (lowerBank) use("tool-power-bank", "service", "metal");
                    if ((q >= 5 && q < 8) || (q >= W - 10 && q < W - 7))
                      use("protected-tool-case", "plate", "trim");
                  } else if (panel > 0) {
                    use("workbench-distribution-cover", "plate", "trim");
                    if (v >= 4 && v < 6)
                      use("workbench-supply-return", "service", "metal");
                  }
                  break;
                case "medical":
                  use(
                    low ? "low-medical-utility" : "medical-supply-face",
                    "plate",
                    "trim",
                  );
                  if (q >= 4 && q < Math.min(W - 4, 12))
                    use("medical-removable-cassette", "plate", "primary");
                  if (q >= W - 8 && q < W - 6 && v >= 4 && v < height - 4)
                    use("oxygen-supply-manifold", "service", "metal");
                  break;
                case "galley":
                  if (panel === 0 && openField) {
                    use("well", "void", "dark");
                    if (lowerBank)
                      use("counter-utility-bank", "service", "metal");
                  } else if (panel > 0 && v < height - 5) {
                    use("galley-storage-cover", "plate", "primary");
                    if (
                      q >= Math.floor(W * 0.56) &&
                      q < Math.floor(W * 0.56) + 3
                    )
                      use("galley-storage-return", "frame", "trim");
                    if (q >= W - 7 && q < W - 5 && v >= 4 && v < 8)
                      use("storage-pull", "service", "metal");
                  }
                  break;
                case "quarters":
                case "living":
                  if (
                    panel === 0 &&
                    openField &&
                    v < Math.floor(height * 0.58)
                  ) {
                    use("well", "void", "dark");
                    if (lowerBank)
                      use("reading-supply-bank", "service", "metal");
                  } else if (q >= 4 && q < W - 4 && v < height - 5) {
                    use("berth-storage-cover", "plate", "primary");
                    if (
                      q >= Math.floor(W * 0.59) &&
                      q < Math.floor(W * 0.59) + 2
                    )
                      use("berth-storage-return", "frame", "trim");
                    if (q >= W - 7 && q < W - 5 && v >= 5 && v < 9)
                      use("berth-storage-pull", "service", "metal");
                  }
                  break;
                case "lounge":
                  if (panel === 0 && openField) {
                    use("media-service-face", "plate", "trim");
                    if (q < Math.floor(W * 0.62) && v < height - 6)
                      use("well", "void", "dark");
                    if (lowerBank) use("media-supply-bank", "service", "metal");
                  }
                  break;
                case "bridge":
                  if (panel === 0 && openField) {
                    use("bridge-distribution-cover", "plate", "trim");
                    if (lowerBank)
                      use("bridge-supply-bank", "service", "metal");
                  } else if (panel > 0 && v < height - 5) {
                    use("bridge-instrument-service-cover", "plate", "trim");
                  }
                  break;
                case "cargo":
                  if ((q >= 4 && q < 7) || (q >= W - 7 && q < W - 4))
                    use("load-restraint-case", "plate", "trim");
                  if (v >= 4 && v < 6)
                    use("load-restraint-anchor", "service", "metal");
                  break;
                case "airlock":
                  use("pressure-control-cover", "plate", "trim");
                  if (q >= 4 && q < Math.min(W - 4, 11))
                    use("pressure-cassette", "plate", "primary");
                  if (q >= W - 7 && q < W - 5 && v >= 5 && v < height - 5)
                    use("pressure-control-handle", "service", "metal");
                  break;
              }
            } else
              switch (task.key) {
                case "engineering":
                  if (panel === 0 && serviceInset) {
                    use("well", "void", "dark");
                    if (v === 4 || v === 7 || v === 10)
                      use("protected-cooling-bank", "service", "metal");
                  }
                  if (panel === 1 && q >= W - 11 && q < W - 4)
                    use("distribution-module", "plate", "trim");
                  if (panel === 1 && q >= W - 7 && q < W - 4)
                    use("distribution-module-case", "plate", "accent");
                  if (panel === 1 && q === W - 5 && v >= 5 && v < height - 5)
                    use("distribution-status", "service", "emit_b");
                  break;
                case "workshop":
                  if (panel === 0 && serviceInset) {
                    use("well", "void", "dark");
                    if (v === 4 || v === 8)
                      use("continuous-tool-bank", "service", "metal");
                    if (
                      [5, 12].includes(q) &&
                      v >= 5 &&
                      v < Math.min(8, height - 4)
                    )
                      use("protected-tool-dock", "service", "metal");
                  }
                  if (panel > 0 && q >= W - 10 && q < W - 4)
                    use("bench-power-module", "plate", "trim");
                  break;
                case "medical":
                  if (q >= 4 && q < Math.min(W - 4, low ? 9 : 12))
                    use(
                      low ? "low-medical-utility" : "medical-control-face",
                      "plate",
                      "trim",
                    );
                  if (q === 5 && v >= 4 && v < height - 4)
                    use("oxygen-supply-manifold", "service", "metal");
                  break;
                case "airlock":
                  if (panel === 0 && serviceInset)
                    use("pressure-control-face", "plate", "trim");
                  if (q === W - 5 && v >= 4 && v < height - 4)
                    use("pressure-control-handle", "service", "metal");
                  break;
                case "galley":
                  if (v === 4) use("counter-utility-rail", "service", "metal");
                  if (panel === 0 && q >= 4 && q < Math.min(W - 4, 14) && v < 7)
                    use("backed-backsplash", "plate", "trim");
                  if (panel > 0 && q === W - 5)
                    use("utility-handle", "service", "metal");
                  break;
                case "cargo":
                  use("load-storage-face", "plate", "primary");
                  if ((q === 4 || q === W - 5) && v < height - 5)
                    use("load-restraint", "service", "metal");
                  break;
                case "bridge":
                  if (panel === 0 && serviceInset)
                    use("bridge-distribution", "plate", "trim");
                  if (panel === 0 && q >= 4 && q < serviceWidth && v === 4)
                    use("bridge-key-bank", "service", "metal");
                  break;
                case "quarters":
                case "living":
                  if (
                    panel === 0 &&
                    q >= 4 &&
                    q < Math.min(W - 4, 12) &&
                    v < 7
                  ) {
                    use("well", "void", "dark");
                    if (v === 4)
                      use("reading-utility-shelf", "service", "metal");
                  }
                  break;
                case "lounge":
                  if (
                    panel === 0 &&
                    q >= 4 &&
                    q < Math.min(W - 4, 16) &&
                    v >= 5 &&
                    v < 9
                  )
                    use("media-utility-face", "plate", "trim");
                  if (
                    panel === 0 &&
                    q >= 4 &&
                    q < Math.min(W - 4, 16) &&
                    v === 4
                  )
                    use("media-utility-shelf", "service", "metal");
                  break;
              }
          }
          // One contained task header per functional field, not a continuous
          // glowing rail around every room or a repeated per-cell light strip.
          if (
            q >= (macro.architecture ? 5 : 3) &&
            q <
              Math.min(W - 3, macro.architecture ? 20 : panel === 0 ? 10 : 7) &&
            (!macro.architecture || panel === 0) &&
            v === height - 3
          )
            use(
              "contained-task-header",
              "service",
              task.key === "medical" || task.key === "bridge"
                ? "emit_a"
                : "emit_b",
            );
          if (panel > 0 && q === W - 4 && v >= 5 && v < height - 4)
            use("storage-latch", "service", "metal");
        }
        if (
          (role as ShipVisualLayer["role"]) === "void" &&
          ![
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([dx, dy]) =>
            [1, 2].every((n) => {
              const c = envelope.get(visualCellKey(x + dx * n, y + dy * n, z));
              return c?.role === "core" && c.family === task.support;
            }),
          )
        ) {
          role = "plate";
          slot = "primary";
          part = "retained-case";
        }
        out.push({
          ...template,
          id: `${task.support}:room-task:${task.room.id}:run:${task.face}:${task.u}:${task.U}:${task.bottom}:${part}`,
          role,
          slot,
          bounds: [x, y, z, x + 1, y + 1, z + 1],
        });
      }
      if (!out.some((l) => l.role === "service")) continue;
      for (const key of footprint.keys()) allocated.add(key);
      // The complete authored field has disjoint per-cell writes. Compress only
      // identical consecutive Z cells within each XY column; no authored write
      // order, polygon, chart, facet or other sampled semantic is discarded.
      const columns = new Map<string, ShipVisualLayer[]>();
      for (const l of out) {
        const k = `${l.bounds[0]},${l.bounds[1]}`;
        const a = columns.get(k) ?? [];
        a.push(l);
        columns.set(k, a);
      }
      for (const column of columns.values()) {
        column.sort((a, b) => a.bounds[2] - b.bounds[2]);
        let last: ShipVisualLayer | undefined,
          lastKey = "";
        for (const l of column) {
          const { bounds, ...semantics } = l,
            k = JSON.stringify(semantics);
          if (last && lastKey === k && last.bounds[5] === bounds[2])
            last.bounds = [
              ...last.bounds.slice(0, 5),
              bounds[5],
            ] as ShipVisualLayer["bounds"];
          else {
            last = { ...l, bounds: [...l.bounds] };
            lastKey = k;
            layers.push(last);
          }
        }
      }
    }
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
  // Final authored openings can be emitted after the outer case recipe. Their
  // full XYZ bounds plus the frame ring stay raw; complete door travel guards
  // above remain conservative in XY at every height.
  const apertureGuards = layers.filter(
    (l) =>
      l.role === "void" &&
      (l.id.endsWith(":opening") || l.id.endsWith(":glass-aperture")),
  );
  const matingSolids = referenceOpticalMatingSolidsR002(
    doc,
    view,
    catalog,
    profileId,
  );
  const opticalFinishIds = [
    ":diagonal-pressure-case",
    ":diagonal-inset-lip",
    ":continuous-sill",
    ":cassette-rim",
    ":pressure-backing",
    ":inset-armor",
  ];
  const exposedMatingArmor = (l: ShipVisualLayer) =>
    l.id.includes(":exposed-bay:") && l.id.endsWith(":armor");
  const permittedMatingOwner = (l: ShipVisualLayer) =>
    opticalFinishIds.some((id) => l.id.endsWith(id)) || exposedMatingArmor(l);
  // Pigment is independent of the exact 3D optical geometry exclusion. Keep the
  // existing source-qualified lower/upper frame gasket courses dark, never the
  // complete opaque bow wall beneath/behind the retained optical art.
  const opticalPigments = layers.flatMap((l) => {
    const opaqueCase =
      l.id.endsWith(":diagonal-pressure-case") && l.slot === "secondary";
    const matingOwner =
      permittedMatingOwner(l) && ["core", "frame", "plate"].includes(l.role);
    if (
      (!opaqueCase && !matingOwner && !["primary", "trim"].includes(l.slot)) ||
      !l.support?.startsWith("volume:") ||
      l.bounds[3] - l.bounds[0] !== 1 ||
      l.bounds[4] - l.bounds[1] !== 1
    )
      return [l];
    const assembly = assemblies.find(
      (a) => l.support === `volume:${a.volume.id}`,
    );
    if (!assembly) return [l];
    const p: Pt = [(l.bounds[0] + 0.5) / 16, (l.bounds[1] + 0.5) / 16];
    const glazedTile = assembly.tiles.find(
      ({ tile, poly }) =>
        bowGlass(tile) &&
        insidePolygon(poly, ...p) &&
        polygonBoundarySample(p, poly).distance <= rawPaddingM,
    );
    const edge = opticalEdges.find((e) => {
      const dx = e.b[0] - e.a[0],
        dy = e.b[1] - e.a[1],
        length = Math.hypot(dx, dy);
      const u = ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / length;
      const v = Math.abs(-(p[0] - e.a[0]) * dy + (p[1] - e.a[1]) * dx) / length;
      return (
        u >= -rawPaddingM &&
        u <= length + rawPaddingM &&
        v <= 0.25 + rawPaddingM
      );
    });
    // Final case/lip/armor attribution comes from the pinned actual 3D mating
    // solid, rather than borrowing an optical XY context. Old height-band
    // pigments remain unchanged for owners that do have that context.
    if (!glazedTile && !edge && !matingOwner) return [l];
    let bands: number[][] = [];
    if (glazedTile) {
      const [lo, hi] = bowHeights(glazedTile.tile, assembly.volume.height, p);
      const [lower, upper] =
        G.bowProfiles.shellThicknessTexels[assembly.volume.height];
      bands = [
        [Math.floor(lo + lower) - 1, Math.floor(lo + lower) + 1],
        [Math.floor(hi - upper) - 1, Math.floor(hi - upper) + 1],
      ];
    } else if (
      edge &&
      ("glass" in edge || ("type" in edge && edge.type === "canopy"))
    ) {
      const [z0, roof] = G.heightClasses[assembly.volume.height].z;
      const base = G.heightClasses[assembly.volume.height].kinds.includes(
        "hull",
      )
        ? Math.max(0, z0 - G.tierRule.skirtTexels)
        : z0;
      // Authored regular canopy source places the lower pressure-glass edge at
      // nose+3 and the upper frame roof-4..roof. The cut variant's return is top-2..top.
      const nose = Math.round(base + (roof - base) * 0.4);
      const top =
        view === "deck" && G.heightClasses[assembly.volume.height].walkable
          ? Math.min(roof, G.deck.shellCutTexels)
          : roof;
      bands = [
        [nose + 3, nose + 5],
        [
          top -
            (view === "deck" && G.heightClasses[assembly.volume.height].walkable
              ? 2
              : 4),
          top,
        ],
      ];
    } else if (edge) {
      bands = [
        [G.deck.floorTopTexels + 12, G.deck.floorTopTexels + 14],
        [
          G.deck.floorTopTexels + G.deck.interiorCutTexels - 4,
          G.deck.floorTopTexels + G.deck.interiorCutTexels - 2,
        ],
      ];
    }
    const rows: ShipVisualLayer[] = [];
    for (let z = l.bounds[2]; z < l.bounds[5]; z++)
      rows.push({
        ...l,
        bounds: [l.bounds[0], l.bounds[1], z, l.bounds[3], l.bounds[4], z + 1],
        slot: bands.some(([lo, hi]) => z >= lo && z < hi)
          ? "secondary"
          : opaqueCase && (glazedTile || edge)
            ? z >= l.bounds[2] + 3 && z < l.bounds[5] - 3
              ? "primary"
              : "trim"
            : l.slot,
      });
    return rows;
  });
  // Moving the descriptor to its actual visible row also moves its patch
  // transition. Apply the EXISTING one-cell Chebyshev raw guard to current final
  // ownership, including vertical armor/lip ends; never relax the union contract.
  const finalOwnership = sampleShipVisualLayers(
    compactColumns(opticalPigments),
  );
  const facetGuardCells = new Set<string>();
  for (const c of finalOwnership.values())
    if (c.facet && opticalCellProtected(c.x, c.y, c.z))
      facetGuardCells.add(visualCellKey(c.x, c.y, c.z));
  for (const c of finalOwnership.values()) {
    if (!c.facet) continue;
    for (let z = -1; z <= 1; z++)
      for (let y = -1; y <= 1; y++)
        for (let x = -1; x <= 1; x++) {
          const n = finalOwnership.get(
            visualCellKey(c.x + x, c.y + y, c.z + z),
          );
          if (
            n?.facet &&
            (n.facet.id !== c.facet.id ||
              n.facet.d !== c.facet.d ||
              n.facet.a.join(",") !== c.facet.a.join(","))
          ) {
            facetGuardCells.add(visualCellKey(c.x, c.y, c.z));
            facetGuardCells.add(visualCellKey(n.x, n.y, n.z));
          }
        }
  }
  const guardedFinishes = opticalPigments.flatMap((l) => {
    if (!l.facet) return [l];
    const rows: ShipVisualLayer[] = [];
    for (let z = l.bounds[2]; z < l.bounds[5]; z++) {
      const row = {
        ...l,
        bounds: [
          l.bounds[0],
          l.bounds[1],
          z,
          l.bounds[3],
          l.bounds[4],
          z + 1,
        ] as ShipVisualLayer["bounds"],
      };
      if (facetGuardCells.has(visualCellKey(l.bounds[0], l.bounds[1], z))) {
        const { facet: _facet, ...raw } = row;
        rows.push(raw);
      } else rows.push(row);
    }
    return rows;
  });
  const finalLayers = compactColumns(
    guardedFinishes.map((l) => {
      if (
        !l.facet ||
        !apertureGuards.some(
          (g) =>
            l.bounds[0] < g.bounds[3] + 2 &&
            l.bounds[3] > g.bounds[0] - 2 &&
            l.bounds[1] < g.bounds[4] + 2 &&
            l.bounds[4] > g.bounds[1] - 2 &&
            l.bounds[2] < g.bounds[5] + 2 &&
            l.bounds[5] > g.bounds[2] - 2,
        )
      )
        return l;
      const { facet: _facet, ...raw } = l;
      return raw;
    }),
  );
  const cockpitAperture = referenceCockpitApertureR002(
    doc,
    view,
    catalog,
    profileId,
  );
  // Root's exact paired manufactured frame is a FINAL duty after both the
  // accepted raw pane mask and every finish/pigment write. Unknown admission
  // returns no replacement and retains the complete preceding candidate.
  const finishBow = (ordered: ShipVisualLayer[]) => {
    const previous = [
      ...ordered,
      ...referenceBowFrameR002(doc, view, catalog, profileId, ordered),
    ];
    return [
      ...previous,
      ...referenceBowTransitionR002(
        doc,
        view,
        catalog,
        profileId,
        previous,
        cockpitAperture,
      ),
    ];
  };
  if (!matingSolids.some((s) => !s.veto))
    return finishBow([...finalLayers, ...cockpitAperture]);
  // A pigment cannot change source-layer grouping priority. Resolve the complete
  // geometry FIRST and append only slot overlays for already occupied exposed
  // final owners; never compact these overlays back across earlier voids/cases.
  const finalCells = sampleShipVisualLayers(finalLayers);
  const candidates = [...finalCells.values()].filter(
    (c) =>
      !c.facet &&
      c.slot !== "trim" &&
      ["core", "frame", "plate"].includes(c.role) &&
      c.family.startsWith("volume:") &&
      c.surfaceRole !== "floor" &&
      opticalCellProtected(c.x, c.y, c.z) &&
      [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ].some(
        ([x, y, z]) =>
          !finalCells.has(visualCellKey(c.x + x, c.y + y, c.z + z)),
      ) &&
      referenceOpticalMatingCubeR002(c.x, c.y, c.z, matingSolids),
  );
  const columns = new Map<string, ShipVisualLayer[]>();
  for (const c of candidates) columns.set(`${c.x},${c.y}`, []);
  for (const l of finalLayers)
    for (let y = l.bounds[1]; y < l.bounds[4]; y++)
      for (let x = l.bounds[0]; x < l.bounds[3]; x++)
        columns.get(`${x},${y}`)?.push(l);
  const contains = (l: ShipVisualLayer, x: number, y: number, z: number) =>
    z >= l.bounds[2] &&
    z < l.bounds[5] &&
    (!l.polygon ||
      (insidePolygon(l.polygon, x + 0.5, y + 0.5) &&
        !l.holes?.some((h) => insidePolygon(h, x + 0.5, y + 0.5)) &&
        (l.band === undefined ||
          polygonBoundarySample([x + 0.5, y + 0.5], l.polygon).distance <=
            l.band)));
  const overlays: ShipVisualLayer[] = [];
  for (const c of candidates) {
    const owner = (columns.get(`${c.x},${c.y}`) ?? [])
      .filter((l) => contains(l, c.x, c.y, c.z))
      .at(-1);
    if (
      !owner ||
      !permittedMatingOwner(owner) ||
      owner.role !== c.role ||
      owner.support !== c.family
    )
      continue;
    overlays.push({
      ...owner,
      slot: "trim",
      bounds: [c.x, c.y, c.z, c.x + 1, c.y + 1, c.z + 1],
    });
  }
  return finishBow([...finalLayers, ...overlays, ...cockpitAperture]);
}

/** Exact box compaction with dependencies only between writes to the same XYZ cells. */
export function compactColumns(
  layers: readonly ShipVisualLayer[],
): ShipVisualLayer[] {
  const limits = {
    nodes: 2000000,
    edges: 4000000,
    xyz: 4000000,
    keys: 100000,
    heap: 250000,
    work: 64000000,
    output: 100000,
  };
  type Node = {
    layer: ShipVisualLayer;
    key: string;
    pending: number;
    successors?: number[];
    emitted: boolean;
  };
  type Ready = { key: string; order: number; version: number; nodes: Node[] };
  type Entry = { group: Ready; version: number; count: number };
  const out: ShipVisualLayer[] = [];
  let nodes: Node[] = [],
    columns = new Map<number, Map<number, number>>(),
    keys = new Map<string, string>();
  const ready = new Map<string, Ready>(),
    heap: Entry[] = [];
  let edges = 0,
    xyz = 0,
    visits = 0,
    order = 0;
  const append = (layer: ShipVisualLayer) => {
    if (out.length >= limits.output)
      throw Error("Visual layer count exceeds limit");
    out.push(layer);
  };
  const ahead = (a: Entry, b: Entry) =>
    a.count > b.count || (a.count === b.count && a.group.order < b.group.order);
  const siftDown = (start: number) => {
    let i = start;
    for (;;) {
      let child = i * 2 + 1;
      if (child >= heap.length) break;
      if (child + 1 < heap.length && ahead(heap[child + 1], heap[child]))
        child++;
      if (!ahead(heap[child], heap[i])) break;
      [heap[i], heap[child]] = [heap[child], heap[i]];
      i = child;
    }
  };
  const rebuild = () => {
    // Release stale references before adding replacements; every active group
    // gets exactly one current entry, including the update that triggered this.
    heap.length = 0;
    if (ready.size > limits.heap)
      throw Error("Visual compaction heap exceeds limit");
    for (const group of ready.values())
      heap.push({ group, version: group.version, count: group.nodes.length });
    for (let i = Math.floor(heap.length / 2) - 1; i >= 0; i--) siftDown(i);
  };
  const push = (group: Ready) => {
    group.version++;
    if (heap.length >= limits.heap) {
      rebuild();
      return;
    }
    heap.push({ group, version: group.version, count: group.nodes.length });
    let i = heap.length - 1;
    while (i > 0) {
      const parent = Math.floor((i - 1) / 2);
      if (!ahead(heap[i], heap[parent])) break;
      [heap[i], heap[parent]] = [heap[parent], heap[i]];
      i = parent;
    }
  };
  const pop = () => {
    const first = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      siftDown(0);
    }
    return first;
  };
  const enqueue = (node: Node, changed?: Set<Ready>) => {
    let group = ready.get(node.key);
    if (!group) {
      group = { key: node.key, order: order++, version: 0, nodes: [] };
      ready.set(node.key, group);
    }
    group.nodes.push(node);
    changed?.add(group);
  };
  const flush = () => {
    if (!nodes.length) return;
    for (const group of ready.values()) push(group);
    let emitted = 0;
    while (ready.size) {
      let entry: Entry;
      do {
        if (!heap.length) throw Error("Visual compaction missing ready entry");
        entry = pop();
      } while (
        ready.get(entry.group.key) !== entry.group ||
        entry.version !== entry.group.version
      );
      const group = entry.group;
      ready.delete(group.key);
      // Freeze this batch before unlocking successors. A newly available child,
      // even with the same key, belongs to a NEW group and a later operation.
      const batch = group.nodes;
      const writes = batch
        .map((n) => n.layer)
        .sort((a, b) => a.bounds[0] - b.bounds[0]);
      let run = {
        ...writes[0],
        bounds: [...writes[0].bounds] as ShipVisualLayer["bounds"],
      };
      for (const l of writes.slice(1)) {
        if (run.bounds[3] === l.bounds[0]) run.bounds[3] = l.bounds[3];
        else {
          append(run);
          run = { ...l, bounds: [...l.bounds] as ShipVisualLayer["bounds"] };
        }
      }
      append(run);
      for (const node of batch) {
        if (node.pending !== 0 || node.emitted)
          throw Error("Visual compaction invalid node emission");
        node.emitted = true;
        emitted++;
      }
      const changed = new Set<Ready>();
      for (const node of batch)
        if (node.successors)
          for (const index of node.successors) {
            const successor = nodes[index];
            if (successor.pending <= 0)
              throw Error("Visual compaction duplicate dependency decrement");
            if (--successor.pending === 0) enqueue(successor, changed);
          }
      for (const next of changed) push(next);
    }
    if (emitted !== nodes.length)
      throw Error("Visual compaction node census differs");
    nodes = [];
    columns = new Map();
    keys = new Map();
    ready.clear();
    heap.length = 0;
    edges = 0;
    xyz = 0;
    order = 0;
  };
  for (const l of layers) {
    const [x, y, z, X, Y, Z] = l.bounds;
    let integerBounds = l.bounds.length === 6;
    if (integerBounds)
      for (let i = 0; i < 6; i++)
        if (
          !Number.isSafeInteger(l.bounds[i]) ||
          Math.abs(l.bounds[i]) > 8192
        ) {
          integerBounds = false;
          break;
        }
    if (
      !integerBounds ||
      !(x < X && y < Y && z < Z) ||
      X - x !== 1 ||
      Y - y !== 1 ||
      l.polygon !== undefined ||
      l.holes !== undefined ||
      l.band !== undefined
    ) {
      // Broad, uncertain and invalid footprints are absolute ordering barriers.
      flush();
      append({ ...l, bounds: [...l.bounds] as ShipVisualLayer["bounds"] });
      continue;
    }
    if (nodes.length >= limits.nodes)
      throw Error("Visual compaction nodes exceed limit");
    const { bounds: _bounds, ...semantics } = l;
    const signature = `${y}:${z}:${Z}:${JSON.stringify(semantics)}`;
    let key = keys.get(signature);
    if (key === undefined) {
      if (keys.size >= limits.keys)
        throw Error("Visual compaction semantic keys exceed limit");
      key = signature;
      keys.set(key, key);
    }
    const xy = (x + 8192) * 16385 + (y + 8192);
    let previous = columns.get(xy);
    if (!previous) {
      previous = new Map();
      columns.set(xy, previous);
    }
    let firstPredecessor: number | undefined;
    let predecessors: Set<number> | undefined;
    let predecessorCount = 0;
    const index = nodes.length;
    for (let h = z; h < Z; h++) {
      if (visits >= limits.work)
        throw Error("Visual compaction work exceeds sampling limit");
      visits++;
      const prior = previous.get(h);
      if (
        prior !== undefined &&
        prior !== firstPredecessor &&
        !predecessors?.has(prior)
      ) {
        if (edges + predecessorCount >= limits.edges)
          throw Error("Visual compaction edges exceed limit");
        if (firstPredecessor === undefined) firstPredecessor = prior;
        else {
          predecessors ??= new Set([firstPredecessor]);
          predecessors.add(prior);
        }
        predecessorCount++;
      }
      if (prior === undefined) {
        if (xyz >= limits.xyz)
          throw Error("Visual compaction XYZ entries exceed limit");
        xyz++;
      }
      previous.set(h, index);
    }
    const node: Node = {
      layer: l,
      key,
      pending: predecessorCount,
      emitted: false,
    };
    nodes.push(node);
    if (predecessors)
      for (const prior of predecessors) {
        (nodes[prior].successors ??= []).push(index);
        edges++;
      }
    else if (firstPredecessor !== undefined) {
      (nodes[firstPredecessor].successors ??= []).push(index);
      edges++;
    }
    if (node.pending === 0) enqueue(node);
  }
  flush();
  return out;
}
