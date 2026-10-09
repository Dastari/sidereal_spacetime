/** Bounded, additive operator installation. Never boards or replaces a character. */
import { SenderError } from "spacetimedb/server";
import type { InferSchema, ReducerCtx } from "spacetimedb/server";
import type world from "./index";
import { FEDERATION_FLEET } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  neighboringSpatialCells,
  spatialCell,
} from "@sidereal/sim/spatial-cells";
import { prefabFormationBounds } from "@sidereal/sim/fleet-formation-bounds";
import { shipPrefabBinding } from "./ship-logic";
import { prefabShipSpawner } from "./ship-assign";
import { FEDERATION_FLEET_PIN_SET } from "./faction-fleet-pins";
import {
  archiveJson,
  priorOperation,
  requireShipOperator,
} from "./ship-operator";

type Context = ReducerCtx<InferSchema<typeof world>>;
export interface FleetFootprint {
  x: number;
  y: number;
  heading: number;
  halfX: number;
  halfY: number;
}
const GAP_M = 8;

/** Conservative rotated hull bounds, with access housings/engines and EVA clearance. */
export function fleetFootprintsSeparated(
  a: FleetFootprint,
  b: FleetFootprint,
): boolean {
  for (const heading of [
    a.heading,
    a.heading + Math.PI / 2,
    b.heading,
    b.heading + Math.PI / 2,
  ]) {
    const nx = Math.cos(heading),
      ny = Math.sin(heading);
    const radius = (p: FleetFootprint) =>
      Math.abs(Math.cos(p.heading) * nx + Math.sin(p.heading) * ny) *
        (p.halfX + GAP_M / 2) +
      Math.abs(-Math.sin(p.heading) * nx + Math.cos(p.heading) * ny) *
        (p.halfY + GAP_M / 2);
    if (Math.abs((a.x - b.x) * nx + (a.y - b.y) * ny) >= radius(a) + radius(b))
      return true;
  }
  return false;
}

export function planFleetFormation(
  source: Pick<FleetFootprint, "x" | "y" | "heading">,
  sizes: readonly { halfX: number; halfY: number }[],
  obstacles: readonly FleetFootprint[],
): FleetFootprint[] {
  if (
    sizes.length !== 6 ||
    obstacles.length > 512 ||
    ![source.x, source.y, source.heading].every(Number.isFinite) ||
    sizes.some(
      (p) => ![p.halfX, p.halfY].every((n) => Number.isFinite(n) && n > 0),
    ) ||
    obstacles.some(
      (p) =>
        ![p.x, p.y, p.heading, p.halfX, p.halfY].every(Number.isFinite) ||
        p.halfX <= 0 ||
        p.halfY <= 0,
    )
  )
    throw Error("Invalid bounded fleet formation");
  const placed: FleetFootprint[] = [];
  for (let i = 0; i < sizes.length; i++) {
    let accepted: FleetFootprint | undefined;
    for (const distance of [65, 80, 100, 120]) {
      for (let step = 0; step < 36; step++) {
        const angle =
          source.heading + (i * Math.PI) / 3 + (step * Math.PI) / 18;
        const p = {
          ...sizes[i],
          x: source.x + Math.cos(angle) * distance,
          y: source.y + Math.sin(angle) * distance,
          heading: source.heading,
        };
        if (Math.abs(p.x) > 1e9 || Math.abs(p.y) > 1e9) continue;
        if (
          [...obstacles, ...placed].every((q) => fleetFootprintsSeparated(p, q))
        ) {
          accepted = p;
          break;
        }
      }
      if (accepted) break;
    }
    if (!accepted)
      throw Error("No safe nearby fleet formation; no ships installed");
    placed.push(accepted);
  }
  return placed;
}

