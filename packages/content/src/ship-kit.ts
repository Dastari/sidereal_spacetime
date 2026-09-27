/**
 * Prefab ship structure kit: the finite set of reusable pieces the dresser can place
 * (docs/shipyard_player_builder_design.md §12). Piece geometry is authored by the Python
 * kit builders in scripts/art_library/ship_kit_prototype.py and exported headlessly to GLB
 * by scripts/art_library/ship_kit_export.py, which reads `ship-kit-pieces.v1.json`.
 *
 * This module owns the canonical piece ids and the exact builder call for each, so the
 * TypeScript dresser and the Python exporter can never disagree on a name.
 * Regenerate the JSON with `npx tsx scripts/generate-ship-kit-pieces.ts`; a test pins it.
 *
 * Piece-local frames (texels, 1/16 m):
 * - face pieces: +X along the face, +Y outward, +Z up; placed at the face-line start.
 * - roof/plan pieces: +X/+Y in plan, +Z up from the mounting plane; placed at the min corner.
 * - interior edge pieces: +X along the edge, +Y across (thickness), +Z up from the floor top.
 */
import {
  G,
  cassetteHeights,
  volumeTiers,
  HEIGHT_CLASS_IDS,
  SHAPE_TILE_IDS,
  shapeTileLocalPolygon,
} from "./construction-grammar";

export const SHIP_KIT_SCHEMA = "sidereal.ship-kit-pieces.v1" as const;
export const SHIP_KIT_REVISION = "r002" as const;
export const SHIP_KIT_SLOTS = [
  "primary",
  "secondary",
  "accent",
  "trim",
  "metal",
  "dark",
  "emit_a",
  "emit_b",
  "glass",
] as const;
export type ShipKitSlot = (typeof SHIP_KIT_SLOTS)[number];

export type ShipKitFamily =
  | "cassette"
  | "glazing"
  | "rim"
  | "roof"
  | "roof-rim"
  | "decorator"
  | "floor"
  | "interior-edge"
  | "door"
  | "post"
  | "fixture"
  | "exterior"
  | "hull-module"
  | "face-module"
  | "canopy"
  | "shell"
  | "bow";

export interface ShipKitPieceSpec {
  id: string;
  family: ShipKitFamily;
  mount: "face" | "top" | "plan" | "edge" | "vertex" | "ceiling" | "tile";
  /** Python builder in ship_kit_prototype.py and its positional arguments. */
  label?: string;
  gridTrue?: boolean;
  builder: string;
  args: (string | number | boolean | null)[];
}

// ---------------------------------------------------------------- id helpers (used by the dresser)
export const kitId = {
  bow: (shape: string, hc: string, step: number, axis: number, part: string) =>
    `bow.${shape}.${hc}.s${step}.a${axis}.${part}`,
  cassette: (kind: string, w: number, h: number) => `cas.${kind}.w${w}.h${h}`,
  window: (kind: "band" | "full" | "port", w: number, h: number) =>
    `win.${kind}.w${w}.h${h}`,
  rim: (h: number, lit: boolean) => `rim.h${h}${lit ? ".lit" : ""}`,
  roof: (kind: string, w: number, d: number) => `roof.${kind}.w${w}.d${d}`,
  roofSmall: (kind: string) => `roof.small.${kind}`,
  roofRim: (kind: string) => `roof.rim.${kind}`,
  skylight: (w: number, d: number) => `roof.skylight.w${w}.d${d}`,
  decorator: (kind: string) => `deco.${kind}`,
  floor: (kind: string) => `int.floor.${kind}`,
  edge: (variant: string, cut: boolean) =>
    `int.edge.${variant}${cut ? ".cut" : ""}`,
  door: (kind: string, cut: boolean) => `int.door.${kind}${cut ? ".cut" : ""}`,
  post: (cut: boolean) => `int.post${cut ? ".cut" : ""}`,
  fixture: (kind: string) => `int.fixture.${kind}`,
  exterior: (kind: string) => `ext.${kind}`,
  /** r002 universal hull modules, in the unrotated shape-tile frame (placed with the tile's turns/mirror). */
  hull: (shape: string, heightClass: string, cockpit = false) =>
    `hull.${shape}.${heightClass}${cockpit ? ".cockpit" : ""}`,
  face: (shape: string, heightClass: string, cut: boolean) =>
    `face.${shape}.${heightClass}${cut ? ".cut" : ""}`,
  canopy: (shape: string, heightClass: string, cut: boolean) =>
    `canopy.${shape}.${heightClass}${cut ? ".cut" : ""}`,
  shellWall: (shape: string) => `shellwall.${shape}`,
  shellStraight: () => "shell.straight",
  hullPost: (heightClass: string, cut: boolean) =>
    `post.hull.${heightClass}${cut ? ".cut" : ""}`,
  floorPart: (shape: string) => `int.floorpart.${shape}`,
} as const;

