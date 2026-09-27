/**
 * Write `.br` and `.gz` sidecars beside compressible files in a built app
 * directory so delivery never re-encodes a release per request.
 *
 *   node scripts/precompress_assets.mjs apps/client/dist
 *
 * Encoded bytes are cached by content hash under node_modules/.cache so a
 * rebuild only pays for files whose bytes changed. A sidecar is skipped when
 * compression would not save at least 5% or the file is under 1 KiB.
 */
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompress, constants, gzip } from "node:zlib";
import { promisify } from "node:util";
import { COMPRESSIBLE } from "./glb_delivery.mjs";

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);
const MIN_BYTES = 1024;
const MIN_SAVING = 0.05;
const CONCURRENCY = 4;

async function* walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

async function encode(bytes, extension) {
  // Large meshes favour a faster brotli level; text and small files get the best ratio.
  const quality = bytes.length > 2 * 1024 * 1024 ? 9 : 11;
  const [br, zipped] = await Promise.all([
    brotli(bytes, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: quality,
        [constants.BROTLI_PARAM_SIZE_HINT]: bytes.length,
        [constants.BROTLI_PARAM_MODE]:
          extension === ".glb" || extension === ".wasm"
            ? constants.BROTLI_MODE_GENERIC
            : constants.BROTLI_MODE_TEXT,
      },
    }),
    gz(bytes, { level: 9 }),
  ]);
  return { ".br": br, ".gz": zipped };
}

/** @returns {Promise<{files:number, sidecars:number, bytes:number, brotli:number}>} bytes/brotli count files that gained a .br sidecar. */
export async function precompress(folder, { cache = defaultCache() } = {}) {
  const root = resolve(folder);
  await mkdir(cache, { recursive: true });
  const summary = { files: 0, sidecars: 0, bytes: 0, brotli: 0 };
  const queue = [];
  for await (const file of walk(root)) {
    const extension = extname(file).toLowerCase();
    if (!COMPRESSIBLE.has(extension)) continue;
    queue.push(file);
  }
  let index = 0;
  async function worker() {
    while (index < queue.length) {
      const file = queue[index++];
      const extension = extname(file).toLowerCase();
      const info = await stat(file);
      summary.files++;
      if (info.size < MIN_BYTES) continue;
      const bytes = await readFile(file);
      const key = createHash("sha256").update(bytes).digest("hex");
      let encoded;
      for (const suffix of [".br", ".gz"]) {
        const cached = join(cache, key + suffix);
        let output;
        try {
          output = await readFile(cached);
        } catch {
          encoded ??= await encode(bytes, extension);
          output = encoded[suffix];
          await writeFile(cached, output);
        }
        if (output.length > bytes.length * (1 - MIN_SAVING)) continue;
        await copyFile(cached, file + suffix);
        // Delivery trusts a sidecar only when it is not older than its source.
        await utimes(file + suffix, info.atime, new Date(info.mtimeMs + 1000));
        summary.sidecars++;
        if (suffix === ".br") {
          summary.bytes += bytes.length;
          summary.brotli += output.length;
        }
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return summary;
}

function defaultCache() {
  return fileURLToPath(
    new URL("../node_modules/.cache/sidereal-precompress/", import.meta.url),
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const folder = process.argv[2];
  if (!folder)
    throw new Error("Usage: precompress_assets.mjs <built app directory>");
  const started = Date.now();
  const summary = await precompress(folder);
  const mb = (n) => (n / 1e6).toFixed(1) + " MB";
  console.log(
    `Precompressed ${summary.sidecars} sidecars for ${summary.files} compressible files: ` +
      `brotli ${mb(summary.bytes)} -> ${mb(summary.brotli)} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}
