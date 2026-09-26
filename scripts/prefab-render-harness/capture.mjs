#!/usr/bin/env node
/**
 * Evidence captures for the prefab ship render harness (no database, no new dependencies).
 *
 *   node scripts/prefab-render-harness/capture.mjs [--out DIR] [--only id,id] [--w 1600 --h 900] [--extra "query"]
 *
 * Starts the harness Vite server on 127.0.0.1:5391 unless one is already answering, launches the
 * Playwright-cached chrome-headless-shell with SwiftShader WebGL, drives it over the raw Chrome
 * DevTools Protocol, waits for `window.__prefabReady`, and writes PNGs plus metrics.json:
 * per prefab flight-iso, deck-iso, flight-top, deck-top and flight-rear; then lineup.png.
 *
 * --game: capture game.html (the real game renderer) instead: per prefab a deck and a 3/4 flight
 * view plus bow and engine close-ups, orbiting/zooming the game camera with real pointer input.
 *   node scripts/prefab-render-harness/capture.mjs --game --only fed.s.wren --out DIR [--orbit PX]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const out = resolve(opt("--out", "/root/sidereal-progress/ships-prefabs/renders"));
const only = opt("--only", "")?.split(",").filter(Boolean);
const W = Number(opt("--w", 1600));
const H = Number(opt("--h", 900));
const extra = opt("--extra", "");
const game = args.includes("--game");
const orbitPx = Number(opt("--orbit", 0));
const alpha = Number(opt("--alpha", -0.6));
const beta = Number(opt("--beta", 0.95));
const radius = Number(opt("--radius", 32));
const PORT = Number(opt("--port", 5391));
const BASE = `http://127.0.0.1:${PORT}/`;
mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromium() {
  const base = join(process.env.HOME ?? "/root", ".cache/ms-playwright");
  for (const dir of readdirSync(base).filter((d) => d.startsWith("chromium_headless_shell")).sort().reverse()) {
    const bin = join(base, dir, "chrome-headless-shell-linux64/chrome-headless-shell");
    if (existsSync(bin)) return bin;
  }
  throw Error("No Playwright chrome-headless-shell in ~/.cache/ms-playwright");
}

async function up(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function startHarness() {
  if (await up(BASE)) return null;
  const vite = spawn(process.execPath, [join(repo, "node_modules/vite/bin/vite.js"), "--config", "scripts/prefab-render-harness/vite.config.ts", "--port", String(PORT), "--strictPort"], {
    cwd: repo,
    stdio: ["ignore", "pipe", "pipe"],
  });
  vite.stderr.on("data", (d) => process.stderr.write(d));
  for (let i = 0; i < 120; i++) {
    if (await up(BASE)) return vite;
    await sleep(250);
  }
  vite.kill();
  throw Error("Harness did not start on " + BASE);
}

async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), "prefab-capture-"));
  const chrome = spawn(
    chromium(),
    [
      "--headless",
      "--no-sandbox",
      "--hide-scrollbars",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      `--window-size=${W},${H}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const endpoint = await new Promise((ok, fail) => {
    let buf = "";
    const timer = setTimeout(() => fail(Error("chrome did not report a DevTools endpoint")), 20000);
    chrome.stderr.on("data", (d) => {
      buf += d;
      const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(buf);
      if (m) {
        clearTimeout(timer);
        ok(m[1]);
      }
    });
    chrome.on("exit", () => fail(Error("chrome exited: " + buf.slice(-500))));
  });
  return { chrome, endpoint, profile };
}

/** Minimal CDP session over the browser WebSocket with flattened page sessions. */
async function cdp(endpoint) {
  const ws = new WebSocket(endpoint);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = fail;
  });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { ok, fail } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) fail(Error(JSON.stringify(msg.error)));
      else ok(msg.result);
    } else for (const l of listeners) l(msg);
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, fail) => {
      const mid = ++id;
      pending.set(mid, { ok, fail });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    });
  return { send, on: (l) => listeners.push(l), close: () => ws.close() };
}

