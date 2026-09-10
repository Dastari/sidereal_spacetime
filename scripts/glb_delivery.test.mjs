import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, request } from "node:http";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { glbDelivery } from "./glb_delivery.mjs";
const sha = (data) => createHash("sha256").update(data).digest("hex");

test("actual HTTP representation, cache, precondition, range and path behavior", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "sidereal-glb-"));
  await mkdir(join(folder, "assets"));
  const bytes = Buffer.concat([Buffer.from("glTF"), Buffer.alloc(50000, 65)]);
  await writeFile(join(folder, "assets/model.glb"), bytes);
  await symlink("/etc/passwd", join(folder, "assets/escape.glb"));
  const middleware = glbDelivery(folder);
  const server = createServer((req, res) =>
    middleware(req, res, () => res.writeHead(200).end("ordinary asset")),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const get = (headers = {}, path = "/assets/model.glb", method = "GET") =>
    new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: "127.0.0.1",
          port: server.address().port,
          path,
          headers,
          method,
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              bytes: Buffer.concat(chunks),
            }),
          );
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end();
    });
  try {
    const raw = await get();
    const compressed = await get({ "Accept-Encoding": "br, gzip" });
    await t.test(
      "gzip preserves decoded bytes, MIME and variant validators",
      () => {
        assert.equal(raw.status, 200);
        assert.equal(compressed.status, 200);
        assert.equal(raw.headers["content-encoding"], undefined);
        assert.equal(compressed.headers["content-encoding"], "gzip");
        assert.equal(compressed.headers["content-type"], "model/gltf-binary");
        assert.equal(compressed.headers.vary, "Accept-Encoding");
        assert.equal(raw.headers.vary, "Accept-Encoding");
        assert.equal(sha(raw.bytes), sha(bytes));
        assert.equal(sha(gunzipSync(compressed.bytes)), sha(bytes));
        assert.ok(compressed.bytes.length < raw.bytes.length / 10);
        assert.notEqual(raw.headers.etag, compressed.headers.etag);
      },
    );
    await t.test("q values, explicit refusal and wildcard", async () => {
      for (const encoding of ["gzip;q=0", "gzip;q=0.2, identity;q=1", "br"])
        assert.equal(
          (await get({ "Accept-Encoding": encoding })).headers[
            "content-encoding"
          ],
          undefined,
        );
      assert.equal(
        (await get({ "Accept-Encoding": "gzip;q=0, *;q=1" })).headers[
          "content-encoding"
        ],
        undefined,
      );
      assert.equal(
        (await get({ "Accept-Encoding": "*;q=1, identity;q=0" })).headers[
          "content-encoding"
        ],
        "gzip",
      );
      assert.equal(
        (await get({ "Accept-Encoding": "gzip;q=0, identity;q=0" })).status,
        406,
      );
    });
    await t.test("HEAD reports representation without body", async () => {
      const head = await get({ "Accept-Encoding": "gzip" }, undefined, "HEAD");
      assert.equal(head.headers.etag, compressed.headers.etag);
      assert.equal(head.headers["content-encoding"], "gzip");
      assert.equal(head.bytes.length, 0);
    });
    await t.test(
      "conditional GET preserves encoding and respects precedence",
      async () => {
        const unchanged = await get({
          "Accept-Encoding": "gzip",
          "If-None-Match": compressed.headers.etag,
        });
        assert.equal(unchanged.status, 304);
        assert.equal(unchanged.bytes.length, 0);
        assert.equal(unchanged.headers.vary, "Accept-Encoding");
        assert.equal(
          (await get({ "If-None-Match": `W/${raw.headers.etag}` })).status,
          304,
        );
        assert.equal(
          (await get({ "If-Modified-Since": raw.headers["last-modified"] }))
            .status,
          304,
        );
        assert.equal(
          (
            await get({
              "If-None-Match": '"different"',
              "If-Modified-Since": raw.headers["last-modified"],
            })
          ).status,
          200,
        );
        assert.equal((await get({ "If-Match": '"different"' })).status, 412);
        assert.equal((await get({ "If-Match": raw.headers.etag })).status, 200);
        assert.equal(
          (
            await get({
              "If-Unmodified-Since": "Thu, 01 Jan 1970 00:00:00 GMT",
            })
          ).status,
          412,
        );
      },
    );
    await t.test(
      "ranges select raw bytes with strong If-Range and suffix support",
      async () => {
        const part = await get({
          "Accept-Encoding": "gzip",
          Range: "bytes=1-9",
          "If-Range": raw.headers.etag,
        });
        assert.equal(part.status, 206);
        assert.equal(part.headers["content-encoding"], undefined);
        assert.equal(
          part.headers["content-range"],
          `bytes 1-9/${bytes.length}`,
        );
        assert.deepEqual(part.bytes, bytes.subarray(1, 10));
        const suffix = await get({ Range: "bytes=-3" });
        assert.deepEqual(suffix.bytes, bytes.subarray(-3));
        assert.equal((await get({ Range: "bytes=9999999-" })).status, 416);
        assert.equal((await get({ Range: "bytes=-0" })).status, 416);
        for (const validator of [
          '"wrong"',
          `W/${raw.headers.etag}`,
          "Thu, 01 Jan 1970 00:00:00 GMT",
        ]) {
          const full = await get({
            "Accept-Encoding": "gzip",
            Range: "bytes=1-9",
            "If-Range": validator,
          });
          assert.equal(full.status, 200);
          assert.equal(sha(gunzipSync(full.bytes)), sha(bytes));
        }
        assert.equal(
          (
            await get({
              Range: "bytes=1-9",
              "If-Range": raw.headers["last-modified"],
            })
          ).status,
          206,
        );
        assert.equal((await get({ Range: "bytes=0-1,5-6" })).status, 200);
        const gzipOnly = await get({
          "Accept-Encoding": "gzip, identity;q=0",
          Range: "bytes=0-1",
        });
        assert.equal(gzipOnly.status, 200);
        assert.equal(sha(gunzipSync(gzipOnly.bytes)), sha(bytes));
      },
    );
    await t.test(
      "non-GLB behavior is delegated, missing/escaped GLBs never SPA-fallback",
      async () => {
        assert.equal(
          (await get({}, "/assets/ordinary.js")).bytes.toString(),
          "ordinary asset",
        );
        assert.equal((await get({}, "/assets/missing.glb")).status, 404);
        assert.equal((await get({}, "/assets/escape.glb")).status, 404);
        assert.equal((await get({}, "/assets/model.glb", "POST")).status, 405);
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(folder, { recursive: true });
  }
});

