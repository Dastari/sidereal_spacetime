import { useMemo } from "react";
import type { LayoutDocument } from "@sidereal/content/ship-layout";
import type { CompiledLayout } from "@sidereal/sim/layout-compiler";
import {
  previewPressureAreas,
  type PressurePreviewStatus,
} from "./pressure-preview";

export const PRESSURE_COLORS: Record<PressurePreviewStatus, string> = {
  "enclosed-design": "#49c9b1",
  "vented-design": "#eeab65",
  incomplete: "#c9a5f3",
};
export const PRESSURE_LABELS: Record<PressurePreviewStatus, string> = {
  "enclosed-design": "Enclosed design",
  "vented-design": "Open to exterior",
  incomplete: "Unresolved enclosure",
};
export function PressureAreas({
  doc,
  result,
  deckId,
}: {
  doc: LayoutDocument;
  result: CompiledLayout;
  deckId: string;
}) {
  const preview = useMemo(
    () => previewPressureAreas(doc, result),
    [doc, result],
  );
  const areas = preview.areas.filter((a) => a.deckId === deckId);
  return (
    <section className="pressure-areas" aria-label="Pressure layout">
      <h3>Pressure areas</h3>
      {!preview.valid ? (
        <p role="status">Resolve layout errors before checking enclosure.</p>
      ) : !areas.length ? (
        <p className="layout-note">
          Draw a floorplan to see its pressure areas.
        </p>
      ) : (
        <ul>
          {areas.map((area, i) => (
            <li key={area.id}>
              <span
                className="pressure-dot"
                style={{ background: PRESSURE_COLORS[area.status] }}
              />
              <div>
                <strong>
                  {area.roomNames.join(" / ") || `Unnamed area ${i + 1}`}
                </strong>
                <small>
                  {PRESSURE_LABELS[area.status]} ·{" "}
                  {Number(area.areaM2.toFixed(2))} m²
                </small>
                {!!area.reasons.length && (
                  <details>
                    <summary>Details</summary>
                    <ul>
                      {area.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <details>
        <summary>Assumptions & limits</summary>
        <ul>
          {[...preview.assumptions, ...preview.limitations].map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
