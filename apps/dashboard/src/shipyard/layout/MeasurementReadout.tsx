import {
  measurePath,
  MAX_MEASUREMENT_POINTS,
  type MeasurementPoint,
} from "@sidereal/render/layout-measurement";
import "./measurement.css";

export function MeasurementReadout({
  points,
  onClear,
  onRemove,
}: {
  points: MeasurementPoint[];
  onClear: () => void;
  onRemove: () => void;
}) {
  const path = measurePath(points);
  const metres = (n: number) =>
    `${n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} m`;
  return (
    <section className="layout-measurement" aria-label="Vertex measurements">
      <header>
        <strong>Measure</strong>
        <span>{points.length} points</span>
      </header>
      {!points.length ? (
        <p>Click a highlighted vertex, then vertices on any visible object.</p>
      ) : points.length === 1 ? (
        <p>Choose the next vertex.</p>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Segment</th>
                <th>Distance</th>
                <th>Up / down</th>
              </tr>
            </thead>
            <tbody>
              {path.segments.map((s, i) => (
                <tr key={i}>
                  <td>
                    {i + 1} → {i + 2}
                  </td>
                  <td>{metres(s.distance)}</td>
                  <td>{metres(s.deltaZ)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="measurement-total">
            Total <strong>{metres(path.totalDistance)}</strong>
          </p>
        </>
      )}
      <footer>
        <button onClick={onRemove} disabled={!points.length} title="Backspace">
          Remove last point
        </button>
        <button onClick={onClear} disabled={!points.length} title="Escape">
          Clear
        </button>
      </footer>
      {points.length >= MAX_MEASUREMENT_POINTS && (
        <p>Path limit reached. Clear or remove a point to continue.</p>
      )}
    </section>
  );
}
