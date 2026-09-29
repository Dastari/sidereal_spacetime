/**
 * Themed hardware cursors for the game canvas (sci-fi HUD: navy halo, cyan edge).
 *
 * They are CSS cursor images, so the operating system draws them with no input lag; nothing
 * trails the pointer. Each is an inline SVG offered at 1x and 2x through image-set(), so the
 * pointer stays crisp on hi-DPI screens. Browsers without image-set() cursor support get the
 * 1x image, and anything without SVG cursor support falls back to the matching CSS keyword.
 */
export type CursorKind =
  "default" | "interact" | "grab" | "not-allowed" | "text";

const NAVY = "#061326",
  DEEP = "#0d2f55",
  CYAN = "#47dfff",
  ICE = "#e9fdff",
  RED = "#ff5a7a";

// Angular pointer with a tail notch; the tip is the hotspot at (3, 2).
const ARROW =
  "M3 2 L3 23.5 L8.6 18.3 L12.6 27 L16.8 25.1 L12.9 16.6 L20.4 16.2 Z";

const BODIES: Record<
  CursorKind,
  { svg: string; hotspot: [number, number]; fallback: string }
> = {
  default: {
    hotspot: [3, 2],
    fallback: "default",
    svg:
      `<path d="${ARROW}" fill="${NAVY}" stroke="${NAVY}" stroke-width="3.4" stroke-linejoin="round"/>` +
      `<path d="${ARROW}" fill="${DEEP}" stroke="${CYAN}" stroke-width="1.5" stroke-linejoin="miter"/>` +
      `<path d="M4.6 6 L4.6 19.6" stroke="${ICE}" stroke-width="1.1" stroke-linecap="square" opacity=".85"/>`,
  },
  interact: {
    hotspot: [3, 2],
    fallback: "pointer",
    svg:
      `<path d="${ARROW}" fill="${NAVY}" stroke="${NAVY}" stroke-width="3.4" stroke-linejoin="round"/>` +
      `<path d="${ARROW}" fill="${CYAN}" stroke="${ICE}" stroke-width="1.4" stroke-linejoin="miter"/>` +
      `<path d="M5 7 L5 18.4 L8.8 14.9" fill="none" stroke="${ICE}" stroke-width="1.2" opacity=".9"/>` +
      // Action brackets beside the tail: this surface responds to a click.
      `<path d="M21 22 v-3 h3 M28 22 v-3 h-3 M21 25 v3 h3 M28 25 v3 h-3" fill="none" stroke="${NAVY}" stroke-width="3"/>` +
      `<path d="M21 22 v-3 h3 M28 22 v-3 h-3 M21 25 v3 h3 M28 25 v3 h-3" fill="none" stroke="${CYAN}" stroke-width="1.4"/>`,
  },
  grab: {
    hotspot: [16, 16],
    fallback: "grabbing",
    svg:
      // Four inward corner brackets clamp a centre diamond: an item is held.
      `<g fill="none" stroke-linecap="square">` +
      `<path d="M6 12 V6 H12 M20 6 H26 V12 M26 20 V26 H20 M12 26 H6 V20" stroke="${NAVY}" stroke-width="4.2"/>` +
      `<path d="M6 12 V6 H12 M20 6 H26 V12 M26 20 V26 H20 M12 26 H6 V20" stroke="${CYAN}" stroke-width="2"/>` +
      `<path d="M9.5 12.5 L12.5 9.5 M22.5 9.5 L19.5 12.5 M22.5 22.5 L19.5 19.5 M9.5 19.5 L12.5 22.5" stroke="${ICE}" stroke-width="1.2" opacity=".85"/>` +
      `</g>` +
      `<path d="M16 11.5 L20.5 16 L16 20.5 L11.5 16 Z" fill="${CYAN}" stroke="${NAVY}" stroke-width="1.6"/>` +
      `<path d="M16 13.8 L18.2 16 L16 18.2 L13.8 16 Z" fill="${ICE}"/>`,
  },
  "not-allowed": {
    hotspot: [3, 2],
    fallback: "not-allowed",
    svg:
      `<path d="${ARROW}" fill="${NAVY}" stroke="${NAVY}" stroke-width="3.4" stroke-linejoin="round"/>` +
      `<path d="${ARROW}" fill="${DEEP}" stroke="#6f8fb0" stroke-width="1.4" stroke-linejoin="miter"/>` +
      `<circle cx="23" cy="23" r="6.4" fill="${NAVY}" stroke="${NAVY}" stroke-width="2.6"/>` +
      `<circle cx="23" cy="23" r="5.2" fill="none" stroke="${RED}" stroke-width="2"/>` +
      `<path d="M19.4 26.6 L26.6 19.4" stroke="${RED}" stroke-width="2"/>`,
  },
  text: {
    hotspot: [16, 16],
    fallback: "text",
    svg:
      `<path d="M12 5 H20 M16 5 V27 M12 27 H20" fill="none" stroke="${NAVY}" stroke-width="4.4" stroke-linecap="square"/>` +
      `<path d="M12 5 H20 M16 5 V27 M12 27 H20" fill="none" stroke="${CYAN}" stroke-width="1.8" stroke-linecap="square"/>` +
      `<path d="M16 8 V24" stroke="${ICE}" stroke-width=".8"/>`,
  },
};

function image(svg: string, scale: number) {
  const size = 32 * scale;
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">${svg}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;
}

/** The CSS `cursor` value for a themed state, preferring the hi-DPI image-set form. */
export function cursorValue(
  kind: CursorKind,
  supports: (value: string) => boolean = cssSupportsCursor,
) {
  const { svg, hotspot, fallback } = BODIES[kind];
  const [x, y] = hotspot;
  const one = image(svg, 1),
    two = image(svg, 2);
  for (const set of ["image-set", "-webkit-image-set"]) {
    const value = `${set}(${one} 1x, ${two} 2x) ${x} ${y}, ${fallback}`;
    if (supports(value)) return value;
  }
  return `${one} ${x} ${y}, ${fallback}`;
}

function cssSupportsCursor(value: string) {
  const css = (
    globalThis as { CSS?: { supports?(p: string, v: string): boolean } }
  ).CSS;
  return !!css?.supports?.("cursor", value);
}

let cache: Record<CursorKind, string> | undefined;
/** Resolved once per page; CSS support does not change at runtime. */
export function gameCursors(): Record<CursorKind, string> {
  cache ??= {
    default: cursorValue("default"),
    interact: cursorValue("interact"),
    grab: cursorValue("grab"),
    "not-allowed": cursorValue("not-allowed"),
    text: cursorValue("text"),
  };
  return cache;
}

/** Expose the themed cursors to DOM overlays (auth, loading, service panels) as CSS variables:
 * `--sr-cursor-default`, `--sr-cursor-interact`, `--sr-cursor-grab`, `--sr-cursor-not-allowed`
 * and `--sr-cursor-text`. The game canvas itself is set by the HUD toolkit. */
export function installCursorTheme(
  root: HTMLElement = document.documentElement,
) {
  for (const [kind, value] of Object.entries(gameCursors()))
    root.style.setProperty(`--sr-cursor-${kind}`, value);
}
