import type { Motion } from "./index";
import type { MassProperties } from "./ifcs";

/** The persisted frame belongs to authored geometry. Its velocity is the
 * velocity of that frame origin; rigid-body integration belongs to the COM. */
function worldCentroid(heading: number, mass: MassProperties) {
  const c = Math.cos(heading),
    s = Math.sin(heading);
  if (![heading, mass.centerX, mass.centerY].every(Number.isFinite))
    throw new Error("Invalid flight frame centroid");
  return {
    x: c * mass.centerX - s * mass.centerY,
    y: s * mass.centerX + c * mass.centerY,
  };
}
export function toCenterOfMassMotion(
  frame: Motion,
  mass: MassProperties,
): Motion {
  const offset = worldCentroid(frame.heading, mass);
  return {
    ...frame,
    x: frame.x + offset.x,
    y: frame.y + offset.y,
    vx: frame.vx - frame.omega * offset.y,
    vy: frame.vy + frame.omega * offset.x,
  };
}
export function toAuthoredFrameMotion(
  body: Motion,
  mass: MassProperties,
): Motion {
  const offset = worldCentroid(body.heading, mass);
  return {
    ...body,
    x: body.x - offset.x,
    y: body.y - offset.y,
    vx: body.vx + body.omega * offset.y,
    vy: body.vy - body.omega * offset.x,
  };
}
