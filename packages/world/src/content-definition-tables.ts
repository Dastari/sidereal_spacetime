/**
 * Content definition registry (roadmap X-1, wiki `Systems/Content Definitions`). All four tables
 * are private. Grantees read them only through the `admin_content_definition_*` views, filtered
 * to the kinds they hold a `definition.*` grant for; no player view reads them.
 */
import { table, t } from "spacetimedb/server";

/** One row per definition (`kind:id`): the editable draft and the revision pointers. */
export const contentDefinitionHead = table(
  {
    name: "content_definition_head",
    indexes: [{ accessor: "by_kind", algorithm: "btree", columns: ["kind"] }],
  },
  {
    /** `kind:definitionId`. */
    definitionKey: t.string().primaryKey(),
    kind: t.string(),
    definitionId: t.string(),
    /** Optimistic concurrency: every save, discard, publish and retire names this and bumps it. */
    revision: t.u64(),
    /** Canonical draft payload; "" when there is no draft. Drafts never affect runtime. */
    draftJson: t.string(),
    draftSha256: t.string(),
    /** `currentRevision` when the draft was saved (the base a diff compares against). */
    draftBaseRevision: t.u64(),
    /** Highest revision ever published; 0 when only a draft exists. */
    latestRevision: t.u64(),
    /** Newest published revision that is not retired (what new instances would pin); 0 = none. */
    currentRevision: t.u64(),
    updatedBy: t.identity(),
    updatedMicros: t.u64(),
  },
);

/** Immutable published revisions (`kind:id@revision`). Only `status` may change, to "retired". */
export const contentDefinition = table(
  {
    name: "content_definition",
    indexes: [
      { accessor: "by_kind", algorithm: "btree", columns: ["kind"] },
      { accessor: "by_key", algorithm: "btree", columns: ["definitionKey"] },
    ],
  },
  {
    /** `kind:definitionId@revision`, the pin instances store. */
    definitionRef: t.string().primaryKey(),
    definitionKey: t.string(),
    kind: t.string(),
    definitionId: t.string(),
    revision: t.u64(),
    /** "published" or "retired" (retired: no new pins; existing pins stay valid). */
    status: t.string(),
    payloadJson: t.string(),
    sha256: t.string(),
    /** Validator version that accepted the payload (`item/v1`). */
    validator: t.string(),
    /** "studio" or "seed:<seed id>". */
    source: t.string(),
    operationId: t.string(),
    publishedBy: t.identity(),
    publishedMicros: t.u64(),
    retiredMicros: t.u64(),
  },
);

/** Idempotency ledger for Studio operations, bounded per principal like construction receipts. */
export const contentDefinitionReceipt = table(
  {
    name: "content_definition_receipt",
    indexes: [
      { accessor: "by_principal", algorithm: "btree", columns: ["principal"] },
    ],
  },
  {
    /** `<principal hex>:<operationId>`. */
    id: t.string().primaryKey(),
    principal: t.identity(),
    kind: t.string(),
    request: t.string(),
    resultRef: t.string(),
    revision: t.u64(),
    createdMicros: t.u64(),
  },
);

/** "Where used" snapshot per definition, recomputed on request by `refresh_definition_usage`. */
export const contentDefinitionUsage = table(
  {
    name: "content_definition_usage",
    indexes: [{ accessor: "by_kind", algorithm: "btree", columns: ["kind"] }],
  },
  {
    definitionKey: t.string().primaryKey(),
    kind: t.string(),
    definitionId: t.string(),
    instanceCount: t.u64(),
    /** JSON `{ "<revision>": count }`: instances by pinned revision. */
    pinsJson: t.string(),
    /** JSON array of definition keys that refer to this one (a weapon's item). */
    referencedByJson: t.string(),
    computedMicros: t.u64(),
  },
);
