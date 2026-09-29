/**
 * Roadmap X-3b tables (wiki `Systems/Content Definitions`). Both private; the snapshot content is
 * published game content and reaches clients through `component_catalog_snapshots`.
 */
import { table, t } from "spacetimedb/server";

/** Immutable, content-addressed component catalogues that ships pin (`ship-components-v1@4+<hash>`). */
export const componentCatalogSnapshot = table(
  { name: "component_catalog_snapshot" },
  {
    pin: t.string().primaryKey(),
    baseRevision: t.u32(),
    /** Canonical `{ base, components, removed }`; its sha256 prefix is the pin hash. */
    snapshotJson: t.string(),
    sha256: t.string(),
    /** `component:<id>@<revision>` of every replaced or added component (where used). */
    componentRefsJson: t.string(),
    createdMicros: t.u64(),
  },
);

/** Interaction definition pin of an interaction object. No row: revision 1 (the seed). */
export const interactionObjectPin = table(
  { name: "interaction_object_pin" },
  {
    objectId: t.string().primaryKey(),
    definitionId: t.string(),
    revision: t.u64(),
    pinnedMicros: t.u64(),
  },
);
