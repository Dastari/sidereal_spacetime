import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    exclude: ["reference/**", "assets/**"],
    // Match CI: native geometry/renderer suites are CPU and memory intensive.
    maxWorkers: 2,
  },
});