/** Shape tiles with a non-axis (angled or curved) edge: every tile except the square. */
export const ANGLED_SHAPES = SHAPE_TILE_IDS.filter((s) => s !== "square");

/** Width (cells) the face picker may choose, and the kinds resolved for a tier. */
export function faceKinds(
  width: number,
  upper: boolean,
  windows: boolean,
): string[] {
  const list =
    width === 1
      ? G.cassettes.pickWidth1
      : width === 2
        ? G.cassettes.pickWidth2
        : G.cassettes.pickWidth3;
  const out = list.map((k) =>
    k.startsWith("@")
      ? upper
        ? k.slice(1).split("|")[0]
        : k.slice(1).split("|")[1]
      : k,
  );
  if (windows && upper) out.push(width === 1 ? "port" : "full");
  return out;
}

const CASSETTE_BUILDER: Record<string, string> = {
  panel: "cas_panel",
  split: "cas_split",
  grille: "cas_grille",
  hatch: "cas_hatch",
  light: "cas_light",
  stack: "cas_stack",
  logo: "cas_logo",
  armor: "cas_armor",
  pipes: "cas_pipes",
  module: "cas_module",
  beacon: "cas_beacon",
};

/** Face piece id for a picked kind (windows map onto glazing pieces). */
export function facePieceId(kind: string, width: number, h: number): string {
  if (kind === "window") return kitId.window("band", width, h);
  if (kind === "full") return kitId.window("full", width, h);
  if (kind === "port") return kitId.window("port", width, h);
  return kitId.cassette(kind, width, h);
}

function faceSpec(kind: string, width: number, h: number): ShipKitPieceSpec {
  const id = facePieceId(kind, width, h);
  if (kind === "window" || kind === "full")
    return {
      id,
      family: "glazing",
      mount: "face",
      builder: "cas_window",
      args: [width * 16, h, kind === "window" ? "band" : "full"],
    };
  if (kind === "port")
    return {
      id,
      family: "glazing",
      mount: "face",
      builder: "cas_port",
      args: [width * 16, h],
    };
  const builder = CASSETTE_BUILDER[kind];
  if (!builder) throw Error(`Unknown cassette kind ${kind}`);
  return {
    id,
    family: "cassette",
    mount: "face",
    builder,
    args: [width * 16, h],
  };
}

