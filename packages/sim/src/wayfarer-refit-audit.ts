import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { compileConstruction } from "./construction-transactions";
import { qualifiedWayfarerWalkingBindings } from "./wayfarer-walking-bindings";
import {
  canOccupyDeck,
  compileDeckCollision,
  deckLineOfSight,
  resolveDeckCollision,
} from "./construction-collision";

type Point = [number, number];
export interface RefitContainer {
  id: string;
  characterId: string;
  shipId: string;
  parentItemId: string;
  carried: boolean;
  kind: "grid" | "liquid";
  name: string;
  width: number;
  height: number;
  maxMassKg: number;
  capacityLitres: number;
  amountLitres: number;
  liquidType: string;
  localX: number;
  localY: number;
}
export interface RefitItem {
  id: string;
  containerId: string;
}
export interface RefitStorageBinding {
  containerId: string;
  sourcePlacementId: string;
}
const cargo = [
  ["room-storage-container-2.15-0.25", -4.0625, 2.0625],
  ["room-storage-container-2.15-1", -3.3125, 2.0625],
  ["room-storage-container-3.5-0.25", -4.0625, 3.4375],
  ["room-storage-container-3.5-1", -3.3125, 3.4375],
] as const;
export const REFIT_FUEL_ATTACHMENT = Object.freeze({
  sourceId: "refit-preserved-engineering-fuel-r001",
  assetId: "part-81d226967abf2efefc20",
  glbSha256: "a2f9fca902c7df08f3e8bad348d09034df8f26d9c248d0d912558886aa2eecf6",
  positionM: [-3, 7, 0.1875] as const,
  approachM: [-1.875, 7] as const,
  reservationM: [1, 1] as const,
  nativeDimensionsM: [
    0.5520000457763672, 0.5479999780654907, 0.8639999628067017,
  ] as const,
  // Geometry pins only. Authority additionally requires the preserved fuel mount
  // certificate from wayfarer-refit-mount; this constant grants no installation.
});

/** Read-only plan. The future atomic adapter must reread revisions and run the
 * full inventory validator; this function neither allocates identities nor writes. */
