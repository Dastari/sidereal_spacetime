import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { Scene } from "@babylonjs/core/scene";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import {
  verifyCrewSource,
  verifiedCrewSourceBytes,
  sharedCrewContainer,
  instantiateSharedCrewBody,
  fetchVerifiedCrewSource,
} from "./crew-asset-cache";

const engines: NullEngine[] = [];
function scene() {
  const engine = new NullEngine();
  engines.push(engine);
  return new Scene(engine);
}
function descriptor(bytes: Uint8Array, variant = "body:male:lod0") {
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    variant,
    byteLength: bytes.length,
  };
}
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("qualified parsed crew source", () => {
  it("shares an actual verified scene download while copying the requested descriptor before awaiting", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const bytes = new Uint8Array([1, 2]);
    const expected = { ...descriptor(bytes), url: "/assets/crew/body.glb" };
    let respond!: (response: Response) => void;
    const fetch = vi.fn(
      () => new Promise<Response>((resolve) => (respond = resolve)),
    );
    vi.stubGlobal("fetch", fetch);
    const s = scene(),
      first = fetchVerifiedCrewSource(s, expected),
      second = fetchVerifiedCrewSource(s, { ...expected });
    expected.sha256 = "0".repeat(64);
    expected.url = "/assets/different.glb";
    respond(new Response(bytes));
    expect(await first).toBe(await second);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/assets/crew/body.glb");
  });
  it("a source request cannot borrow unverified URL data and retains the same failed descriptor", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const bytes = new Uint8Array([1]);
    const fetch = vi.fn(async () => new Response(new Uint8Array([2])));
    vi.stubGlobal("fetch", fetch);
    const s = scene(),
      expected = { ...descriptor(bytes), url: "/assets/crew/body.glb" };
    await expect(fetchVerifiedCrewSource(s, expected)).rejects.toThrow(
      "integrity",
    );
    await expect(fetchVerifiedCrewSource(s, expected)).rejects.toThrow(
      "integrity",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(
      fetchVerifiedCrewSource(s, {
        ...expected,
        url: "https://outside.invalid/model.glb",
      }),
    ).rejects.toThrow("requested source");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("copies caller bytes and descriptor before asynchronous hashing and returns no mutable source view", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const expected = descriptor(bytes);
    const pending = verifyCrewSource(bytes, expected);
    bytes.fill(9);
    expected.variant = "different";
    const source = await pending;
    expect(source.variant).toBe("body:male:lod0");
    expect([...verifiedCrewSourceBytes(source)]).toEqual([1, 2, 3, 4]);
    verifiedCrewSourceBytes(source).fill(8);
    expect([...verifiedCrewSourceBytes(source)]).toEqual([1, 2, 3, 4]);
  });
  it("refuses wrong digest, wrong length and forged public attestation", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const bytes = new Uint8Array([1]);
    await expect(
      verifyCrewSource(bytes, { ...descriptor(bytes), sha256: "0".repeat(64) }),
    ).rejects.toThrow("integrity");
    await expect(
      verifyCrewSource(bytes, { ...descriptor(bytes), byteLength: 2 }),
    ).rejects.toThrow("descriptor");
    expect(() => verifiedCrewSourceBytes(descriptor(bytes))).toThrow(
      "attestation",
    );
  });
  it("separates verified digest/variant/scene from the ordinary URL cache", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const bytes = new Uint8Array([1, 2]);
    const a = await verifyCrewSource(bytes, descriptor(bytes));
    const b = await verifyCrewSource(
      bytes,
      descriptor(bytes, "body:female:lod0"),
    );
    const load = vi
      .spyOn(SceneLoader, "LoadAssetContainerAsync")
      .mockImplementation(async (_root, _input, s) => new AssetContainer(s));
    const s = scene();
    await sharedCrewContainer(
      s,
      JSON.stringify(["verified-glb", a.sha256, a.variant]),
    );
    const first = await sharedCrewContainer(s, a);
    expect(
      await sharedCrewContainer(
        s,
        await verifyCrewSource(bytes, descriptor(bytes)),
      ),
    ).toBe(first);
    await sharedCrewContainer(s, b);
    await sharedCrewContainer(scene(), a);
    expect(load).toHaveBeenCalledTimes(4);
    expect(load.mock.calls[1][1]).toEqual(bytes);
  });
  it("keeps a qualified parser failure owned by its descriptor without changing legacy retries", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const bytes = new Uint8Array([2]);
    const a = await verifyCrewSource(bytes, descriptor(bytes));
    const load = vi
      .spyOn(SceneLoader, "LoadAssetContainerAsync")
      .mockRejectedValue(new Error("parse failed"));
    const s = scene();
    await expect(sharedCrewContainer(s, a)).rejects.toThrow("parse failed");
    await expect(sharedCrewContainer(s, a)).rejects.toThrow("parse failed");
    expect(load).toHaveBeenCalledTimes(1);
    await expect(sharedCrewContainer(s, "legacy.glb")).rejects.toThrow();
    await expect(sharedCrewContainer(s, "legacy.glb")).rejects.toThrow();
    expect(load).toHaveBeenCalledTimes(3);
  });
  it("independent actor clones survive another actor's cancellation and own separate materials", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const s = scene();
    const bytes = new Uint8Array([3]);
    const source = new AssetContainer(s);
    const mesh = MeshBuilder.CreateBox("body", {}, s);
    mesh.material = new StandardMaterial("body-material", s);
    source.meshes.push(mesh);
    source.rootNodes.push(mesh);
    source.materials.push(mesh.material);
    source.removeAllFromScene();
    vi.spyOn(SceneLoader, "LoadAssetContainerAsync").mockResolvedValue(source);
    const verified = await verifyCrewSource(bytes, descriptor(bytes));
    const first = await instantiateSharedCrewBody(s, verified);
    const second = await instantiateSharedCrewBody(s, verified);
    expect(first.meshes[0]).not.toBe(second.meshes[0]);
    expect(first.materials[0]).not.toBe(second.materials[0]);
    first.dispose();
    expect(second.meshes[0].isDisposed()).toBe(false);
    expect(source.meshes[0].isDisposed()).toBe(false);
    second.dispose();
  });
});