test("managed preview configuration serves immutable GLBs, SPA and database proxy", async () => {
  const { preview } = await import("vite");
  const folder = await mkdtemp(join(tmpdir(), "sidereal-preview-"));
  await mkdir(join(folder, "assets"));
  await writeFile(join(folder, "index.html"), "<html>immutable game</html>");
  const bytes = Buffer.concat([Buffer.from("glTF"), Buffer.alloc(10000, 23)]);
  await writeFile(join(folder, "assets/model.glb"), bytes);
  const upstream = createServer((req, res) => res.end(`database:${req.url}`));
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  process.env.SIDEREAL_PUBLIC_ROOT = folder;
  process.env.SIDEREAL_PUBLIC_DATABASE_URL = `http://127.0.0.1:${upstream.address().port}`;
  process.env.SIDEREAL_PUBLIC_ALLOWED_HOSTS = '["example.test"]';
  const { default: config } = await import("./public_client_preview.mjs");
  const app = await preview({
    ...config,
    configFile: false,
    logLevel: "silent",
    preview: { ...config.preview, host: "127.0.0.1", port: 0 },
  });
  const get = (path, headers = {}) =>
    new Promise((resolve, reject) => {
      request(
        {
          hostname: "127.0.0.1",
          port: app.httpServer.address().port,
          path,
          headers,
        },
        (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("error", reject);
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              bytes: Buffer.concat(chunks),
            }),
          );
        },
      )
        .on("error", reject)
        .end();
    });
  try {
    const zipped = await get("/assets/model.glb", {
      "Accept-Encoding": "gzip",
    });
    assert.equal(zipped.status, 200);
    assert.equal(zipped.headers["content-encoding"], "gzip");
    assert.equal(zipped.headers["content-type"], "model/gltf-binary");
    assert.equal(sha(gunzipSync(zipped.bytes)), sha(bytes));
    assert.equal(
      (await get("/")).bytes.toString(),
      "<html>immutable game</html>",
    );
    assert.equal(
      (await get("/callback")).bytes.toString(),
      "<html>immutable game</html>",
    );
    assert.equal(
      (await get("/v1/database/test")).bytes.toString(),
      "database:/v1/database/test",
    );
    assert.equal(
      (
        await get("/assets/model.glb", {
          "If-None-Match": zipped.headers.etag,
          "Accept-Encoding": "gzip",
        })
      ).status,
      304,
    );
  } finally {
    await app.close();
    await new Promise((resolve) => upstream.close(resolve));
    await rm(folder, { recursive: true });
    delete process.env.SIDEREAL_PUBLIC_ROOT;
    delete process.env.SIDEREAL_PUBLIC_DATABASE_URL;
    delete process.env.SIDEREAL_PUBLIC_ALLOWED_HOSTS;
  }
});
