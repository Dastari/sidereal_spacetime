import {
  WAYFARER_CONVERSION_PIN as PIN,
  type WayfarerPlacementRole,
  type WayfarerConversionGap,
} from "../../content/src/wayfarer-conversion-candidate";
import {
  validateAssembly,
  type PartCatalog,
  type PartPlacement,
} from "../../content/src/assembly";
import { importShipAssembly } from "../../content/src/layout-assembly";
import { SHAPE_REVISION, type Point } from "../../content/src/ship-layout";
import { bindConstructionLayout } from "./construction-layout";
import {
  compileConstruction,
  constructionHash,
} from "./construction-transactions";
import {
  planConstructionInstance,
  type ConstructionSpawnRequest,
} from "./construction-instance";

export type WayfarerPinnedInputs = Record<keyof typeof PIN.sources, string>;
interface FloorShape {
  id: string;
  slug: string;
  polygon_xy_m: Point[];
}
export interface WayfarerPlacementRecord {
  sourcePlacedId: string;
  templatePlacedId: string;
  assetId: string;
  role: WayfarerPlacementRole;
  representation: "semantic-native-floor" | "preserved-visual-object";
  visual: PartCatalog["assets"][number]["visual"] | null;
  damageRule:
    | "structural-voxel-required"
    | "entity-health-required"
    | "visual-only"
    | "unresolved";
  /** Historical backing/proxy is evidence, not certified nominal floor collision. */
  originalPlacement: PartPlacement;
}
function check(v: unknown, why: string): asserts v {
  if (!v) throw Error("Wayfarer candidate: " + why);
}
function units(v: number) {
  const n = Math.round(v * 32);
  check(
    Number.isFinite(v) && Math.abs(n - v * 32) < 1e-7,
    "off-lattice floor transform",
  );
  return n;
}
function role(
  p: PartPlacement,
  a: PartCatalog["assets"][number],
): WayfarerPlacementRole {
  if (a.category === "floor") return "structural-floor";
  if (a.category === "roof") return "roof-visual";
  if (a.category === "cargo") return "cargo-container";
  if (a.category === "equipment") return "interior-equipment";
  if (a.category === "engine") return "external-system";
  if (a.category === "decoration") return "decoration";
  if (a.category === "superstructure")
    return a.label.startsWith("Frontier side armor") ||
      p.id.startsWith("pilot-r005-outer-")
      ? "outer-armor-unrated"
      : "structural-or-armor-unresolved";
  if (p.id.startsWith("pilot-r004-rear-partition-"))
    return "interior-partition-unqualified";
  return "structural-wall-unqualified";
}
/** Source bytes are exact-pinned before interpretation. No live database state is
 * an input. Existing floor native silhouettes, all visual transforms and stable
 * placed IDs are retained; no GLB is scaled or regenerated. */
