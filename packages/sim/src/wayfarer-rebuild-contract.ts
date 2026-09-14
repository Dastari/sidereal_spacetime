import { CONSTRUCTION_INSET_VISUAL_PIN } from "@sidereal/content/construction-inset-visuals";
import visualExtension from "@sidereal/content/construction-wayfarer-rebuild-visuals.json";
import source from "@sidereal/content/wayfarer-rebuild-r002.json";
import type { ConstructionDocument } from "@sidereal/content/construction";
import { stableStringify } from "./layout-geometry";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** Exact source admission, separate from native envelope and gameplay qualification. */
export const WAYFARER_REBUILD_SOURCE =
  source as unknown as ConstructionDocument;
const hash = (value: unknown) =>
  bytesToHex(sha256(new TextEncoder().encode(stableStringify(value))));
export const WAYFARER_REBUILD_SHA256 = hash(source);
export const WAYFARER_REBUILD_VISUALS_SHA256 = hash({
  basePin: CONSTRUCTION_INSET_VISUAL_PIN,
  extension: visualExtension,
});
const sourceIds = Object.keys(source.wayfarerRebuild.identities).sort();
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) {
    const entries = value.map(ordered);
    return entries.every((v) => v && typeof v === "object" && "id" in v)
      ? entries.sort((a: any, b: any) =>
          String(a.id).localeCompare(String(b.id)),
        )
      : entries;
  }
  return value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, ordered(v)]))
    : value;
}
function shape(document: ConstructionDocument) {
  const copy = JSON.parse(JSON.stringify(document));
  delete copy.wayfarerRebuild;
  copy.layout.id = source.layout.id;
  copy.layout.name = source.layout.name;
  copy.layout.source = source.layout.source;
  return ordered(copy);
}
const expected = stableStringify(
  shape(source as unknown as ConstructionDocument),
);
export function verifyWayfarerRebuildSource(document: ConstructionDocument) {
  const binding = document.wayfarerRebuild;
  if (
    !binding ||
    binding.revision !== "r002" ||
    binding.nativeVisualsSha256 !== WAYFARER_REBUILD_VISUALS_SHA256 ||
    Object.keys(binding).sort().join(",") !==
      "identities,nativeVisualsSha256,revision" ||
    !binding.identities ||
    Array.isArray(binding.identities) ||
    Object.keys(binding.identities).sort().join("\n") !== sourceIds.join("\n")
  )
    throw Error("Wayfarer rebuild: exact identity domain required");
  const entries = Object.entries(binding.identities);
  const values = entries.map(([, v]) => v);
  if (
    values.some(
      (v) =>
        typeof v !== "string" || v.length > 256 || /[\u0000-\u001f]/.test(v),
    ) ||
    new Set(values).size !== values.length
  )
    throw Error("Wayfarer rebuild: unique bounded identities required");
  if (binding.identities[source.layout.id] !== document.layout.id)
    throw Error("Wayfarer rebuild: instance identity mismatch");
  const reverse = new Map(entries.map(([k, v]) => [v, k]));
  const deckId = binding.identities[source.layout.decks[0].id];
  const restoreString = (v: string) =>
    reverse.get(v) ??
    (v.startsWith(deckId + ":")
      ? source.layout.decks[0].id + v.slice(deckId.length)
      : v);
  const restore = (v: unknown): unknown =>
    typeof v === "string"
      ? restoreString(v)
      : Array.isArray(v)
        ? v.map(restore)
        : v && typeof v === "object"
          ? Object.fromEntries(
              Object.entries(v).map(([k, x]) => [restoreString(k), restore(x)]),
            )
          : v;
  if (
    stableStringify(shape(restore(document) as ConstructionDocument)) !==
    expected
  )
    throw Error(
      "Wayfarer rebuild: source geometry or retained installation differs",
    );
  return {
    source: WAYFARER_REBUILD_SOURCE,
    identities: binding.identities,
    sourceSha256: WAYFARER_REBUILD_SHA256,
  };
}
