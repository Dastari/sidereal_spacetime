/** Rendering-independent UI contract used by DOM, canvas and the auth theme. */
export const uiTheme = {
  colors: {
    background: "#02091b",
    panel: "#051736",
    raised: "#102947",
    input: "#091a30",
    border: "#277fbd",
    primary: "#47dfff",
    secondary: "#47dfff",
    text: "#eff6ff",
    textSecondary: "#a7c5e8",
    textMuted: "#8aaac7",
    danger: "#ff8eaa",
    warning: "#ffd26d",
    success: "#74dcbb",
    glow: "#169bff",
  },
  fonts: {
    body: 'Barlow, "Segoe UI", sans-serif',
    title: '"Barlow Condensed", Barlow, "Segoe UI", sans-serif',
  },
  frame: { cornerCut: 8, topRightCut: 10, borderWidth: 1, focusWidth: 2 },
} as const;

/** The established character/inventory shell, in logical pixels for both adapters. */
export function panelFrameGeometry(width: number, height: number) {
  const w = Math.max(0, Number.isFinite(width) ? width : 0);
  const h = Math.max(0, Number.isFinite(height) ? height : 0);
  const cut = Math.min(uiTheme.frame.cornerCut, w / 2, h / 2);
  const right = Math.min(uiTheme.frame.topRightCut, w / 2, h / 2);
  const edge = Math.min(46, w / 3);
  const rise = Math.min(28, h / 3);
  return {
    outline: [
      [cut, 0],
      [w - right, 0],
      [w, right],
      [w, h - cut],
      [w - cut, h],
      [0, h],
      [0, cut],
    ],
    accents: [
      [
        [0, Math.min(22, h / 3)],
        [0, cut],
        [cut, 0],
        [edge, 0],
      ],
      [
        [w - edge, h],
        [w - cut, h],
        [w, h - cut],
        [w, h - rise],
      ],
    ],
  };
}

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
  "--ui-panel-clip": `polygon(${uiTheme.frame.cornerCut}px 0, calc(100% - ${uiTheme.frame.topRightCut}px) 0, 100% ${uiTheme.frame.topRightCut}px, 100% calc(100% - ${uiTheme.frame.cornerCut}px), calc(100% - ${uiTheme.frame.cornerCut}px) 100%, 0 100%, 0 ${uiTheme.frame.cornerCut}px)`,
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
