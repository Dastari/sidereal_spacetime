import type { LayoutDocument } from "@sidereal/content/ship-layout";
import type { CompiledLayout } from "@sidereal/sim/layout-compiler";
export function ShipSummary({
  doc,
  result,
}: {
  doc: LayoutDocument;
  result?: CompiledLayout;
}) {
  const errors = result?.diagnostics.filter(
    (item) => item.severity === "error",
  ).length;
  return (
    <section className="ship-summary" aria-label="Ship design overview">
      <h3>{doc.name}</h3>
      <dl>
        <dt>Type</dt>
        <dd>{doc.kind === "station-module" ? "Station module" : "Ship"}</dd>
        <dt>Authored decks</dt>
        <dd>{doc.decks.length}</dd>
        <dt>Floor modules</dt>
        <dd>{doc.tiles.length}</dd>
        <dt>Rooms</dt>
        <dd>{doc.rooms.length}</dd>
        <dt>Components</dt>
        <dd>{(doc.assembly?.parts.length ?? 0) + doc.fittings.length}</dd>
        {result && (
          <>
            <dt>Floor bounds</dt>
            <dd>
              {((result.bounds.max[0] - result.bounds.min[0]) / 32).toFixed(1)}{" "}
              ×{" "}
              {((result.bounds.max[1] - result.bounds.min[1]) / 32).toFixed(1)}{" "}
              m
            </dd>
          </>
        )}
      </dl>
      <h3>Design validation</h3>
      <p className="layout-note">
        {errors === undefined
          ? "Validation pending"
          : errors
            ? `${errors} design errors. Review in Structure → Validation.`
            : "No floor topology errors."}
      </p>
      <p className="layout-note">
        Local design draft. System performance and live installation require
        separate validation.
      </p>
    </section>
  );
}
