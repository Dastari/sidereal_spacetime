import type { SystemMapDocument } from "@sidereal/content/system-map";
import { MAP_BACKGROUNDS } from "@sidereal/content/system-map";
import type { MapZone } from "@sidereal/content/zones";
import {
  curveZoneEdge,
  splitZoneEdge,
  setZoneHandle,
} from "@sidereal/sim/zone-path";
import { mapZones, subtree, moveMapSelection } from "./map-commands";
import { NumberField, CoordinateFields } from "@sidereal/ui/property-controls";
import { InspectorIdentity } from "./InspectorIdentity";
export function ZoneProperties({
  doc,
  zone,
  edit,
  point,
  setPoint,
}: {
  doc: SystemMapDocument;
  zone: MapZone;
  edit: (f: (d: SystemMapDocument) => void) => void;
  point: number | null;
  setPoint: (p: number | null) => void;
}) {
  const update = (f: (z: MapZone) => void) =>
    edit((d) => {
      const z = mapZones(d).find((z) => z.id === zone.id);
      if (z) f(z);
    });
  const descendants = subtree(doc, [zone.id]),
    anchor = point === null ? undefined : zone.vertices[point];
  return (
    <fieldset className="zone-properties">
      <legend>Zone boundary</legend>
      <label>
        Shape
        <select
          aria-label="Zone shape"
          value={zone.shape}
          onChange={(e) =>
            update((z) => {
              z.shape = e.target.value as MapZone["shape"];
              if (z.shape === "polygon" && z.vertices.length < 3)
                z.vertices = [
                  { x: -z.width / 2, y: -z.length / 2 },
                  { x: z.width / 2, y: -z.length / 2 },
                  { x: z.width / 2, y: z.length / 2 },
                  { x: -z.width / 2, y: z.length / 2 },
                ];
            })
          }
        >
          <option value="box">Box</option>
          <option value="ellipsoid">Ellipsoid</option>
          <option value="polygon">Polygon / curved path</option>
        </select>
      </label>
      <label>
        Color
        <input
          aria-label="Zone color"
          type="color"
          value={zone.color ?? "#6ca6cb"}
          onChange={(e) =>
            update((z) => {
              z.color = e.target.value;
            })
          }
        />
      </label>
      <label>
        Parent zone
        <select
          aria-label="Parent zone"
          value={zone.parentId ?? doc.id}
          onChange={(e) =>
            update((z) => {
              z.parentId = e.target.value;
            })
          }
        >
          <option value={doc.id}>{doc.name} (system)</option>
          {mapZones(doc)
            .filter((z) => !descendants.has(z.id))
            .map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
        </select>
      </label>
      <p className="map-hint">
        Clipped by its ancestors. Moving a zone moves child boundaries; live
        objects stay in place.
      </p>
      {zone.shape === "polygon" && (
        <>
          <label>
            Anchor
            <select
              aria-label="Selected anchor"
              value={point ?? ""}
              onChange={(e) =>
                setPoint(e.target.value === "" ? null : Number(e.target.value))
              }
            >
              <option value="">Select a point (A)</option>
              {zone.vertices.map((_, i) => (
                <option key={i} value={i}>
                  Point {i + 1}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!anchor}
            onClick={() => update((z) => curveZoneEdge(z.vertices, point!))}
          >
            Curve next edge
          </button>
          <button
            disabled={!anchor || zone.vertices.length >= 64}
            onClick={() => {
              update((z) => splitZoneEdge(z.vertices, point!));
              setPoint(point! + 1);
            }}
          >
            Add point after
          </button>
          <button
            disabled={!anchor || zone.vertices.length <= 3}
            onClick={() => {
              update((z) => {
                z.vertices.splice(point!, 1);
              });
              setPoint(null);
            }}
          >
            Remove point
          </button>
          {anchor && (
            <>
              <CoordinateFields label="Anchor offset (m)">
                {(["x", "y"] as const).map((k) => (
                  <NumberField
                    key={k}
                    label={`Anchor ${k.toUpperCase()} (m)`}
                    value={anchor[k]}
                    onChange={(n) =>
                      update((z) => {
                        z.vertices[point!][k] = n;
                      })
                    }
                  />
                ))}
              </CoordinateFields>
              <label>
                Handle coupling
                <select
                  aria-label="Handle coupling"
                  value={anchor.mode ?? "corner"}
                  onChange={(e) =>
                    update((z) => {
                      const a = z.vertices[point!];
                      a.mode = e.target.value as typeof a.mode;
                      if (a.out) setZoneHandle(a, "out", a.out);
                      else if (a.in) setZoneHandle(a, "in", a.in);
                    })
                  }
                >
                  <option value="corner">Independent</option>
                  <option value="aligned">Aligned</option>
                  <option value="mirrored">Mirrored</option>
                </select>
              </label>
              {(["in", "out"] as const).map((side) => {
                const h = anchor[side];
                return (
                  <div key={side}>
                    <strong>
                      {side === "in" ? "Incoming" : "Outgoing"} handle
                    </strong>
                    <NumberField
                      label={`${side} angle (°)`}
                      min={-180}
                      max={180}
                      slider
                      value={h ? (Math.atan2(h.y, h.x) * 180) / Math.PI : 0}
                      onChange={(angle) =>
                        update((z) => {
                          const length =
                            Math.hypot(h?.x ?? 0, h?.y ?? 0) || 100;
                          setZoneHandle(z.vertices[point!], side, {
                            x: Math.cos((angle * Math.PI) / 180) * length,
                            y: Math.sin((angle * Math.PI) / 180) * length,
                          });
                        })
                      }
                    />
                    <NumberField
                      label={`${side} length (m)`}
                      min={0}
                      value={h ? Math.hypot(h.x, h.y) : 0}
                      onChange={(length) =>
                        update((z) => {
                          const angle = h ? Math.atan2(h.y, h.x) : 0;
                          setZoneHandle(z.vertices[point!], side, {
                            x: Math.cos(angle) * length,
                            y: Math.sin(angle) * length,
                          });
                        })
                      }
                    />
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </fieldset>
  );
}
export function GenericZoneInspector({
  doc,
  zone,
  edit,
  point,
  setPoint,
  onDelete,
}: {
  doc: SystemMapDocument;
  zone: MapZone;
  edit: (f: (d: SystemMapDocument) => void) => void;
  point: number | null;
  setPoint: (p: number | null) => void;
  onDelete: () => void;
}) {
  const patch = (p: Partial<MapZone>) =>
    edit((d) => {
      Object.assign(
        d.zones!.find((z) => z.id === zone.id)!,
        p,
      );
    });
  return (
    <aside className="map-inspector">
      <InspectorIdentity
        doc={doc}
        id={zone.id}
        name={zone.name}
        onName={(name) => patch({ name })}
      />
      <h2>Zone</h2>
      <CoordinateFields>
        {(["x", "y", "height"] as const).map((k) => (
          <NumberField
            key={k}
            label={`${k === "height" ? "Height" : k.toUpperCase()} (m)`}
            value={zone[k]}
            onChange={(n) =>
              edit((d) =>
                moveMapSelection(
                  d,
                  [zone.id],
                  k === "x" ? n - zone.x : 0,
                  k === "y" ? n - zone.y : 0,
                  k === "height" ? n - zone.height : 0,
                ),
              )
            }
          />
        ))}
      </CoordinateFields>
      {(["width", "length", "depth"] as const)
        .filter((k) => zone.shape !== "polygon" || k === "depth")
        .map((k) => (
          <NumberField
            key={k}
            label={`${k} (m)`}
            min={1}
            value={zone[k]}
            onChange={(n) => patch({ [k]: n })}
          />
        ))}
      <label>
        Background
        <select
          aria-label="Zone background"
          value={zone.backgroundId ?? ""}
          onChange={(e) => patch({ backgroundId: e.target.value || undefined })}
        >
          <option value="">Inherit parent</option>
          {MAP_BACKGROUNDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <NumberField
        label="Feather (m)"
        max={Math.max(zone.width, zone.length, zone.depth)}
        slider
        min={0}
        value={zone.feather ?? 50}
        onChange={(n) => patch({ feather: n })}
      />
      <NumberField
        label="Priority"
        integer
        value={zone.priority ?? 0}
        onChange={(n) => patch({ priority: n })}
      />
      <ZoneProperties {...{ doc, zone, edit, point, setPoint }} />
      <button onClick={onDelete}>Delete zone and children</button>
    </aside>
  );
}
