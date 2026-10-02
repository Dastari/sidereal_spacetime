/** Isolated candidate descriptor only: no ship/default/catalog registration. */
import { WAYFARER_STUDY_KIT } from "./wayfarer-study-kit";
export const WAYFARER_STUDY_FIXTURE = {
  kind: "completed-cluster-voxel-comparison",
  presentationOnly: true,
  source: WAYFARER_STUDY_KIT,
  rawPlacement: WAYFARER_STUDY_KIT.placement,
  sampledFrame: "global ship-local +X fore,+Y port,+Z up",
  /** Proposed first cut crosses the CORE backer and projecting case, in texels. */
  cutBounds: [-31, 92, -13, -23, 116, 3],
} as const;
