import { G, TEXEL } from "@sidereal/content/construction-grammar";
import { interiorArtQuarterTurns } from "@sidereal/content/ship-furniture";
import type { AuthoredStudyPiece } from "@sidereal/content/wayfarer-authored-study";
import type { DressedShip } from "@sidereal/sim/ship-dresser";
import type { AuthoredInstanceInput } from "./wayfarer-authored-study";
import { componentMatrix } from "./frames";

/** Functional modules without an authored counterpart keep their dedicated equipment model. */
export const TEMPLATE_OBJECT_PIECES: Readonly<Record<string, string>> = {
  "cargo.fluid.medium": "prop.props_workrooms.canister_red",
  "cargo.standard.medium": "prop.props_workrooms.crate_small_white",
  "pale-studless.console.standard": "prop.props_workrooms.utility_console",
  "pale-studless.kitchen.standard": "prop.props_workrooms.galley_floor_unit",
  "pale-studless.table.standard": "prop.props_lounge.coffee_table",
  "shipyard.equipment.bridge-bank": "prop.props_bridge.wall_console",
  "shipyard.equipment.command-console": "prop.props_bridge.wall_console_low",
  "shipyard.equipment.crew-bunk": "prop.props_quarters.bunk_bed",
  "shipyard.equipment.hydroponics": "prop.props_workrooms.grow_hood",
  "shipyard.equipment.lounge-sofa": "prop.props_lounge.sofa_l",
  "shipyard.equipment.medical-bed": "prop.props_quarters.bed_single",
  "shipyard.equipment.pilot-seat": "prop.props_bridge.pilot_chair",
  "shipyard.equipment.wall-locker": "prop.props_quarters.locker_lit",
};
const FACING = { fore: 0, port: 1, aft: 2, starboard: 3 } as const;
export interface TemplateObjectInstance extends AuthoredInstanceInput {
  view: "deck";
  region: string;
}

/** Preserve source proportions. Shrink only when its oriented bounds exceed the reserved socket;
 * never enlarge a small crate to fill a conservative gameplay reserve. Seats retain their height. */
export function fittedObjectMatrix(
  piece: Pick<AuthoredStudyPiece, "boundsMin" | "boundsMax">,
  anchor: readonly [number, number],
  size: readonly [number, number],
  height: number,
  turns: number,
  floor: number,
): number[][] {
  const min = piece.boundsMin,
    max = piece.boundsMax;
  const w = max[0] - min[0],
    d = max[1] - min[1],
    h = max[2] - min[2];
  if ([w, d, h, ...size, height].some((v) => !Number.isFinite(v) || v <= 0))
    throw Error("Invalid authored object envelope");
  // Component +Y is prefab +X at zero turns, so its width occupies prefab Y.
  const targetW = turns % 2 ? size[0] : size[1],
    targetD = turns % 2 ? size[1] : size[0];
  const scale = Math.min(1, targetW / w, targetD / d, height / h);
  const m = componentMatrix(anchor, floor, turns),
    center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, min[2]];
  const rows = Array.from({ length: 4 }, (_, r) =>
    Array.from({ length: 4 }, (_, c) => m[c * 4 + r]),
  );
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) rows[r][c] *= scale;
    rows[r][3] -=
      rows[r][0] * center[0] + rows[r][1] * center[1] + rows[r][2] * center[2];
  }
  return rows;
}

export function authoredTemplateObjects(
  dressed: DressedShip,
  pieces: ReadonlyMap<string, AuthoredStudyPiece>,
): TemplateObjectInstance[] {
  return dressed.objects.flatMap((o, index) => {
    const id = TEMPLATE_OBJECT_PIECES[o.designId];
    if (!id) return [];
    const piece = pieces.get(id);
    if (!piece) throw Error(`Missing authored furnishing source: ${id}`);
    return [
      {
        object: `furnishing:${o.fixture ?? `${o.room}:${index}`}`,
        piece: id,
        role: "equipment",
        view: "deck" as const,
        region: o.room,
        matrix: fittedObjectMatrix(
          piece,
          [o.at[0] + o.size[0] / 2, o.at[1] + o.size[1] / 2],
          o.size,
          o.heightTexels * TEXEL,
          (FACING[o.facing] + interiorArtQuarterTurns(o.designId)) % 4,
          G.deck.floorTopTexels * TEXEL,
        ),
      },
    ];
  });
}

export function authoredInteriorComponentPiece(
  component: string,
): string | null {
  if (component === "console.navigation.sm")
    return "prop.props_bridge.pilot_chair";
  if (component.startsWith("console."))
    return "prop.props_workrooms.utility_console";
  if (component === "crew-bunk.sm") return "prop.props_quarters.bunk_bed";
  if (component === "hydroponics.sm") return "prop.props_workrooms.grow_hood";
  return null;
}

export function authoredTemplateComponents(
  dressed: DressedShip,
  pieces: ReadonlyMap<string, AuthoredStudyPiece>,
): TemplateObjectInstance[] {
  return dressed.components.flatMap((c) => {
    const id =
      c.placement.mount.attach === "interior"
        ? authoredInteriorComponentPiece(c.component)
        : null;
    if (!id) return [];
    const piece = pieces.get(id);
    if (!piece) throw Error(`Missing authored component source: ${id}`);
    const p = c.placement,
      size: [number, number] = [p.rect[2] - p.rect[0], p.rect[3] - p.rect[1]];
    // The native chair's +Y is its view direction; consoles face the operator's side.
    const turns =
      (p.quarterTurns +
        (c.component === "console.navigation.sm"
          ? 0
          : interiorArtQuarterTurns(c.component))) %
      4;
    return [
      {
        object: `mount:${c.mount}`,
        piece: id,
        role: "equipment",
        view: "deck" as const,
        region: `component:${p.host ?? "deck"}`,
        matrix: fittedObjectMatrix(
          piece,
          p.anchor,
          size,
          (p.z[1] - p.z[0]) * TEXEL,
          turns,
          p.anchorZ * TEXEL,
        ),
      },
    ];
  });
}
