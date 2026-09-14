import { Eye, EyeOff } from "lucide-react";
import type { ViewState } from "./state";

const LAYERS = [
  ["floor", "Floors"],
  ["walls", "Walls"],
  ["roof", "Roofs"],
  ["labels", "Room labels"],
  ["objects", "Objects"],
  ["exteriorHull", "Hull"],
  ["routes", "Systems"],
  ["pressure", "Pressure areas"],
] as const;

/** One visible set of layer controls is shared across all editing modes. */
export function LayerVisibility({
  layers,
  onChange,
}: {
  layers: ViewState["layers"];
  onChange: (layers: ViewState["layers"]) => void;
}) {
  return (
    <div
      className="layout-visibility-bar"
      role="group"
      aria-label="Visible layers"
    >
      <span>Show</span>
      {LAYERS.map(([key, label]) => {
        const visible = layers[key] !== false;
        const Icon = visible ? Eye : EyeOff;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={visible}
            aria-label={`Show ${label.toLowerCase()}`}
            title={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
            onClick={() => onChange({ ...layers, [key]: !visible })}
          >
            <Icon size={13} aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
