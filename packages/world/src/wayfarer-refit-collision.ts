import { requireQualifiedPreservedFuelMount } from "@sidereal/sim/wayfarer-refit-mount";
import type { DeckCollisionFrame } from "@sidereal/sim/construction-collision";
import { REFIT_FUEL_ATTACHMENT } from "@sidereal/sim/wayfarer-refit-audit";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import type { RefitReadContext } from "./wayfarer-refit-authority";
/** Added explicit floor mount. Exact native source remains unchanged. This fixed
 * conservative1m footprint is solid, nonstacking and cannot be client resized. */
export function addWayfarerRefitCollision(
  ctx: Pick<RefitReadContext, "db">,
  instance: { id: string; revision: bigint },
  deckId: string,
  frame: DeckCollisionFrame,
): DeckCollisionFrame {
  const rows = [
    ...ctx.db.wayfarerRefitAttachment.by_instance.filter(instance.id),
  ].filter((a) => a.deckId === deckId);
  if (!rows.length) return frame;
  if (rows.length !== 1 || instance.revision !== 1n)
    throw Error("Refit attachment qualification changed");
  const a = rows[0]!,
    source = ctx.db.constructionInstance.id.find(instance.id),
    binding = ctx.db.instanceInventoryBinding.placedObjectId.find(a.id),
    container = ctx.db.inventoryContainer.id.find(a.containerId);
  if (
    !source ||
    source.blueprintSha256 !== WAYFARER_STARTER.sha256 ||
    a.assetId !== REFIT_FUEL_ATTACHMENT.assetId ||
    a.assetSha256 !== REFIT_FUEL_ATTACHMENT.glbSha256 ||
    a.x !== -3 ||
    a.y !== 7 ||
    a.z !== 0.1875 ||
    a.revision !== 1n ||
    binding?.containerId !== a.containerId ||
    !container ||
    container.kind !== "liquid" ||
    container.capacityLitres !== 100 ||
    container.maxMassKg !== 80
  )
    throw Error("Exact preserved fuel floor mount required");
  requireQualifiedPreservedFuelMount({
    baseSha256: source.blueprintSha256,
    assetId: a.assetId,
    assetSha256: a.assetSha256,
    x: a.x,
    y: a.y,
    z: a.z,
    capacityLitres: container.capacityLitres,
    maxMassKg: container.maxMassKg,
  });
  const obstacle = {
    id: a.id,
    definitionId: a.assetId,
    vertices: [
      [-3.5, 6.5],
      [-2.5, 6.5],
      [-2.5, 7.5],
      [-3.5, 7.5],
    ] as [number, number][],
  };
  return {
    ...frame,
    obstacles: [...frame.obstacles, obstacle],
    segments: [
      ...frame.segments,
      ...obstacle.vertices.map((p, i) => ({
        id: `refit:${a.id}:${i}`,
        a: p,
        b: obstacle.vertices[(i + 1) % 4]!,
        halfWidthM: 0,
      })),
    ],
  };
}
