import type { ComponentProps } from "react";
import { NumberField } from "@sidereal/ui/property-controls";
import {
  ASTRONOMICAL_KM_PER_GAMEPLAY_METRE,
  toAstronomicalKm,
  fromAstronomicalKm,
} from "@sidereal/ui/astronomical-units";
/** Value/bounds/callback retain gameplay metres; the author edits display km. */
export function MapDistanceField({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  ...props
}: ComponentProps<typeof NumberField>) {
  return (
    <NumberField
      {...props}
      label={label}
      precision={2}
      value={toAstronomicalKm(value)}
      min={min === undefined ? undefined : toAstronomicalKm(min)}
      max={max === undefined ? undefined : toAstronomicalKm(max)}
      step={toAstronomicalKm(step)}
      onChange={(n) => onChange(fromAstronomicalKm(n))}
    />
  );
}
export function MapScaleNote() {
  return (
    <small
      className="map-scale-note"
      title="Astronomical display conversion. Ship, character and asteroid sizes retain their construction metres. Flight times use unchanged gameplay distances and speed."
    >
      Astronomical scale · 1 gameplay m = {ASTRONOMICAL_KM_PER_GAMEPLAY_METRE}{" "}
      km
    </small>
  );
}
