import {
  FURNISHING_DEFAULT,
  readFurnishingOverrides,
} from "@sidereal/content/wayfarer-furnishings";
import { createOperationId } from "./operation-id";
export interface FurnishingRequest {
  instanceId: string;
  sourceObjectId: string;
  action: string;
  dx: number;
  dy: number;
  yaw: number;
  snap: boolean;
  expectedRevision: bigint;
  operationId: string;
}
export function furnishingRequest(
  instance: {
    id: string;
    furnishingsJson?: string;
    furnishingRevision?: bigint;
  },
  placementId: string,
  action: "move" | "delete" | "snap",
  proposal?: { dx: number; dy: number; yaw: number; snap: boolean },
): FurnishingRequest {
  if (!placementId.startsWith("prefab:socket:"))
    throw Error("Select a furnishing to arrange");
  const sourceObjectId = placementId.slice("prefab:socket:".length),
    old =
      readFurnishingOverrides(instance.furnishingsJson)[sourceObjectId] ??
      FURNISHING_DEFAULT;
  return {
    instanceId: instance.id,
    sourceObjectId,
    action,
    dx: proposal?.dx ?? old.dx,
    dy: proposal?.dy ?? old.dy,
    yaw: proposal?.yaw ?? old.yaw,
    snap: proposal?.snap ?? (action === "snap" ? !old.snap : old.snap),
    expectedRevision: instance.furnishingRevision ?? 0n,
    operationId: createOperationId(),
  };
}
