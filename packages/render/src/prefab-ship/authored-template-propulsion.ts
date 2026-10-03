/** Presentation-only propulsion art: original fitted envelopes and actuator definitions stay intact. */
import type { PrefabComponentCatalog } from "@sidereal/content/ship-prefab";
import type { ShipComponentDefinition } from "@sidereal/content/ship-components";
import {
  buildShipComponentCatalog,
  SHIP_COMPONENT_CATALOG_ID,
  SHIP_COMPONENT_CATALOG_REVISIONS,
  type ShipComponentCatalogRevision,
} from "@sidereal/content/ship-components-source";
import type { AuthoredStudyPiece } from "@sidereal/content/wayfarer-authored-study";
import type {
  ComponentPlacement,
  DressedShip,
  DressView,
} from "@sidereal/sim/ship-dresser";
import type { AuthoredInstanceInput } from "./wayfarer-authored-study";
import {
  basisMatrix,
  componentMatrix,
  mountRotation,
  multiply,
  type MountSocket,
} from "./frames";

export const TEMPLATE_MAIN_ENGINE_PIECE = "engine.pod.w2.4.l5.z-0.75_1.6";
export const TEMPLATE_RCS_PIECE: AuthoredStudyPiece & { base: string } = {
  id: "engine.rcs.md.wayfarer-r001",
  file: "rcs.md.glb",
  base: "/assets/ship-study/wayfarer-authored-r001/",
  sha256: "9e7f2d54f90e3d5f0cd0e1900b6d76f9534e33c9552abe21ce6dd7e7b50eda51",
  triangles: 2570,
  frame: "piece-local",
  boundsMin: [-0.625, -1, -0.5625],
  boundsMax: [0.625, 0, 0.5625],
  materials: [
    "primary",
    "secondary",
    "accent",
    "trim",
    "metal",
    "rubber",
    "rcs_lens",
  ],
};
const BASE = "/assets/ship-study/wayfarer-authored-r001/";
const MAIN_KINDS = new Set(["ion-drive", "thrust-block", "resonance-drive"]);
const catalogs = new Map<
  ShipComponentCatalogRevision,
  ReadonlyMap<string, ShipComponentDefinition>
>();
function definitions(
  catalog: PrefabComponentCatalog,
): ReadonlyMap<string, ShipComponentDefinition> | null {
  const revision = SHIP_COMPONENT_CATALOG_REVISIONS.find(
    (r) => catalog.revision === `${SHIP_COMPONENT_CATALOG_ID}@${r}`,
  );
  // A composed/custom definition must supply its own compatible art. Never infer its envelope from current stats.
  if (revision === undefined) return null;
  let result = catalogs.get(revision);
  if (!result) {
    result = new Map(
      buildShipComponentCatalog(revision).components.map((c) => [c.id, c]),
    );
    catalogs.set(revision, result);
  }
  return result;
}
function socketOf(c: ComponentPlacement): MountSocket {
  const mount = c.placement.mount;
  return mount.attach === "face"
    ? c.placement.rear
      ? "rear"
      : "face"
    : mount.attach;
}

/** Study pods use +X fore/+Y port; RCS is already in component +X starboard/+Y fore axes.
 * Fit the entire source bounds to the ORIGINAL component envelope, before socket rotation and yaw. */
export function fittedPropulsionMatrix(
  piece: Pick<AuthoredStudyPiece, "boundsMin" | "boundsMax">,
  definition: Pick<ShipComponentDefinition, "kind" | "mount">,
  component: ComponentPlacement,
): number[][] {
  const min = piece.boundsMin,
    max = piece.boundsMax,
    [lo, hi] = definition.mount.envelopeM;
  const source = max.map((v, i) => v - min[i]),
    target = hi.map((v, i) => v - lo[i]);
  if ([...source, ...target].some((v) => !Number.isFinite(v) || v <= 0))
    throw Error("Invalid native propulsion envelope");
  const center = min.map((v, i) => (v + max[i]) / 2),
    dest = lo.map((v, i) => (v + hi[i]) / 2);
  const main = MAIN_KINDS.has(definition.kind);
  const sx = target[0] / source[main ? 1 : 0],
    sy = target[1] / source[main ? 0 : 1],
    sz = target[2] / source[2];
  const fit = main
    ? basisMatrix(
        [0, sy, 0],
        [-sx, 0, 0],
        [0, 0, sz],
        [
          dest[0] + sx * center[1],
          dest[1] - sy * center[0],
          dest[2] - sz * center[2],
        ],
      )
    : basisMatrix(
        [sx, 0, 0],
        [0, sy, 0],
        [0, 0, sz],
        [
          dest[0] - sx * center[0],
          dest[1] - sy * center[1],
          dest[2] - sz * center[2],
        ],
      );
  const placed = multiply(
    multiply(fit, mountRotation(definition.mount.frame, socketOf(component))),
    componentMatrix(
      component.placement.anchor,
      component.placement.anchorZ / 16,
      component.placement.quarterTurns,
    ),
  );
  return Array.from({ length: 4 }, (_, r) =>
    Array.from({ length: 4 }, (_, c) => placed[c * 4 + r]),
  );
}
export interface TemplatePropulsionInstance extends AuthoredInstanceInput {
  view: DressView;
  region: string;
}
export interface TemplatePropulsionPlan {
  pieces: (AuthoredStudyPiece & { base: string })[];
  instances: TemplatePropulsionInstance[];
  replacedMounts: Set<string>;
}

export function authoredTemplatePropulsion(
  dressed: DressedShip,
  pieces: ReadonlyMap<string, AuthoredStudyPiece>,
  catalog: PrefabComponentCatalog,
): TemplatePropulsionPlan {
  const result: TemplatePropulsionPlan = {
      pieces: [],
      instances: [],
      replacedMounts: new Set(),
    },
    defs = definitions(catalog);
  if (!defs) return result;
  const used = new Map<string, AuthoredStudyPiece & { base: string }>();
  for (const component of dressed.components) {
    const definition = defs.get(component.component);
    if (
      !definition ||
      (!MAIN_KINDS.has(definition.kind) && definition.kind !== "rcs")
    )
      continue;
    // Respect the supplied prefab catalog: removed/replaced entries are not silently reconstructed.
    if (!catalog.get(component.component)) continue;
    const piece =
      definition.kind === "rcs"
        ? TEMPLATE_RCS_PIECE
        : pieces.get(TEMPLATE_MAIN_ENGINE_PIECE);
    if (!piece)
      throw Error(
        `Missing authored propulsion source: ${TEMPLATE_MAIN_ENGINE_PIECE}`,
      );
    const source = { ...piece, base: BASE };
    used.set(source.id, source);
    result.instances.push({
      object: `propulsion:${component.mount}`,
      piece: piece.id,
      role: "equipment",
      view: component.view,
      region: component.placement.host ?? "propulsion",
      matrix: fittedPropulsionMatrix(piece, definition, component),
    });
    result.replacedMounts.add(component.mount);
  }
  result.pieces = [...used.values()];
  return result;
}
