#!/usr/bin/env node
/**
 * Crew review captures from the real game renderer (crew.html: createWorld + the voxel crew on a
 * prefab deck). No database, no auth, no new dependencies; binds 127.0.0.1 only.
 *
 *   node scripts/prefab-render-harness/crew-capture.mjs --lineup [--out DIR]
 *     Both bodies in nothing-equipped, every department uniform, every armour set (wardrobe tiers,
 *     EVA suit, r008 department sets): front and back tiles, then lineup-front.png / lineup-back.png.
 *   node scripts/prefab-render-harness/crew-capture.mjs --faces [--out DIR]
 *     Face close-ups per expression (texture-only switching) plus a blink strip.
 *   node scripts/prefab-render-harness/crew-capture.mjs --motion [--out DIR]
 *     Idle / walk / run (unarmed and per held-item class) frame strips and foot-trace numbers
 *     (stance-foot slip, lowest-foot height) in motion.json.
 *
 * Options: --port 5397 (harness), --prefab fed.s.wren, --pos x,y (open deck spot, ship metres),
 * --bodies male,female, --only name,name (tile names), --tile WxH, --cam alpha,beta,radius,height (overrides every view).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cdp, launchChrome, sleep, startHarness } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const out = resolve(opt("--out", "/root/sidereal-progress/crew-2"));
const PORT = Number(opt("--port", 5397));
const prefab = opt("--prefab", "fed.s.wren");
const [TW, TH] = opt("--tile", "360x560").split("x").map(Number);
const only = opt("--only", "")?.split(",").filter(Boolean);
const [PX, PY] = opt("--pos", "0,-1").split(",").map(Number);
const BODIES = opt("--bodies", "male,female").split(",");
const CAM = opt("--cam", "")?.split(",").filter(Boolean).map(Number);
const BASE = `http://127.0.0.1:${PORT}/crew.html`;
mkdirSync(join(out, "tiles"), { recursive: true });

const set = (prefix, slots) => slots.map((s) => `${prefix}-${s}`);
const LEGACY_SLOTS = [
  "helmet",
  "visor",
  "chest",
  "shoulders",
  "gloves",
  "belt",
  "legs",
  "boots",
  "back",
];
const legacy = (dept) => set(`crew-${dept}`, LEGACY_SLOTS);
const TIER_SLOTS = [
  "chest",
  "shoulders",
  "gloves",
  "belt",
  "legs",
  "boots",
  "back",
];
/** [name, inventory definition ids]; unknown ids (a set without a visor) are skipped by crew.ts. */
const OUTFITS = [
  ["nothing", []],
  ["uniform-command", ["wardrobe-uniform-command"]],
  ["uniform-medical", ["wardrobe-uniform-medical"]],
  ["uniform-engineering", ["wardrobe-uniform-engineering"]],
  ["uniform-security", ["wardrobe-uniform-security"]],
  ["t1-set", set("wardrobe-t1", TIER_SLOTS)],
  ["t2-set", set("wardrobe-t2", TIER_SLOTS)],
  [
    "t2-security",
    ["wardrobe-uniform-security", ...set("wardrobe-t2", TIER_SLOTS)],
  ],
  [
    "eva-suit",
    ["body", "helmet", "pack", "boots"].map((s) => `wardrobe-suit-${s}`),
  ],
  ...[
    "captain",
    "engineer",
    "medic",
    "pilot",
    "security",
    "marine",
    "salvage",
    "recon",
    "scientist",
    "mechanic",
  ].map((d) => [`set-${d}`, legacy(d)]),
];
/** Full-body review cameras: alpha, beta, radius, target x, target y (ship metres), target height. */
const view = (alpha, beta, radius, height) =>
  CAM?.length === 4
    ? [CAM[0], CAM[1], CAM[2], PX, PY, CAM[3]]
    : [alpha, beta, radius, PX, PY, height];
const FRONT = view(-Math.PI / 2 + 0.2, 1.42, 5.4, 0.9);
const BACK = view(Math.PI / 2 + 0.2, 1.42, 5.4, 0.9);
const FACE = view(-Math.PI / 2 + 0.2, 1.5, 1.9, 1.5);

