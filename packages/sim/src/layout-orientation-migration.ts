import type {
  PartAsset,
  PartCatalog,
  PartPlacement,
} from "@sidereal/content/assembly";
import {
  layoutVisualParts,
  visualRevision,
} from "@sidereal/content/layout-assembly";
import { LAYOUT_LIMITS } from "@sidereal/content/ship-layout";
import {
  classifyLegacyYaw,
  transformPlacementPoint,
} from "@sidereal/content/placement-orientation";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { readLayout } from "./layout-validation";

type Triple = [number, number, number];
export interface OrientationMigrationEntry {
  id: string;
  assetId: string;
  domain: "fitting" | "assembly";
  status: "exact" | "conversion-required" | "unresolved";
  reason: string | null;
  /** Mathematical conversion only; this never qualifies support, seals or mounts. */
  qualification: "not-evaluated";
  proposal: null | {
    yawStep: number;
    reflected: boolean;
    /** Retains the legacy modelling origin; it does not invent a mount anchor. */
    frame: "legacy-source-origin" | "legacy-fitting-min-bound";
    anchorUnits: Triple;
    modelOriginMeters: Triple;
    angularDeltaRadians: number;
    originDeltaMeters: Triple;
    /** Maximum displacement of the declared native bounding box's eight corners.
     * This bounds its contained vertices, but does not certify export containment. */
    envelopeDisplacementMeters: number;
  };
}
export interface OrientationMigrationReview {
  schema: "sidereal.orientation-migration-review.v1";
  sourceRaw: string;
  sourceSha256: string;
  status: "reviewable" | "unsupported";
  reason: string | null;
  entries: OrientationMigrationEntry[];
}

function validBounds(asset: PartAsset): boolean {
  return (
    !!asset.bounds &&
    [asset.bounds.min, asset.bounds.max].every(
      (p) =>
        Array.isArray(p) &&
        p.length === 3 &&
        p.every((n) => Number.isFinite(n) && Math.abs(n) <= 10000),
    ) &&
    asset.bounds.min.every((n, i) => n <= asset.bounds.max[i])
  );
}

function displacement(
  part: PartPlacement,
  asset: PartAsset,
  origin: Triple,
  yaw: number,
) {
  let maximum = 0;
  const c = Math.cos(part.rotation),
    s = Math.sin(part.rotation);
  for (let mask = 0; mask < 8; mask++) {
    const local = [0, 1, 2].map(
      (i) => (mask & (1 << i) ? asset.bounds.max : asset.bounds.min)[i],
    );
    const x = part.flipped ? -local[0] : local[0];
    const before = [
      c * x - s * local[1] + part.position[0],
      s * x + c * local[1] + part.position[1],
      local[2] + part.position[2],
    ];
    const after = transformPlacementPoint(
      [local[0], local[1]],
      yaw,
      part.flipped,
    );
    maximum = Math.max(
      maximum,
      Math.hypot(
        after[0] + origin[0] - before[0],
        after[1] + origin[1] - before[1],
        local[2] + origin[2] - before[2],
      ),
    );
  }
  return maximum;
}

/** Read-only prerequisite to explicit migration. Never passes a proposed transform
 * to a production reader, rewrites sourceRaw, or changes a canonical blueprint hash.
 * Unknown/new schemas and catalog mismatches remain recoverable without conversion. */