export function auditWayfarerRefitStorage(input: {
  characterId: string;
  shipId: string;
  containers: readonly RefitContainer[];
  items: readonly RefitItem[];
  bindings: readonly RefitStorageBinding[];
}) {
  const containers = new Map(input.containers.map((c) => [c.id, c]));
  const items = new Map(input.items.map((i) => [i.id, i]));
  if (
    containers.size !== input.containers.length ||
    items.size !== input.items.length
  )
    throw Error("Refit audit: duplicate inventory identity");
  const roots = input.containers.filter((c) => !c.carried && !c.parentItemId);
  for (const c of input.containers) {
    if (c.characterId !== input.characterId || c.shipId !== input.shipId)
      throw Error("Refit audit: foreign inventory scope");
    if (
      ![
        c.maxMassKg,
        c.capacityLitres,
        c.amountLitres,
        c.localX,
        c.localY,
      ].every(Number.isFinite) ||
      c.maxMassKg < 0 ||
      c.amountLitres < 0 ||
      c.amountLitres > c.capacityLitres
    )
      throw Error("Refit audit: invalid conserved balance");
    if (
      c.kind === "grid" &&
      (![c.width, c.height].every(Number.isSafeInteger) ||
        c.width <= 0 ||
        c.height <= 0)
    )
      throw Error("Refit audit: invalid conserved grid");
    const visited = new Set<string>();
    let current: RefitContainer | undefined = c;
    while (current?.parentItemId) {
      if (visited.has(current.id))
        throw Error("Refit audit: nested container cycle");
      visited.add(current.id);
      const parent = items.get(current.parentItemId);
      if (!parent) throw Error("Refit audit: missing parent item");
      // Equipped parent items have an empty container reference.
      current = parent.containerId
        ? containers.get(parent.containerId)
        : undefined;
      if (parent.containerId && !current)
        throw Error("Refit audit: missing parent container");
    }
  }
  for (const i of input.items)
    if (i.containerId && !containers.has(i.containerId))
      throw Error("Refit audit: item outside captured inventory graph");
  const bound = new Map<string, string>(),
    used = new Set<string>();
  for (const b of input.bindings) {
    if (
      !roots.some((c) => c.id === b.containerId && c.kind === "grid") ||
      !cargo.some((c) => c[0] === b.sourcePlacementId) ||
      bound.has(b.containerId) ||
      used.has(b.sourcePlacementId)
    )
      throw Error("Refit audit: invalid or non-bijective storage binding");
    bound.set(b.containerId, b.sourcePlacementId);
    used.add(b.sourcePlacementId);
  }
  const unboundGrid = roots.filter(
    (c) => c.kind === "grid" && !bound.has(c.id),
  );
  if (
    unboundGrid.length > 1 ||
    unboundGrid.some((c) => c.name !== "Storage supply crate")
  )
    throw Error(
      "Refit audit: unknown storage requires explicit additional placement",
    );
  for (const c of unboundGrid) {
    const slot = cargo.find((p) => !used.has(p[0]));
    if (!slot)
      throw Error("Refit audit: supply root requires additional placement");
    bound.set(c.id, slot[0]);
    used.add(slot[0]);
  }
  const tanks = roots.filter((c) => c.kind === "liquid");
  if (
    tanks.length > 1 ||
    tanks.some(
      (c) => c.name !== "Engineering fuel tank" || c.liquidType !== "fuel",
    )
  )
    throw Error(
      "Refit audit: liquid root requires explicit additional placement",
    );
  return {
    baseSha256: WAYFARER_STARTER.sha256,
    shipId: input.shipId,
    characterId: input.characterId,
    rootBindings: roots.map((c) => {
      const sourcePlacementId = bound.get(c.id),
        slot = cargo.find((p) => p[0] === sourcePlacementId);
      return {
        containerId: c.id,
        sourcePlacementId: sourcePlacementId ?? REFIT_FUEL_ATTACHMENT.sourceId,
        originM: [c.localX, c.localY] as Point,
        targetM: slot
          ? ([slot[1], slot[2]] as Point)
          : ([...REFIT_FUEL_ATTACHMENT.positionM.slice(0, 2)] as Point),
        scopeChange: "character-to-owned-instance" as const,
        conserved: { ...c },
        requiresAttachment: !sourcePlacementId,
      };
    }),
    preservedItemIds: [...items.keys()].sort(),
    preservedContainerIds: [...containers.keys()].sort(),
    // Unbound visual boxes stay decoration; refit grants no free new storage.
    unboundVisualPlacements: cargo
      .filter((p) => !used.has(p[0]))
      .map((p) => p[0]),
    allocatesItems: false as const,
    allocatesContainers: false as const,
    readyToApply: false as const,
  };
}

export function qualifyRefitFuelLayout(
  position: Point = [-3, 7],
  approach: Point = [-1.875, 7],
) {
  const snapshot = compileConstruction(WAYFARER_STARTER.documentJson);
  const document = JSON.parse(snapshot.canonical);
  const bindings = qualifiedWayfarerWalkingBindings(snapshot, 0.3, 1.8);
  const obstacles = bindings.flatMap((b) =>
    b.obstacles.map((o, i) => ({
      id: b.sourceObjectId + i,
      definitionId: b.definitionId,
      vertices: o.vertices,
    })),
  );
  const base = compileDeckCollision(
    document.layout,
    WAYFARER_STARTER.sourceDeckId,
    {
      shipId: "refit-audit",
      perimeterHalfWidthM: 0,
      partitionHalfWidthM: 0,
      obstacles,
    },
  );
  const frame = resolveDeckCollision(base, []);
  const loc = (position: Point) => ({
    shipId: frame.shipId,
    deckId: frame.deckId,
    position,
  });
  const footprintClear = canOccupyDeck(frame, loc(position), Math.SQRT1_2);
  const approachClear =
    canOccupyDeck(frame, loc(approach), 0.3) &&
    Math.hypot(position[0] - approach[0], position[1] - approach[1]) >=
      Math.SQRT1_2 + 0.3 &&
    deckLineOfSight(frame, loc(position), loc(approach));
  return {
    footprintClear,
    approachClear,
    baseSha256: snapshot.sha256,
    qualification:
      "nominal-floor-and-qualified-standing-obstacles-only" as const,
    nativeVolumeRoofLoadAndAttachmentPending: true as const,
  };
}
