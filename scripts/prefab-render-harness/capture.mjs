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
 * --custom "name|query;name|query": game.html close-ups with explicit queries instead of the defaults
 *   (e.g. "bridge|interior=1&cam=-0.6,0.95,7,0,3"); the prefab id is prepended to name and query.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cdp, launchChrome, sleep, startHarness } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const out = resolve(
  opt("--out", "/root/sidereal-progress/ships-prefabs/renders"),
);
const only = opt("--only", "")?.split(",").filter(Boolean);
const W = Number(opt("--w", 1600));
const H = Number(opt("--h", 900));
const extra = opt("--extra", "");
const game = args.includes("--game");
const orbitPx = Number(opt("--orbit", 0));
const alpha = Number(opt("--alpha", -0.6));
const beta = Number(opt("--beta", 0.95));
const radius = Number(opt("--radius", 24));
const PORT = Number(opt("--port", 5391));
const BASE = `http://127.0.0.1:${PORT}/`;
mkdirSync(out, { recursive: true });

async function main() {
  const vite = await startHarness(PORT);
  const { chrome, endpoint, profile } = await launchChrome(W, H);
  const session = await cdp(endpoint);
  const { targetId } = await session.send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await session.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const page = (method, params) => session.send(method, params, sessionId);
  const logs = [];
  session.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (
      msg.method === "Runtime.consoleAPICalled" &&
      ["warning", "error"].includes(msg.params.type)
    )
      logs.push(
        `${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`,
      );
    if (msg.method === "Runtime.exceptionThrown")
      logs.push(
        `exception: ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`,
      );
  });
  await page("Runtime.enable");
  await page("Page.enable");
  await page("Emulation.setDeviceMetricsOverride", {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const ids = only?.length
    ? only
    : await (async () => {
        // The prefab list comes from the harness page itself so this script never restates content.
        await page("Page.navigate", { url: `${BASE}?list=1` });
        await waitReady(page, "?list=1", 180000);
        const r = await page("Runtime.evaluate", {
          expression:
            "JSON.stringify((window.__prefabMetrics||[]).map(m=>m.id))",
          returnByValue: true,
        });
        return JSON.parse(r.result.value).filter(
          (id) => !only?.length || only.includes(id),
        );
      })();

  const shots = [];
  if (game)
    for (const id of ids) {
      // [name, query, orbit px, wheel dy]: crew position (x starboard, y fore) steers the camera target.
      // Matching 3/4 review angles via &cam=alpha,beta,radius; crew x/y (starboard/fore metres)
      // is the camera target, so close-ups move the crew to the bow or the engines.
      const cam = (r, da = 0) => `${alpha + da},${beta},${r}`;
      shots.push({
        name: `${id}_game_deck`,
        page: "game.html",
        query: `prefab=${id}&interior=1&cam=${cam(radius)}`,
      });
      shots.push({
        name: `${id}_game_flight`,
        page: "game.html",
        query: `prefab=${id}&interior=0&cam=${cam(radius)}`,
      });
      shots.push({
        name: `${id}_game_bow`,
        page: "game.html",
        query: `prefab=${id}&interior=0&cam=${cam(15, 0.5)},0,4`,
      });
      shots.push({
        name: `${id}_game_engines`,
        page: "game.html",
        query: `prefab=${id}&interior=0&cam=${cam(15, 2.6)},0,-4.5`,
      });
      shots.push({
        name: `${id}_game_side`,
        page: "game.html",
        query: `prefab=${id}&interior=0&cam=0,1.5,${radius}`,
      });
      shots.push({
        name: `${id}_game_deck_close`,
        page: "game.html",
        query: `prefab=${id}&interior=1&cam=${cam(14, 0.3)}`,
      });
    }
  else
    for (const id of ids)
      for (const [view, cam] of [
        ["flight", "iso"],
        ["deck", "iso"],
        ["flight", "top"],
        ["deck", "top"],
        ["flight", "rear"],
      ])
        shots.push({
          name: `${id}_${view}_${cam}`,
          query: `prefab=${id}&view=${view}&cam=${cam}`,
        });
  if (!only?.length && !game)
    shots.push({ name: "lineup", query: "lineup=1&view=flight&cam=iso" });

  const custom = opt("--custom", "")?.split(";").filter(Boolean);
  if (game && custom?.length)
    shots.splice(
      0,
      shots.length,
      ...ids.flatMap((id) =>
        custom.map((c) => {
          const [name, query] = c.split("|");
          return {
            name: `${id}_game_${name}`,
            page: "game.html",
            query: `prefab=${id}&${query}`,
          };
        }),
      ),
    );
  if (args.includes("--plan"))
    shots.splice(0, shots.length, {
      name: "shipyard_plan",
      page: "plan.html",
      query: "review=bow",
    });
  // --shots: keep named suffixes (game: bow/flight/etc; prefab: flight_iso/etc).
  const keepShots = opt("--shots", "")?.split(",").filter(Boolean);
  if (keepShots?.length)
    shots.splice(
      0,
      shots.length,
      ...shots.filter((s) =>
        keepShots.some(
          (k) => s.name.endsWith(`_game_${k}`) || s.name.endsWith(`_${k}`),
        ),
      ),
    );
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
      const mouse = (type, x, y, extraParams = {}) =>
        page("Input.dispatchMouseEvent", {
          type,
          x,
          y,
          button: "left",
          buttons: type === "mouseReleased" ? 0 : 1,
          ...extraParams,
        });
      if (s.orbit) {
        await mouse("mousePressed", cx, cy, { clickCount: 1 });
        for (let i = 1; i <= 10; i++)
          await mouse("mouseMoved", cx + (s.orbit * i) / 10, cy);
        await mouse("mouseReleased", cx + s.orbit, cy, { clickCount: 1 });
      }
      for (let left = s.zoom; Math.abs(left) > 0;) {
        const step = Math.sign(left) * Math.min(Math.abs(left), 300);
        await page("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: cx,
          y: cy,
          deltaX: 0,
          deltaY: step,
        });
        left -= step;
      }
      await sleep(4000);
    }
    const err = await page("Runtime.evaluate", {
      expression: "window.__prefabError || ''",
      returnByValue: true,
    });
    if (err.result.value) console.error(`${s.name}: ${err.result.value}`);
    const m = await page("Runtime.evaluate", {
      expression: "JSON.stringify(window.__prefabMetrics||null)",
      returnByValue: true,
    });
    metrics[s.name] = JSON.parse(m.result.value);
    const shot = await page("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(out, `${s.name}.png`), Buffer.from(shot.data, "base64"));
    const summary = (metrics[s.name] ?? [])
      .map((x) =>
        x.shipDraws !== undefined
          ? `${x.drawCalls} frame draws, ${x.shipDraws} ship draws, ${x.meshes} meshes, ${((x.origin?.triangles ?? 0) / 1000).toFixed(1)}k tris`
          : `${x.drawCalls} draws (main ${x.mainDraws}, glow ${x.glowDraws}), ${x.meshes} meshes, ${x.instances} inst, ${(x.triangles / 1000).toFixed(1)}k tris`,
      )
      .join(" | ");
    console.log(
      `${s.name}.png  ${((Date.now() - t0) / 1000).toFixed(1)} s  ${summary}`,
    );
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
      const r = await page("Runtime.evaluate", {
        expression,
        returnByValue: true,
      });
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
