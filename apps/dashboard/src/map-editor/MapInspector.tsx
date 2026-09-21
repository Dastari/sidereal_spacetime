import { moveMapSelection } from "./map-commands";
import { ZoneProperties } from "./ZoneProperties";
import { systemCenter } from "@sidereal/sim/space-background";
import {
  mapBodyRole,
  moveMapBody,
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
  point,
  setPoint,
}: {
  doc: SystemMapDocument;
  selected: string;
  ships: MapShip[];
  edit: (update: (d: SystemMapDocument) => void) => void;
  onDelete: () => void;
  point: number | null;
  setPoint: (p: number | null) => void;
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
      {field && (
        <ZoneProperties
          doc={doc}
          zone={field}
          edit={edit}
          point={point}
          setPoint={setPoint}
        />
      )}
      {!field && !body && (
        <label>
          System color
          <input
            aria-label="System color"
            type="color"
            value={doc.color ?? "#6ca6cb"}
            onChange={(e) =>
              edit((d) => {
                d.color = e.target.value;
              })
            }
          />
        </label>
      )}
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
          value={(field ?? body ?? systemCenter(doc))[k]}
          onChange={(n) =>
            edit((d) => {
              const p =
                d.fields.find((f) => f.id === selected) ??
                d.bodies.find((b) => b.id === selected) ??
                d.center;
              if (body)
                moveMapBody(d, body.id, {
                  x: body.x,
                  y: body.y,
                  height: body.height,
                  [k]: n,
                });
              else if (!field && d.primaryStarId)
                moveMapBody(d, d.primaryStarId, { ...systemCenter(d), [k]: n });
              else if (field)
                moveMapSelection(
                  d,
                  [field.id],
                  k === "x" ? n - field.x : 0,
                  k === "y" ? n - field.y : 0,
                  k === "height" ? n - field.height : 0,
                );
              else p[k] = n;
            })
          }
        />
      ))}
      {body && (
        <>
          <p>
            {mapBodyRole(body, doc.bodies)} · radius {body.radius} m
          </p>
          {body.kind !== "star" && (
            <label>
              Orbits around
              <select
                aria-label="Orbits around"
                value={body.parentId ?? ""}
                onChange={(e) =>
                  edit((d) => {
                    d.bodies.find((b) => b.id === body.id)!.parentId =
                      e.target.value || null;
                  })
                }
              >
                <option value="">No parent</option>
                {doc.bodies
                  .filter(
                    (b) =>
                      b.id !== body.id &&
                      (b.kind === "star" ||
                        !b.parentId ||
                        doc.bodies.find((p) => p.id === b.parentId)?.kind ===
                          "star"),
                  )
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <p>
            Moving this body moves its moons. Guides show design distances, not
            orbital motion.
          </p>
        </>
      )}
      {!field && !body && (
        <>
          <label>
            System center
            <select
              aria-label="System center"
              value={doc.primaryStarId ?? ""}
              onChange={(e) =>
                edit((d) => {
                  d.center = { ...systemCenter(d) };
                  d.primaryStarId = e.target.value || undefined;
                  if (d.primaryStarId) {
                    const p = systemCenter(d);
                    d.center = { x: p.x, y: p.y, height: p.height };
                  }
                })
              }
            >
              <option value="">Free center</option>
              {doc.bodies
                .filter((b) => b.kind === "star")
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
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
          {MAP_BACKGROUNDS.find((b) => b.id === doc.backgroundId)?.asset ? (
            <img
              className="map-background-preview"
              alt={MAP_BACKGROUNDS.find((b) => b.id === doc.backgroundId)?.name}
              src={`/assets/environment/${MAP_BACKGROUNDS.find((b) => b.id === doc.backgroundId)?.asset}`}
            />
          ) : (
            <div
              className="map-background-stars"
              role="img"
              aria-label="Deep space starfield"
            />
          )}
          <NumberField
            label="System feather (m)"
            min={0}
            value={doc.feather ?? Math.min(doc.radius * 0.05, 100000)}
            onChange={(n) =>
              edit((d) => {
                d.feather = n;
              })
            }
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
          <label>
            Field background
            <select
              aria-label="Field background"
              value={field.backgroundId ?? ""}
              onChange={(e) =>
                updateField({ backgroundId: e.target.value || undefined })
              }
            >
              <option value="">Inherit system background</option>
              {MAP_BACKGROUNDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          {field.backgroundId && (
            <>
              <NumberField
                label="Field feather (m)"
                min={0}
                value={
                  field.feather ??
                  Math.min(field.width, field.length, field.depth) * 0.1
                }
                onChange={(n) => updateField({ feather: n })}
              />
              <NumberField
                label="Background priority"
                value={field.priority ?? 0}
                onChange={(n) => updateField({ priority: n })}
              />
            </>
          )}
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
