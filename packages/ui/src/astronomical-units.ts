/** Astronomical presentation only. Never use these values in reducers or rendering.
 * Ship/character/asteroid dimensions and construction measurements remain metres.
 * See docs/adr/ADR-20260922-map-interaction-scale.md.
 */
export const ASTRONOMICAL_METRES_PER_GAMEPLAY_METRE = 100_000;
export const ASTRONOMICAL_KM_PER_GAMEPLAY_METRE =
  ASTRONOMICAL_METRES_PER_GAMEPLAY_METRE / 1000;
export const REFERENCE_FLIGHT_SPEED = 30; // gameplay m/s
export const toAstronomicalKm = (gameplayMetres: number) =>
  gameplayMetres * ASTRONOMICAL_KM_PER_GAMEPLAY_METRE;
export const fromAstronomicalKm = (kilometres: number) =>
  kilometres / ASTRONOMICAL_KM_PER_GAMEPLAY_METRE;
export function formatAstronomicalDistance(gameplayMetres: number) {
  if (!Number.isFinite(gameplayMetres)) return "Unavailable";
  let value = gameplayMetres * ASTRONOMICAL_METRES_PER_GAMEPLAY_METRE;
  const units = ["m", "km", "million km", "billion km", "trillion km"];
  let index = 0;
  const divisors = [1000, 1e6, 1000, 1000];
  while (
    index < divisors.length &&
    Math.abs(value) >= divisors[index] - 0.005
  ) {
    value /= divisors[index++];
  }
  return `${Number(value.toFixed(2)).toLocaleString("en", { maximumFractionDigits: 2 })} ${units[index]}`;
}
export const formatAstronomicalSpeed = (gameplayMetresPerSecond: number) =>
  Number.isFinite(gameplayMetresPerSecond)
    ? `${formatAstronomicalDistance(gameplayMetresPerSecond)}/s`
    : "Unavailable";
