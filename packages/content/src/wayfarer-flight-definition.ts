import {
  flightDefinitionHash,
  type FlightPlacedPart,
  type FlightDefinitionInput,
  type FlightFitting,
  type FlightCargoMass,
  type FlightCrewMass,
} from "../../sim/src/flight-definition";
const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const identifier = (v: unknown): v is string =>
  typeof v === "string" &&
  v.length > 0 &&
  v.length <= 256 &&
  !/[\u0000-\u001f]/.test(v);

import type { ConstructionDocument } from "./construction";
import {
  WAYFARER_PHYSICAL_CATALOG,
  WAYFARER_FLIGHT_HULL,
} from "./physical-definitions";
import historicalSource from "./wayfarer-starter-r001.json";
import rebuiltSource from "./wayfarer-rebuild-r002.json";
import exteriorSource from "./wayfarer-exterior-r005.json";
import { planWayfarerRebuildGame } from "../../sim/src/wayfarer-rebuild-game";

export type WayfarerPhysicalVariant = "r001" | "r002" | "r005";
const variantSources = {
  r001: historicalSource,
  r002: rebuiltSource,
  r005: exteriorSource,
};
let rebuiltNative:
  | ReturnType<typeof planWayfarerRebuildGame>["nativeVisualRequests"]
  | undefined;
export interface WayfarerPhysicalInputOptions {
  variant: WayfarerPhysicalVariant;
  /** Source->instance identity map retained by authoritative construction spawn. */
  identities?: Readonly<Record<string, string>>;
  /** Explicit adoption replaces the original shell mass with the versioned
   * secured assembly tare at its actual movable carrier placement. */
  replacements?: readonly { placedObjectId: string; part: FlightPlacedPart }[];
  /** Independent authoritative attachments absent from the saved assembly. */
  attachments?: readonly FlightPlacedPart[];
}
function restoreIdentities(
  value: unknown,
  reverse: Map<string, string>,
  deckPrefixes: readonly [string, string][],
): unknown {
  const restoreString = (v: string) =>
    reverse.get(v) ??
    (() => {
      const prefix = deckPrefixes.find(([actual]) =>
        v.startsWith(actual + ":"),
      );
      return prefix ? prefix[1] + v.slice(prefix[0].length) : v;
    })();
  if (typeof value === "string") return restoreString(value);
  if (Array.isArray(value)) {
    const rows = value.map((v) => restoreIdentities(v, reverse, deckPrefixes));
    return rows.every((v) => v && typeof v === "object" && "id" in v)
      ? rows.sort((a: any, b: any) => order(a.id, b.id))
      : rows;
  }
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        restoreString(k),
        restoreIdentities(v, reverse, deckPrefixes),
      ]),
    );
  return value;
}
const structureInput = (d: ConstructionDocument) => ({
  floorKit: d.floorKit,
  floors: d.floors,
  boundaryKit: d.boundaryKit,
  roofKit: d.roofKit,
  decks: d.layout.decks,
  tiles: d.layout.tiles,
  partitions: d.layout.partitions,
  openings: d.layout.openings,
  structure: d.layout.structure,
});
/** Existing semantic/native source adapter. It reads actual placed parts rather
 * than selecting a stock layout. The separately compiled native floor/wall/roof
 * modules remain admitted only while their semantic source is unchanged.
 * Structural edits need a newly qualified variant; equipment removal/movement
 * flows through the actual placements. Authority validators remain the caller's
 * responsibility and are not bypassed by this physical compilation helper. */
