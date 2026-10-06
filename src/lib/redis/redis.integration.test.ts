import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { closeRedis, getRedis } from "./client.ts";
import { consumeLoginAttempt, resetLoginAttempts } from "./login-rate-limit.ts";

after(async () => closeRedis());

describe("Redis login protection", () => {
  it('shares one connection for concurrent production requests',async()=>{
    await closeRedis();const testEnv=process.env as Record<string,string|undefined>;const previous=testEnv.NODE_ENV;testEnv.NODE_ENV='production';
    try{
      const clients=await Promise.all(Array.from({length:20},()=>getRedis()));
      assert.ok(clients.every(client=>client===clients[0]));assert.equal(await clients[0]!.ping(),'PONG');
    }finally{await closeRedis();if(previous===undefined)delete testEnv.NODE_ENV;else testEnv.NODE_ENV=previous;}
  });
  it("blocks the sixth attempt and permits access after an explicit reset", async () => {
    const identity = `integration-${crypto.randomUUID()}@revenia.local`;
    for (let attempt = 1; attempt <= 5; attempt++) {
      assert.equal((await consumeLoginAttempt(identity)).allowed, true);
    }
    assert.equal((await consumeLoginAttempt(identity)).allowed, false);
    await resetLoginAttempts(identity);
    assert.equal((await consumeLoginAttempt(identity)).allowed, true);
    await resetLoginAttempts(identity);
  });
});
