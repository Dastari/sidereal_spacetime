/**
 * Standalone prefab ship render harness (evidence renders, no database, no auth).
 *
 *   npm run prefab:harness   # http://127.0.0.1:5391/?prefab=fed.s.wren&view=flight&cam=iso
 *
 * Binds to 127.0.0.1 only. Serves the few runtime asset directories the prefab renderer needs
 * straight from the repository (read-only); everything else under /assets is a hard 404 so a
 * missing GLB can never be answered by the SPA index.html fallback.
 */
import { defineConfig, type Plugin } from "vite";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";

const repo = fileURLToPath(new URL("../..", import.meta.url));

/** URL prefix -> candidate repository directories (first existing file wins). */
const MOUNTS: [string, string[]][] = [
  ["/assets/ship-kit/", ["assets/runtime/ship-kit"]],
  ["/assets/materials/", ["assets/runtime/materials"]],
  ["/assets/environment/", ["assets/runtime/environment"]],
  // Component GLBs: the published runtime copy (any art revision) first, else the art-library export.
  ["/assets/ship-components/r001/", ["assets/runtime/ship-components/r001", "assets/art-library/ship-components/r001/glb"]],
  ["/assets/ship-components/", ["assets/runtime/ship-components"]],
];

const TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".hdr": "application/octet-stream",
};

function resolveAsset(url: string): string | null {
  const path = decodeURIComponent(url.split("?")[0]);
  for (const [prefix, dirs] of MOUNTS) {
    if (!path.startsWith(prefix)) continue;
    const rest = normalize(path.slice(prefix.length));
    if (rest.startsWith("..") || rest.includes(`${sep}..`)) return null;
    for (const dir of dirs) {
      const file = join(repo, dir, rest);
      if (existsSync(file) && statSync(file).isFile()) return file;
    }
  }
  return null;
}

function repositoryAssets(): Plugin {
  return {
    name: "prefab-harness-assets",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/assets/")) return next();
        const file = resolveAsset(req.url);
        if (!file) {
          res.statusCode = 404;
          res.end("not found");
          return;
        }
        const ext = file.slice(file.lastIndexOf("."));
        res.setHeader("Content-Type", TYPES[ext] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [repositoryAssets()],
  publicDir: false,
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    fs: {
      allow: [repo],
      deny: [".env", ".env.*", "**/.git/**", "**/.runtime/**", "**/.spacetime-data/**", "**/ops/**", "**/dev.toml", "*.{crt,pem,key,p12,pfx,cer,der}"],
    },
  },
});
