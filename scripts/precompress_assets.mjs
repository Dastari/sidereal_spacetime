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
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  brotliCompress,
  brotliDecompress,
  constants,
  gzip,
  gunzip,
} from "node:zlib";
import { promisify } from "node:util";
import { COMPRESSIBLE } from "./glb_delivery.mjs";

const brotli = promisify(brotliCompress);
const gz = promisify(gzip);
const decode = { ".br": promisify(brotliDecompress), ".gz": promisify(gunzip) };
// Shared across simultaneous precompress calls, not only the four workers in one call.
const inFlight = new Map();
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

async function publish(cached, output) {
  const temporary = `${cached}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, output, { flag: "wx" });
    // Same-directory rename publishes only complete bytes, including to other processes.
    await rename(temporary, cached);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function cachedEncodings(cache, key, bytes, extension) {
  const location = join(resolve(cache), key);
  let work = inFlight.get(location);
  if (!work) {
    work = (async () => {
      let encoded;
      const outputs = {};
      for (const suffix of [".br", ".gz"]) {
        const cached = location + suffix;
        let output;
        try {
          output = await readFile(cached);
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (output) {
          try {
            // Old builds could publish a truncated entry. A decode alone does not prove
            // Brotli content identity; require the source hash for both encodings.
            const decoded = await decode[suffix](output);
            if (createHash("sha256").update(decoded).digest("hex") !== key)
              output = undefined;
          } catch {
            output = undefined;
          }
        }
        if (!output) {
          encoded ??= await encode(bytes, extension);
          output = encoded[suffix];
          await publish(cached, output);
        }
        outputs[suffix] = output;
      }
      return outputs;
    })();
    inFlight.set(location, work);
  }
  try {
    return await work;
  } finally {
    if (inFlight.get(location) === work) inFlight.delete(location);
  }
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
      const encoded = await cachedEncodings(cache, key, bytes, extension);
      for (const suffix of [".br", ".gz"]) {
        const output = encoded[suffix];
        if (output.length > bytes.length * (1 - MIN_SAVING)) continue;
        // Use the verified in-memory representation; no second read of a mutable cache path.
        await writeFile(file + suffix, output);
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