export function reviewLayoutOrientations(
  sourceRaw: string,
  catalog: PartCatalog,
): OrientationMigrationReview {
  const bytes = new TextEncoder().encode(sourceRaw);
  const review: OrientationMigrationReview = {
    schema: "sidereal.orientation-migration-review.v1",
    sourceRaw,
    sourceSha256: bytesToHex(sha256(bytes)),
    status: "unsupported",
    reason: null,
    entries: [],
  };
  if (bytes.length > LAYOUT_LIMITS.bytes) {
    review.reason = "Original source exceeds the 1 MiB migration review budget";
    return review;
  }
  let doc;
  try {
    doc = readLayout(JSON.parse(sourceRaw));
  } catch (error) {
    review.reason =
      error instanceof Error ? error.message : "Invalid source document";
    return review;
  }
  const assets = new Map(catalog.assets.map((a) => [a.id, a]));
  if (
    catalog.schema !== "sidereal.part-catalog.v1" ||
    assets.size !== catalog.assets.length
  ) {
    review.reason = "Unsupported catalog or ambiguous asset identity";
    return review;
  }
  review.status = "reviewable";
  const visuals = new Map(
    layoutVisualParts(doc, {
      ...catalog,
      assets: catalog.assets.filter(validBounds),
    }).map((p) => [p.id, p]),
  );
  const sources = [
    ...doc.fittings.map((f) => ({
      id: f.id,
      assetId: f.definitionId,
      revision: f.revision,
      domain: "fitting" as const,
    })),
    ...(doc.assembly?.parts ?? []).map((p) => ({
      id: p.id,
      assetId: p.assetId,
      revision: doc.assembly!.revisions[p.assetId],
      domain: "assembly" as const,
    })),
  ];
  for (const source of sources) {
    const entry: OrientationMigrationEntry = {
      id: source.id,
      assetId: source.assetId,
      domain: source.domain,
      status: "unresolved",
      reason: null,
      qualification: "not-evaluated",
      proposal: null,
    };
    review.entries.push(entry);
    const asset = assets.get(source.assetId),
      part = visuals.get(source.id);
    if (asset && !validBounds(asset)) {
      entry.reason = "Native bounding envelope is invalid";
      continue;
    }
    if (
      !asset ||
      !part ||
      source.revision !== visualRevision(catalog, source.assetId)
    ) {
      entry.reason =
        "Missing asset or mismatched pinned native revision; preserve the original source";
      continue;
    }
    const proxyId = part.fittingProxy?.assetId;
    if (
      proxyId &&
      (!assets.has(proxyId) ||
        doc.assembly?.revisions[proxyId] !== visualRevision(catalog, proxyId))
    ) {
      entry.reason =
        "Missing fitting proxy or mismatched pinned proxy revision; preserve the original source";
      continue;
    }
    const angle = classifyLegacyYaw(part.rotation, "");
    const yaw =
      angle.status === "representable"
        ? angle.yawStep
        : angle.proposal?.yawStep;
    if (yaw === undefined) {
      entry.reason =
        "Legacy angle has insufficient finite precision for a conversion proposal";
      continue;
    }
    const fitting = doc.fittings.find((f) => f.id === source.id);
    const anchorUnits = fitting
      ? ([
          ...fitting.position,
          doc.decks.find((d) => d.id === fitting.deckId)!.elevation,
        ] as Triple)
      : (part.position.map((n) => Math.round(n * 32)) as Triple);
    // The legacy fitting anchor already is integral. Preserve its existing
    // model-to-anchor conversion even when model bounds are not lattice aligned.
    const origin: Triple = fitting
      ? [...part.position]
      : (anchorUnits.map((n) => n / 32) as Triple);
    const delta = origin.map((n, i) => n - part.position[i]) as Triple;
    // Encoding allowance only; not the placement grid or geometric fit tolerance.
    const translationExact = delta.every(
      (n, i) =>
        Math.abs(n) <=
        32 * Number.EPSILON * Math.max(1, Math.abs(part.position[i])),
    );
    entry.status =
      angle.status === "representable" && translationExact
        ? "exact"
        : "conversion-required";
    entry.reason =
      entry.status === "exact"
        ? null
        : "Review the proposed angle and source-origin displacement before migration; no edit has been applied";
    entry.proposal = {
      yawStep: yaw,
      reflected: part.flipped,
      frame: fitting ? "legacy-fitting-min-bound" : "legacy-source-origin",
      anchorUnits,
      modelOriginMeters: origin,
      angularDeltaRadians:
        angle.status === "representable"
          ? 0
          : angle.proposal!.angularDeltaRadians,
      originDeltaMeters: delta,
      envelopeDisplacementMeters: displacement(part, asset, origin, yaw),
    };
  }
  return review;
}
