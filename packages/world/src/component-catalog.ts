/**
 * Registry-composed component catalogues on the server (roadmap X-3b, wiki
 * `Systems/Content Definitions`). Rules: `@sidereal/sim/component-catalogs`.
 *
 * - Ships keep the catalogue pin in their construction document; existing ships therefore keep
 *   their behaviour until an operator upgrade moves them to the current catalogue.
 * - New ships pin the **current** catalogue: code catalogue 4 (the seed) with every component's
 *   current registry revision applied. While nothing is published that is `ship-components-v1@4`,
 *   byte for byte the pre-X-3b pin.
 * - A composed catalogue is stored once in `component_catalog_snapshot` (content-addressed) and
 *   loaded into the process by `syncComponentSnapshots` at every entry point.
 */
import {
  SenderError,
  t,
  type InferSchema,
  type ReducerCtx,
  type ViewCtx,
} from "spacetimedb/server";
import type world from "./index";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { COMPONENT_SEED_CATALOG_REVISION } from "@sidereal/content/content-definition-seed";
import { buildShipComponentCatalog } from "@sidereal/content/ship-components-source";
import type { ShipComponentDefinition } from "@sidereal/content/ship-components";
import type { PrefabComponentCatalog } from "@sidereal/content/ship-prefab";
import { syncComponentSnapshots } from "./component-catalog-sync";
import {
  registerComponentCatalogSnapshot,
  snapshotPin,
  type ComponentCatalogSnapshot,
} from "@sidereal/sim/component-catalogs";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { stableStringify } from "@sidereal/sim/layout-geometry";
import { prefabFlightModel } from "@sidereal/sim/prefab-flight";
import { flightDefinitionCatalogHash } from "@sidereal/sim/flight-definition";
import { trustedPrefabTemplateFor } from "./prefab-ship-authority";
import type { PinnedPrefabShip } from "./prefab-ship-pins";

type Context = ReducerCtx<InferSchema<typeof world>>;
type Db = Pick<ViewCtx<InferSchema<typeof world>>, "db">["db"];
const BASE = COMPONENT_SEED_CATALOG_REVISION;
const BASE_COMPONENTS = new Map(
  buildShipComponentCatalog(BASE).components.map((c) => [
    c.id,
    JSON.parse(JSON.stringify(c)) as ShipComponentDefinition,
  ]),
);
const BASE_IDS = new Set(BASE_COMPONENTS.keys());

export { syncComponentSnapshots };

type Change =
  | { kind: "publish"; definitionId: string; payloadJson: string }
  | { kind: "retire"; definitionId: string; revision: bigint };
/**
 * The current component set: the payload of each component's current registry revision where it
 * differs from the seed (revision 1), and seed components whose every revision is retired.
 * `change` evaluates a publish or retire before it is committed.
 */
export function currentComponentSnapshot(
  db: Db,
  change?: Change,
): ComponentCatalogSnapshot {
  const components: ShipComponentDefinition[] = [];
  const removed: string[] = [];
  for (const head of db.contentDefinitionHead.by_kind.filter("component")) {
    if (head.latestRevision === 0n) continue;
    let current = head.currentRevision;
    let payload: string | undefined;
    if (change?.definitionId === head.definitionId) {
      if (change.kind === "publish") {
        current = head.latestRevision + 1n;
        payload = change.payloadJson;
      } else if (change.revision === head.currentRevision) {
        let next = 0n;
        for (const r of db.contentDefinition.by_key.filter(head.definitionKey))
          if (
            r.status === "published" &&
            r.revision !== change.revision &&
            r.revision > next
          )
            next = r.revision;
        current = next;
      }
    }
    if (current === 0n) {
      if (BASE_IDS.has(head.definitionId)) removed.push(head.definitionId);
      continue;
    }
    if (current === 1n && BASE_IDS.has(head.definitionId) && !payload) continue;
    payload ??= db.contentDefinition.definitionRef.find(
      `component:${head.definitionId}@${current}`,
    )?.payloadJson;
    if (!payload)
      throw new SenderError(
        `component:${head.definitionId}@${current} missing`,
      );
    const definition = JSON.parse(payload) as ShipComponentDefinition;
    // Content equal to the seed changes nothing (keeps the plain pin).
    const seed = BASE_COMPONENTS.get(head.definitionId);
    if (seed && stableStringify(seed) === stableStringify(definition)) continue;
    components.push(definition);
  }
  // A first publication of a brand-new component has no head yet.
  if (
    change?.kind === "publish" &&
    !db.contentDefinitionHead.definitionKey.find(
      `component:${change.definitionId}`,
    )
  )
    components.push(JSON.parse(change.payloadJson) as ShipComponentDefinition);
  return { base: BASE, components, removed };
}
const isEmpty = (s: ComponentCatalogSnapshot) =>
  !s.components.length && !s.removed.length;