export function installFactionFleet(
  ctx: Context,
  args: {
    operationId: string;
    characterId: string;
    expectedShipId: string;
    expectedInstanceRevision: bigint;
    expectedFleetPinSet: string;
  },
) {
  requireShipOperator(ctx);
  const request = archiveJson(args);
  if (
    priorOperation(
      ctx.db,
      ctx.sender,
      args.operationId,
      "install-faction-fleet",
      request,
    )
  )
    return;
  if (args.expectedFleetPinSet !== FEDERATION_FLEET_PIN_SET)
    throw new SenderError("Fleet design revision changed");
  const actor = ctx.db.character.id.find(args.characterId);
  const source = actor && ctx.db.shipWorldMotion.shipId.find(actor.shipId);
  const instance = actor && ctx.db.constructionInstance.id.find(actor.shipId);
  const location =
    actor && ctx.db.constructionLocation.characterId.find(actor.id);
  const admission = actor && ctx.db.worldAdmission.characterId.find(actor.id);
  const ship = actor && ctx.db.ship.id.find(actor.shipId);
  if (
    !actor ||
    !source ||
    !instance ||
    !location ||
    !admission ||
    !ship ||
    actor.shipId !== args.expectedShipId ||
    instance.revision !== args.expectedInstanceRevision ||
    location.instanceId !== actor.shipId ||
    admission.shipId !== actor.shipId ||
    admission.systemId !== source.systemId ||
    !ship.owner.isEqual(actor.owner) ||
    !instance.owner.isEqual(actor.owner) ||
    !admission.owner.isEqual(actor.owner) ||
    ctx.db.evaBody.characterId.find(actor.id) ||
    ctx.db.retiredIdentity.source.find(actor.owner)
  )
    throw new SenderError("Current owned ship occupancy changed");
  if (
    ![
      source.x,
      source.y,
      source.heading,
      source.vx,
      source.vy,
      source.omega,
    ].every(Number.isFinite) ||
    Math.hypot(source.vx, source.vy) > 0.1 ||
    Math.abs(source.omega) > 0.001
  )
    throw new SenderError(
      "Park the current ship before installing its nearby fleet",
    );
  const obstacles: FleetFootprint[] = [];
  let foundSource = false;
  for (const cell of neighboringSpatialCells(spatialCell(source)))
    for (const motion of ctx.db.shipWorldMotion.by_cell.filter([
      source.systemId,
      BigInt(cell.cellX),
      BigInt(cell.cellY),
    ])) {
      if (obstacles.length >= 512)
        throw new SenderError("Nearby fleet placement budget exceeded");
      const binding = shipPrefabBinding(ctx.db, motion.shipId);
      if (!binding)
        throw new SenderError("Nearby ship lacks qualified formation geometry");
      const bounds = prefabFormationBounds(binding.doc, binding.catalog).ship;
      obstacles.push({
        ...motion,
        halfX: Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])),
        halfY: Math.max(Math.abs(bounds.min[1]), Math.abs(bounds.max[1])),
      });
      if (motion.shipId === source.shipId) foundSource = true;
    }
  if (!foundSource)
    throw new SenderError("Source ship missing from current placement index");
  const sizes = FEDERATION_FLEET.map((doc) => {
    const bounds = prefabFormationBounds(
      doc,
      defaultPrefabComponentCatalog(),
    ).ship;
    return {
      halfX: Math.max(Math.abs(bounds.min[0]), Math.abs(bounds.max[0])),
      halfY: Math.max(Math.abs(bounds.min[1]), Math.abs(bounds.max[1])),
    };
  });
  const formation = planFleetFormation(source, sizes, obstacles);
  const before = archiveJson({
    actor,
    location,
    admission,
    input: ctx.db.input.characterId.find(actor.id),
  });
  const installed = FEDERATION_FLEET.map((doc, i) => {
    const spawner = prefabShipSpawner(doc.id);
    if (!spawner || spawner.legacy)
      throw Error("Qualified fleet spawner missing");
    const result = spawner.spawn(ctx, actor, {
      name: "",
      boardActor: false,
      pose: { kind: "at", systemId: source.systemId, ...formation[i] },
    });
    return { prefabId: doc.id, ...result, pose: formation[i] };
  });
  const after = archiveJson({
    actor: ctx.db.character.id.find(actor.id),
    location: ctx.db.constructionLocation.characterId.find(actor.id),
    admission: ctx.db.worldAdmission.characterId.find(actor.id),
    input: ctx.db.input.characterId.find(actor.id),
  });
  if (before !== after)
    throw Error("Additive fleet installation changed the current character");
  ctx.db.shipOperatorOperation.insert({
    operationId: args.operationId,
    principal: ctx.sender,
    kind: "install-faction-fleet",
    request,
    summaryJson: archiveJson({
      installed,
      sourceShipId: source.shipId,
      fleetPinSet: FEDERATION_FLEET_PIN_SET,
    }),
    createdMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}