/** Every piece the dresser can emit, in a stable order. */
export function enumerateShipKitPieces(): ShipKitPieceSpec[] {
  const out = new Map<string, ShipKitPieceSpec>();
  const add = (s: ShipKitPieceSpec) => out.set(s.id, s);
  // Face cassettes and glazing, per reachable tier height.
  for (const hc of HEIGHT_CLASS_IDS) {
    const [z0, z1] = G.heightClasses[hc].z;
    const { tiers } = volumeTiers(z0, z1);
    tiers.forEach(([t0, t1], ti) => {
      const h = t1 - t0;
      if (h < G.tierRule.cassetteMinTexels) return;
      const upper = ti === tiers.length - 1 && tiers.length > 1;
      for (const width of [1, 2, 3])
        for (const kind of faceKinds(width, upper, true))
          add(faceSpec(kind, width, h));
      if (
        tiers.length === 2 &&
        ti === 1 &&
        G.heightClasses[hc].kinds.includes("hull")
      )
        add(faceSpec("logo", 3, h));
      if (h >= G.tierRule.smallSplitMinTexels) {
        const h1 = Math.floor(h / 2);
        for (const hh of [h1, h - h1])
          for (const width of [1, 2])
            for (const kind of G.cassettes.pickSmall)
              add(faceSpec(kind, width, hh));
      }
    });
  }
  for (const h of cassetteHeights().rims)
    for (const lit of [false, true])
      add({
        id: kitId.rim(h, lit),
        family: "rim",
        mount: "face",
        builder: "cas_rim",
        args: [16, h, lit],
      });
  // Roof modules.
  for (const [w, d] of G.roof.moduleSizes) {
    const kinds = Math.min(w, d) >= 2 ? G.roof.bigKinds : G.roof.thinKinds;
    for (const kind of kinds)
      add({
        id: kitId.roof(kind, w, d),
        family: "roof",
        mount: "top",
        builder: "roof_module",
        args: [w * 16, d * 16, kind],
      });
  }
  add({
    id: kitId.roof("spine", 2, 2),
    family: "roof",
    mount: "top",
    builder: "roof_module",
    args: [32, 32, "spine"],
  });
  add({
    id: kitId.roof("logo", 4, 2),
    family: "roof",
    mount: "top",
    builder: "roof_logo",
    args: [64, 32],
  });
  for (const kind of new Set(G.roof.smallKinds))
    add({
      id: kitId.roofSmall(kind),
      family: "roof",
      mount: "top",
      builder: "roof_small",
      args: [kind],
    });
  for (const kind of new Set(G.roof.rimKinds))
    add({
      id: kitId.roofRim(kind),
      family: "roof-rim",
      mount: "top",
      builder: "roof_rim",
      args: [kind],
    });
  for (const [w, d] of G.roof.skylightSizes)
    add({
      id: kitId.skylight(w, d),
      family: "glazing",
      mount: "top",
      builder: "roof_skylight",
      args: [w * 16, d * 16],
    });
  for (const kind of new Set(Object.values(G.decorators)))
    add({
      id: kitId.decorator(kind),
      family: "decorator",
      mount: "top",
      builder: "decorator",
      args: [kind],
    });
  // Interior architecture.
  for (const kind of G.floorKinds)
    add({
      id: kitId.floor(kind),
      family: "floor",
      mount: "plan",
      builder: "ifloor",
      args: [kind],
    });
  for (const variant of [...G.wallVariants, "glazed", "half"])
    for (const cut of [false, true])
      add({
        id: kitId.edge(variant, cut),
        family: "interior-edge",
        mount: "edge",
        builder: "iwall",
        args: [variant, cut ? G.deck.interiorCutTexels : null, 16],
      });
  for (const kind of ["standard", "sliding", "airlock", "blast", "forcefield"])
    for (const cut of [false, true])
      add({
        id: kitId.door(kind, cut),
        family: "door",
        mount: "edge",
        builder: "idoor",
        args: [kind, cut ? G.deck.interiorCutTexels : null],
      });
  for (const cut of [false, true])
    add({
      id: kitId.post(cut),
      family: "post",
      mount: "vertex",
      builder: "ipost",
      args: [cut ? G.deck.interiorCutTexels : null, true],
    });
  add({
    id: kitId.fixture("ceiling-light"),
    family: "fixture",
    mount: "ceiling",
    builder: "iceiling_light",
    args: [],
  });
  add({
    id: kitId.fixture("wall-lamp"),
    family: "fixture",
    mount: "edge",
    builder: "iwall_lamp",
    args: [],
  });
  add({
    id: kitId.fixture("floor-light"),
    family: "fixture",
    mount: "plan",
    builder: "ifloor_light",
    args: [],
  });
  add({
    id: kitId.exterior("airlock"),
    family: "exterior",
    mount: "face",
    builder: "airlock",
    args: [],
  });
  // r002 universal hull modules (ship_kit_modules.py): every shape tile on every height class.
  const cut = G.deck.shellCutTexels;
  for (const hc of HEIGHT_CLASS_IDS) {
    for (const shape of SHAPE_TILE_IDS) {
      add({
        id: kitId.hull(shape, hc),
        family: "hull-module",
        mount: "tile",
        builder: "hull_body",
        args: [shape, hc],
      });
      if (G.heightClasses[hc].kinds.includes("hull"))
        add({
          id: kitId.hull(shape, hc, true),
          family: "hull-module",
          mount: "tile",
          builder: "hull_cockpit",
          args: [shape, hc],
        });
    }
    for (const shape of ANGLED_SHAPES) {
      add({
        id: kitId.face(shape, hc, false),
        family: "face-module",
        mount: "tile",
        builder: "face_module",
        args: [shape, hc, null],
      });
      add({
        id: kitId.canopy(shape, hc, false),
        family: "canopy",
        mount: "tile",
        builder: "canopy_module",
        args: [shape, hc, null],
      });
    }
    add({
      id: kitId.canopy("nav", hc, false),
      family: "canopy",
      mount: "face",
      builder: "canopy_nav",
      args: [hc],
    });
    for (const degrees of [5, 45, 90])
      add({
        id: kitId.canopy(`corner${degrees}`, hc, false),
        family: "canopy",
        mount: "vertex",
        builder: "canopy_corner",
        args: [hc, null, degrees],
      });
    add({
      id: kitId.canopy("straight.w1", hc, false),
      family: "canopy",
      mount: "face",
      builder: "canopy_straight",
      args: [hc, null],
    });
    add({
      id: kitId.hullPost(hc, false),
      family: "post",
      mount: "vertex",
      builder: "corner_post",
      args: [hc, null],
    });
  }
  for (const shape of ANGLED_SHAPES) {
    add({
      id: kitId.face(shape, "deck", true),
      family: "face-module",
      mount: "tile",
      builder: "face_module",
      args: [shape, "deck", cut],
    });
    add({
      id: kitId.canopy(shape, "deck", true),
      family: "canopy",
      mount: "tile",
      builder: "canopy_module",
      args: [shape, "deck", cut],
    });
    add({
      id: kitId.shellWall(shape),
      family: "shell",
      mount: "tile",
      builder: "shellwall",
      args: [shape],
    });
    add({
      id: kitId.floorPart(shape),
      family: "floor",
      mount: "tile",
      builder: "floor_part",
      args: [shape],
    });
  }
  for (const degrees of [5, 45, 90])
    add({
      id: kitId.canopy(`corner${degrees}`, "deck", true),
      family: "canopy",
      mount: "vertex",
      builder: "canopy_corner",
      args: ["deck", cut, degrees],
    });
  add({
    id: kitId.canopy("straight.w1", "deck", true),
    family: "canopy",
    mount: "face",
    builder: "canopy_straight",
    args: ["deck", cut],
  });
  add({
    id: kitId.shellStraight(),
    family: "shell",
    mount: "face",
    builder: "shell_straight",
    args: [],
  });
  add({
    id: kitId.hullPost("deck", true),
    family: "post",
    mount: "vertex",
    builder: "corner_post",
    args: ["deck", cut],
  });
  for (const spec of [...out.values()])
    if (
      spec.family === "canopy" &&
      (spec.builder === "canopy_module" || spec.builder === "canopy_straight")
    ) {
      add({
        ...spec,
        id: spec.id.replace("canopy.", "canopy.upright."),
        builder: spec.builder + "_upright",
        label: "Original upright canopy (Opus)",
        gridTrue: false,
      });
    }
  for (const hc of HEIGHT_CLASS_IDS)
    for (const shape of SHAPE_TILE_IDS)
      for (const step of [0, 1, 2, 3])
        for (const axis of [0, 1, 2, 3]) {
          const parts = [
            "base",
            "roof",
            ...shapeTileLocalPolygon(shape).map((_, i) => `edge${i}`),
          ];
          for (const part of parts)
            add({
              id: kitId.bow(shape, hc, step, axis, part),
              family: "bow",
              mount: "tile",
              builder: "bow_module",
              args: [shape, hc, step, axis, part],
              gridTrue: true,
              label: `Grid-true ${G.bowProfiles.labels[step]} (${part})`,
            });
        }
  for (const spec of out.values())
    if (spec.family === "canopy" && !spec.id.startsWith("canopy.upright.")) {
      spec.gridTrue = false;
      spec.label =
        "Presentation-only, not grid-true (round 1 projecting canopy)";
    }
  return [...out.values()];
}

