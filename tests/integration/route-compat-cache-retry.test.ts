import { describe, expect, it, vi } from "vitest";
import { invalidateRouteCache, lookupLegacyRoute } from "@/server/services/routes/route-map";

// vi.spyOn 对 Prisma model Proxy 不可用(spyOn 会破坏 delegate),故整文件 mock @/lib/db:
// findMany 首调用 reject 模拟 DB 瞬断,后续调用透传真实库。
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  let failed = false;
  return {
    prisma: {
      routeMap: {
        findMany: (args: Parameters<typeof actual.prisma.routeMap.findMany>[0]) => {
          if (!failed) {
            failed = true;
            return Promise.reject(new Error("db down"));
          }
          return actual.prisma.routeMap.findMany(args);
        },
      },
    },
  };
});

describe("route_map 缓存失败不固化(503 恢复韧性)", () => {
  it("首次加载失败抛错后,下次请求重新触库而非复用 rejected promise", async () => {
    invalidateRouteCache();
    await expect(lookupLegacyRoute("p:990010")).rejects.toThrow("db down");
    // 修复前:rejected promise 被永久缓存,此后所有旧地址 503 直到进程重启
    await expect(lookupLegacyRoute("p:990010")).resolves.toBeNull();
  });
});
