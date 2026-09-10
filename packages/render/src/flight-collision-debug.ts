import { LAB_HULL } from "@sidereal/content/space";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import type { Matrix } from "@babylonjs/core/Maths/math.vector";
import type { DebugCollisionFrame } from "./debug-collision-geometry";

export interface KnownFlightCollisionSource {
  /** Caller identifies its accepted stock installation, never a visual asset ID. */
  kind: "legacy-stock" | "authored" | "unsupported";
  templateSha256?: string;
  /** Authored reviews without accepted flight admission have no flight collider. */
  flightAdmitted?: boolean;
}
/** Presentation-only adapter for the exact current stock authority capsule.
 * Public exterior IDs identify art, not collision, and cannot qualify a source.
 * No native-mesh bounds, walking frame, camera state or server mutation is used.
 * Ship-root world matrix supplies the existing origin-relative position/heading.
 */
export function stockFlightCollisionDebugFrame(input: {
  shipId: string;
  source?: KnownFlightCollisionSource;
  world: Matrix;
}): DebugCollisionFrame | undefined {
  const { shipId, source, world } = input;
  if (!shipId || shipId.length > 128 || !source) return;
  if (
    source.kind !== "legacy-stock" &&
    !(
      source.kind === "authored" &&
      source.templateSha256 === WAYFARER_STARTER.sha256 &&
      source.flightAdmitted === true
    )
  )
    return;
  return {
    id: `flight:${shipId}`,
    scope:
      "Planar flight collision: one stock hull capsule (not deck walking geometry)",
    world,
    frame: {
      shipId,
      deckId: "debug-flight-plane",
      fingerprint: `stock-flight:${LAB_HULL.radius}:${LAB_HULL.halfLength}:${LAB_HULL.longitudinalOffset}`,
      elevationM: 0,
      floors: [],
      obstacles: [],
      segments: [
        {
          id: "stock-flight-capsule",
          a: [0, LAB_HULL.longitudinalOffset - LAB_HULL.halfLength],
          b: [0, LAB_HULL.longitudinalOffset + LAB_HULL.halfLength],
          halfWidthM: LAB_HULL.radius,
        },
      ],
    },
  };
}
