import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const config = JSON.parse(
  execFileSync(
    "python3",
    [
      fileURLToPath(new URL("../../scripts/public_config.py", import.meta.url)),
      "client",
    ],
    { encoding: "utf8" },
  ),
) as {
  database: string;
  databaseUrl: string;
  clientPort: number;
  dashboardPort: number;
  allowedHosts: string[];
};
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [react()],
  define: {
    "import.meta.env.VITE_DATABASE": JSON.stringify(
      process.env.VITE_DATABASE ?? config.database,
    ),
    "import.meta.env.VITE_CLIENT_PORT": JSON.stringify(
      String(config.clientPort),
    ),
    "import.meta.env.VITE_DASHBOARD_PORT": JSON.stringify(
      String(config.dashboardPort),
    ),
  },
  server: {
    allowedHosts: config.allowedHosts,
    // A workspace dev server must not expose private repository inputs via /@fs.
    fs: {
      deny: [
        ".env",
        ".env.*",
        ".npmrc",
        ".yarnrc.yml",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        "**/.git/**",
        "**/.runtime/**",
        "**/.spacetime-data/**",
        "**/.tools/**",
        "**/docs/**",
        "**/reference/**",
        "**/assets/art-library/**",
        "**/assets/source/**",
        "**/ops/**",
        "**/output/**",
        "**/AGENTS.md",
        "**/PIVOT.md",
        "**/dev.toml",
      ],
    },
    proxy: { "/v1": { target: config.databaseUrl, ws: true } },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
