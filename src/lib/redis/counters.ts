import "server-only";
import { redis } from "./index";

/**
 * 计数器取大值(atomic max):「读旧值-比较-写回」在 Lua 内单原子完成,
 * 并发探针不会丢更新(低值无法覆盖高值,issue #77)。
 */
export async function maxCounter(
  key: string,
  value: number,
  ttlSeconds: number,
): Promise<number> {
  const lua = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local incoming = tonumber(ARGV[1])
if incoming > current then current = incoming end
redis.call('SET', KEYS[1], tostring(current), 'EX', ARGV[2])
return current`;
  const result = (await redis.eval(lua, 1, key, String(value), String(ttlSeconds))) as number;
  return Number(result);
}
