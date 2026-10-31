import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',timeout:45000,fullyParallel:false,workers:1,retries:0,
  use:{ baseURL:'http://127.0.0.1:8087',channel:'msedge',headless:true,viewport:{ width:393,height:852 },trace:'retain-on-failure' },
  reporter:'list',
  webServer:{ command:'node tools/serve-preview.cjs 8087',url:'http://127.0.0.1:8087',reuseExistingServer:false,timeout:30000 },
});
