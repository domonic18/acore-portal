import "server-only";
import Redis from "ioredis";
import { env } from "@/lib/env";

const globalStore = globalThis as unknown as { __redis?: Redis };

export const redis: Redis = globalStore.__redis ?? new Redis(env.REDIS_URL, {
  lazyConnect: false,
  maxRetriesPerRequest: 2,
});

if (process.env.NODE_ENV !== "production") {
  globalStore.__redis = redis;
}
