#!/usr/bin/env node
/** Capture actual native geometry on a transparent render target using a running
 * Playwright CLI session and local dashboard. No source-image background removal.
 * Usage: node scripts/art_library/capture_map_portraits.mjs SESSION BASE_URL
 * Optional capture IDs after BASE_URL allow resuming a bounded subset. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const [session, base, ...only] = process.argv.slice(2);
if (!session || !base)
  throw Error("Playwright session and local dashboard URL required");
const url = new URL(base);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw Error("Capture only against a local dashboard");
const wrapper = path.join(
  root,
  ".agents/skills/playwright/scripts/playwright_cli.sh",
);
function cli(...args) {
  return execFileSync("bash", [wrapper, `-s=${session}`, ...args], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 180000,
  });
}
function run(code) {
  const output = cli("run-code", code);
  if (output.includes("### Error")) throw Error(output);
  const start = output.indexOf("### Result\n");
  if (start < 0) throw Error(output);
  return JSON.parse(
    output
      .slice(start + 11)
      .split("\n### Ran Playwright code")[0]
      .trim(),
  );
}
const output = path.join(root, "output/playwright/map-portraits-alpha");
mkdirSync(output, { recursive: true });
const planets = JSON.parse(
  readFileSync(
    path.join(
      root,
      "packages/render/src/environment/reviewed-native-planet-catalog.json",
    ),
    "utf8",
  ),
);
const entries = [
  {
    id: "yellow-main-sequence-r013",
    runtimeKitSha256:
      "f651ba13ade02fb918c97dd4d3924879dd9c204527a4e43cef90c8c578505bd2",
    seed: 3901,
  },
  ...planets.map((p) => ({ ...p, seed: 117 })),
].filter((p) => !only.length || only.includes(p.id));
cli("goto", new URL("/map", url).href);
run(
  `async page => {await page.evaluate(async moduleUrl=>{const {createReviewedNativePreview}=await import(moduleUrl);const c=document.createElement("canvas");c.id="portrait-capture";c.width=192;c.height=192;c.style.cssText="position:fixed;left:0;top:0;width:192px;height:192px;z-index:99999";document.body.append(c);window.__portrait=createReviewedNativePreview(c,(message,error)=>{window.__portraitStatus={message,error};},{transparent:true});},${JSON.stringify("/@fs" + path.join(root, "packages/render/src/environment/reviewed-native-preview.ts"))});return true;}`,
);
for (const entry of entries) {
  const data = run(
    `async page => {await page.evaluate(async ({id,seed})=>{await window.__portrait.select(id,seed);},${JSON.stringify({ id: entry.id, seed: entry.seed })});await page.waitForFunction(id=>{if(window.__portraitStatus?.error)throw Error(window.__portraitStatus.message);const c=document.querySelector("#portrait-capture");const s=JSON.parse(c.dataset.planetState||"{}");return s.selected===id&&s.ready&&!s.loading&&!s.pending&&s.stats?.active!==undefined;},${JSON.stringify(entry.id)},{timeout:120000});await page.waitForTimeout(250);return await page.evaluate(()=>{const c=document.querySelector("#portrait-capture");return {png:c.toDataURL("image/png"),state:JSON.parse(c.dataset.planetState)};});}`,
  );
  const png = Buffer.from(data.png.split(",")[1], "base64");
  writeFileSync(path.join(output, entry.id + ".png"), png);
  writeFileSync(
    path.join(output, entry.id + ".json"),
    JSON.stringify(
      {
        id: entry.id,
        seed: entry.seed,
        assetSha256: entry.runtimeKitSha256,
        sourceSha256: createHash("sha256").update(png).digest("hex"),
        renderer: "reviewed-native-preview",
        transparent: true,
        state: data.state,
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Captured", entry.id, png.length, "bytes");
}
run(
  `async page=>{await page.evaluate(()=>{window.__portrait.dispose();document.querySelector("#portrait-capture").remove();});return true;}`,
);