/** Register (without storing) a snapshot and return its catalogue. */
function catalogOf(s: ComponentCatalogSnapshot) {
  if (isEmpty(s)) return defaultPrefabComponentCatalog();
  const { pin, canonical } = snapshotPin(s);
  registerComponentCatalogSnapshot(pin, canonical);
  return prefabComponentCatalogFor(pin);
}

/** The catalogue new ships pin now; stores its snapshot the first time it is used. */
export function currentComponentCatalog(ctx: Context): PrefabComponentCatalog {
  syncComponentSnapshots(ctx.db);
  const snapshot = currentComponentSnapshot(ctx.db);
  if (isEmpty(snapshot)) return defaultPrefabComponentCatalog();
  const { pin, canonical, sha256 } = snapshotPin(snapshot);
  if (!ctx.db.componentCatalogSnapshot.pin.find(pin))
    ctx.db.componentCatalogSnapshot.insert({
      pin,
      baseRevision: snapshot.base,
      snapshotJson: canonical,
      sha256,
      componentRefsJson: JSON.stringify(
        snapshot.components.map((c) => {
          const head = ctx.db.contentDefinitionHead.definitionKey.find(
            `component:${c.id}`,
          );
          return `component:${c.id}@${head?.currentRevision ?? 1n}`;
        }),
      ),
      createdMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  registerComponentCatalogSnapshot(pin, canonical);
  return prefabComponentCatalogFor(pin);
}

/**
 * A registered pin as it spawns under `catalog`: the same prefab, blueprint and flight hashes
 * derived with that catalogue. Identical to `pin` when the catalogue is the pinned one.
 */
export function effectivePrefabPin(
  pin: PinnedPrefabShip,
  catalog: PrefabComponentCatalog,
): PinnedPrefabShip {
  if (catalog.revision === pin.catalogRevision) return pin;
  const prefab = prefabById(pin.prefabId);
  if (!prefab) throw new SenderError(`Unknown prefab ${pin.prefabId}`);
  const template = trustedPrefabTemplateFor(prefab, catalog);
  return {
    ...pin,
    catalogRevision: catalog.revision,
    blueprintSha256: template.snapshot.sha256,
    flightDefinitionSha256: flightDefinitionCatalogHash(
      prefabFlightModel(prefab, catalog).catalog,
    ),
  };
}

/**
 * Publish/retire check for components: the catalogue after the change must be valid and every
 * spawnable prefab must still compile and fly with it, so new ships can always be issued.
 */
export function componentChangeBlocker(
  db: Db,
  prefabIds: readonly string[],
  change: Change,
): string | null {
  syncComponentSnapshots(db);
  let catalog: PrefabComponentCatalog;
  try {
    catalog = catalogOf(currentComponentSnapshot(db, change));
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  for (const id of prefabIds) {
    const prefab = prefabById(id);
    if (!prefab) continue;
    try {
      trustedPrefabTemplateFor(prefab, catalog);
      const model = prefabFlightModel(prefab, catalog);
      if (!model.station) throw Error("no pilot station");
      if (!model.fittings.some((f) => f.role === "actuator"))
        throw Error("no thrust");
    } catch (e) {
      return `New ${prefab.name} ships could not be issued with this change: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return null;
}

export const componentSnapshotProjection = t.row(
  "VisibleComponentCatalogSnapshot",
  {
    pin: t.string().primaryKey(),
    baseRevision: t.u32(),
    snapshotJson: t.string(),
    sha256: t.string(),
  },
);
/** Published component content referenced by ship pins; the client composes the same catalogue. */
export function componentSnapshotsView(ctx: { db: Db }) {
  return [...ctx.db.componentCatalogSnapshot.iter()].map(
    ({ pin, baseRevision, snapshotJson, sha256 }) => ({
      pin,
      baseRevision,
      snapshotJson,
      sha256,
    }),
  );
}
