/** Project the actual grammar grid into a real orthographic game frame, without altering it. */
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import type { Scene } from "@babylonjs/core/scene";
import {
  prefabOrigin,
  type ShipPrefabDocumentV1,
} from "@sidereal/content/ship-prefab";
import { placedTilePolygon } from "@sidereal/content/construction-grammar";
export function addBowOverlay(scene: Scene, doc: ShipPrefabDocumentV1) {
  const engine = scene.getEngine(),
    w = engine.getRenderWidth(),
    h = engine.getRenderHeight(),
    vp = new Viewport(0, 0, 1, 1).toGlobal(w, h),
    [ox, oy] = prefabOrigin(doc);
  const at = (x: number, y: number) =>
    Vector3.Project(
      new Vector3(-(y - oy), 0, -(x - ox)),
      Matrix.Identity(),
      scene.getTransformMatrix(),
      vp,
    );
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
  const line = (points: string, colour: string, width: number) => {
    const e = document.createElementNS(svg.namespaceURI, "polyline");
    e.setAttribute("points", points);
    e.setAttribute("stroke", colour);
    e.setAttribute("stroke-width", String(width));
    e.setAttribute("fill", "none");
    svg.appendChild(e);
  };
  const p = (x: number, y: number) => {
    const v = at(x, y);
    return `${v.x},${v.y}`;
  };
  for (let x = 0; x <= 11; x++) line(`${p(x, -2)} ${p(x, 8)}`, "#ffffff55", 1);
  for (let y = -2; y <= 8; y++) line(`${p(0, y)} ${p(11, y)}`, "#ffffff55", 1);
  for (const t of doc.volumes.flatMap((v) => v.tiles).filter((t) => t.bow)) {
    const poly = placedTilePolygon(t);
    line([...poly, poly[0]].map((v) => p(...v)).join(" "), "#ffdf80", 2);
  }
  document.body.appendChild(svg);
  const text = document.createElement("div");
  text.style.cssText =
    "position:absolute;left:20px;top:20px;color:#ffdf80;background:#0d1424dd;padding:12px;font:16px system-ui";
  text.textContent =
    "Actual game frame + projected grammar • 1 m grid • gold = bow tile boundaries • nose x = 11 m";
  document.body.appendChild(text);
}