export function createWayfarerConversionCandidate(raw: WayfarerPinnedInputs) {
  for (const [path, hash] of Object.entries(PIN.sources))
    check(
      constructionHash(raw[path as keyof WayfarerPinnedInputs]) === hash,
      "source hash mismatch: " + path,
    );
  const catalog = JSON.parse(
    raw["assets/runtime/assembly/catalog.json"],
  ) as PartCatalog;
  const assembly = validateAssembly(
    JSON.parse(raw["assets/runtime/assembly/wayfarer.json"]),
    catalog,
  );
  check(
    assembly.parts.length === PIN.placementCount,
    "placement count changed",
  );
  check(
    assembly.parts.every((p) => p.removedCells.length === 0),
    "source contains damage; a live-state migration cannot become a pristine template implicitly",
  );
  const shapes = JSON.parse(
    raw["assets/art-library/shipyard-floor/r002/specification.json"],
  ).components as FloorShape[];
  const assets = new Map(catalog.assets.map((a) => [a.id, a]));
  const layout = importShipAssembly(assembly, catalog, PIN.id, PIN.deckId);
  layout.name = "Wayfarer · semantic conversion candidate r001";
  layout.decks[0].name = "Main deck · existing authored layout";
  layout.decks[0].ceiling = PIN.proposedCeilingUnits;
  // Existing roof GLBs remain exact visual objects. No unsupported generic roof
  // adapter or inferred sealed ceiling is attached to the semantic document.
  layout.decks[0].roof = false;
  const placements: WayfarerPlacementRecord[] = assembly.parts.map((p) => {
    const a = assets.get(p.assetId)!;
    const r = role(p, a);
    return {
      sourcePlacedId: p.id,
      templatePlacedId: p.id,
      assetId: p.assetId,
      role: r,
      representation:
        r === "structural-floor"
          ? "semantic-native-floor"
          : "preserved-visual-object",
      visual: a.visual ? structuredClone(a.visual) : null,
      damageRule:
        r === "interior-equipment" || r === "cargo-container"
          ? "entity-health-required"
          : r === "decoration"
            ? "visual-only"
            : r === "structural-or-armor-unresolved"
              ? "unresolved"
              : "structural-voxel-required",
      originalPlacement: structuredClone(p),
    };
  });
  const floors = placements.filter((p) => p.role === "structural-floor");
  check(floors.length === PIN.floorCount, "floor count changed");
  for (const item of floors) {
    const p = item.originalPlacement,
      shape = shapes.find((s) => s.id === p.assetId);
    check(shape, "native nominal floor shape unavailable: " + p.id);
    check(
      p.position[2] === 0 && !p.flipped,
      "floor datum/reflection needs an explicit adapter: " + p.id,
    );
    const quarter = p.rotation / (Math.PI / 2);
    check(
      Math.abs(quarter - Math.round(quarter)) < 1e-8,
      "floor rotation not a right angle",
    );
    const c = Math.round(Math.cos(p.rotation)),
      s = Math.round(Math.sin(p.rotation));
    const vertices = shape.polygon_xy_m.map(([x, y]): Point => [
      units(p.position[0] + c * x - s * y),
      units(p.position[1] + s * x + c * y),
    ]);
    layout.tiles.push({
      id: p.id,
      deckId: PIN.deckId,
      shape: vertices.length === 3 ? "triangle" : "rectangle",
      revision: SHAPE_REVISION,
      vertices,
      material: "native-floor-r002",
    });
  }
  layout.assembly!.parts = layout.assembly!.parts.filter(
    (p) => !floors.some((f) => f.sourcePlacedId === p.id),
  );
  const binding = bindConstructionLayout(layout);
  check(
    !binding.unmatched.length,
    "nominal floors unmatched: " + binding.unmatched.join(","),
  );
  const snapshot = compileConstruction(JSON.stringify(binding.document));
  const byRole = (...roles: WayfarerPlacementRole[]) =>
    placements
      .filter((p) => roles.includes(p.role))
      .map((p) => p.sourcePlacedId);
  const gaps: WayfarerConversionGap[] = [
    {
      code: "OBJECT_COLLISION_BINDINGS_REQUIRED",
      placedIds: layout.assembly!.parts.map((p) => p.id),
      requirement:
        "Provide native/body-qualified collision coverage per visual object before current safe instance spawn. Empty obstacle bindings must not stand in for walls, fittings or mounts.",
    },
    {
      code: "NATIVE_ROOF_INTERFACE_REQUIRED",
      placedIds: byRole("roof-visual"),
      requirement:
        "Bind installed r004 roofs/collars to actual nominal footprints, underside datums, support, cutaway layers and service clearance. Existing construction roof pin is a different kit; no replacement is authorized by this candidate.",
    },
    {
      code: "WALL_PARTITION_SEAL_INTERFACES_REQUIRED",
      placedIds: byRole(
        "structural-wall-unqualified",
        "interior-partition-unqualified",
      ),
      requirement:
        "Qualify actual native wall centerlines, thickness, junctions, cabin headroom and openings. Then author semantic partitions/room labels. No seal or pressure compartment is inferred from visual AABBs.",
    },
    {
      code: "ARMOR_MOUNT_DAMAGE_RULES_REQUIRED",
      placedIds: byRole(
        "outer-armor-unrated",
        "structural-or-armor-unresolved",
        "external-system",
      ),
      requirement:
        "Separate armor and structural layers; qualify mounts/exhaust/weapon clearance, functional services and localized voxel damage. Visual categories do not provide material ratings or thrust.",
    },
    {
      code: "EQUIPMENT_HEALTH_STORAGE_ADAPTERS_REQUIRED",
      placedIds: byRole("interior-equipment", "cargo-container"),
      requirement:
        "Bind existing fitting/entity-health/inventory definitions, nominal reach and collision, then allocate fresh empty containers on template spawn. Existing live contents and UUID mappings belong to an independent refit transaction.",
    },
    {
      code: "ADDITIONAL_DECKS_AIRLOCK_SERVICES_CARGO_REQUIRED",
      placedIds: [],
      requirement:
        "Purposefully author extra decks with qualified transitions, an actual external airlock/support route, 3D conserved utilities and cargo-only supported stacking grids. The current recognizable single-deck source cannot certify these missing features.",
    },
  ];
  return {
    schema: "sidereal.wayfarer-semantic-candidate.v1" as const,
    pin: PIN,
    document: binding.document,
    snapshot,
    placements,
    gaps,
    readiness: {
      compiledFloorTopology: true,
      preservedSourcePlacements: placements.length,
      spawnableWithCurrentAuthority: false,
      liveMigrationReady: false,
      completeWayfarer: false,
    },
    liveMigration: {
      kind: "separate-authoritative-refit-required" as const,
      sourceAssemblySha256:
        PIN.sources["assets/runtime/assembly/wayfarer.json"],
      preserve: [
        "shipId",
        "characterIds",
        "itemIds",
        "containerIds",
        "fittingIds",
        "contents",
        "damage",
        "energy",
        "gas",
        "operationReceipts",
      ],
      transformChanges: [],
    },
  };
}
export type WayfarerConversionCandidate = ReturnType<
  typeof createWayfarerConversionCandidate
>;
/** The existing spawn compiler remains the gate; never bypass missing collision
 * coverage or invent object UUIDs just to claim the candidate is already playable. */
export function planWayfarerCandidateSpawn(
  candidate: WayfarerConversionCandidate,
  request: Omit<
    ConstructionSpawnRequest,
    "expectedBlueprintSha256" | "sourceDeckId"
  >,
  uuid: () => string,
) {
  return planConstructionInstance(
    candidate.snapshot,
    {
      ...request,
      expectedBlueprintSha256: candidate.snapshot.sha256,
      sourceDeckId: PIN.deckId,
    },
    uuid,
  );
}
