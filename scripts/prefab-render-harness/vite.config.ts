/**
 * Standalone prefab ship render harness (evidence renders, no database, no auth).
 *
 *   npm run prefab:harness   # http://127.0.0.1:5391/?prefab=fed.s.wren&view=flight&cam=iso
 *                            # http://127.0.0.1:5391/game.html?prefab=fed.s.wren&interior=1 (game renderer)
 *
 * Binds to 127.0.0.1 only. Serves the few runtime asset directories the prefab renderer needs
 * straight from the repository (read-only); everything else under /assets is a hard 404 so a
 * missing GLB can never be answered by the SPA index.html fallback.
 */
import {
  defineConfig,
  type Plugin,
  type ViteDevServer,
  type PreviewServer,
} from "vite";
import { fileURLToPath } from "node:url";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const repo = fileURLToPath(new URL("../..", import.meta.url));

/** URL prefix -> candidate repository directories (first existing file wins). */
const MOUNTS: [string, string[]][] = [
  ["/assets/ship-kit/", ["assets/runtime/ship-kit"]],
  ["/assets/materials/", ["assets/runtime/materials"]],
  ["/assets/environment/", ["assets/runtime/environment"]],
  // Component GLBs: the published runtime copy first, else the art-library export.
  [
    "/assets/ship-components/r004/",
    [
      "assets/runtime/ship-components/r004",
      "assets/art-library/ship-components/r004/glb",
    ],
  ],
  // game.html (the real game renderer) needs the rest of the published runtime tree.
  ["/assets/", ["assets/runtime"]],
];

const TYPES: Record<string, string> = {
  ".glb": "model/gltf-binary",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".hdr": "application/octet-stream",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gz": "application/gzip",
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
  const mount = (server: ViteDevServer | PreviewServer) => {
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
  };
  return {
    name: "prefab-harness-assets",
    configureServer: mount,
    configurePreviewServer: mount,
  };
}

export default defineConfig({
  define: {
    __PREFAB_SOURCE__: JSON.stringify({
      head: execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: repo,
        encoding: "utf8",
      }).trim(),
      rendererTree: execFileSync(
        "git",
        ["rev-parse", "HEAD:packages/render/src"],
        { cwd: repo, encoding: "utf8" },
      ).trim(),
      frameCallbackSourceSha256: createHash("sha256")
        .update(readFileSync(join(repo, "packages/render/src/index.ts")))
        .digest("hex"),
      probeSourceSha256: createHash("sha256")
        .update(
          readFileSync(
            join(repo, "scripts/prefab-render-harness/performance-probe.ts"),
          ),
        )
        .digest("hex"),
    }),
  },
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [repositoryAssets()],
  publicDir: false,
  esbuild: { jsx: "automatic" },
  clearScreen: false,
  // The hardware probe uses a fixed bundle rather than hundreds of dev-module
  // round trips and HMR reloads. Runtime art remains read-only through the same
  // allowlisted mount; generated code lives in the ignored dependency cache.
  build: {
    outDir: join(repo, "node_modules/.cache/sidereal-prefab-performance"),
    emptyOutDir: true,
    assetsDir: "harness-code",
    rolldownOptions: {
      input: fileURLToPath(new URL("./game.html", import.meta.url)),
    },
  },
  preview: { host: "127.0.0.1" },
  server: {
    host: "127.0.0.1",
    fs: {
      allow: [repo],
      deny: [
        ".env",
        ".env.*",
        "**/.git/**",
        "**/.runtime/**",
        "**/.spacetime-data/**",
        "**/ops/**",
        "**/dev.toml",
        "*.{crt,pem,key,p12,pfx,cer,der}",
      ],
    },
  },
});
