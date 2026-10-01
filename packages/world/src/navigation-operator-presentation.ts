/** Unregistered presentation scaffold. Admission and actual visual activation remain separate. */
import { NAVIGATION_OPERATOR_ACTIVATIONS } from "@sidereal/content/navigation-operator-activation.generated";
import type { InventoryDefinition } from "@sidereal/content/inventory";
import { CHARACTER_EQUIPMENT_SLOTS } from "@sidereal/content/character-components";
import {
  acceptedNavigationOperator,
  type AcceptedOperatorTuple,
  registeredNavigationContext,
  type NavigationOperatorRegistration,
} from "@sidereal/sim/navigation-operator-context";
import {
  itemDefinitions,
  type PinnedItemDefinitions,
} from "./item-definitions";
import type { ViewCtx, InferSchema } from "spacetimedb/server";
import type world from "./index";
import type { visibleInteriorBodies } from "./construction-passenger-views";
import {
  compileConstruction,
  readConstructionDraft,
  constructionHash,
} from "@sidereal/sim/construction-transactions";
import {
  isPrefabConstruction,
  restorePrefabSourceIdentities,
  prefabToShipMetres,
  PREFAB_DECK_ID,
} from "@sidereal/sim/prefab-construction";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import {
  prefabFlightModel,
  prefabPlacedObjectId,
  catalogRevisionNumber,
  PREFAB_FLIGHT_DEFINITION,
} from "@sidereal/sim/prefab-flight";
import { dressShip } from "@sidereal/sim/ship-dresser";
import { interiorArtQuarterTurns } from "@sidereal/content/ship-furniture";
import { validateAppearanceJson } from "@sidereal/sim/appearance";
import {
  CHARACTER_APPEARANCE_ENUMS,
  CHARACTER_APPEARANCE_COLORS,
} from "@sidereal/content/appearance";

type Matched = NonNullable<ReturnType<typeof registeredNavigationContext>>;
type EquippedInstance = {
  id: string;
  definitionId: string;
  equipmentSlot: string;
};
export interface PublicOperatorVisual {
  slot: string;
  definitionId: string;
  definitionRevision: string;
  crewItemId: string | null;
  wardrobeId: string | null;
  characterComponentId: string | null;
}
const slots = new Set<string>(["hand", ...CHARACTER_EQUIPMENT_SLOTS]);

/** A key uses the actual pinned public fields, never a current/seed definition or instance UUID. */
export function operatorVisualKey(visual: PublicOperatorVisual) {
  return JSON.stringify([
    visual.slot,
    visual.definitionId,
    visual.definitionRevision,
    visual.crewItemId,
    visual.wardrobeId,
    visual.characterComponentId,
  ]);
}

export type OperatorUnavailableReason =
  | "definition-unavailable"
  | "visual-unresolved"
  | "visual-unmeasured"
  | "head-source-unmeasured"
  | "request-unavailable";
export interface OperatorUnavailableSlot {
  slot: string | null;
  reason: OperatorUnavailableReason;
}
export interface ResolvedOperatorVisuals {
  visuals: PublicOperatorVisual[];
  unavailableSlots: OperatorUnavailableSlot[];
}

