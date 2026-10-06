import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',fullyParallel:false,workers:1,timeout:45000,
 reporter:[['list'],['html',{open:'never'}]],
 use:{baseURL:'http://localhost:3000',trace:'off',screenshot:'only-on-failure',viewport:{width:1440,height:960}},
 webServer:{command:'npm run dev -- --hostname 127.0.0.1',url:'http://localhost:3000/api/live',reuseExistingServer:!process.env.CI,timeout:120000},
});
