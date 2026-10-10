/** Real game presentation in standalone Chromium after explicit T3 unavailable status/open.
 * Private bundle and isolated wire receipt required; reads published approved base assets only.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { cdp, launchChrome, sleep } from "./cdp.mjs";
const [bundlePath, wirePath, output] = process.argv.slice(2);
if (!bundlePath || !wirePath || !output)
  throw Error(
    "Private bundle, isolated wire receipt and external evidence directory required",
  );
const bundle = readFileSync(resolve(bundlePath), "utf8"),
  wire = JSON.parse(readFileSync(resolve(wirePath), "utf8")),
  out = resolve(output);
mkdirSync(out, { recursive: true });
if (
  wire.profile !== 2 ||
  wire.fixtureAdmissionOnly !== true ||
  wire.productionAdmission !== false
)
  throw Error("Qualified private profile wire receipt required");
const { chrome, endpoint, profile } = await launchChrome(1600, 1000),
  session = await cdp(endpoint);
try {
  const { targetId } = await session.send("Target.createTarget", {
    url: "https://sidereal.dastari.net/",
  });
  const { sessionId } = await session.send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  await session.send("Runtime.enable", {}, sessionId);
  await session.send("Page.enable", {}, sessionId);
  const evaluate = async (expression) => {
    const r = await session.send(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  await sleep(1000);
  await evaluate(
    `(async()=>{document.body.innerHTML='<canvas id="view" style="width:100vw;height:100vh;display:block"></canvas><div id="status" style="position:fixed;top:12px;left:12px;color:#9eefff;background:#102036;padding:8px;font:14px monospace">Private physical review</div>';document.body.style.margin='0';const data=Uint8Array.from(atob(${JSON.stringify(bundle)}),c=>c.charCodeAt(0));const source=await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).text();(0,eval)(source);return true})()`,
  );
  const deadline = Date.now() + 60000;
  let state;
  while (Date.now() < deadline) {
    state = await evaluate(
      `(()=>{const r=window.__wayfarerAccess;return {ready:r?.ready,error:r?.error,meshes:r?.scene?.meshes.length}})()`,
    );
    if (state.error) throw Error(state.error);
    if (state.ready) break;
    await sleep(200);
  }
  if (!state.ready)
    throw Error("Normal presentation loading timeout " + JSON.stringify(state));
  await evaluate("window.__wayfarerAccess.scene.getEngine().stopRenderLoop()");
  const receipts = wire.receipts.filter((r) => r.states),
    selected = [
      "initial-pressurised",
      "personnel-cycling-both-sealed",
      "personnel-vacuum-open",
      "cargo-vacuum-open",
    ];
  const evidence = {
    browser: "Playwright cached Chromium via project CDP capture helper",
    renderer: "normal loadPrefabShipPresentation",
    gpu: "SwiftShader; no performance qualification",
    source: wire.shipId,
    frames: [],
    metrics: await evaluate("window.__wayfarerAccess.view.metrics()"),
  };
  for (const label of selected) {
    const receipt = receipts.find((r) => r.label === label);
    if (!receipt) throw Error("Missing accepted wire snapshot " + label);
    for (const view of ["deck", "flight"]) {
      await evaluate(
        `(()=>{const r=window.__wayfarerAccess;r.view.setInterior(${view === "deck"});r.applyReceipt(${JSON.stringify(receipt)});r.scene.activeCamera.setTarget(r.scene.activeCamera.target.clone().set(0,1,1.5));r.scene.activeCamera.setPosition(r.scene.activeCamera.position.clone().set(-23,18,-26));r.scene.render();return r.view.doors()})()`,
      );
      await sleep(500);
      const frame = await session.send(
          "Page.captureScreenshot",
          { format: "png" },
          sessionId,
        ),
        name = `${view}-${label}.png`;
      writeFileSync(join(out, name), Buffer.from(frame.data, "base64"));
      evidence.frames.push({
        name,
        label,
        view,
        doors: await evaluate("window.__wayfarerAccess.view.doors()"),
      });
    }
  }
  writeFileSync(
    join(out, "browser-receipt.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      ready: true,
      frames: evidence.frames.length,
      metrics: evidence.metrics,
    }),
  );
} finally {
  session.close();
  chrome.kill();
  rmSync(profile, { recursive: true, force: true });
}