/** After admission, unavailable requested slots remain explicit; private instance IDs never escape. */
export function resolvePinnedOperatorVisuals(
  items: Iterable<EquippedInstance>,
  definitions: Pick<PinnedItemDefinitions, "find" | "pin">,
): ResolvedOperatorVisuals {
  const visuals: PublicOperatorVisual[] = [],
    unavailableSlots: OperatorUnavailableSlot[] = [];
  const seen = new Set<string>();
  let scanned = 0;
  try {
    for (const item of items) {
      if (++scanned > 512) {
        unavailableSlots.push({ slot: null, reason: "request-unavailable" });
        break;
      }
      if (!item.equipmentSlot) continue;
      if (!slots.has(item.equipmentSlot)) {
        unavailableSlots.push({ slot: null, reason: "request-unavailable" });
        continue;
      }
      const slot = item.equipmentSlot;
      if (seen.has(slot)) {
        unavailableSlots.push({ slot, reason: "request-unavailable" });
        continue;
      }
      seen.add(slot);
      try {
        const definition: InventoryDefinition | undefined =
          definitions.find(item);
        const pin = definitions.pin(item);
        if (
          !definition ||
          definition.id !== item.definitionId ||
          pin.itemRevision <= 0n
        ) {
          unavailableSlots.push({ slot, reason: "definition-unavailable" });
          continue;
        }
        if (definition.equipSlot !== slot) {
          unavailableSlots.push({ slot, reason: "request-unavailable" });
          continue;
        }
        const visual = {
          slot,
          definitionId: definition.id,
          definitionRevision: pin.itemRevision.toString(),
          crewItemId: definition.crewItemId ?? null,
          wardrobeId: definition.wardrobeId ?? null,
          characterComponentId: definition.characterComponentId ?? null,
        };
        visuals.push(visual);
        if (!(
          visual.crewItemId ||
          visual.wardrobeId ||
          visual.characterComponentId
        ))
          unavailableSlots.push({ slot, reason: "visual-unresolved" });
      } catch {
        unavailableSlots.push({ slot, reason: "definition-unavailable" });
      }
    }
  } catch {
    unavailableSlots.push({ slot: null, reason: "request-unavailable" });
  }
  return {
    visuals: visuals.sort((a, b) => a.slot.localeCompare(b.slot)),
    unavailableSlots,
  };
}

/** Compatibility helper for pure callers requiring only a complete public list. */
export function pinnedOperatorVisuals(
  items: Iterable<EquippedInstance>,
  definitions: Pick<PinnedItemDefinitions, "find" | "pin">,
): PublicOperatorVisual[] | null {
  const result = resolvePinnedOperatorVisuals(items, definitions);
  return result.unavailableSlots.length ? null : result.visuals;
}

/** Pure positive serialization for injected tests/future adapter, with an explicit measured cohort. */
export function operatorSnapshotJson(
  matched: Matched,
  tuple: AcceptedOperatorTuple,
  appearanceJson: string,
  visuals: readonly PublicOperatorVisual[] | null,
  measuredVisualKeys: ReadonlySet<string>,
  unavailableSlots: readonly OperatorUnavailableSlot[] = [],
  measuredAppearanceKeys?: ReadonlySet<string>,
) {
  const accepted = acceptedNavigationOperator(matched, tuple);
  if (!accepted) return null;
  const reasons = new Set<OperatorUnavailableReason>([
    "definition-unavailable",
    "visual-unresolved",
    "visual-unmeasured",
    "head-source-unmeasured",
    "request-unavailable",
  ]);
  const unavailable: OperatorUnavailableSlot[] = unavailableSlots.map(
    (entry) => ({
      slot: entry.slot && slots.has(entry.slot) ? entry.slot : null,
      reason: reasons.has(entry.reason) ? entry.reason : "request-unavailable",
    }),
  );
  if (!visuals) unavailable.push({ slot: null, reason: "request-unavailable" });
  for (const visual of visuals ?? [])
    if (!measuredVisualKeys.has(operatorVisualKey(visual)))
      unavailable.push({ slot: visual.slot, reason: "visual-unmeasured" });
  let appearance: unknown = {};
  try {
    const canonical = validateAppearanceJson(
      appearanceJson,
      CHARACTER_APPEARANCE_ENUMS,
      CHARACTER_APPEARANCE_COLORS,
    );
    appearance = JSON.parse(canonical);
    if (measuredAppearanceKeys && !measuredAppearanceKeys.has(canonical))
      unavailable.push({ slot: null, reason: "head-source-unmeasured" });
  } catch {
    unavailable.push({ slot: null, reason: "request-unavailable" });
  }
  // Explicit fields: private inventory identities and adapter inputs cannot leak by object spread.
  const registration = matched.registration;
  return JSON.stringify({
    version: 1,
    status: unavailable.length ? "visual-unavailable" : "supported",
    unavailableSlots: unavailable,
    profileId: registration.profileId,
    certificateSha256: registration.certificateSha256,
    proofSha256: registration.proofSha256,
    manifestSha256: registration.manifestSha256,
    compilerSha256: registration.compilerSha256,
    geometrySha256: registration.geometrySha256,
    navigationSha256: registration.navigationSha256,
    characterId: tuple.characterId,
    instanceId: tuple.instanceId,
    deckId: tuple.deckId,
    visitId: tuple.visitId,
    stationId: tuple.stationId,
    seatPlacedObjectId: tuple.seatPlacedObjectId,
    consolePlacedObjectId: tuple.consolePlacedObjectId,
    mountSourceId: matched.context.mountSourceId,
    instanceRevision: tuple.instanceRevision,
    locationRevision: tuple.locationRevision,
    bindingRevision: tuple.bindingRevision,
    mappingRevision: tuple.mappingRevision,
    seatRevision: tuple.seatRevision,
    acceptedX: tuple.acceptedX,
    acceptedY: tuple.acceptedY,
    standingElevationM: tuple.standingElevationM,
    connected: tuple.connected,
    dead: tuple.dead,
    pose: "occupied",
    appearance,
    visuals: (visuals ?? []).map((v) => ({
      slot: v.slot,
      definitionId: v.definitionId,
      definitionRevision: v.definitionRevision,
      crewItemId: v.crewItemId,
      wardrobeId: v.wardrobeId,
      characterComponentId: v.characterComponentId,
    })),
  });
}

