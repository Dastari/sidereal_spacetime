/** Rendering-independent UI contract used by DOM, canvas and the auth theme. */
export const uiTheme = {
  colors: {
    background: "#030b19",
    panel: "#08182e",
    raised: "#102947",
    input: "#061326",
    border: "#28628a",
    primary: "#24dcff",
    secondary: "#aa76ff",
    text: "#edf6ff",
    textSecondary: "#b6cee5",
    textMuted: "#8aaac7",
    danger: "#ff6686",
    warning: "#ffd36c",
    success: "#58e6b2",
  },
  fonts: {
    body: 'Barlow, "Segoe UI", sans-serif',
    title: '"Barlow Condensed", Barlow, "Segoe UI", sans-serif',
  },
  frame: { cornerCut: 10, borderWidth: 1, focusWidth: 2 },
} as const;

export type ControlVariant =
  "primary" | "secondary" | "ghost" | "danger" | "warning" | "success";
export type ControlState = {
  variant?: ControlVariant;
  disabled?: boolean;
  pending?: boolean;
  selected?: boolean;
  focused?: boolean;
  hovered?: boolean;
  pressed?: boolean;
};

/** States compose: selection remains visible while focus and pending change. */
export function resolveControlStyle(state: ControlState = {}) {
  const c = uiTheme.colors;
  const accent =
    state.variant === "ghost" ? c.textSecondary : c[state.variant ?? "primary"];
  const inactive = !!(state.disabled || state.pending);
  return {
    fill:
      state.pressed && !inactive
        ? c.raised
        : state.selected
          ? "#13385a"
          : state.variant === "primary"
            ? "#0b2d49"
            : c.input,
    border:
      state.variant === "ghost" &&
      !state.selected &&
      !state.hovered &&
      !state.pressed
        ? c.border
        : accent,
    text: state.disabled ? c.textMuted : c.text,
    focus: state.focused ? c.primary : "transparent",
    glow:
      !inactive && (state.focused || state.selected || state.hovered) ? 6 : 0,
    interactive: !inactive,
    accent,
  };
}

export const uiThemeCss = {
  ...Object.fromEntries(
    Object.entries(uiTheme.colors).map(([key, value]) => [
      `--ui-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      value,
    ]),
  ),
  "--ui-font-body": uiTheme.fonts.body,
  "--ui-font-title": uiTheme.fonts.title,
  "--ui-corner-cut": `${uiTheme.frame.cornerCut}px`,
  "--ui-scale": "1",
} as Record<string, string>;

export function uiThemeCssText() {
  return `:root {\n${Object.entries(uiThemeCss)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n")}\n}\n`;
}

/** User scale is independent of device pixel ratio and clamped at its public limits. */
export function logicalUiScale(value: number) {
  return Number.isFinite(value) ? Math.min(1.5, Math.max(0.75, value)) : 1;
}
