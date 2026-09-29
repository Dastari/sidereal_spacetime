/**
 * Shared helpers for the render-harness capture scripts (capture.mjs, crew-capture.mjs): the harness
 * Vite server on 127.0.0.1, the Playwright-cached chrome-headless-shell with SwiftShader WebGL, and a
 * minimal raw Chrome DevTools Protocol session. No new dependencies.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function chromium() {
  const base = join(process.env.HOME ?? "/root", ".cache/ms-playwright");
  for (const dir of readdirSync(base)
    .filter((d) => d.startsWith("chromium_headless_shell"))
    .sort()
    .reverse()) {
    const bin = join(
      base,
      dir,
      "chrome-headless-shell-linux64/chrome-headless-shell",
    );
    if (existsSync(bin)) return bin;
  }
  throw Error("No Playwright chrome-headless-shell in ~/.cache/ms-playwright");
}

export async function up(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

export async function startHarness(port) {
  const base = `http://127.0.0.1:${port}/`;
  if (await up(base)) return null;
  const vite = spawn(
    process.execPath,
    [
      join(repo, "node_modules/vite/bin/vite.js"),
      "--config",
      "scripts/prefab-render-harness/vite.config.ts",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: repo,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  vite.stderr.on("data", (d) => process.stderr.write(d));
  for (let i = 0; i < 120; i++) {
    if (await up(base)) return vite;
    await sleep(250);
  }
  vite.kill();
  throw Error("Harness did not start on " + base);
}

export async function launchChrome(width, height) {
  const profile = mkdtempSync(join(tmpdir(), "prefab-capture-"));
  const chrome = spawn(
    chromium(),
    [
      "--headless",
      "--no-sandbox",
      "--hide-scrollbars",
      "--disable-dev-shm-usage",
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      `--window-size=${width},${height}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  const endpoint = await new Promise((ok, fail) => {
    let buf = "";
    const timer = setTimeout(
      () => fail(Error("chrome did not report a DevTools endpoint")),
      20000,
    );
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
export async function cdp(endpoint) {
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
