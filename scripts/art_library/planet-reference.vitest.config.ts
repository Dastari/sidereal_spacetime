import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "scripts/art_library/planet_reference_composition.test.ts",
      "scripts/art_library/planet_reference_materials.test.ts",
      "scripts/art_library/native_deformation_normals.test.ts",
      "scripts/art_library/gas_reference_composition.test.ts",
    ],
  },
});
