import {
  compileConstruction,
  constructionHash,
} from "./construction-transactions";
import { stableStringify } from "./layout-geometry";

export type TemplateCapability =
  "walking" | "cargo" | "seat" | "pilot" | "refit";
export interface TemplateBindingPins {
  /** Source recorded by the qualification, not inferred from a reused definition. */
  sourceSha256: string;
  definitionId: string;
  /** Gameplay/support definition, never an artwork-derived rating. */
  definitionSha256: string;
  geometrySha256: string;
  sourceDeckId: string;
  sourceObjectIds: readonly string[];
}
export interface TemplateQualificationManifest {
  schema: "sidereal.template-qualification.v1";
  sourceSha256: string;
  capabilities: Partial<Record<TemplateCapability, TemplateBindingPins>>;
}
export interface TrustedTemplateQualification {
  canonical: string;
  manifest: TemplateQualificationManifest;
  /** Independently pinned by trusted server content/build configuration. */
  qualificationSha256: string;
}
export interface TrustedTemplateRefitEdge {
  fromSha256: string;
  toSha256: string;
  fromQualificationSha256: string;
  toQualificationSha256: string;
  qualificationSha256: string;
}

const capabilities: readonly TemplateCapability[] = [
  "walking",
  "cargo",
  "seat",
  "pilot",
  "refit",
];
const hash = (value: string) => /^[0-9a-f]{64}$/.test(value);
const reject = (reason: string): never => {
  throw Error("Template qualification: " + reason);
};
const encode = (pins: TemplateBindingPins) => stableStringify(pins);
export const templateQualificationHash = (
  manifest: TemplateQualificationManifest,
) => constructionHash(stableStringify(manifest));

/** Pure lookup over an immutable, explicitly admitted set. Construct this only
 * from trusted server content, never reducer/client-provided registry records.
 * Matching a source is eligibility, not account permission or proof of live state.
 * No default/latest revision, caller registration, or implied refit transition.
 */
export function createTemplateQualificationResolver(
  trusted: readonly TrustedTemplateQualification[],
  refits: readonly TrustedTemplateRefitEdge[] = [],
) {
  if (trusted.length > 64 || refits.length > 128) reject("registry budget");
  const sources = new Map<
    string,
    {
      canonical: string;
      manifest: TemplateQualificationManifest;
      qualificationSha256: string;
    }
  >();
  for (const entry of trusted) {
    const snapshot = compileConstruction(entry.canonical);
    // Clone before retaining anything: a shared caller object cannot revise admission.
    const manifest = JSON.parse(
      stableStringify(entry.manifest),
    ) as TemplateQualificationManifest;
    if (
      manifest.schema !== "sidereal.template-qualification.v1" ||
      !hash(manifest.sourceSha256) ||
      manifest.sourceSha256 !== snapshot.sha256 ||
      !hash(entry.qualificationSha256) ||
      templateQualificationHash(manifest) !== entry.qualificationSha256
    )
      reject("source/qualification hash mismatch");
    if (sources.has(snapshot.sha256)) reject("duplicate source revision");
    const document = JSON.parse(snapshot.canonical);
    const decks = new Set(
      document.layout.decks.map((d: { id: string }) => d.id),
    );
    const objects = new Set(
      [...(document.layout.assembly?.parts ?? []), ...document.floors].map(
        (p: { id: string }) => p.id,
      ),
    );
    for (const [kind, pins] of Object.entries(manifest.capabilities)) {
      if (
        !capabilities.includes(kind as TemplateCapability) ||
        !pins ||
        pins.sourceSha256 !== manifest.sourceSha256 ||
        typeof pins.definitionId !== "string" ||
        !pins.definitionId ||
        pins.definitionId.length > 160 ||
        !hash(pins.definitionSha256) ||
        !hash(pins.geometrySha256) ||
        !decks.has(pins.sourceDeckId) ||
        !Array.isArray(pins.sourceObjectIds) ||
        pins.sourceObjectIds.length > 2000 ||
        new Set(pins.sourceObjectIds).size !== pins.sourceObjectIds.length ||
        pins.sourceObjectIds.some((id) => !objects.has(id))
      )
        reject("invalid capability binding");
      Object.freeze(pins.sourceObjectIds);
      Object.freeze(pins);
    }
    Object.freeze(manifest.capabilities);
    Object.freeze(manifest);
    sources.set(
      snapshot.sha256,
      Object.freeze({
        canonical: snapshot.canonical,
        manifest,
        qualificationSha256: entry.qualificationSha256,
      }),
    );
  }
  const edges = new Map<string, string>();
  for (const edge of refits) {
    const from = sources.get(edge.fromSha256),
      to = sources.get(edge.toSha256);
    const key = edge.fromSha256 + ":" + edge.toSha256;
    if (
      !from?.manifest.capabilities.refit ||
      !to?.manifest.capabilities.refit ||
      from.qualificationSha256 !== edge.fromQualificationSha256 ||
      to.qualificationSha256 !== edge.toQualificationSha256 ||
      edge.fromSha256 === edge.toSha256 ||
      !hash(edge.qualificationSha256) ||
      edges.has(key)
    )
      reject("invalid explicit refit edge");
    edges.set(key, edge.qualificationSha256);
  }
  function source(sourceSha256: string) {
    const entry = sources.get(sourceSha256);
    if (!entry) reject("unregistered source revision");
    return entry!;
  }
  function resolveSource(input: { sha256: string; canonical: string }) {
    const admitted = source(input.sha256);
    const actual = compileConstruction(input.canonical);
    if (
      actual.sha256 !== input.sha256 ||
      actual.canonical !== admitted.canonical
    )
      reject("document differs from admitted source");
    return admitted.manifest;
  }
  function resolveBinding(
    sourceSha256: string,
    capability: TemplateCapability,
    actual: TemplateBindingPins,
  ) {
    const expected = source(sourceSha256).manifest.capabilities[capability];
    if (!expected) reject("capability not qualified for source");
    if (encode(actual) !== encode(expected!))
      reject("binding pins differ from source qualification");
    return expected!;
  }
  return Object.freeze({
    /** Install/refit/reload source admission; run after authoritative ID reconstruction. */
    resolveSource,
    /** Bounded installed definition lookup; caller retains revision/auth/lease checks. */
    resolveBinding,
    resolveRefit(
      from: { sha256: string; canonical: string },
      to: { sha256: string; canonical: string },
      qualificationSha256: string,
    ) {
      resolveSource(from);
      resolveSource(to);
      const expected = edges.get(from.sha256 + ":" + to.sha256);
      if (!expected || expected !== qualificationSha256)
        reject("refit transition not qualified");
      return Object.freeze({
        fromSha256: from.sha256,
        toSha256: to.sha256,
        qualificationSha256: expected,
      });
    },
    /** Lookup-only; adding a future source never replaces the current admission. */
    admittedSourceSha256s: Object.freeze([...sources.keys()].sort()),
  });
}
