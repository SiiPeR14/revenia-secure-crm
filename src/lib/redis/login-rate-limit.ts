import { createHash } from "node:crypto";
import { getRedis } from "./client.ts";

const WINDOW_SECONDS = 15 * 60;
const MAX_ATTEMPTS = 5;

function redisKey(identity: string) {
  return `security:login:${createHash("sha256").update(identity).digest("hex")}`;
}

export async function consumeLoginAttempt(identity: string) {
  const redis = await getRedis();
  const attempts = await redis.eval(
    "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n",
    { keys: [redisKey(identity)], arguments: [String(WINDOW_SECONDS)] },
  ) as number;
  return { allowed: attempts <= MAX_ATTEMPTS, remaining: Math.max(0, MAX_ATTEMPTS - attempts) };
}

export async function resetLoginAttempts(identity: string) {
  await (await getRedis()).del(redisKey(identity));
}
