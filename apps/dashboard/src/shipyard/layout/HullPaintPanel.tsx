import type { HullPaint } from "@sidereal/content/hull-paint";

export function HullPaintPanel({
  paint,
  disabled,
  change,
}: {
  paint?: HullPaint;
  disabled: boolean;
  change: (paint?: HullPaint) => void;
}) {
  const reset = (channel: keyof HullPaint) => {
    const next = { ...paint };
    delete next[channel];
    change(Object.keys(next).length ? next : undefined);
  };
  return (
    <fieldset className="hull-paint-panel" disabled={disabled}>
      <legend>Paint</legend>
      {(["primary", "secondary"] as const).map((channel) => (
        <div className="hull-paint-row" key={channel}>
          <label>
            {channel === "primary" ? "Primary" : "Secondary"}
            <input
              type="color"
              aria-label={`${channel === "primary" ? "Primary" : "Secondary"} paint color`}
              value={
                paint?.[channel] ??
                (channel === "primary" ? "#c7cbd3" : "#943d4a")
              }
              onChange={(e) => change({ ...paint, [channel]: e.target.value })}
            />
          </label>
          <span>{paint?.[channel] ?? "Original"}</span>
          <button
            type="button"
            aria-label={`Reset ${channel} paint`}
            disabled={!paint?.[channel]}
            onClick={() => reset(channel)}
          >
            Reset
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={!paint?.primary && !paint?.secondary}
        onClick={() => change(undefined)}
      >
        Reset all paint
      </button>
    </fieldset>
  );
}
