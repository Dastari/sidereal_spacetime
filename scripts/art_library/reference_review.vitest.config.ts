import{defineConfig}from'vitest/config';
import files from './reference_review_test_files.json';
export default defineConfig({test:{testTimeout:90000,fileParallelism:false,maxWorkers:1,include:files}});
