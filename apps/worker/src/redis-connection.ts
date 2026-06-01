import { type RedisOptions } from 'bullmq';

/** Parse a redis(s):// URL into BullMQ/ioredis connection options. */
export function connectionFromUrl(redisUrl: string): RedisOptions {
  const u = new URL(redisUrl);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    // BullMQ requires this to be null on the connections it drives.
    maxRetriesPerRequest: null,
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
