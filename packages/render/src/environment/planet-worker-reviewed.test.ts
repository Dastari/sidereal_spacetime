import { expect, test, vi } from "vitest";
import { createPlanetWorkerClient } from "./planet-worker-client";
import type {
  ReviewedAssetDescriptor,
  ReviewedRegistration,
} from "./reviewed-native/reviewed-worker-registry";
import { planetRecipe } from "../../../content/src/environment";
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  messages: any[] = [];
  terminated = false;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(message: any) {
    this.messages.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  reply(message: any) {
    this.onmessage?.({ data: message } as MessageEvent);
  }
}
const descriptor = { id: "gas-r005" } as ReviewedAssetDescriptor;
const registration: ReviewedRegistration = {
  assetKey: "gas-key",
  header: {
    schema: "sidereal.native-planet-kit.v1",
    layout: "gas-bands-and-rings",
    materials: [],
  },
};
test("shared worker leases registration, sends compact builds and releases only final lease", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  FakeWorker.instances = [];
  const client = createPlanetWorkerClient();
  try {
    const first = client.registerReviewed(descriptor),
      second = client.registerReviewed(descriptor),
      worker = FakeWorker.instances[0];
    expect(worker.messages).toHaveLength(1);
    worker.reply({ id: worker.messages[0].id, result: registration });
    expect(await first).toEqual(await second);
    const build = client.buildReviewed("gas-key", {
      bodyId: "body",
      seed: 38,
      lod: 2,
      recipe: planetRecipe("gas", 38),
    });
    expect(worker.messages[1].type).toBe("reviewed-build");
    expect(worker.messages[1]).not.toHaveProperty("nativeKit");
    worker.reply({
      id: worker.messages[1].id,
      result: { batches: [], shadowRadii: [], buildMs: 1 },
    });
    await build;
    await client.releaseReviewed("gas-key");
    expect(worker.messages).toHaveLength(2);
    const release = client.releaseReviewed("gas-key");
    expect(worker.messages[2].type).toBe("reviewed-release");
    worker.reply({ id: worker.messages[2].id, result: { released: true } });
    await release;
    expect(FakeWorker.instances).toHaveLength(1);
  } finally {
    client.dispose();
    vi.unstubAllGlobals();
  }
});
test("fatal worker error invalidates registrations and permits explicit registration retry on a new worker", async () => {
  vi.stubGlobal("Worker", FakeWorker);
  FakeWorker.instances = [];
  const client = createPlanetWorkerClient();
  try {
    const first = client.registerReviewed(descriptor),
      old = FakeWorker.instances[0];
    old.onmessageerror?.();
    await expect(first).rejects.toThrow("decoded");
    expect(old.terminated).toBe(true);
    await expect(
      client.buildReviewed("gas-key", {
        bodyId: "x",
        seed: 38,
        lod: 0,
        recipe: planetRecipe("gas", 38),
      }),
    ).rejects.toThrow("expired");
    const retry = client.registerReviewed(descriptor),
      next = FakeWorker.instances[1];
    next.reply({ id: next.messages[0].id, result: registration });
    expect(await retry).toEqual(registration);
  } finally {
    client.dispose();
    vi.unstubAllGlobals();
  }
});
