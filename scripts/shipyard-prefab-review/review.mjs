// Manual browser review of the Shipyard prefab editor (not part of npm test).
// Start the dashboard on 127.0.0.1:5392, then: node scripts/shipyard-prefab-review/review.mjs
// (OUT=dir to choose the screenshot folder). Drives every tool and captures 01..11.
// Browser review captures for the prefab editor (01..11).
import { launch, sleep } from "./cdp.mjs";
const B = "http://127.0.0.1:5392";
const OUT = process.env.OUT ?? "/root/sidereal-progress/ships-prefabs/shipyard";
const only = (process.env.ONLY ?? "").split(",").filter(Boolean);
const W = Number(process.env.W ?? 1600);
const H = Number(process.env.H ?? 900);
const b = await launch({ W, H });
const want = (n) => !only.length || only.includes(n);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const clickSel = async (sel) => {
  const r = await b.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({block:'center'}); const r = e.getBoundingClientRect(); return [r.left + r.width/2, r.top + r.height/2]; })()`);
  if (!r) throw Error(`no element ${sel}`);
  await b.click(r[0], r[1]);
  await sleep(200);
};
const hoverWorld = async (x, y) => {
  const [sx, sy] = await b.worldToScreen(x, y);
  await b.move(sx - 3, sy - 3);
  await sleep(60);
  await b.move(sx, sy);
  await sleep(350);
  return [sx, sy];
};
const ghost = () => b.evaluate(`(() => { const g = document.querySelector('.pf-ghost'); return g ? g.getAttribute('class') : ''; })()`);
const status = () => b.evaluate(`document.querySelector('.pf-status')?.textContent ?? ''`);
try {
  // 01 library
  await b.page("Page.navigate", { url: `${B}/shipyard/prefabs` });
  await b.waitFor("document.querySelectorAll('.pf-card img').length >= 12", 300000);
  await sleep(1000);
  if (want("01")) await b.shot(`${OUT}/01_library.png`), log("01");

  // 02 open Wren from the card
  await clickSel('.pf-card[data-prefab="fed.s.wren"] .layout-primary');
  await b.waitFor("location.search.includes('fed.s.wren') && !!document.querySelector('.prefab-plan .pf-volume')", 120000);
  await sleep(800);
  await clickSel('.pf-right .layout-tabs button:nth-child(3)'); // Stats
  await sleep(300);
  if (want("02")) await b.shot(`${OUT}/02_wren_open.png`), log("02");

  // 03 hull paint with a slope tile ghost at the bow
  await b.key("b", "KeyB");
  await sleep(200);
  await clickSel('.pf-tile-grid button[title="Slope 1:1"]');
  await hoverWorld(11.5, 4.5);
  log("03 ghost", await ghost(), "|", await status());
  if (want("03")) await b.shot(`${OUT}/03_hull_slope_ghost.png`);

  // 04 room tool: remove HOLD, then drag a new workshop over its cells
  await b.key("v", "KeyV");
  await sleep(150);
  const [hx, hy] = await b.worldToScreen(5, 1);
  await b.click(hx, hy);
  await sleep(300);
  await b.key("Delete", "Delete");
  await sleep(400);
  await b.key("m", "KeyM");
  await sleep(200);
  await clickSel('.pf-room-types button:nth-child(10)'); // workshop
  const a = await b.worldToScreen(3.2, 0.2);
  const c = await b.worldToScreen(6.8, 1.8);
  await b.move(a[0], a[1]);
  await b.mouse("mousePressed", a[0], a[1]);
  for (let i = 1; i <= 6; i++) {
    await b.page("Input.dispatchMouseEvent", { type: "mouseMoved", x: a[0] + ((c[0] - a[0]) * i) / 6, y: a[1] + ((c[1] - a[1]) * i) / 6, button: "left", buttons: 1 });
    await sleep(60);
  }
  await sleep(300);
  log("04 ghost", await ghost(), "|", await status());
  if (want("04")) await b.shot(`${OUT}/04_room_drag.png`);
  await b.mouse("mouseReleased", c[0], c[1]);
  await sleep(400);

  // 05 edge tool: door between ENGINE and the new workshop
  await b.key("d", "KeyD");
  await sleep(200);
  await clickSel('.pf-edge-types button:nth-child(6)'); // door.standard
  await hoverWorld(3.05, 1.2);
  log("05 ghost", await ghost(), "|", await status());
  if (want("05")) await b.shot(`${OUT}/05_edge_door.png`);
  const [dx, dy] = await b.worldToScreen(3.05, 1.2);
  await b.click(dx, dy);
  await sleep(400);

  // 06 mount tool green ghost (autocannon on the roof)
  await b.key("p", "KeyP");
  await sleep(200);
  const comp = await b.evaluate(`[...document.querySelectorAll('.pf-component')].map(e => e.dataset.component).find(id => id.startsWith('autocannon')) ?? ''`);
  log("component", comp);
  await clickSel(`.pf-component[data-component="${comp}"]`);
  let okAt = null;
  for (const p of [[9.5, 1.0], [9.5, 4.5], [4.0, 1.0], [2.0, 2.5], [8.0, 5.0], [1.5, 2.5]]) {
    await hoverWorld(p[0], p[1]);
    if ((await ghost()).includes("ok")) {
      okAt = p;
      break;
    }
  }
  log("06 ok at", okAt, await status());
  if (want("06")) await b.shot(`${OUT}/06_mount_green.png`);

  // 07 mount tool red ghost over the existing turret
  await hoverWorld(5.5, 3.0);
  log("07 ghost", await ghost(), "|", await status());
  if (want("07")) await b.shot(`${OUT}/07_mount_red.png`);

  // 10 (setup) create an issue: move the turret onto the skylight with arrow keys
  await b.key("v", "KeyV");
  await sleep(150);
  const [tx, ty] = await b.worldToScreen(5.5, 3.0);
  await b.click(tx, ty);
  await sleep(300);
  for (let i = 0; i < 4; i++) await b.key("ArrowRight", "ArrowRight"), await sleep(120);
  await sleep(500);
  await b.key("Escape", "Escape");
  await clickSel('.pf-right .layout-tabs button:nth-child(4)'); // Issues
  await sleep(400);
  await b.evaluate(`document.querySelector('.pf-issues button')?.focus({ focusVisible: true })`);
  await sleep(200);
  log("issues", await b.evaluate(`[...document.querySelectorAll('.pf-issues button')].map(e => e.textContent).join(' | ')`));
  if (want("10")) await b.shot(`${OUT}/10_validation_list.png`);
  await clickSel(".pf-issues button");
  await sleep(500);
  if (want("10")) await b.shot(`${OUT}/10b_issue_selected.png`), log("10b");

  // 11 publish dialog (validation gate should fail)
  await clickSel(".pf-docbar .layout-primary");
  await sleep(1500);
  if (want("11")) await b.shot(`${OUT}/11_publish_gate.png`), log("11");
  await clickSel('.pf-dialog-head button');
  await sleep(300);
  await b.key("z", "KeyZ", { modifiers: 2 }); // undo the moves so the preview is clean
  for (let i = 0; i < 3; i++) await b.key("z", "KeyZ", { modifiers: 2 });
  await sleep(300);

  // 08/09 3D preview
  if (want("08") || want("09")) {
    await clickSel("[data-preview-toggle]");
    await b.waitFor("!!document.querySelector('.prefab-preview canvas') && !document.querySelector('.prefab-preview-status')", 600000).catch((e) => log("preview wait", e.message));
    await sleep(3000);
    log("preview", await b.evaluate(`document.querySelector('.prefab-preview-status')?.textContent ?? 'ready'`), await b.evaluate(`document.querySelector('.pf-preview-metrics')?.textContent`));
    await b.shot(`${OUT}/08_preview_flight.png`);
    await clickSel('.prefab-preview .pf-segmented button:nth-child(2)');
    await sleep(1500);
    await b.waitFor("!document.querySelector('.prefab-preview-status')", 300000).catch(() => {});
    await sleep(3000);
    await b.shot(`${OUT}/09_preview_deck.png`);
    log("08/09");
  }
  log("draft", await b.evaluate(`!!localStorage.getItem('sidereal.prefab.draft.v1:fed.s.wren')`));
  console.log([...new Set(b.logs)].join("\n"));
} finally {
  b.close();
}