async function main() {
  const vite = await startHarness();
  const { chrome, endpoint, profile } = await launchChrome();
  const session = await cdp(endpoint);
  const { targetId } = await session.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await session.send("Target.attachToTarget", { targetId, flatten: true });
  const page = (method, params) => session.send(method, params, sessionId);
  const logs = [];
  session.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.consoleAPICalled" && ["warning", "error"].includes(msg.params.type))
      logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    if (msg.method === "Runtime.exceptionThrown") logs.push(`exception: ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`);
  });
  await page("Runtime.enable");
  await page("Page.enable");
  await page("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  const ids = await (async () => {
    // The prefab list comes from the harness page itself so this script never restates content.
    await page("Page.navigate", { url: `${BASE}?list=1` });
    await waitReady(page, "?list=1", 180000);
    const r = await page("Runtime.evaluate", { expression: "JSON.stringify((window.__prefabMetrics||[]).map(m=>m.id))", returnByValue: true });
    return JSON.parse(r.result.value).filter((id) => !only?.length || only.includes(id));
  })();

  const shots = [];
  if (game)
    for (const id of ids) {
      // [name, query, orbit px, wheel dy]: crew position (x starboard, y fore) steers the camera target.
      // Matching 3/4 review angles via &cam=alpha,beta,radius; crew x/y (starboard/fore metres)
      // is the camera target, so close-ups move the crew to the bow or the engines.
      const cam = (r, da = 0) => `${alpha + da},${beta},${r}`;
      shots.push({ name: `${id}_game_deck`, page: "game.html", query: `prefab=${id}&interior=1&cam=${cam(radius)}` });
      shots.push({ name: `${id}_game_flight`, page: "game.html", query: `prefab=${id}&interior=0&cam=${cam(radius)}` });
      shots.push({ name: `${id}_game_bow`, page: "game.html", query: `prefab=${id}&interior=0&cam=${cam(15, 0.5)},0,4` });
      shots.push({ name: `${id}_game_engines`, page: "game.html", query: `prefab=${id}&interior=0&cam=${cam(15, 2.6)},0,-4.5` });
      shots.push({ name: `${id}_game_deck_close`, page: "game.html", query: `prefab=${id}&interior=1&cam=${cam(14, 0.3)}` });
    }
  else for (const id of ids)
    for (const [view, cam] of [["flight", "iso"], ["deck", "iso"], ["flight", "top"], ["deck", "top"], ["flight", "rear"]])
      shots.push({ name: `${id}_${view}_${cam}`, query: `prefab=${id}&view=${view}&cam=${cam}` });
  if (!only?.length && !game) shots.push({ name: "lineup", query: "lineup=1&view=flight&cam=iso" });

  const metrics = {};
  for (const s of shots) {
    logs.length = 0;
    const t0 = Date.now();
    const search = `?${s.query}&w=${W}&h=${H}${extra ? "&" + extra : ""}`;
    await page("Page.navigate", { url: BASE + (s.page ?? "") + search });
    await waitReady(page, search, 300000);
    if (s.orbit || s.zoom) {
      const cx = W / 2;
      const cy = H / 2;
      const mouse = (type, x, y, extraParams = {}) => page("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, ...extraParams });
      if (s.orbit) {
        await mouse("mousePressed", cx, cy, { clickCount: 1 });
        for (let i = 1; i <= 10; i++) await mouse("mouseMoved", cx + (s.orbit * i) / 10, cy);
        await mouse("mouseReleased", cx + s.orbit, cy, { clickCount: 1 });
      }
      for (let left = s.zoom; Math.abs(left) > 0; ) {
        const step = Math.sign(left) * Math.min(Math.abs(left), 300);
        await page("Input.dispatchMouseEvent", { type: "mouseWheel", x: cx, y: cy, deltaX: 0, deltaY: step });
        left -= step;
      }
      await sleep(4000);
    }
    const err = await page("Runtime.evaluate", { expression: "window.__prefabError || ''", returnByValue: true });
    if (err.result.value) console.error(`${s.name}: ${err.result.value}`);
    const m = await page("Runtime.evaluate", { expression: "JSON.stringify(window.__prefabMetrics||null)", returnByValue: true });
    metrics[s.name] = JSON.parse(m.result.value);
    const shot = await page("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(out, `${s.name}.png`), Buffer.from(shot.data, "base64"));
    const summary = (metrics[s.name] ?? []).map((x) => `${x.drawCalls} draws (main ${x.mainDraws}, glow ${x.glowDraws}), ${x.meshes} meshes, ${x.instances} inst, ${(x.triangles / 1000).toFixed(1)}k tris`).join(" | ");
    console.log(`${s.name}.png  ${((Date.now() - t0) / 1000).toFixed(1)} s  ${summary}`);
    for (const l of new Set(logs)) console.log(`   ${l.slice(0, 300)}`);
  }
  writeFileSync(join(out, "metrics.json"), JSON.stringify(metrics, null, 1));
  session.close();
  chrome.kill();
  vite?.kill();
  rmSync(profile, { recursive: true, force: true });
  console.log(`wrote ${shots.length} PNGs and metrics.json to ${out}`);
}

/** Poll until the NEW document (matching `search`) reports ready; never trusts the previous page. */
async function waitReady(page, search, timeout) {
  const t0 = Date.now();
  const expression = `location.search === ${JSON.stringify(search)} && window.__prefabReady === true`;
  while (Date.now() - t0 < timeout) {
    try {
      const r = await page("Runtime.evaluate", { expression, returnByValue: true });
      if (r.result.value) return;
    } catch {
      /* navigation in progress */
    }
    await sleep(250);
  }
  throw Error("timed out waiting for __prefabReady");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
