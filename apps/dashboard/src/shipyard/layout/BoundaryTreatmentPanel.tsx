import {
  BOUNDARY_TREATMENTS,
  type BoundaryTreatmentId,
  type BoundaryTreatmentOverride,
} from "@sidereal/content/layout-boundary-treatments";
import type { LayoutWall } from "@sidereal/sim/layout-compiler";
import { EditorSection, PropertyField } from "@sidereal/ui/editor-controls";

export type BoundaryTreatmentPatch = Partial<
  Pick<
    BoundaryTreatmentOverride,
    "treatment" | "heightUnits" | "reservationSide"
  >
>;
export interface BoundaryTreatmentPanelProps {
  wall: LayoutWall;
  override?: BoundaryTreatmentOverride;
  clearHeightUnits: number;
  disabled: boolean;
  onChange: (patch: BoundaryTreatmentPatch) => void;
}

const LABELS: Record<BoundaryTreatmentId, string> = {
  auto: "Automatic",
  "vertical-hull": "Vertical hull",
  "sloped-hull": "Sloped hull",
  "low-hull": "Low hull",
  "cockpit-glass": "Cockpit glazing",
  window: "Window",
  bulkhead: "Bulkhead",
  airlock: "Airlock",
  door: "Door",
  ramp: "Ramp",
  "hangar-door": "Hangar door",
  "engine-interface": "Engine interface",
  "docking-interface": "Docking interface",
  "open-bay": "Open bay",
  open: "Open",
  custom: "Custom",
};
const HEIGHTS = [24, 48, 72, 96];
const pointLabel = (point: readonly number[]) =>
  `(${point.map((n) => n / 32).join(", ")})`;

/** Authored intent only. The parent owns validation, undo and persistence. */
export function BoundaryTreatmentPanel({
  wall,
  override,
  clearHeightUnits,
  disabled,
  onChange,
}: BoundaryTreatmentPanelProps) {
  const heights = HEIGHTS.filter((height) => height <= clearHeightUnits);
  const currentHeight = override?.heightUnits;
  const retainedHeight =
    currentHeight !== undefined && !heights.includes(currentHeight);
  const a = override?.a ?? wall.a;
  const b = override?.b ?? wall.b;
  return (
    <EditorSection title="Boundary treatment">
      <PropertyField label="Treatment">
        <select
          aria-label="Boundary treatment"
          disabled={disabled}
          value={override?.treatment ?? "auto"}
          onChange={(event) => {
            const treatment = BOUNDARY_TREATMENTS.find(
              (value) => value === event.target.value,
            );
            if (treatment) onChange({ treatment });
          }}
        >
          {BOUNDARY_TREATMENTS.map((treatment) => (
            <option key={treatment} value={treatment}>
              {LABELS[treatment]}
            </option>
          ))}
        </select>
      </PropertyField>
      <PropertyField label="Height">
        <select
          aria-label="Boundary height"
          disabled={disabled}
          value={currentHeight ?? ""}
          onChange={(event) => {
            if (event.target.value === "") onChange({ heightUnits: undefined });
            else {
              const heightUnits = Number(event.target.value);
              if (heights.includes(heightUnits)) onChange({ heightUnits });
            }
          }}
        >
          <option value="">
            Full clear height · {clearHeightUnits / 32} m
          </option>
          {retainedHeight ? (
            <option value={currentHeight} disabled>
              Retained height · {currentHeight / 32} m
            </option>
          ) : null}
          {heights.map((height) => (
            <option key={height} value={height}>
              {height / 32} m
            </option>
          ))}
        </select>
      </PropertyField>
      {wall.source === "partition" ? (
        <>
          <PropertyField label="Wall reservation">
            <select
              aria-label="Internal wall reservation side"
              disabled={disabled}
              value={override?.reservationSide ?? ""}
              onChange={(event) => {
                const reservationSide = event.target.value;
                if (
                  reservationSide === "left" ||
                  reservationSide === "right" ||
                  reservationSide === "center"
                )
                  onChange({ reservationSide });
              }}
            >
              <option value="" disabled>
                Choose a side
              </option>
              <option value="left">Left of boundary</option>
              <option value="right">Right of boundary</option>
              <option value="center">Centered on boundary</option>
            </select>
          </PropertyField>
          <p className="layout-note">
            Left and right follow {pointLabel(a)} → {pointLabel(b)} m.
          </p>
        </>
      ) : null}
      {override ? (
        <p className="layout-note">
          Changes apply to the entire authored span {pointLabel(a)} →{" "}
          {pointLabel(b)} m, including any split sections.
        </p>
      ) : null}
      <p className="layout-note">
        Native fit and pressure qualification pending.
      </p>
    </EditorSection>
  );
}