export function wayfarerFlightParts(
  document: ConstructionDocument,
  options: WayfarerPhysicalInputOptions,
): FlightPlacedPart[] {
  const source = variantSources[
    options.variant
  ] as unknown as ConstructionDocument;
  if (
    !source ||
    !document ||
    !document.layout ||
    !Array.isArray(document.layout.assembly?.parts) ||
    document.layout.assembly!.parts.length > 2000 ||
    !Array.isArray(document.floors) ||
    document.floors.length > 512
  )
    throw Error("Unsupported bounded physical construction source");
  const identities =
    options.identities ??
    document.wayfarerRebuild?.identities ??
    document.wayfarerExterior?.identities ??
    {};
  const entries = Object.entries(identities);
  if (
    entries.length > 16384 ||
    entries.some(([a, b]) => !identifier(a) || !identifier(b)) ||
    new Set(entries.map(([, v]) => v)).size !== entries.length
  )
    throw Error("Invalid physical source identity map");
  const reverse = new Map(entries.map(([a, b]) => [b, a]));
  if (
    flightDefinitionHash(
      restoreIdentities(
        structureInput(document),
        reverse,
        document.layout.decks
          .filter((d) => reverse.has(d.id))
          .map((d) => [d.id, reverse.get(d.id)!]),
      ),
    ) !==
    flightDefinitionHash(
      restoreIdentities(structureInput(source), new Map(), []),
    )
  )
    throw Error("Unsupported physical structural revision");
  const catalogById = new Map(
    WAYFARER_PHYSICAL_CATALOG.definitions.map((d) => [d.id, d]),
  );
  const parts: FlightPlacedPart[] = document.layout.assembly!.parts.map((p) => {
    const d = catalogById.get("physical:" + p.assetId),
      revision = document.layout.assembly!.revisions[p.assetId];
    if (!d || !d.visualRevisions?.includes(revision))
      throw Error(
        "Missing physical asset revision:" + p.assetId + "@" + revision,
      );
    return {
      id: p.id,
      definitionId: d.id,
      revision: d.revision,
      position: p.position,
      rotation: p.rotation,
      flipped: p.flipped,
    };
  });
  for (const f of document.floors)
    parts.push({
      id: "floor:" + f.id,
      definitionId: "floor:" + f.partId,
      revision: 1,
      position: f.origin.map((v) => v / 32) as [number, number, number],
      rotation: (f.quarterTurns * Math.PI) / 2,
      flipped: f.reflected,
    });
  if (options.variant !== "r001") {
    // The exact planner checks native source pins. This cache is immutable source
    // metadata, not a cached ship aggregate or a fallback for unknown layouts.
    rebuiltNative ??= planWayfarerRebuildGame(
      rebuiltSource as unknown as ConstructionDocument,
    ).nativeVisualRequests;
    for (const n of rebuiltNative)
      parts.push({
        id: "native:" + flightDefinitionHash([document.layout.id, n.id]),
        definitionId: "native:" + n.key,
        revision: 1,
        position: n.originM,
        rotation: (n.quarterTurns * Math.PI) / 2,
        flipped: false,
      });
  }
  const replacements = options.replacements ?? [];
  if (
    replacements.length > 512 ||
    new Set(replacements.map((r) => r.placedObjectId)).size !==
      replacements.length
  )
    throw Error("Invalid cargo replacement budget");
  for (const replacement of replacements) {
    const index = parts.findIndex((p) => p.id === replacement.placedObjectId),
      old = index >= 0 && catalogById.get(parts[index].definitionId),
      next = catalogById.get(replacement.part.definitionId);
    if (
      !old ||
      old.kind !== "cargo" ||
      !next ||
      next.kind !== "cargo" ||
      replacement.part.id !== replacement.placedObjectId
    )
      throw Error(
        "Invalid cargo shell replacement:" + replacement.placedObjectId,
      );
    parts[index] = replacement.part;
  }
  if ((options.attachments?.length ?? 0) > 256)
    throw Error("Physical attachment budget");
  return [...parts, ...(options.attachments ?? [])];
}
export function wayfarerFlightInput(
  document: ConstructionDocument,
  options: WayfarerPhysicalInputOptions,
  dynamic: {
    fittings: readonly FlightFitting[];
    cargo?: readonly FlightCargoMass[];
    crew?: readonly FlightCrewMass[];
    supply?: Readonly<Record<string,number>>;
  },
): FlightDefinitionInput {
  return {
    parts: wayfarerFlightParts(document, options),
    fittings: dynamic.fittings,
    cargo: dynamic.cargo ?? [],
    crew: dynamic.crew ?? [],
    supply: dynamic.supply,
    catalog: WAYFARER_PHYSICAL_CATALOG,
    hull: WAYFARER_FLIGHT_HULL,
  };
}
