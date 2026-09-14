import{defineConfig}from'vitest/config';
export default defineConfig({test:{include:['scripts/art_library/reference_full_output_fixed_detail.test.ts'],maxWorkers:1,fileParallelism:false,testTimeout:180000}});
