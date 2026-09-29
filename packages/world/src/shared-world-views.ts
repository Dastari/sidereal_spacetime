import { SOLAR_SYSTEM_BODY_LIMIT } from "@sidereal/content/shared-system";
import {
  acceptedPassengerAccess,
  type PassengerAccessDatabase,
} from "./construction-passenger-access";
import {
  hasAcceptedAuthoredFlight,
  type AcceptedFlightContext,
} from "./construction-flight-views";
import { t } from "spacetimedb/server";
import type { Identity } from "spacetimedb";
import {
  neighboringSpatialCells,
  spatialCell,
  withinSpaceDiscovery,
} from "@sidereal/sim/spatial-cells";
import { TRUSTED_PREFAB_BLUEPRINT_PREFIX } from "@sidereal/sim/game-ship-access";
import {
  prefabExteriorAssetId,
  UNPUBLISHED_EXTERIOR_ID,
} from "@sidereal/sim/ship-exterior";
import type {
  SharedWorldReadDatabase,
  ShipMotionRow,
  BodyMotionRow,
  SystemBodyRow,
  AdmissionRow,
} from "./shared-world";
export interface SharedViewContext {
  sender: Identity;
  db: SharedWorldReadDatabase &
    PassengerAccessDatabase &
    AcceptedFlightContext["db"] & {
      ship: {
        id: {
          find(id: string): { id: string; name: string } | null | undefined;
        };
      };
      character: {
        id: {
          find(id: string):
            | {
                id: string;
                owner: Identity;
                shipId: string;
                connected: boolean;
              }
            | null
            | undefined;
        };
      };
      constructionLocation: { characterId: { find(id: string): unknown } };
      authSession: {
        by_owner: { filter(owner: Identity): Iterable<{ game: boolean }> };
      };
      retiredIdentity: { source: { find(owner: Identity): unknown } };
    };
}
export type PublishedExteriorResolver = (
  shipId: string,
) =>
  { publishedExteriorAssetId: string; appearanceRevision: bigint } | undefined;

/** Private rows that name a ship's hull (read inside views only; never delivered). */
export interface ExteriorReadDatabase {
  gameShipAccess: {
    shipId: {
      find(id: string): { instanceId: string } | null | undefined;
    };
  };
  constructionInstance: {
    id: {
      find(id: string): { blueprintId: string } | null | undefined;
    };
  };
}
/** `trusted-prefab:<prefabId>:r<revision>` (prefab-ship-authority.ts `blueprintRevisionId`). */
const TRUSTED_PREFAB_BLUEPRINT = new RegExp(
  "^" +
    TRUSTED_PREFAB_BLUEPRINT_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
    "([a-z0-9][a-z0-9.-]{2,63}):r([0-9]{1,9})$",
);
/**
 * The public exterior of a perceived ship (wiki `Architecture/Visibility and Interest
 * Management`, hard rule 6). A game-owned ship built from a trusted developer prefab is named by
 * its blueprint pin only: `prefab:<prefabId>` plus the prefab document revision. Nothing from the
 * instance (layout document, rooms, modules, containers, items, crew, damage) is disclosed; the
 * client draws the exterior of the published developer prefab. Any other ship is "unpublished"
 * and is drawn as a marker.
 */
export function publishedShipExterior(
  db: ExteriorReadDatabase,
  shipId: string,
): { publishedExteriorAssetId: string; appearanceRevision: bigint } {
  const access = db.gameShipAccess.shipId.find(shipId);
  const instance = access
    ? db.constructionInstance.id.find(access.instanceId)
    : undefined;
  const match = instance
    ? TRUSTED_PREFAB_BLUEPRINT.exec(instance.blueprintId)
    : null;
  return match
    ? {
        publishedExteriorAssetId: prefabExteriorAssetId(match[1]),
        appearanceRevision: BigInt(match[2]),
      }
    : {
        publishedExteriorAssetId: UNPUBLISHED_EXTERIOR_ID,
        appearanceRevision: 0n,
      };
}
/**
 * Server work bound of one ship-contact evaluation: motion rows examined in the observer's nine
 * cells. It is far above any physical density (hulls cannot overlap) and it only bounds work: past
 * it the evaluation keeps what it has found (centre cell first) and always the observer's own
 * ship. It never returns nothing, and it is not a visibility cap (hard rule 5).
 */
