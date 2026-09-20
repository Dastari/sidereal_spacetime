import { spaceRegion } from "@sidereal/sim/space-background";
import {
  t,
  SenderError,
  type ReducerCtx,
  type ViewCtx,
  type InferSchema,
} from "spacetimedb/server";
import type world from "./index";
import {
  mapBodyName,
  mapBodyMetadata,
  MAP_WORKSPACE,
  newSystemMap,
  type MapBody,
  type SystemMapDocument,
} from "@sidereal/content/system-map";
import { readSystemMap, generateField } from "@sidereal/sim/system-map";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import {
  neighboringSpatialCells,
  withinSpaceDiscovery,
  spatialCell,
} from "@sidereal/sim/spatial-cells";
import { requireGrant, operation, receipt } from "./construction";
type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
export const mapProjection = t.row("SystemMapProjection", {
  id: t.string().primaryKey(),
  revision: t.u64(),
  documentJson: t.string(),
  sourceFingerprint: t.string(),
});
export const mapShipProjection = t.row("MapShipProjection", {
  shipId: t.string().primaryKey(),
  systemId: t.string(),
  name: t.string(),
  x: t.f64(),
  y: t.f64(),
  heading: t.f64(),
  serverTick: t.u64(),
});
export const systemScapeProjection = t.row("SystemScapeProjection", {
  id: t.string().primaryKey(),
  backgroundId: t.string(),
  regionsJson: t.string(),
});
function canRead(ctx: ReadContext) {
  return [...ctx.db.constructionGrant.by_principal.filter(ctx.sender)].some(
    (g) =>
      g.workspaceId === MAP_WORKSPACE &&
      g.capability === "draft.read" &&
      !g.revoked,
  );
}
function liveBodies(ctx: ReadContext, systemId: string): MapBody[] {
  return [...ctx.db.systemBody.by_system.filter(systemId)]
    .filter((b) => b.kind !== "asteroid")
    .map((b) => {
      const m = ctx.db.bodyWorldMotion.bodyId.find(b.id);
      if (!m || m.systemId !== systemId)
        throw Error("Missing celestial motion");
      return {
        ...mapBodyMetadata(b.id),
        appearance: b.appearance,
        seed: b.seed,
        id: b.id,
        name: mapBodyName(b.id, b.authoredKey),
        kind: b.kind,
        radius: b.radius,
        x: m.x,
        y: m.y,
        height: b.height,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
function sourceFingerprint(ctx: ReadContext, systemId: string) {
  return constructionHash(JSON.stringify(liveBodies(ctx, systemId)));
}
function projection(ctx: ReadContext, id: string) {
  const stored = ctx.db.systemMapDefinition.id.find(id),
    bodies = liveBodies(ctx, id);
  const doc: SystemMapDocument = stored
    ? JSON.parse(stored.documentJson)
    : { ...newSystemMap(id, bodies), name: "Helion system" };
  doc.bodies = bodies.map((b) => ({
    ...b,
    name: doc.bodies.find((old) => old.id === b.id)?.name ?? b.name,
    parentId:
      doc.bodies.find((old) => old.id === b.id)?.parentId === undefined
        ? b.parentId
        : doc.bodies.find((old) => old.id === b.id)!.parentId,
  }));
  return {
    id,
    revision: stored?.revision ?? 0n,
    documentJson: JSON.stringify(doc),
    sourceFingerprint: sourceFingerprint(ctx, id),
  };
}
export function ownMaps(ctx: ReadContext) {
  if (!canRead(ctx)) return [];
  return [...ctx.db.worldSystem.iter()].map((s) => projection(ctx, s.id));
}
export function ownMapShips(ctx: ReadContext) {
  if (!canRead(ctx)) return [];
  return [...ctx.db.shipWorldMotion.iter()].map((s) => ({
    shipId: s.shipId,
    systemId: s.systemId,
    name: ctx.db.ship.id.find(s.shipId)?.name ?? "Ship",
    x: s.x,
    y: s.y,
    heading: s.heading,
    serverTick: s.serverTick,
  }));
}
export function admittedSystemScapes(ctx: ReadContext) {
  const ids = new Set<string>();
  for (const a of ctx.db.worldAdmission.by_owner.filter(ctx.sender)) {
    const actor = ctx.db.character.id.find(a.characterId),
      ship = ctx.db.shipWorldMotion.shipId.find(a.shipId);
    if (
      actor?.connected &&
      actor.owner.isEqual(ctx.sender) &&
      actor.shipId === a.shipId &&
      ship?.systemId === a.systemId
    )
      ids.add(a.systemId);
  }
  return [...ids].flatMap((id) => {
    const row = ctx.db.systemMapDefinition.id.find(id);
    if (!row) return [];
    const doc = JSON.parse(row.documentJson) as SystemMapDocument;
    // Geometry and public presentation only: no resources, body roster or edit history.
    return [
      {
        id,
        backgroundId: doc.backgroundId,
        regionsJson: JSON.stringify(spaceRegion(doc)),
      },
    ];
  });
}

export function applySystemMap(
  ctx: Context,
  args: {
    documentJson: string;
    expectedRevision: bigint;
    sourceFingerprint: string;
    operationId: string;
  },
) {
  requireGrant(ctx, MAP_WORKSPACE, "draft.read");
  requireGrant(ctx, MAP_WORKSPACE, "draft.write");
  let doc: SystemMapDocument;
  try {
    doc = readSystemMap(args.documentJson);
  } catch (e) {
    throw new SenderError(String(e));
  }
  const old = ctx.db.systemMapDefinition.id.find(doc.id),
    system = ctx.db.worldSystem.id.find(doc.id);
  const op = operation(
    ctx,
    args.operationId,
    {
      kind: "apply-system-map",
      ...args,
      expectedRevision: args.expectedRevision.toString(),
    },
    args.expectedRevision,
    old?.revision ?? 0n,
  );
  if (op.replay) return;
  const bodies = liveBodies(ctx, doc.id);
  if (sourceFingerprint(ctx, doc.id) !== args.sourceFingerprint)
    throw new SenderError("Celestial chart changed; reload the current map");
  if (
    bodies.length !== doc.bodies.length ||
    doc.bodies.some(
      (b) =>
        !bodies.some(
          (old) =>
            old.id === b.id &&
            old.kind === b.kind &&
            old.radius === b.radius &&
            (b.appearance === undefined || old.appearance === b.appearance) &&
            (b.seed === undefined || old.seed === b.seed),
        ),
    )
  )
    throw new SenderError(
      "Celestial identity, type and radius must match the live chart",
    );
  if (!system && [...ctx.db.worldSystem.iter()].length >= 32)
    throw new SenderError("System budget exceeded");
  const ships = [...ctx.db.shipWorldMotion.by_system.filter(doc.id)];
  for (const b of doc.bodies) {
    const prior = bodies.find((p) => p.id === b.id)!;
    if (prior.x === b.x && prior.y === b.y && prior.height === b.height)
      continue;
    if (
      ships.some(
        (s) => Math.hypot(s.x - b.x, s.y - b.y, b.height) < b.radius + 100,
      )
    )
      throw new SenderError("Moved body overlaps a live ship safety area");
  }
  if ([...ctx.db.systemMapEdit.by_system.filter(doc.id)].length >= 128)
    throw new SenderError(
      "System edit history full; operator archival required",
    );
  const beforeJson = system ? projection(ctx, doc.id).documentJson : "";
  const population = doc.fields.flatMap(generateField);
  for (const rock of population)
    if (
      ships.some(
        (s) =>
          Math.hypot(s.x - rock.x, s.y - rock.y, rock.height) <
          rock.radius + 100,
      )
    )
      throw new SenderError("Asteroid field overlaps a live ship safety area");
  if (!system)
    ctx.db.worldSystem.insert({
      id: doc.id,
      seedRevision: 0n,
      seedSha256: "map-authored",
      migrationRevision: 0n,
      lastSimulationTick: 0n,
    });
  for (const b of doc.bodies) {
    const row = ctx.db.systemBody.id.find(b.id)!,
      motion = ctx.db.bodyWorldMotion.bodyId.find(b.id)!,
      cell = spatialCell(b);
    ctx.db.systemBody.id.update({ ...row, height: b.height });
    ctx.db.bodyWorldMotion.bodyId.update({
      ...motion,
      x: b.x,
      y: b.y,
      cellX: BigInt(cell.cellX),
      cellY: BigInt(cell.cellY),
    });
  }
  for (const row of ctx.db.fieldAsteroid.by_system.filter(doc.id))
    ctx.db.fieldAsteroid.id.delete(row.id);
  for (const rock of population) {
    const cell = spatialCell(rock);
    ctx.db.fieldAsteroid.insert({
      id: `${doc.id}:${rock.id}`,
      systemId: doc.id,
      fieldId: rock.fieldId,
      x: rock.x,
      y: rock.y,
      height: rock.height,
      radius: rock.radius,
      seed: rock.seed,
      resourcesJson: JSON.stringify(rock.resources),
      cellX: BigInt(cell.cellX),
      cellY: BigInt(cell.cellY),
    });
  }
  const revision = (old?.revision ?? 0n) + 1n,
    row = { id: doc.id, revision, documentJson: JSON.stringify(doc) };
  if (old) ctx.db.systemMapDefinition.id.update(row);
  else ctx.db.systemMapDefinition.insert(row);
  ctx.db.systemMapEdit.insert({
    id: op.key,
    systemId: doc.id,
    principal: ctx.sender,
    revision,
    beforeJson,
    afterJson: row.documentJson,
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
  receipt(ctx, op.key, op.request, doc.id, revision);
}

export const nearbyFieldProjection = t.row("NearbyFieldAsteroid", {
  id: t.string().primaryKey(),
  systemId: t.string(),
  x: t.f64(),
  y: t.f64(),
  height: t.f64(),
  radius: t.f64(),
  seed: t.u32(),
});
/** Resource occurrences remain private until a future scanning/mining permission contract. */
export function nearbyFieldAsteroids(ctx: ReadContext) {
  const result: {
    id: string;
    systemId: string;
    x: number;
    y: number;
    height: number;
    radius: number;
    seed: number;
  }[] = [];
  for (const admission of ctx.db.worldAdmission.by_owner.filter(ctx.sender)) {
    const actor = ctx.db.character.id.find(admission.characterId),
      ship = ctx.db.shipWorldMotion.shipId.find(admission.shipId);
    if (
      !actor?.connected ||
      actor.shipId !== admission.shipId ||
      !actor.owner.isEqual(ctx.sender) ||
      !ship ||
      ship.systemId !== admission.systemId
    )
      continue;
    for (const cell of neighboringSpatialCells(spatialCell(ship)))
      for (const rock of ctx.db.fieldAsteroid.by_cell.filter([
        ship.systemId,
        BigInt(cell.cellX),
        BigInt(cell.cellY),
      ])) {
        if (withinSpaceDiscovery(ship, rock))
          result.push({
            id: rock.id,
            systemId: rock.systemId,
            x: rock.x,
            y: rock.y,
            height: rock.height,
            radius: rock.radius,
            seed: rock.seed,
          });
      }
  }
  return result.sort((a, b) => a.id.localeCompare(b.id)).slice(0, 128);
}
