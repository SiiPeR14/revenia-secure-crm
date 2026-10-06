import { checkDatabase } from "@/lib/db/pool";
import { checkRedis } from "@/lib/redis/client";

export async function GET() {
  const [database, redis] = await Promise.allSettled([checkDatabase(), checkRedis()]);
  const databaseReady = database.status === "fulfilled" && database.value;
  const redisReady = redis.status === "fulfilled" && redis.value;
  const healthy = databaseReady && redisReady;
  return Response.json(
    { status: healthy ? "healthy" : "degraded", app: "ok", database: databaseReady ? "ok" : "unavailable", redis: redisReady ? "ok" : "unavailable" },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
