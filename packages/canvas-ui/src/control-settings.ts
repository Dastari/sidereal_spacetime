export type SteeringStyle = "cursor" | "keyboard";
export const STEERING_DEFAULT: SteeringStyle = "cursor";
export const STEERING_STORAGE_KEY = "sidereal.controls.steering.v1";
export function readSteeringStyle(
  storage?: Pick<Storage, "getItem">,
): SteeringStyle {
  try {
    return storage?.getItem(STEERING_STORAGE_KEY) === "keyboard"
      ? "keyboard"
      : STEERING_DEFAULT;
  } catch {
    return STEERING_DEFAULT;
  }
}
export function saveSteeringStyle(
  style: SteeringStyle,
  storage?: Pick<Storage, "setItem">,
) {
  try {
    storage?.setItem(STEERING_STORAGE_KEY, style);
  } catch {
    /* Session choice still applies. */
  }
}
