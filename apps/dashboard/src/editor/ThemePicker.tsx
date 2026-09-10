import { Palette } from "lucide-react";
import { useLayoutEffect, useState } from "react";
const key = "sidereal.creator.theme.v1";
type Theme = "navy" | "graphite";
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return localStorage.getItem(key) === "graphite" ? "graphite" : "navy";
    } catch {
      return "navy";
    }
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.creatorTheme = theme;
    try {
      localStorage.setItem(key, theme);
    } catch {
      /* Session theme still works. */
    }
  }, [theme]);
  return (
    <label className="editor-theme">
      <Palette size={16} />
      <select
        aria-label="Editor theme"
        value={theme}
        onChange={(e) => setTheme(e.target.value as Theme)}
      >
        <option value="navy">Deep space</option>
        <option value="graphite">Graphite</option>
      </select>
    </label>
  );
}
