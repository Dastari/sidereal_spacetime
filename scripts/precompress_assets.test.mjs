import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  brotliCompressSync,
  brotliDecompressSync,
  gzipSync,
  gunzipSync,
} from "node:zlib";
import { precompress } from "./precompress_assets.mjs";

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
async function fixture(t, duplicates = 12) {
  const root = await mkdtemp(join(tmpdir(), "sidereal-precompress-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const folder = join(root, "dist"),
    cache = join(root, "cache");
  await mkdir(folder);
  await mkdir(cache);
  const bytes = Buffer.concat([Buffer.from("glTF"), Buffer.alloc(50000, 65)]);
  const files = Array.from({ length: duplicates }, (_, i) =>
    join(folder, `${i}.glb`),
  );
  await Promise.all(files.map((file) => writeFile(file, bytes)));
  return { folder, cache, bytes, files };
}
async function verify(f, summary) {
  assert.equal(summary.files, f.files.length);
  assert.equal(summary.sidecars, f.files.length * 2);
  for (const suffix of [".br", ".gz"]) {
    const cached = await readFile(join(f.cache, sha(f.bytes) + suffix));
    const decode = suffix === ".br" ? brotliDecompressSync : gunzipSync;
    assert.equal(sha(decode(cached)), sha(f.bytes));
    for (const file of f.files)
      assert.deepEqual(await readFile(file + suffix), cached);
  }
}

test("duplicate producers never expose partial cache entries and share one in-process publication", async (t) => {
  const f = await fixture(t);
  const started = deferred(),
    release = deferred();
  const originalWrite = fs.promises.writeFile;
  let writes = 0,
    peer;
  const cachedBr = join(f.cache, sha(f.bytes) + ".br");
  // Hold the actual writer after opening/truncating its destination. Workers may continue
  // reading the same key. The old direct publication exposes an empty final entry here.
  fs.promises.writeFile = async (path, data, options) => {
    if (String(path).startsWith(f.cache) && String(path).includes(".br")) {
      writes++;
      await originalWrite(path, Buffer.alloc(0), options);
      started.resolve();
      await release.promise;
      options = { ...options, flag: "w" };
    }
    return originalWrite(path, data, options);
  };
  syncBuiltinESMExports();
  const producing = precompress(f.folder, { cache: f.cache });
  try {
    await started.promise;
    // A second invocation uses the same key while publication is paused, independently of
    // whether the initial four workers happened to reach their first cache read together.
    const other = join(f.folder, "peer");
    await mkdir(other);
    await originalWrite(join(other, "peer.glb"), f.bytes);
    peer = precompress(other, { cache: f.cache });
    const visible = await readFile(cachedBr).then(
      (bytes) => bytes,
      (e) => {
        if (e.code === "ENOENT") return null;
        throw e;
      },
    );
    if (visible) assert.equal(sha(brotliDecompressSync(visible)), sha(f.bytes));
    assert.equal(
      visible,
      null,
      "cache key must remain absent until complete publication",
    );
    release.resolve();
    const [summary] = await Promise.all([producing, peer]);
    assert.equal(
      writes,
      1,
      "concurrent duplicate content must publish Brotli once",
    );
    // The peer folder was created after the original walk completed.
    await verify(f, summary);
    assert.deepEqual(
      await readFile(join(other, "peer.glb.br")),
      await readFile(cachedBr),
    );
  } finally {
    release.resolve();
    fs.promises.writeFile = originalWrite;
    syncBuiltinESMExports();
    await Promise.allSettled([producing, peer]);
  }
});

test(
  "independent processes publish complete cache entries while another writer is paused",
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t, 4);
    const childCode = `
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    const [folder, cache, module] = process.argv.slice(1);
    const original = fs.promises.writeFile;
    fs.promises.writeFile = async (path, data, options) => {
      if (String(path).startsWith(cache) && String(path).includes(".br")) {
        await original(path, Buffer.alloc(0), options);
        process.send("paused");
        await new Promise(resolve => process.once("message", resolve));
        options = { ...options, flag: "w" };
      }
      return original(path, data, options);
    };
    syncBuiltinESMExports();
    const { precompress } = await import(module);
    await precompress(folder, { cache });
    process.disconnect();
  `;
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        childCode,
        f.folder,
        f.cache,
        new URL("./precompress_assets.mjs", import.meta.url).href,
      ],
      { stdio: ["ignore", "ignore", "pipe", "ipc"] },
    );
    let stderr = "";
    child.stderr.on("data", (data) => (stderr += data));
    const exited = new Promise((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    const paused = new Promise((resolve, reject) => {
      child.once("message", resolve);
      child.once("error", reject);
      child.once("exit", (code) =>
        reject(Error(`producer exited ${code}: ${stderr}`)),
      );
    });
    t.after(() => {
      if (child.exitCode === null) child.kill();
    });
    try {
      assert.equal(await paused, "paused");
      await assert.rejects(readFile(join(f.cache, sha(f.bytes) + ".br")), {
        code: "ENOENT",
      });
      const peer = await fixture(t, 4);
      peer.cache = f.cache;
      await verify(peer, await precompress(peer.folder, { cache: f.cache }));
      child.send("release");
      assert.equal(await exited, 0, stderr);
      await verify(f, { files: f.files.length, sidecars: f.files.length * 2 });
      assert.ok(
        (await readdir(f.cache)).every((name) => !name.endsWith(".tmp")),
      );
    } finally {
      if (child.connected) child.send("release");
    }
  },
);

for (const suffix of [".br", ".gz"])
  for (const damage of ["empty", "truncated", "wrong content"])
    test(`${suffix} ${damage} inherited cache regenerates exact source bytes`, async (t) => {
      const f = await fixture(t, 4);
      const compress = suffix === ".br" ? brotliCompressSync : gzipSync;
      const corrupt =
        damage === "empty"
          ? Buffer.alloc(0)
          : damage === "truncated"
            ? compress(f.bytes).subarray(0, 3)
            : compress(Buffer.alloc(f.bytes.length, 66));
      await writeFile(join(f.cache, sha(f.bytes) + suffix), corrupt);
      await verify(f, await precompress(f.folder, { cache: f.cache }));
      assert.ok(
        (await readdir(f.cache)).every((name) => !name.endsWith(".tmp")),
      );
    });

test("warm valid cache preserves exact encoded bytes without republishing", async (t) => {
  const f = await fixture(t, 4);
  const br = brotliCompressSync(f.bytes),
    gz = gzipSync(f.bytes, { level: 1 });
  await writeFile(join(f.cache, sha(f.bytes) + ".br"), br);
  await writeFile(join(f.cache, sha(f.bytes) + ".gz"), gz);
  await verify(f, await precompress(f.folder, { cache: f.cache }));
  assert.deepEqual(await readFile(f.files[0] + ".br"), br);
  assert.deepEqual(await readFile(f.files[0] + ".gz"), gz);
});
