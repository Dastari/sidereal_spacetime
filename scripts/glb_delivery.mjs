/**
 * Exact-byte delivery for everything under `/assets/`: published runtime
 * assets (GLB, JSON, PNG, SVG, HDR) and Vite's content-hashed bundle files.
 * Decoded bytes and MIME never change; only transfer encoding and caching do.
 *
 * - Precompressed `.br` / `.gz` sidecars (see precompress_assets.mjs) are
 *   served when the client accepts them; otherwise compressible types are
 *   gzipped on the fly and incompressible ones go out as identity.
 * - Vite bundle files directly under `/assets/` carry a content hash in their
 *   name, so they are immutable. Published runtime assets keep their plain
 *   names and revalidate with a strong sha256 ETag.
 */
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, resolve, sep } from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

const TYPES = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".hdr": "image/vnd.radiance",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".map": "application/json",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
};
/** Types that shrink under a general-purpose compressor; the rest are already entropy coded. */
export const COMPRESSIBLE = new Set([
  ".glb",
  ".gltf",
  ".json",
  ".svg",
  ".hdr",
  ".js",
  ".mjs",
  ".css",
  ".map",
  ".wasm",
  ".txt",
  ".webmanifest",
  ".ttf",
]);
const SIDECARS = new Set([".br", ".gz"]);
/** Vite names emitted bundle files `<name>-<8 char hash>.<ext>` directly under assets/. */
const HASHED_BUNDLE =
  /^\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(?:js|mjs|css|wasm|map|woff2?|ttf)$/;
export const IMMUTABLE = "public, max-age=31536000, immutable";
export const REVALIDATE = "no-cache";

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
  const wildcard = values.get("*");
  return {
    br: values.get("br") ?? wildcard ?? 0,
    gzip: values.get("gzip") ?? wildcard ?? 0,
    identity: values.get("identity") ?? (wildcard === 0 ? 0 : 1),
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

/** A sidecar is only trusted when it is at least as new as the bytes it encodes. */
async function sidecar(file, info, suffix) {
  try {
    const encoded = await stat(file + suffix);
    if (encoded.isFile() && encoded.mtimeMs >= info.mtimeMs) return encoded;
  } catch {
    /* absent */
  }
  return undefined;
}

export function assetDelivery(root) {
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
    if (hashes.size >= 4096) hashes.clear();
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
    if (!pathname.startsWith("/assets/")) return next();
    const extension = extname(pathname).toLowerCase();
    const type = TYPES[extension];
    // Unknown types and the sidecars themselves are not part of the public surface.
    if (!type || SIDECARS.has(extension)) return next();
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
      if (q.br === 0 && q.gzip === 0 && q.identity === 0) {
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
      // Encoding choice: precompressed brotli, then precompressed or on-the-fly
      // gzip, only for compressible types and never alongside a byte range.
      let encoding;
      let source = file;
      if (range === undefined && COMPRESSIBLE.has(extension)) {
        const preferBr = q.br > 0 && q.br >= q.gzip && q.br >= q.identity;
        const preferGzip = q.gzip > 0 && q.gzip >= q.identity;
        if (preferBr && (await sidecar(file, info, ".br"))) {
          encoding = "br";
          source = file + ".br";
        } else if (preferGzip) {
          encoding = "gzip";
          if (await sidecar(file, info, ".gz")) source = file + ".gz";
        }
      }
      const etag = encoding ? `W/"sha256-${sha}-${encoding}"` : identityTag;
      res.setHeader("Content-Type", type);
      res.setHeader(
        "Cache-Control",
        HASHED_BUNDLE.test(pathname) ? IMMUTABLE : REVALIDATE,
      );
      res.setHeader("ETag", etag);
      res.setHeader("Last-Modified", new Date(modified).toUTCString());
      res.setHeader("Accept-Ranges", "bytes");
      if (encoding) res.setHeader("Content-Encoding", encoding);
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
      } else if (!encoding) res.setHeader("Content-Length", info.size);
      else if (source !== file)
        res.setHeader("Content-Length", (await stat(source)).size);
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const stream = createReadStream(source, range ?? {});
      if (encoding === "gzip" && source === file)
        await pipeline(stream, createGzip({ level: 6 }), res);
      else await pipeline(stream, res);
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
