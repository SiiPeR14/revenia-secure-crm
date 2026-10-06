import { createClient, type RedisClientType } from "redis";

const globalForRedis = globalThis as unknown as { reveniaRedis?: RedisClientType; reveniaRedisConnecting?: Promise<unknown> };

function redisUrl() {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL no está configurado");
  return url;
}

export async function getRedis() {
  const client = globalForRedis.reveniaRedis ?? createClient({ url: redisUrl(), socket: { connectTimeout: 3_000, reconnectStrategy: false } });
  if (!globalForRedis.reveniaRedis) {
    client.on("error", () => console.error("[REDIS] Connection unavailable"));
    globalForRedis.reveniaRedis = client;
  }
  if (!client.isOpen && !globalForRedis.reveniaRedisConnecting) {
    globalForRedis.reveniaRedisConnecting = client.connect().finally(() => { globalForRedis.reveniaRedisConnecting = undefined; });
  }
  if (globalForRedis.reveniaRedisConnecting) await globalForRedis.reveniaRedisConnecting;
  return client;
}

export async function checkRedis() {
  return (await (await getRedis()).ping()) === "PONG";
}

export async function closeRedis() {
  await globalForRedis.reveniaRedisConnecting?.catch(() => undefined);
  const client = globalForRedis.reveniaRedis;
  if (client?.isOpen) await client.close();
  globalForRedis.reveniaRedis = undefined;
}