type Context = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
type Visible = NonNullable<ReturnType<typeof visibleInteriorBodies>>;
export interface OperatorWorldRegistration extends NavigationOperatorRegistration {
  measuredVisualKeys: readonly string[];
  measuredAppearanceKeys: readonly string[];
}

/** Stable canonical catalog fingerprint; never returned as document/catalog data. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}

/** Compare grouped stored mappings to the compiler-admitted flat identity map, including layout. */
export function operatorMappingAgrees(
  raw: string,
  flat: unknown,
  instanceId: string,
): boolean {
  if (
    typeof raw !== "string" ||
    new TextEncoder().encode(raw).length > 262144 ||
    !flat ||
    typeof flat !== "object" ||
    Array.isArray(flat)
  )
    return false;
  try {
    const admitted = Object.entries(flat as Record<string, unknown>);
    if (
      !admitted.length ||
      admitted.length > 16384 ||
      admitted.some(([source, id]) => !source || typeof id !== "string" || !id)
    )
      return false;
    const byInstance = new Set(admitted.map(([, id]) => id));
    if (byInstance.size !== admitted.length) return false;
    const layout = admitted.filter(([, id]) => id === instanceId);
    if (layout.length !== 1) return false;
    const expected = new Map(admitted as [string, string][]);
    const stored = JSON.parse(raw) as Record<string, unknown>;
    if (!stored || typeof stored !== "object" || Array.isArray(stored))
      return false;
    const groups = new Set([
      "decks",
      "floors",
      "objects",
      "partitions",
      "openings",
      "rooms",
      "routeNodes",
      "routes",
      "serviceConnections",
      "holes",
      "traversalLinks",
      "nativeParts",
      "traversalApertures",
      "stairLinks",
      "stairSupports",
      "stairApertures",
      "boundaryTreatments",
      "cargoGrids",
    ]);
    const seen = new Map<string, string>([[layout[0][0], instanceId]]);
    for (const [group, entries] of Object.entries(stored)) {
      if (!groups.has(group) || !Array.isArray(entries)) return false;
      for (const entry of entries) {
        if (
          !entry ||
          typeof entry !== "object" ||
          Object.keys(entry).sort().join(",") !== "instanceId,sourceId" ||
          typeof entry.sourceId !== "string" ||
          typeof entry.instanceId !== "string" ||
          seen.has(entry.sourceId) ||
          expected.get(entry.sourceId) !== entry.instanceId ||
          seen.size >= 16384
        )
          return false;
        seen.set(entry.sourceId, entry.instanceId);
      }
    }
    return seen.size === expected.size;
  } catch {
    return false;
  }
}

