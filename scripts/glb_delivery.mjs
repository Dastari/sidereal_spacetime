/** Exact-byte native GLB delivery. The app and world artifacts are unchanged. */
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, sep } from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

function qualities(header) {
  const values = new Map();
  for (const part of (header ?? "").split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    if (!name) continue;
    let q = 1;
    for (const param of params) {
      const pair = param.trim().split("=");
      if (pair[0] === "q")
        q = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(pair[1] ?? "")
          ? Number(pair[1])
          : 0;
    }
    values.set(name, Math.max(values.get(name) ?? 0, q));
  }
  return {
    gzip: values.get("gzip") ?? values.get("*") ?? 0,
    identity: values.get("identity") ?? (values.get("*") === 0 ? 0 : 1),
  };
}
const tags = (value) => (value ?? "").split(",").map((v) => v.trim());
const weak = (value) => value.replace(/^W\//, "");
const date = (value) => (value ? Date.parse(value) : NaN);
function rangeFor(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!match || (!match[1] && !match[2])) return undefined; // Ignore unsupported/multiple ranges.
  const first = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  const last =
    match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  if (
    !Number.isSafeInteger(first) ||
    !Number.isSafeInteger(last) ||
    first > last ||
    first >= size
  )
    return null;
  return { start: first, end: last };
}

export function glbDelivery(root) {
  const base = resolve(root);
  const hashes = new Map();
  async function digest(file, info) {
    const key = `${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    const old = hashes.get(file);
    if (old?.key === key) return old.promise;
    const promise = (async () => {
      const hash = createHash("sha256");
      for await (const bytes of createReadStream(file)) hash.update(bytes);
      return hash.digest("hex");
    })();
    if (hashes.size >= 2048) hashes.clear();
    hashes.set(file, { key, promise });
    try {
      return await promise;
    } catch (error) {
      hashes.delete(file);
      throw error;
    }
  }
  return function middleware(req, res, next) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://local").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (
      !pathname.startsWith("/assets/") ||
      !pathname.toLowerCase().endsWith(".glb")
    )
      return next();
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    void (async () => {
      const file = resolve(base, `.${pathname}`);
      if (!file.startsWith(base + sep) || (await realpath(file)) !== file) {
        res.writeHead(404).end();
        return;
      }
      const info = await stat(file);
      if (!info.isFile()) {
        res.writeHead(404).end();
        return;
      }
      const q = qualities(req.headers["accept-encoding"]);
      res.setHeader("Vary", "Accept-Encoding");
      if (q.gzip === 0 && q.identity === 0) {
        res.writeHead(406).end();
        return;
      }
      const sha = await digest(file, info);
      const identityTag = `"sha256-${sha}"`;
      const modified = Math.floor(info.mtimeMs / 1000) * 1000;
      const ifRange = req.headers["if-range"];
      const rangeAllowed =
        !ifRange ||
        ifRange === identityTag ||
        (!ifRange.includes('"') && date(ifRange) >= modified);
      const range =
        req.method === "GET" && q.identity > 0 && rangeAllowed
          ? rangeFor(req.headers.range, info.size)
          : undefined;
      const gzip = range === undefined && q.gzip > 0 && q.gzip >= q.identity;
      const etag = gzip ? `W/"sha256-${sha}-gzip6-v1"` : identityTag;
      res.setHeader("Content-Type", "model/gltf-binary");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("ETag", etag);
      res.setHeader("Last-Modified", new Date(modified).toUTCString());
      res.setHeader("Accept-Ranges", "bytes");
      if (gzip) res.setHeader("Content-Encoding", "gzip");
      const match = req.headers["if-match"];
      if (
        (match &&
          !tags(match).some(
            (tag) =>
              tag === "*" ||
              (!tag.startsWith("W/") && !etag.startsWith("W/") && tag === etag),
          )) ||
        (!match && date(req.headers["if-unmodified-since"]) < modified)
      ) {
        res.removeHeader("Content-Encoding");
        res.writeHead(412).end();
        return;
      }
      const none = req.headers["if-none-match"];
      if (
        (none &&
          tags(none).some((tag) => tag === "*" || weak(tag) === weak(etag))) ||
        (!none && date(req.headers["if-modified-since"]) >= modified)
      ) {
        res.writeHead(304).end();
        return;
      }
      if (range === null) {
        res.setHeader("Content-Range", `bytes */${info.size}`);
        res.writeHead(416).end();
        return;
      }
      if (range) {
        res.setHeader(
          "Content-Range",
          `bytes ${range.start}-${range.end}/${info.size}`,
        );
        res.setHeader("Content-Length", range.end - range.start + 1);
        res.statusCode = 206;
      } else if (!gzip) res.setHeader("Content-Length", info.size);
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const source = createReadStream(file, range ?? {});
      if (gzip) await pipeline(source, createGzip({ level: 6 }), res);
      else await pipeline(source, res);
    })().catch((error) => {
      if (res.destroyed) return;
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.removeHeader("Content-Encoding");
      res.removeHeader("Content-Length");
      res
        .writeHead(
          error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500,
        )
        .end();
    });
  };
}
