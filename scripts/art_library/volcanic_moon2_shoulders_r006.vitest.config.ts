import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    testTimeout: 30000,
    maxWorkers: 1,
    fileParallelism: false,
    include: ["scripts/art_library/volcanic_moon2_shoulders_r006.test.ts"],
  },
});
