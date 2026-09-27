/** Plan colours: room types, mount families and theme slot swatches. */
import type { RoomTypeId } from "@sidereal/content/construction-grammar";

export const ROOM_COLOURS: Record<RoomTypeId, string> = {
  bridge: "#2b6590",
  cockpit: "#2b6590",
  quarters: "#6a4a36",
  lounge: "#6a3a5c",
  galley: "#6b5a33",
  medbay: "#2f6a64",
  hydro: "#3b6b33",
  engineering: "#34507e",
  cargo: "#6a5829",
  workshop: "#5a4d40",
  armory: "#6b3030",
  corridor: "#34405a",
  airlock: "#7d5724",
};

const MOUNT_COLOURS: Record<string, string> = {
  propulsion: "#ff9f4a",
  weapon: "#ff5f6d",
  defense: "#6fd3ff",
  sensor: "#a3f07f",
  utility: "#ffd166",
  power: "#c79bff",
  thermal: "#7ae0c8",
  structure: "#dfe7ee",
  "cargo-door": "#dfe7ee",
  ammunition: "#f2b264",
  interior: "#9fb7ff",
  console: "#8fd0ff",
};

export const mountColour = (category: string | undefined) => MOUNT_COLOURS[(category ?? "").split(".")[0]] ?? "#e6edf3";

export const CATEGORY_LABELS: Record<string, string> = {
  propulsion: "Propulsion",
  weapon: "Weapons",
  defense: "Defence",
  sensor: "Sensors",
  utility: "Utility",
  power: "Power",
  thermal: "Thermal",
  structure: "Openings and hatches",
  "cargo-door": "Cargo doors",
  ammunition: "Ammunition",
  interior: "Interior systems",
  console: "Consoles",
};

/** Linear RGB (theme data) to an sRGB hex swatch. */
export function linearToHex([r, g, b]: readonly [number, number, number]): string {
  const c = (v: number) => {
    const x = Math.max(0, Math.min(1, v));
    const s = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(s * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${c(r)}${c(g)}${c(b)}`;
}
