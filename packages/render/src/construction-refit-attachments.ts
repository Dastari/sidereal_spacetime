import type { PartPlacement, PartAsset } from "@sidereal/content/assembly";
import { REFIT_FUEL_ATTACHMENT } from "@sidereal/sim/wayfarer-refit-audit";

export interface RefitAttachmentVisual {
  id: string;
  instanceId: string;
  deckId: string;
  assetId: string;
  assetSha256: string;
  x: number;
  y: number;
  z: number;
}

/** Accepted sidecar placements never modify the immutable authored document. */
export function refitAttachmentPlacements(
  attachments: readonly RefitAttachmentVisual[],
  instanceId: string,
  deckId: string,
  assets: readonly PartAsset[],
  existingIds: readonly string[],
): PartPlacement[] {
  const seen = new Set(existingIds);
  if (attachments.length > 1) throw Error("Unsupported refit attachment count");
  return attachments.map((row) => {
    const pin = REFIT_FUEL_ATTACHMENT;
    const asset = assets.find((a) => a.id === row.assetId);
    if (
      !row.id ||
      seen.has(row.id) ||
      row.instanceId !== instanceId ||
      row.deckId !== deckId ||
      row.assetId !== pin.assetId ||
      row.assetSha256 !== pin.glbSha256 ||
      asset?.visual?.sha256 !== pin.glbSha256 ||
      [row.x, row.y, row.z].some((v, i) => v !== pin.positionM[i])
    )
      throw Error(
        "Refit attachment does not match the accepted native binding",
      );
    seen.add(row.id);
    return {
      id: row.id,
      assetId: row.assetId,
      position: [row.x, row.y, row.z],
      rotation: 0,
      flipped: false,
      removedCells: [],
    };
  });
}
