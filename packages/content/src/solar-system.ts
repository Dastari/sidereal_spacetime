import authored from "./solar-system.json";
/** Owner-scaled static celestial chart, not N-body mechanics. World XY metres;
 * negative renderer height supplies scenic depth below the playable plane. */
export const SOLAR_SYSTEM = authored;
export const SOLAR_SYSTEM_BODY_LIMIT = 64;
export const SOLAR_LEGACY_KEY_REPLACEMENTS: Readonly<Record<string, string>> = {
  "ivory-star": "helion",
  "companion-moon": "basalt-rock-moon-1",
  "ember-garden": "pelagic",
};
export function solarBodyForLegacyKey(key: string) {
  return SOLAR_SYSTEM.bodies.find(
    (body) => body.key === (SOLAR_LEGACY_KEY_REPLACEMENTS[key] ?? key),
  );
}