/** Positive adapter is pure view work; injected registrations are for trusted tests/future literal DATA. */
export function navigationOperatorSnapshotsFor(
  ctx: Context,
  visible: Visible,
  registrations: readonly OperatorWorldRegistration[],
) {
  const empty = (_body: Visible["bodies"][number]) => undefined;
  if (!registrations.length) return empty;
  const { instance, deck } = visible;
  const binding = ctx.db.constructionFlightBinding.shipId.find(instance.id);
  if (
    !binding ||
    binding.instanceId !== instance.id ||
    binding.deckId !== deck.id ||
    binding.instanceRevision !== instance.revision ||
    binding.blueprintSha256 !== instance.blueprintSha256 ||
    binding.definitionId !== PREFAB_FLIGHT_DEFINITION ||
    deck.sourceDeckId !== PREFAB_DECK_ID ||
    !registrations.some(
      (entry) => entry.blueprintSha256 === instance.blueprintSha256,
    )
  )
    return empty;
  let derived:
    | { stationX: number; stationY: number; seatId: string; consoleId: string }
    | undefined;
  const matched = registeredNavigationContext(registrations, () => {
    const snapshot = compileConstruction(instance.documentJson);
    const admitted: unknown = JSON.parse(snapshot.canonical);
    if (!isPrefabConstruction(admitted)) return null;
    const flat = (
      admitted.prefab as typeof admitted.prefab & { identities?: unknown }
    ).identities;
    if (!operatorMappingAgrees(instance.idMapJson, flat, instance.id))
      return null;
    const restored = restorePrefabSourceIdentities(admitted, flat);
    const source = readConstructionDraft(JSON.stringify(restored), {
      prefabDerivation: true,
    });
    if (source.sha256 !== instance.blueprintSha256) return null;
    const doc = restored.prefab.document;
    const catalog = prefabComponentCatalogFor(restored.prefab.catalog);
    const mounts = dressShip(doc, { catalog }).components.filter(
      (c) => c.component === "console.navigation.sm",
    );
    if (mounts.length !== 1) return null;
    const mount = mounts[0];
    if (
      mount.placement.mount.attach !== "interior" ||
      !mount.placement.spec ||
      mount.placement.anchorZ !== 3
    )
      return null;
    const model = prefabFlightModel(doc, catalog);
    const computer = model.fittings
      .filter((f) => f.role === "computer")
      .sort((a, b) => a.sourceId.localeCompare(b.sourceId))[0];
    if (!model.station || !computer) return null;
    const [mx, my] = prefabToShipMetres(doc)(mount.placement.anchor);
    if (Math.hypot(mx - model.station[0], my - model.station[1]) > 1e-5)
      return null;
    derived = {
      stationX: model.station[0],
      stationY: model.station[1],
      seatId: prefabPlacedObjectId(instance.id, "station"),
      consoleId: prefabPlacedObjectId(instance.id, computer.sourceId),
    };
    return {
      prefabId: doc.id,
      blueprintSha256: source.sha256,
      catalogId: catalog.revision.split("@")[0],
      catalogRevision: catalogRevisionNumber(catalog.revision),
      catalogSha256: constructionHash(
        canonical({
          revision: catalog.revision,
          components: [...catalog.list()].sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
        }),
      ),
      mountSourceId: mount.mount,
      storedMappingAgrees: true,
      internalQuarterTurns: mount.placement.quarterTurns,
      artQuarterTurns:
        (mount.placement.quarterTurns +
          interiorArtQuarterTurns(mount.placement.spec.id)) %
        4,
      deckElevationM: deck.elevation,
      floorElevationM: deck.elevation + 0.1875,
      stationX: model.station[0],
      stationY: model.station[1],
    };
  });
  if (!matched || !derived) return empty;
  const registration = matched.registration as OperatorWorldRegistration;
  const station = ctx.db.station.id.find(binding.stationId);
  const mapping = ctx.db.constructionFlightStation.stationId.find(
    binding.stationId,
  );
  if (
    !station ||
    !mapping ||
    station.shipId !== instance.id ||
    mapping.shipId !== instance.id ||
    mapping.deckId !== deck.id ||
    mapping.seatPlacedObjectId !== derived.seatId ||
    mapping.consolePlacedObjectId !== derived.consoleId ||
    ![station.localX, station.localY].every(Number.isFinite) ||
    Math.hypot(
      station.localX - derived.stationX,
      station.localY - derived.stationY,
    ) > 1e-5
  )
    return empty;
  const definitions = itemDefinitions(ctx);
  return ({
    body,
    location,
  }: Visible["bodies"][number]): string | undefined => {
    const seat = ctx.db.constructionPilotSeat.characterId.find(body.id);
    if (
      !seat ||
      seat.shipId !== instance.id ||
      seat.deckId !== deck.id ||
      seat.stationId !== station.id ||
      body.shipId !== instance.id ||
      location.instanceId !== instance.id ||
      location.deckId !== deck.id
    )
      return;
    const vitals = ctx.db.characterVitals.characterId.find(body.id);
    const tuple: AcceptedOperatorTuple = {
      characterId: body.id,
      instanceId: instance.id,
      deckId: deck.id,
      visitId: location.visitId,
      stationId: station.id,
      seatPlacedObjectId: mapping.seatPlacedObjectId,
      consolePlacedObjectId: mapping.consolePlacedObjectId,
      instanceRevision: instance.revision.toString(),
      locationRevision: location.revision.toString(),
      bindingRevision: binding.revision.toString(),
      mappingRevision: mapping.revision.toString(),
      seatRevision: seat.revision.toString(),
      seatInstanceRevision: seat.instanceRevision.toString(),
      bindingInstanceRevision: binding.instanceRevision.toString(),
      lifecycle: binding.lifecycle,
      connected: body.connected,
      dead: vitals?.state === "dead" || vitals?.state === "downed",
      recoveryRequested: seat.recoveryRequested,
      operational: station.operational,
      occupantId: station.occupantId ?? "",
      acceptedX: body.localX,
      acceptedY: body.localY,
      standingElevationM: deck.elevation + 0.1875,
    };
    if (!acceptedNavigationOperator(matched, tuple)) return;
    let resolved: ResolvedOperatorVisuals;
    try {
      resolved = resolvePinnedOperatorVisuals(
        ctx.db.inventoryItem.by_character.filter(body.id),
        definitions,
      );
    } catch {
      resolved = {
        visuals: [],
        unavailableSlots: [{ slot: null, reason: "request-unavailable" }],
      };
    }
    let appearanceJson = "{}";
    try {
      appearanceJson =
        ctx.db.characterAppearance.characterId.find(body.id)?.appearanceJson ??
        "{}";
    } catch {
      resolved.unavailableSlots.push({
        slot: null,
        reason: "request-unavailable",
      });
    }
    return (
      operatorSnapshotJson(
        matched,
        tuple,
        appearanceJson,
        resolved.visuals,
        new Set(registration.measuredVisualKeys),
        resolved.unavailableSlots,
        new Set(registration.measuredAppearanceKeys),
      ) ?? undefined
    );
  };
}

/** Production EMPTY is unconditional before compiler, pinned resolver or per-body work. */
export function currentNavigationOperatorSnapshots(
  ctx?: Context,
  visible?: Visible,
) {
  if (NAVIGATION_OPERATOR_ACTIVATIONS.length === 0)
    return (_body?: Visible["bodies"][number]) => undefined;
  if (!ctx || !visible) return (_body?: Visible["bodies"][number]) => undefined;
  const snapshot = navigationOperatorSnapshotsFor(
    ctx,
    visible,
    NAVIGATION_OPERATOR_ACTIVATIONS,
  );
  return (body?: Visible["bodies"][number]) =>
    body ? snapshot(body) : undefined;
}