async function main() {
  const vite = await startHarness(PORT);
  const { chrome, endpoint, profile } = await launchChrome(TW, TH);
  // Never leave the browser or the harness server behind (errors, Ctrl-C, timeouts).
  process.on("exit", () => {
    chrome.kill();
    vite?.kill();
    rmSync(profile, { recursive: true, force: true });
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => process.exit(130));
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
    if (msg.method === "Runtime.exceptionThrown")
      logs.push(msg.params.exceptionDetails?.exception?.description);
    if (
      msg.method === "Runtime.consoleAPICalled" &&
      msg.params.type === "error"
    )
      logs.push(msg.params.args.map((a) => a.value ?? "").join(" "));
  });
  await page("Runtime.enable");
  await page("Page.enable");
  await page("Emulation.setDeviceMetricsOverride", {
    width: TW,
    height: TH,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const js = async (expression, awaitPromise = false) => {
    const r = await page("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise,
    });
    if (r.exceptionDetails)
      throw Error(r.exceptionDetails.exception?.description ?? expression);
    return r.result.value;
  };
  const open = async (query) => {
    const search = `?prefab=${prefab}&interior=1&clear=1&x=${PX}&y=${PY}&w=${TW}&h=${TH}&${query}`;
    await page("Page.navigate", { url: BASE + search });
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      try {
        if (
          await js(
            `location.search === ${JSON.stringify(search)} && window.__crewReady === true`,
          )
        )
          break;
      } catch {
        /* navigating */
      }
      await sleep(250);
    }
    const err = await js("window.__crewError || ''");
    if (err) throw Error(err);
    // Hide the HUD text; tiles carry their own label.
    await js(
      `document.getElementById('hud').style.display='none';` +
        `(()=>{const d=document.createElement('div');d.id='tag';` +
        `d.style.cssText='position:absolute;left:0;right:0;top:6px;text-align:center;color:#e8f4ff;` +
        `font:700 15px Helvetica,Arial,sans-serif;text-shadow:0 1px 3px #000,0 0 6px #6b3cff';` +
        `document.body.appendChild(d)})()`,
    );
  };
  const cam = (c) => js(`window.__crewCam = ${JSON.stringify(c)}`);
  const tag = (text) =>
    js(`document.getElementById('tag').textContent = ${JSON.stringify(text)}`);
  const settle = async (minMs = 1200) => {
    await sleep(minMs);
    for (let i = 0; i < 120 && !(await js("window.__crew.settled()")); i++)
      await sleep(250);
  };
  const shot = async (name) => {
    const s = await page("Page.captureScreenshot", { format: "png" });
    const file = join(out, "tiles", `${name}.png`);
    writeFileSync(file, Buffer.from(s.data, "base64"));
    return file;
  };
  const want = (name) => !only?.length || only.some((o) => name.includes(o));

  if (args.includes("--lineup")) {
    const rows = { front: [], back: [] };
    for (const body of BODIES) {
      await open(`body=${body}`);
      for (const [name, ids] of OUTFITS) {
        if (!want(name)) continue;
        await js(`window.__crew.dress(${JSON.stringify(ids)})`);
        await settle();
        for (const [view, c] of [
          ["front", FRONT],
          ["back", BACK],
        ]) {
          await cam(c);
          await tag(`${body} · ${name}`);
          await sleep(400);
          rows[view].push(await shot(`${body}_${name}_${view}`));
        }
        console.log(`${body} ${name}`);
      }
    }
    for (const [view, files] of Object.entries(rows))
      if (files.length) sheet(files, OUTFITS.length, `lineup-${view}.png`);
  }

  if (args.includes("--faces")) {
    const expressions = [
      "neutral",
      "happy",
      "angry",
      "sad",
      "surprised",
      "pain",
      "confused",
      "determined",
      "scared",
      "smug",
      "sleepy",
      "knocked_out",
    ];
    const files = [];
    const blinks = [];
    for (const body of BODIES) {
      await open(`body=${body}`);
      await settle();
      await cam(FACE);
      for (const e of expressions.filter(want)) {
        await js(`window.__crew.expression(${JSON.stringify(e)})`);
        await tag(`${body} · ${e}`);
        await sleep(350);
        files.push(await shot(`face_${body}_${e}`));
      }
      await js("window.__crew.expression(null)");
      // Blink: hold each blink frame (the game advances one frame per 1/24 s on its own).
      await js(
        "(()=>{const f=window.__crew.visual().face;window.__tick=f.tick;f.tick=()=>{};f.setAutoBlink(false);f.blink()})()",
      );
      for (const [i, label] of ["open", "half", "closed", "half"].entries()) {
        if (i === 0)
          await js(
            "(()=>{const f=window.__crew.visual().face;window.__tick.call(f,1)})()",
          );
        else if (i === 1) await js("window.__crew.visual().face.blink()");
        else
          await js(
            "(()=>{const f=window.__crew.visual().face;window.__tick.call(f,1/24+1e-4)})()",
          );
        await tag(`${body} · blink ${label}`);
        await sleep(350);
        blinks.push(await shot(`blink_${body}_${i}`));
      }
      await js(
        "(()=>{const f=window.__crew.visual().face;f.tick=window.__tick;f.setAutoBlink(true)})()",
      );
    }
    sheet(files, expressions.filter(want).length, "faces-expressions.png");
    sheet(blinks, 4, "faces-blink.png");
  }

  if (args.includes("--motion")) {
    const results = {};
    const cases = [
      ["unarmed", undefined],
      ["pistol", "pistol"],
      ["smg", "smg"],
      ["rifle", "rifle"],
      ["shotgun", "shotgun"],
      ["heavy", "heavy-gun"],
      ["beam", "beam-rifle"],
      ["rail", "rail-rifle"],
      ["baton", "baton"],
      ["repair-tool", "repair-tool"],
    ];
    const [SA, SB, SR] = view(-Math.PI / 2 + 1.0, 1.42, 4.6, 0.85);
    const FRAMES = Number(opt("--frames", 10));
    const STEP_MS = Number(opt("--step", 1000 / 12));
    for (const body of BODIES)
      for (const [name, hand] of cases) {
        if (!want(name)) continue;
        await open(`body=${body}${hand ? `&hand=${hand}` : ""}`);
        await settle(2500);
        const key = `${body}_${name}`;
        results[key] = {};
        const gifFrames = [];
        for (const [gait, speed, sprint, combat] of [
          ["idle", 0, false, false],
          ["walk", 2.5, false, false],
          ["run", 4.5, true, false],
          ...(hand ? [["aim", 0, false, true]] : []),
        ]) {
          await js(
            `window.__crew.motion(${combat ? "{ combat: true }" : "undefined"})`,
          );
          await js(`window.__crew.walk(${speed}, ${sprint})`);
          await sleep(1500);
          const trace = await js("window.__crew.footTrace(2.5)", true);
          const support = await js(
            "window.__crew.visual().supportError ?? null",
          );
          results[key][gait] = { ...trace, supportError: support };
          // Even-time strip: freeze the loop, frame the body where it stands, step the clips.
          await js("window.__crew.freeze()");
          await js(
            `(()=>{const p=window.__crew.visual().root.getAbsolutePosition();window.__crewCam=[${SA},${SB},${SR},p.x,-p.z,${0.85}]})()`,
          );
          const files = [];
          for (let f = 0; f < FRAMES; f++) {
            await js(`window.__crew.advance(${STEP_MS})`);
            await tag(`${body} · ${name} · ${gait} ${f + 1}/${FRAMES}`);
            files.push(await shot(`motion_${key}_${gait}_${f}`));
          }
          await js("window.__crew.thaw()");
          gifFrames.push(...files);
          sheet(files, FRAMES, `motion_${key}_${gait}.png`);
        }
        await js("window.__crew.walk(0)");
        await js("window.__crew.motion(undefined)");
        loop(gifFrames, `motion_${key}.gif`, 1000 / STEP_MS);
        console.log(key, JSON.stringify(results[key]));
      }
    writeFileSync(join(out, "motion.json"), JSON.stringify(results, null, 1));
  }

  for (const l of new Set(logs)) console.log(`   ${String(l).slice(0, 300)}`);
  session.close();
  chrome.kill();
  vite?.kill();
  rmSync(profile, { recursive: true, force: true });
}

