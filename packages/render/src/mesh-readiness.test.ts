import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { renderRootReady, waitForRenderRoot } from "./mesh-readiness";
const engines: NullEngine[] = [];
afterEach(() => {
  engines.splice(0).forEach((engine) => engine.dispose());
  vi.useRealTimers();
});
function fixture() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  const root = new TransformNode("staged", scene);
  root.setEnabled(false);
  const visible = CreateBox("visible", {}, scene);
  visible.parent = root;
  return { scene, root, visible };
}
test("checks all intended shaders under a hidden root, excluding hidden source/flight cohorts", () => {
  const { scene, root, visible } = fixture();
  const pending = vi.spyOn(visible, "isReady").mockReturnValue(false);
  const hidden = new TransformNode("flight", scene);
  hidden.parent = root;
  hidden.setEnabled(false);
  const roof = CreateBox("roof", {}, scene);
  roof.parent = hidden;
  const roofReady = vi.spyOn(roof, "isReady").mockReturnValue(false);
  expect(renderRootReady(root)).toBe(false);
  expect(pending).toHaveBeenCalledWith(true);
  expect(roofReady).not.toHaveBeenCalled();
  expect(renderRootReady(root, true)).toBe(false);
  expect(roofReady).toHaveBeenCalledWith(true);
  pending.mockReturnValue(true);
  expect(renderRootReady(root)).toBe(true);
  expect(root.isEnabled()).toBe(false);
});
test("disposal immediately cancels the owned shader poll without another query", async () => {
  vi.useFakeTimers();
  const { root, visible } = fixture();
  const pending = vi.spyOn(visible, "isReady").mockReturnValue(false);
  const wait = waitForRenderRoot(root, () => true);
  root.dispose();
  expect(await wait).toBe(false);
  await vi.runAllTimersAsync();
  expect(pending).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
test("descriptor revocation cancels warming and a ready replacement can finish", async () => {
  vi.useFakeTimers();
  const { root, visible } = fixture();
  const pending = vi.spyOn(visible, "isReady").mockReturnValue(false);
  let current = true;
  const wait = waitForRenderRoot(root, () => current);
  current = false;
  await vi.advanceTimersByTimeAsync(16);
  expect(await wait).toBe(false);
  pending.mockReturnValue(true);
  expect(await waitForRenderRoot(root, () => true)).toBe(true);
  await vi.runAllTimersAsync();
  expect(vi.getTimerCount()).toBe(0);
});
