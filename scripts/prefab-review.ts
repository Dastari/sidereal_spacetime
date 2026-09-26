/**
 * Developer review of prefab ships: validation issues, stats, dressing counts and blueprint
 * SVG/PNG evidence. Usage:
 *   npx tsx scripts/prefab-review.ts [--out DIR] [--only id,id] [--png]
 * PNG conversion uses the Playwright headless Chromium already cached on this host.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PREFAB_SHIPS } from "../packages/content/src/prefabs/index";
import { prefabStats, validateShipPrefab } from "../packages/content/src/ship-prefab";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { dressShip } from "../packages/sim/src/ship-dresser";
import { prefabBlueprintSvg } from "../packages/render/src/prefab-ship/blueprint-svg";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const out = resolve(opt("--out") ?? "output/prefab-review");
const only = opt("--only")?.split(",");
const png = args.includes("--png");
mkdirSync(out, { recursive: true });

function chromium(): string | null {
  const base = join(process.env.HOME ?? "/root", ".cache/ms-playwright");
  if (!existsSync(base)) return null;
  for (const dir of readdirSync(base).filter((d) => d.startsWith("chromium_headless_shell")).sort().reverse()) {
    const bin = join(base, dir, "chrome-headless-shell-linux64/chrome-headless-shell");
    if (existsSync(bin)) return bin;
  }
  return null;
}

const catalog = defaultPrefabComponentCatalog();
const chrome = png ? chromium() : null;
let failures = 0;
for (const doc of PREFAB_SHIPS) {
  if (only && !only.includes(doc.id)) continue;
  const issues = validateShipPrefab(doc, catalog);
  const st = prefabStats(doc, catalog);
  const t0 = performance.now();
  const dressed = dressShip(doc, { catalog });
  const ms = performance.now() - t0;
  const errors = issues.filter((i) => i.severity === "error");
  if (errors.length) failures++;
  console.log(
    `\n== ${doc.id} (${doc.name}) size ${doc.sizeClass}: ${st.lengthM}x${st.beamM} m, ${(st.massKg / 1000).toFixed(1)} t, ` +
      `${(st.thrustN / 1000).toFixed(0)} kN, ${st.accelerationMs2.toFixed(2)} m/s2, power ${(st.powerGenerationW / 1e3).toFixed(0)}/${(st.powerDrawW / 1e3).toFixed(0)} kW, ` +
      `heat ${(st.heatGenerationW / 1e3).toFixed(0)}/${(st.heatDissipationW / 1e3).toFixed(0)} kW, crew ${st.crew}`,
  );
  console.log(`   dressed in ${ms.toFixed(0)} ms: ${dressed.kit.length} kit placements, ${dressed.generated.reduce((n, g) => n + g.boxes.length, 0)} generated boxes, ${JSON.stringify(dressed.stats)}`);
  for (const i of issues) console.log(`   ${i.severity.toUpperCase()} ${i.code} [${i.ref.kind}${"id" in i.ref ? ":" + i.ref.id : ""}] ${i.message}`);
  const svg = prefabBlueprintSvg(doc, catalog, { scale: 32 });
  const svgPath = join(out, `${doc.id}.svg`);
  writeFileSync(svgPath, svg);
  if (chrome) {
    const [, w, h] = /width="([\d.]+)" height="([\d.]+)"/.exec(svg)!;
    execFileSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", `--window-size=${Math.ceil(+w)},${Math.ceil(+h)}`, `--screenshot=${join(out, `${doc.id}.png`)}`, `file://${svgPath}`], { stdio: "ignore" });
  }
}
if (chrome && args.includes("--sheet")) {
  // Contact sheet of every blueprint at a common scale.
  const cells = PREFAB_SHIPS.filter((d) => !only || only.includes(d.id))
    .map((d) => `<figure><img src="${d.id}.svg"/></figure>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#07111f;display:flex;flex-wrap:wrap;gap:18px;padding:18px;width:3200px;align-items:flex-start">${cells.replace(/<figure>/g, '<figure style="margin:0">')}</body></html>`;
  const sheet = join(out, "blueprints_sheet.html");
  writeFileSync(sheet, html);
  execFileSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=3240,4300", `--screenshot=${join(out, "blueprints_sheet.png")}`, `file://${sheet}`], { stdio: "ignore" });
}
console.log(`\n${failures} prefab(s) with errors; output in ${out}`);
process.exitCode = failures ? 1 : 0;