export const SHIP_CONTACT_CANDIDATE_BUDGET = 4096;
const motionFields = {
  systemId: t.string(),
  cellX: t.i64(),
  cellY: t.i64(),
  x: t.f64(),
  y: t.f64(),
  vx: t.f64(),
  vy: t.f64(),
  heading: t.f64(),
  omega: t.f64(),
  serverTick: t.u64(),
};
export const visibleShipMotionProjection = t.row("SharedShipMotionProjection", {
  shipId: t.string().primaryKey(),
  ...motionFields,
});
export const visibleBodyMotionProjection = t.row("SharedBodyMotionProjection", {
  bodyId: t.string().primaryKey(),
  ...motionFields,
});
export const visibleShipDescriptionProjection = t.row(
  "SharedShipDescriptionProjection",
  {
    shipId: t.string().primaryKey(),
    publishedExteriorAssetId: t.string(),
    appearanceRevision: t.u64(),
    displayName: t.string(),
  },
);
export const visibleBodyDescriptionProjection = t.row(
  "SharedBodyDescriptionProjection",
  {
    bodyId: t.string().primaryKey(),
    kind: t.string(),
    appearance: t.string(),
    seed: t.u32(),
    radius: t.f64(),
    height: t.f64(),
  },
);
export const ownWorldAdmissionProjection = t.row("SharedAdmissionProjection", {
  characterId: t.string().primaryKey(),
  shipId: t.string(),
  systemId: t.string(),
  revision: t.u64(),
});
function limited<T>(rows: Iterable<T>, max: number): T[] | undefined {
  const result: T[] = [];
  for (const row of rows) {
    if (result.length === max) return undefined;
    result.push(row);
  }
  return result;
}
function game(ctx: SharedViewContext): boolean {
  // Views lack a wall clock. Existing admission expiry reducer removes expired
  // sessions; root must preserve that scheduler and additionally use auth.gameView.
  return (
    !ctx.db.retiredIdentity.source.find(ctx.sender) &&
    !!limited(ctx.db.authSession.by_owner.filter(ctx.sender), 64)?.some(
      (s) => s.game,
    )
  );
}
function admission(ctx: SharedViewContext): AdmissionRow | undefined {
  if (!game(ctx)) return undefined;
  const rows = limited(ctx.db.worldAdmission.by_owner.filter(ctx.sender), 1);
  // Current account contract selects one character. Do not arbitrarily choose the
  // first if a future multi-character account needs an explicit selection row.
  if (rows?.length !== 1) return undefined;
  const row = rows[0],
    actor = ctx.db.character.id.find(row.characterId);
  if (
    !row.owner.isEqual(ctx.sender) ||
    !actor?.connected ||
    !actor.owner.isEqual(ctx.sender) ||
    actor.shipId !== row.shipId ||
    (ctx.db.constructionLocation.characterId.find(actor.id) &&
      !hasAcceptedAuthoredFlight(ctx, actor) &&
      !acceptedPassengerAccess(ctx, actor.id).readInterior) ||
    !ctx.db.worldSystem.id.find(row.systemId)
  )
    return undefined;
  return row;
}
/**
 * The admitted viewer's discovery centre: their EVA body while outside a ship (EVA milestone 1),
 * otherwise their ship. `center` stays the admitted ship's motion row (always visible to its own
 * character); `point` is where discovery is measured from.
 */
