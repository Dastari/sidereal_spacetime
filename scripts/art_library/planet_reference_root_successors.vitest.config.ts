import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['scripts/art_library/volcanic_reference_composition_r022.test.ts','scripts/art_library/crystal_reference_composition_r007.test.ts'],testTimeout:30000}});
