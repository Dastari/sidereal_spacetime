// Minimal raw-CDP helper for driving the dashboard (no playwright dependency).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chromium() {
  const base = join(process.env.HOME ?? "/root", ".cache/ms-playwright");
  for (const dir of readdirSync(base).filter((d) => d.startsWith("chromium_headless_shell")).sort().reverse()) {
    const bin = join(base, dir, "chrome-headless-shell-linux64/chrome-headless-shell");
    if (existsSync(bin)) return bin;
  }
  throw Error("No chrome-headless-shell");
}

export async function launch({ W = 1600, H = 900, profileRoot = process.env.REVIEW_PROFILE_ROOT ?? "output/shipyard-prefab-review" } = {}) {
  const profile = mkdtempSync(join(profileRoot, "chrome-"));
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
    const timer = setTimeout(() => fail(Error("chrome did not start")), 60000);
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
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const page = (m, p) => send(m, p, sessionId);
  const logs = [];
  listeners.push((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.consoleAPICalled" && ["warning", "error"].includes(msg.params.type))
      logs.push(`${msg.params.type}: ${msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
    if (msg.method === "Runtime.exceptionThrown") logs.push(`exception: ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`);
  });
  await page("Runtime.enable");
  await page("Page.enable");
  await page("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  const evaluate = async (expression) => {
    const r = await page("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expression, timeout = 120000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        if (await evaluate(expression)) return true;
      } catch {
        /* navigating */
      }
      await sleep(250);
    }
    throw Error(`timeout waiting for ${expression}`);
  };
  const mouse = async (type, x, y, extra = {}) =>
    page("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
  const move = (x, y) => page("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
  const click = async (x, y) => {
    await move(x, y);
    await mouse("mousePressed", x, y);
    await mouse("mouseReleased", x, y);
  };
  const drag = async (pts) => {
    await move(pts[0][0], pts[0][1]);
    await mouse("mousePressed", pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) {
      await page("Input.dispatchMouseEvent", { type: "mouseMoved", x: p[0], y: p[1], button: "left", buttons: 1 });
      await sleep(40);
    }
    const last = pts[pts.length - 1];
    await mouse("mouseReleased", last[0], last[1]);
  };
  const key = async (k, code = k, extra = {}) => {
    await page("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, ...extra });
    await page("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, ...extra });
  };
  const shot = async (file) => {
    const s = await page("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(s.data, "base64"));
  };
  /** Screen point for a plan world point (m), read from the SVG world transform. */
  const worldToScreen = async (wx, wy) =>
    evaluate(`(() => {
      const svg = document.querySelector('.prefab-plan'); const g = svg.querySelector('.pf-world');
      const m = /translate\\(([-\\d.e]+) ([-\\d.e]+)\\) scale\\(([-\\d.e]+)/.exec(g.getAttribute('transform'));
      const r = svg.getBoundingClientRect();
      return [r.left + Number(m[1]) + ${wx} * Number(m[3]), r.top + Number(m[2]) - ${wy} * Number(m[3])];
    })()`);
  const close = () => {
    ws.close();
    chrome.kill("SIGKILL");
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };
  return { page, evaluate, waitFor, mouse, move, click, drag, key, shot, worldToScreen, close, logs };
}
