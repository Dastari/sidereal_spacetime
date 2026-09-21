import { NumberField, CoordinateFields } from "@sidereal/ui/property-controls";
import { InspectorIdentity } from "./InspectorIdentity";
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
        <InspectorIdentity doc={doc} id={ship.shipId} name={ship.name} />
        <p>Live ship · read only</p>
        <dl>
          <dt>X</dt>
          <dd>{ship.x.toFixed(2)} m</dd>
          <dt>Heading</dt>
          <dd>{ship.heading.toFixed(2)} rad</dd>
          <dt>Y</dt>
          <dd>{ship.y.toFixed(2)} m</dd>
        </dl>
      </aside>
    );
  if (selected !== doc.id && !body && !field)
    return (
      <aside className="map-inspector map-inspector-empty">
        <h2>Nothing selected</h2>
        <p>
          Select an object in the Universe tree or on the map to inspect its
          properties.
        </p>
      </aside>
    );
  return (
    <aside className="map-inspector">
      <InspectorIdentity
        doc={doc}
        id={field?.id ?? body?.id ?? doc.id}
        name={field?.name ?? body?.name ?? doc.name}
        onName={(name) =>
          edit((d) => {
            const target =
              d.fields.find((f) => f.id === selected) ??
              d.bodies.find((b) => b.id === selected) ??
              d;
            target.name = name;
          })
        }
      />
      <h2>{field ? "Asteroid field" : body ? "Celestial body" : "System"}</h2>
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
      <CoordinateFields>
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
                  moveMapBody(d, d.primaryStarId, {
                    ...systemCenter(d),
                    [k]: n,
                  });
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
      </CoordinateFields>
      {body && (
        <>
          <p>
            {mapBodyRole(body, doc.bodies)} · catalog components (read only)
          </p>
          <dl className="map-component-facts">
            <dt>Radius</dt>
            <dd>{body.radius} m</dd>
            <dt>Appearance</dt>
            <dd>{body.appearance ?? "Unassigned"}</dd>
            <dt>Seed</dt>
            <dd>{body.seed ?? "Default"}</dd>
          </dl>
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
            max={1e8}
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
          <NumberField
            label="System feather (m)"
            max={doc.radius}
            slider
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
          <ZoneProperties
            doc={doc}
            zone={field}
            edit={edit}
            point={point}
            setPoint={setPoint}
          />
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
                integer
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
            integer
            max={4294967295}
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
              max={100}
              slider
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