export function spaceObserver(ctx: SharedViewContext) {
  const admitted = admission(ctx);
  if (!admitted) return undefined;
  const center = ctx.db.shipWorldMotion.shipId.find(admitted.shipId);
  if (!center || center.systemId !== admitted.systemId) return undefined;
  const eva = ctx.db.evaBody?.characterId.find(admitted.characterId);
  const point =
    eva && eva.systemId === admitted.systemId
      ? { x: eva.x, y: eva.y }
      : { x: center.x, y: center.y };
  try {
    return {
      admitted,
      center,
      point,
      cells: neighboringSpatialCells(spatialCell(point)),
    };
  } catch {
    return undefined;
  }
}
const observer = spaceObserver;
/** Caller-supplied SQL never participates in these authority predicates. */
function shipContacts(ctx: SharedViewContext): ShipMotionRow[] {
  const origin = observer(ctx);
  if (!origin) return [];
  const found = new Map<string, ShipMotionRow>();
  let examined = 0;
  // Centre cell first, so a work-bound overflow keeps the nearest contacts (never nothing).
  const [cx, cy] = [origin.cells[4].cellX, origin.cells[4].cellY];
  const cells = [...origin.cells].sort(
    (a, b) =>
      Math.abs(a.cellX - cx) +
      Math.abs(a.cellY - cy) -
      (Math.abs(b.cellX - cx) + Math.abs(b.cellY - cy)),
  );
  scan: for (const cell of cells)
    for (const motion of ctx.db.shipWorldMotion.by_cell.filter([
      origin.admitted.systemId,
      BigInt(cell.cellX),
      BigInt(cell.cellY),
    ])) {
      if (++examined > SHIP_CONTACT_CANDIDATE_BUDGET) break scan;
      if (motion.systemId !== origin.admitted.systemId) continue;
      try {
        if (withinSpaceDiscovery(origin.point, motion))
          found.set(motion.shipId, motion);
      } catch {
        // An invalid row is skipped; it never blinds the observer to every other contact.
        continue;
      }
    }
  found.set(origin.center.shipId, origin.center);
  return [...found.values()].sort((a, b) =>
    a.shipId < b.shipId ? -1 : a.shipId > b.shipId ? 1 : 0,
  );
}
function bodyContacts(
  ctx: SharedViewContext,
): { body: SystemBodyRow; motion: BodyMotionRow }[] {
  const origin = observer(ctx);
  if (!origin) return [];
  const found = new Map<
    string,
    { body: SystemBodyRow; motion: BodyMotionRow }
  >();
  let examined = 0;
  for (const cell of origin.cells)
    for (const motion of ctx.db.bodyWorldMotion.by_cell.filter([
      origin.admitted.systemId,
      BigInt(cell.cellX),
      BigInt(cell.cellY),
    ])) {
      if (++examined > SOLAR_SYSTEM_BODY_LIMIT) return [];
      const body = ctx.db.systemBody.id.find(motion.bodyId);
      if (
        !body ||
        body.systemId !== origin.admitted.systemId ||
        motion.systemId !== body.systemId
      )
        continue;
      try {
        if (withinSpaceDiscovery(origin.point, motion))
          found.set(body.id, { body, motion });
      } catch {
        return [];
      }
    }
  const descriptions = limited(
    ctx.db.systemBody.by_system.filter(origin.admitted.systemId),
    SOLAR_SYSTEM_BODY_LIMIT,
  );
  if (!descriptions) return [];
  for (const body of descriptions)
    if (body.charted && body.systemId === origin.admitted.systemId) {
      const motion = ctx.db.bodyWorldMotion.bodyId.find(body.id);
      if (motion?.systemId === body.systemId)
        found.set(body.id, { body, motion });
    }
  return [...found.values()].sort((a, b) =>
    a.body.id < b.body.id ? -1 : a.body.id > b.body.id ? 1 : 0,
  );
}
function projectMotion(m: ShipMotionRow | BodyMotionRow) {
  return {
    systemId: m.systemId,
    cellX: m.cellX,
    cellY: m.cellY,
    x: m.x,
    y: m.y,
    vx: m.vx,
    vy: m.vy,
    heading: m.heading,
    omega: m.omega,
    serverTick: m.serverTick,
  };
}
export function visibleShipMotion(ctx: SharedViewContext) {
  return shipContacts(ctx).map((m) => ({
    shipId: m.shipId,
    ...projectMotion(m),
  }));
}
export function visibleShipDescriptions(
  ctx: SharedViewContext,
  resolve: PublishedExteriorResolver,
) {
  return shipContacts(ctx).flatMap((m) => {
    const ship = ctx.db.ship.id.find(m.shipId),
      asset = resolve(m.shipId);
    return ship && asset
      ? [
          {
            shipId: m.shipId,
            publishedExteriorAssetId: asset.publishedExteriorAssetId,
            appearanceRevision: asset.appearanceRevision,
            displayName: ship.name,
          },
        ]
      : [];
  });
}
export function visibleBodyMotion(ctx: SharedViewContext) {
  return bodyContacts(ctx).map(({ body, motion }) => ({
    bodyId: body.id,
    ...projectMotion(motion),
  }));
}
export function visibleBodyDescriptions(ctx: SharedViewContext) {
  return bodyContacts(ctx).map(({ body }) => ({
    bodyId: body.id,
    kind: body.kind,
    appearance: body.appearance,
    seed: body.seed,
    radius: body.radius,
    height: body.height,
  }));
}
export function ownWorldAdmission(ctx: SharedViewContext) {
  const row = admission(ctx);
  return row
    ? [
        {
          characterId: row.characterId,
          shipId: row.shipId,
          systemId: row.systemId,
          revision: row.revision,
        },
      ]
    : [];
}
