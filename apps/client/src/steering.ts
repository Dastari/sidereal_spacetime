import type { SteeringStyle } from "@sidereal/canvas-ui/control-settings";
import { evaThrustFromKeys } from "./eva";
const clamp = (v: number) => Math.max(-1, Math.min(1, v));
export function cursorShipTurn(
  direction: readonly number[] | undefined,
  omega: number,
  manual: number,
  blocked: boolean,
) {
  if (blocked) return 0;
  if (manual || !direction) return manual;
  const error = Math.atan2(-direction[0], direction[1]);
  return Number.isFinite(error) && Number.isFinite(omega)
    ? clamp(error * 1.5 - omega * 0.8)
    : 0;
}
/** Keyboard heading is a suit facing request, not a client-authored transform. */
export function evaSteering(
  keys: ReadonlySet<string>,
  style: SteeringStyle,
  mode: string,
  heading: number,
  pointerHeading: number | undefined,
  blocked: boolean,
) {
  const shift = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const yaw =
    blocked || shift ? 0 : Number(keys.has("KeyA")) - Number(keys.has("KeyD"));
  const cursor = !blocked && style === "cursor" && pointerHeading !== undefined;
  const active =
    cursor || (style === "keyboard" && mode !== "free" && yaw !== 0);
  const facing = cursor
    ? pointerHeading!
    : active
      ? heading + yaw * 0.8
      : heading;
  const intent = evaThrustFromKeys(
    keys,
    cursor ? facing : heading,
    blocked,
    style === "keyboard",
  );
  return { facing, active, intent };
}

export function steeringHelp(style: SteeringStyle) {
  return style === "cursor"
    ? "Mouse steers · W/S forward/reverse · A/D strafe · X stabilizer · E button · V combat"
    : "W/S forward/reverse · A/D rotate · Shift+A/D strafe · X stabilizer · E button · V combat";
}