export interface ShipKitPiecesFile {
  schema: typeof SHIP_KIT_SCHEMA;
  revision: typeof SHIP_KIT_REVISION;
  slots: readonly ShipKitSlot[];
  texelsPerMeter: number;
  pieces: ShipKitPieceSpec[];
}

export function shipKitPiecesFile(): ShipKitPiecesFile {
  return {
    schema: SHIP_KIT_SCHEMA,
    revision: SHIP_KIT_REVISION,
    slots: SHIP_KIT_SLOTS,
    texelsPerMeter: G.texelsPerMeter,
    pieces: enumerateShipKitPieces(),
  };
}

/** Exported manifest written next to the GLBs by the Python exporter. */
export interface ShipKitManifest {
  schema: "sidereal.ship-kit-manifest.v1";
  revision: string;
  /** Piece-local frame note: prototype +X/+Y plan, +Z up, exported glTF Y-up (x, z, -y). */
  frame: string;
  slots: readonly ShipKitSlot[];
  /** Relative GLB file; bundles identify the piece with a named local node. */
  pieces: Record<
    string,
    {
      file: string;
      node?: string;
      sha256: string;
      triangles: number;
      /** Piece bounds in texels [x0, y0, z0, x1, y1, z1] (piece-local frame). */
      bounds: [number, number, number, number, number, number];
      slots: ShipKitSlot[];
      decals: {
        kind: string;
        rect: [number, number, number, number];
        plane: "face" | "top";
      }[];
      voxelAligned: boolean;
    }
  >;
}
