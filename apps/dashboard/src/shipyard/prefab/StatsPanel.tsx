/** Live stats (`prefabStats`) and the validation list (`validateShipPrefab` plus admission). */
import { G, MOUNT_SIZE_IDS } from "@sidereal/content/construction-grammar";
import type { PrefabIssue, PrefabStats, ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";
import { CATEGORY_LABELS } from "./palette";

const kw = (w: number) => `${(w / 1000).toFixed(0)} kW`;
const tone = (good: boolean | null) => (good === null ? undefined : good ? "good" : "bad");

function Row({ label, value, good = null, hint }: { label: string; value: string; good?: boolean | null; hint?: string }) {
  return (
    <>
      <dt title={hint}>{label}</dt>
      <dd data-tone={tone(good)}>{value}</dd>
    </>
  );
}

export function StatsPanel({ doc, stats }: { doc: ShipPrefabDocumentV1; stats: PrefabStats }) {
  const size = G.blueprintSizeClasses[doc.sizeClass];
  const hardpoints = doc.mounts.filter((m) => m.attach !== "interior").length;
  const fits = stats.lengthM <= size.maxCells[0] && stats.beamM <= size.maxCells[1];
  return (
    <>
      <section className="layout-section pf-stats">
        <h2>Structure</h2>
        <dl>
          <Row label="Length x beam" value={`${stats.lengthM} x ${stats.beamM} m`} good={fits} hint={`Size ${doc.sizeClass} allows ${size.maxCells[0]} x ${size.maxCells[1]} m`} />
          <Row label="Hull area" value={`${stats.hullAreaM2.toFixed(1)} m²`} />
          <Row label="Deck area" value={`${stats.deckAreaM2} m²`} />
          <Row label="Rooms" value={String(stats.rooms)} />
          <Row label="Crew" value={String(stats.crew)} />
          <Row label="Cargo cells" value={String(stats.cargoCells)} />
        </dl>
      </section>
      <section className="layout-section pf-stats">
        <h2>Flight</h2>
        <dl>
          <Row label="Mass" value={`${(stats.massKg / 1000).toFixed(1)} t`} hint={`Structure ${(stats.structureMassKg / 1000).toFixed(1)} t, components ${(stats.componentMassKg / 1000).toFixed(1)} t`} />
          <Row label="Structure / parts" value={`${(stats.structureMassKg / 1000).toFixed(1)} / ${(stats.componentMassKg / 1000).toFixed(1)} t`} />
          <Row label="Main thrust" value={`${(stats.thrustN / 1000).toFixed(0)} kN`} good={stats.thrustN > 0} hint="Rear-face engines only" />
          <Row label="Acceleration" value={`${stats.accelerationMs2.toFixed(2)} m/s²`} good={stats.accelerationMs2 > 0} />
          <Row label="Thrust / weight" value={stats.thrustToWeight.toFixed(2)} good={stats.thrustN > 0 ? stats.thrustToWeight >= 0.05 : false} />
        </dl>
      </section>
      <section className="layout-section pf-stats">
        <h2>Power and heat</h2>
        <dl>
          <Row label="Generation" value={kw(stats.powerGenerationW)} />
          <Row label="Draw" value={kw(stats.powerDrawW)} />
          <Row label="Power balance" value={`${stats.powerBalanceW >= 0 ? "+" : ""}${kw(stats.powerBalanceW)}`} good={stats.powerBalanceW >= 0} />
          <Row label="Heat produced" value={kw(stats.heatGenerationW)} />
          <Row label="Heat rejected" value={kw(stats.heatDissipationW)} />
          <Row label="Heat balance" value={`${stats.heatBalanceW > 0 ? "+" : ""}${kw(stats.heatBalanceW)}`} good={stats.heatBalanceW <= 0} />
        </dl>
      </section>
      <section className="layout-section pf-stats">
        <h2>Mounts</h2>
        <dl>
          <Row label="Hardpoints used" value={`${hardpoints} / ${size.maxMounts}`} good={hardpoints <= size.maxMounts} />
          {MOUNT_SIZE_IDS.map((s) => (
            <Row key={s} label={`Size ${s}`} value={String(stats.mountsBySize[s])} good={stats.mountsBySize[s] && MOUNT_SIZE_IDS.indexOf(s) > MOUNT_SIZE_IDS.indexOf(size.maxMount) ? false : null} />
          ))}
          {Object.entries(stats.mountsByCategory)
            .sort()
            .map(([c, n]) => (
              <Row key={c} label={CATEGORY_LABELS[c.split(".")[0]] ?? c} value={String(n)} />
            ))}
        </dl>
        <p className="layout-note">Mass and balance constants are proposals, not approved balance.</p>
      </section>
    </>
  );
}

export function IssuesPanel({ issues, onPick }: { issues: PrefabIssue[]; onPick: (i: PrefabIssue) => void }) {
  const errors = issues.filter((i) => i.severity === "error").length;
  return (
    <section className="layout-section">
      <h2>
        {errors ? `${errors} error${errors === 1 ? "" : "s"}` : "No errors"}
        {issues.length - errors ? `, ${issues.length - errors} warning${issues.length - errors === 1 ? "" : "s"}` : ""}
      </h2>
      {!issues.length && <p className="pf-ok">This ship passes every grammar rule and can be published.</p>}
      <ul className="layout-validation pf-issues">
        {issues.map((i, n) => (
          <li key={`${i.code}-${n}`} data-severity={i.severity}>
            <button onClick={() => onPick(i)} data-issue={i.code}>
              <strong>{i.code.replace(/[.-]/g, " ")}</strong>
              <span>{i.message}</span>
              {i.ref.kind !== "document" && <small>{i.ref.kind === "volume" && i.ref.tile !== undefined ? `tile ${i.ref.tile} of ${i.ref.id}` : `${i.ref.kind} ${i.ref.id}`}</small>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