/** Looping GIF from frames in order (ffmpeg concat + palette; low priority, 2 threads). */
function loop(files, name, fps) {
  const list = join(out, "tiles", `${name}.txt`);
  writeFileSync(
    list,
    files.map((f) => `file '${f}'\nduration ${1 / fps}`).join("\n") + "\n",
  );
  execFileSync(
    "nice",
    [
      "-n",
      "15",
      "ffmpeg",
      "-v",
      "error",
      "-y",
      "-threads",
      "2",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      list,
      "-vf",
      "split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse",
      "-loop",
      "0",
      join(out, name),
    ],
    { stdio: "inherit" },
  );
  rmSync(list);
  console.log(`wrote ${join(out, name)}`);
}

/** Grid sheet from equal-size tiles (ffmpeg xstack; low priority, 2 threads). */
function sheet(files, columns, name) {
  const cols = Math.min(columns, files.length);
  const layout = files
    .map((_, i) => `${(i % cols) * TW}_${Math.floor(i / cols) * TH}`)
    .join("|");
  const inputs = files.flatMap((f) => ["-i", f]);
  const filter =
    files.length === 1
      ? "null"
      : `xstack=inputs=${files.length}:layout=${layout}:fill=black`;
  execFileSync(
    "nice",
    [
      "-n",
      "15",
      "ffmpeg",
      "-v",
      "error",
      "-y",
      "-threads",
      "2",
      ...inputs,
      "-filter_complex",
      filter,
      "-frames:v",
      "1",
      join(out, name),
    ],
    { stdio: "inherit" },
  );
  console.log(`wrote ${join(out, name)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
