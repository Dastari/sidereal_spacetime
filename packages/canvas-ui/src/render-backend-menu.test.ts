import { expect, test, vi } from "vitest";
import { drawRenderBackendMenu } from "./render-backend-menu";
import { createRenderBackendPreference } from "../../render/src/render-backend";
import type { CanvasUI } from "./toolkit";

test("renderer selection saves a preference before an explicit reload action", () => {
  const store = {getItem:()=>null,setItem:vi.fn()};
  const preference = createRenderBackendPreference("webgl","webgl",store);
  const buttons = new Map<string,()=>void>(), apply = vi.fn();
  const ui = {text:vi.fn(),paragraph:vi.fn(),button:(id:string,_label:string,_rect:unknown,click:()=>void)=>{buttons.set(id,click);}} as unknown as CanvasUI;
  const draw = () => drawRenderBackendMenu(ui,{x:0,y:0,w:420,h:190},{state:preference.snapshot(),set:preference.set,apply});
  draw();
  expect(buttons.has("graphics-renderer-apply")).toBe(false);
  buttons.get("graphics-renderer-webgpu")!();
  expect(store.setItem).toHaveBeenCalled();
  expect(preference.snapshot().active).toBe("webgl");
  expect(apply).not.toHaveBeenCalled();
  draw();
  buttons.get("graphics-renderer-apply")!();
  expect(apply).toHaveBeenCalledOnce();
});
