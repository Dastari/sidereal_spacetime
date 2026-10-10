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
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
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
      // Private, opt-in local result collection. Never accepts a client path;
      // the operator supplies an outside-repository directory at server start.
      if (req.url === "/__prefab-perf-result" && req.method === "POST") {
        const directory = process.env.SIDEREAL_PREFAB_PERF_RESULTS_DIR;
        if (!directory) {
          res.statusCode = 503;
          res.end("collection disabled");
          return;
        }
        let body = "",
          tooLarge = false;
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
          if (Buffer.byteLength(body) > 65536) {
            tooLarge = true;
            body = "";
          }
        });
        req.on("end", () => {
          try {
            if (tooLarge) {
              res.statusCode = 413;
              res.end();
              return;
            }
            const report = JSON.parse(body);
            if (
              report.status !== "complete" ||
              report.runs?.length !== 2 ||
              !/^[0-9a-f]{40}$/.test(report.metadata?.source?.head ?? "")
            ) {
              res.statusCode = 400;
              res.end("not a completed probe");
              return;
            }
            const key = createHash("sha256")
              .update(body)
              .digest("hex")
              .slice(0, 16);
            mkdirSync(directory, { recursive: true });
            writeFileSync(
              join(
                directory,
                `probe-${report.metadata.source.head.slice(0, 9)}-${key}.json`,
              ),
              JSON.stringify(report, null, 2),
              { flag: "wx" },
            );
            res.statusCode = 201;
            res.end("recorded");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") {
              res.statusCode = 200;
              res.end("already recorded");
            } else {
              res.statusCode = 400;
              res.end("invalid result");
            }
          }
        });
        return;
      }
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
