import { expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { createReviewedNativeSelection } from "./reviewed-native-selection";
function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const candidate = (name: string) => {
    const root = new TransformNode(name, scene);
    return {
      runtime: { root },
      ready: false,
      disposals: 0,
      dispose() {
        this.disposals++;
        root.dispose();
      },
    };
  };
  const handover =
    createReviewedNativeSelection<ReturnType<typeof candidate>>();
  return {
    scene,
    candidate,
    handover,
    close() {
      handover.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
it("keeps the previous body visible while replacement loads and publishes only in a ready render-loop step", () => {
  const f = fixture();
  try {
    const first = f.candidate("first");
    first.ready = true;
    f.handover.stage(f.handover.begin(), first);
    f.handover.publishIfReady((c) => c.ready);
    const second = f.candidate("second");
    f.handover.stage(f.handover.begin(), second);
    expect(first.runtime.root.isEnabled()).toBe(true);
    expect(second.runtime.root.isEnabled()).toBe(false);
    expect(f.handover.publishIfReady((c) => c.ready)).toBeUndefined();
    expect(first.disposals).toBe(0);
    second.ready = true;
    expect(first.runtime.root.isEnabled()).toBe(true);
    expect(second.runtime.root.isEnabled()).toBe(false);
    expect(f.handover.publishIfReady((c) => c.ready)).toBe(second);
    expect(first.disposals).toBe(1);
    expect(second.runtime.root.isEnabled()).toBe(true);
  } finally {
    f.close();
  }
});
it("rejects out-of-order completion and disposes superseded unpublished candidates without replacing current", () => {
  const f = fixture();
  try {
    const first = f.candidate("visible");
    first.ready = true;
    f.handover.stage(f.handover.begin(), first);
    f.handover.publishIfReady((c) => c.ready);
    const staleToken = f.handover.begin(),
      newToken = f.handover.begin(),
      newest = f.candidate("newest");
    f.handover.stage(newToken, newest);
    const stale = f.candidate("stale");
    stale.ready = true;
    expect(f.handover.stage(staleToken, stale)).toBe(false);
    expect(stale.disposals).toBe(1);
    expect(f.handover.pending).toBe(newest);
    expect(f.handover.current).toBe(first);
    expect(first.runtime.root.isEnabled()).toBe(true);
    f.handover.begin();
    expect(newest.disposals).toBe(1);
    expect(f.handover.pending).toBeUndefined();
    expect(first.disposals).toBe(0);
  } finally {
    f.close();
  }
});
it("failed pending candidates preserve visible output; disposal rejects late results and releases each owned candidate once", () => {
  const f = fixture();
  try {
    const first = f.candidate("visible");
    first.ready = true;
    f.handover.stage(f.handover.begin(), first);
    f.handover.publishIfReady((c) => c.ready);
    const failed = f.candidate("failed");
    f.handover.stage(f.handover.begin(), failed);
    f.handover.rejectPending();
    expect(failed.disposals).toBe(1);
    expect(first.runtime.root.isEnabled()).toBe(true);
    const token = f.handover.begin(),
      waiting = f.candidate("waiting");
    f.handover.stage(token, waiting);
    f.handover.dispose();
    f.handover.dispose();
    expect(first.disposals).toBe(1);
    expect(waiting.disposals).toBe(1);
    expect(f.handover.isCurrent(token)).toBe(false);
    const late = f.candidate("late");
    expect(f.handover.stage(token, late)).toBe(false);
    expect(late.disposals).toBe(1);
    expect(f.scene.transformNodes).toHaveLength(0);
    expect(() => f.handover.begin()).toThrow("disposed");
  } finally {
    f.close();
  }
});
