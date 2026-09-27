import { REFERENCE_FLIGHT_SPEED } from "@sidereal/ui/astronomical-units";
const number = (n: number) =>
  Number(n.toFixed(2)).toLocaleString("en", { maximumFractionDigits: 2 });
export { formatAstronomicalDistance as formatDistance } from "@sidereal/ui/astronomical-units";
export function formatTravelTime(
  distance: number,
  speed = REFERENCE_FLIGHT_SPEED,
) {
  if (!Number.isFinite(distance) || !Number.isFinite(speed) || speed <= 0)
    return "Unavailable";
  const seconds = Math.max(0, distance) / speed;
  const units: [[number, string], ...[number, string][]] = [
    [31557600, "y"],
    [86400, "d"],
    [3600, "h"],
    [60, "min"],
    [1, "s"],
  ];
  const [size, unit] = units.find(([size]) => seconds >= size) ?? units.at(-1)!;
  return `${number(seconds / size)} ${unit}`;
}
/** A short analytic arc, never an entire giant offscreen circle. */
export function orbitLabelPath(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  view?: { width: number; height: number },
) {
  if (![cx, cy, radius, angle].every(Number.isFinite) || radius < 160)
    return "";
  const half = Math.min(1, 190 / radius),
    reverse = Math.sin(angle) > 0;
  if (
    view &&
    Array.from({ length: 9 }, (_, i) => angle - half + (2 * half * i) / 8).some(
      (a) => {
        const x = cx + radius * Math.cos(a),
          y = cy + radius * Math.sin(a);
        return x < 20 || x > view.width - 20 || y < 24 || y > view.height - 24;
      },
    )
  )
    return "";
  const a = angle + (reverse ? half : -half),
    b = angle + (reverse ? -half : half);
  return `M ${cx + radius * Math.cos(a)} ${cy + radius * Math.sin(a)} A ${radius} ${radius} 0 0 ${reverse ? 0 : 1} ${cx + radius * Math.cos(b)} ${cy + radius * Math.sin(b)}`;
}
