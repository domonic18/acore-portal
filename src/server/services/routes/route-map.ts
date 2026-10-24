import "server-only";
import { prisma } from "@/lib/db";
import { LEGACY_KEY_PATTERN } from "@/constants/legacy-routes";

/**
 * route_map 旧路由映射(research R8):全量 ≤200 行,进程内缓存 + 写时失效,避免每请求查库。
 * 缓存边界:仅覆盖经本服务的写入;绕过服务直改 DB(手工 SQL/外部工具)需重启或手动失效才可见,
 * M3 后台管理必须走 saveRouteMapping/removeRouteMapping。
 */

type RouteEntry = { newPath: string; enabled: boolean };

let cachePromise: Promise<Map<string, RouteEntry>> | null = null;

function loadCache(): Promise<Map<string, RouteEntry>> {
  cachePromise ??= prisma.routeMap
    .findMany({ select: { oldKey: true, newPath: true, enabled: true } })
    .then(
      (rows) =>
        new Map(rows.map((r) => [r.oldKey, { newPath: r.newPath, enabled: r.enabled }])),
    );
  return cachePromise;
}

export function invalidateRouteCache(): void {
  cachePromise = null;
}

/** 未命中/停用一律 null(上层 404);键格式非法直接拒绝,不触库 */
export async function lookupLegacyRoute(key: string): Promise<string | null> {
  if (!LEGACY_KEY_PATTERN.test(key)) return null;
  const cache = await loadCache();
  const hit = cache.get(key);
  return hit && hit.enabled ? hit.newPath : null;
}

export async function saveRouteMapping(oldKey: string, newPath: string): Promise<void> {
  if (!LEGACY_KEY_PATTERN.test(oldKey)) {
    throw new Error(`route_map 键格式非法: ${oldKey}`);
  }
  if (!newPath.startsWith("/")) {
    throw new Error(`route_map 新路径须以 / 开头: ${newPath}`);
  }
  await prisma.routeMap.upsert({
    where: { oldKey },
    create: { oldKey, newPath },
    update: { newPath, enabled: true },
  });
  invalidateRouteCache();
}

export async function removeRouteMapping(oldKey: string): Promise<void> {
  await prisma.routeMap.delete({ where: { oldKey } });
  invalidateRouteCache();
}
