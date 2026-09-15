import {
  mapBodyRole,
  MAP_BACKGROUNDS,
  MAP_RESOURCES,
  type AsteroidField,
  type SystemMapDocument,
} from "@sidereal/content/system-map";
import { fieldCount, fieldVolume } from "@sidereal/sim/system-map";
import type { MapShip } from "./MapCanvas";
export function NumberField({
  label,
  value,
  onChange,
  min,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </label>
  );
}
export default function MapInspector({
  doc,
  selected,
  ships,
  edit,
  onDelete,
}: {
  doc: SystemMapDocument;
  selected: string;
  ships: MapShip[];
  edit: (update: (d: SystemMapDocument) => void) => void;
  onDelete: () => void;
}) {
  const body = doc.bodies.find((b) => b.id === selected),
    field = doc.fields.find((f) => f.id === selected),
    ship = ships.find((s) => s.shipId === selected);
  const updateField = (patch: Partial<AsteroidField>) =>
    edit((d) => {
      Object.assign(
        d.fields.find((f) => f.id === selected)!,
        patch,
      );
    });
  if (ship)
    return (
      <aside className="map-inspector">
        <h2>{ship.name}</h2>
        <p>Live ship · read only</p>
        <dl>
          <dt>X</dt>
          <dd>{ship.x.toFixed(2)} m</dd>
          <dt>Y</dt>
          <dd>{ship.y.toFixed(2)} m</dd>
        </dl>
      </aside>
    );
  return (
    <aside className="map-inspector">
      <h2>{field ? "Asteroid field" : body ? "Celestial body" : "System"}</h2>
      <label>
        Name
        <input
          aria-label="Name"
          value={field?.name ?? body?.name ?? doc.name}
          onChange={(e) =>
            edit((d) => {
              const target =
                d.fields.find((f) => f.id === selected) ??
                d.bodies.find((b) => b.id === selected) ??
                d;
              target.name = e.target.value;
            })
          }
        />
      </label>
      {(["x", "y", "height"] as const).map((k) => (
        <NumberField
          key={k}
          label={`${k === "height" ? "Height" : k.toUpperCase()} (m)`}
          value={(field ?? body ?? doc.center)[k]}
          onChange={(n) =>
            edit((d) => {
              const p =
                d.fields.find((f) => f.id === selected) ??
                d.bodies.find((b) => b.id === selected) ??
                d.center;
              p[k] = n;
            })
          }
        />
      ))}
      {body && (
        <p>
          {mapBodyRole(body)} · radius {body.radius} m
        </p>
      )}
      {!field && !body && (
        <>
          <NumberField
            label="System radius (m)"
            value={doc.radius}
            min={1}
            onChange={(n) =>
              edit((d) => {
                d.radius = n;
              })
            }
          />
          <label>
            Space background
            <select
              aria-label="Space background"
              value={doc.backgroundId}
              onChange={(e) =>
                edit((d) => {
                  d.backgroundId = e.target.value;
                })
              }
            >
              {MAP_BACKGROUNDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <img
            className="map-background-preview"
            alt={MAP_BACKGROUNDS.find((b) => b.id === doc.backgroundId)?.name}
            src={`/assets/environment/${MAP_BACKGROUNDS.find((b) => b.id === doc.backgroundId)?.asset}`}
          />
          <p>The outline is the top-down projection of the system sphere.</p>
        </>
      )}
      {field && (
        <>
          <p>
            {field.shape === "polygon"
              ? `${field.vertices.length} vertices · drag handles to reshape`
              : field.shape}
          </p>
          {field.shape !== "polygon" &&
            (["width", "length"] as const).map((k) => (
              <NumberField
                key={k}
                label={`${k === "width" ? "Width" : "Length"} (m)`}
                min={1}
                value={field[k]}
                onChange={(n) => updateField({ [k]: n })}
              />
            ))}
          <NumberField
            label="Depth (m)"
            min={1}
            value={field.depth}
            onChange={(n) => updateField({ depth: n })}
          />
          <NumberField
            label="Density (asteroids/km³)"
            min={0}
            step={0.1}
            value={field.density}
            onChange={(n) => updateField({ density: n })}
          />
          <NumberField
            label="Seed"
            value={field.seed}
            min={0}
            onChange={(n) => updateField({ seed: n })}
          />
          <div className="map-population">
            <strong>{fieldCount(field).toLocaleString()} asteroids</strong>
            <span>{+(fieldVolume(field) / 1e9).toFixed(4)} km³</span>
          </div>
          <NumberField
            label="Minimum radius (m)"
            min={0.1}
            step={0.1}
            value={field.minRadius}
            onChange={(n) => updateField({ minRadius: n })}
          />
          <NumberField
            label="Maximum radius (m)"
            min={0.1}
            step={0.1}
            value={field.maxRadius}
            onChange={(n) => updateField({ maxRadius: n })}
          />
          <h3>Resource occurrence</h3>
          <p>
            Independent chance per asteroid; multiple resources can occur
            together.
          </p>
          {MAP_RESOURCES.map((resource) => (
            <NumberField
              key={resource}
              label={`${resource} (%)`}
              min={0}
              value={
                field.resources.find((r) => r.resource === resource)?.chance ??
                0
              }
              onChange={(chance) =>
                updateField({
                  resources: [
                    ...field.resources.filter((r) => r.resource !== resource),
                    { resource, chance },
                  ],
                })
              }
            />
          ))}
          <button onClick={onDelete}>Delete field</button>
        </>
      )}
    </aside>
  );
}
