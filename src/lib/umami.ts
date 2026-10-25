import "server-only";
import { getConfig } from "@/lib/config";
import { redis } from "@/lib/redis";

/**
 * Umami API client(research R5;apiUrl 含 /api 后缀,如 https://stats.lokta.cn/api):
 * login 取 token → Redis 30min 缓存;查询 401 时强制重登一次;
 * 全链路容错返回 null,不抛未捕获(看板区块级降级,SC-306)。
 */
const TOKEN_KEY = "umami:token";
const TOKEN_TTL_SEC = 30 * 60;

type UmamiConfig = NonNullable<
  Awaited<ReturnType<typeof getConfig>>["umami"]
>;

export async function fetchUmamiToken(force = false): Promise<string | null> {
  const umami = (await getConfig()).umami;
  if (!umami) {
    return null;
  }
  if (!force) {
    const cached = await redis.get(TOKEN_KEY);
    if (cached) {
      return cached;
    }
  }
  try {
    const res = await fetch(`${umami.apiUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: umami.apiUsername,
        password: umami.apiPassword,
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      return null;
    }
    const data = (await res.json()) as { token?: string };
    if (!data.token) {
      return null;
    }
    await redis.set(TOKEN_KEY, data.token, "EX", TOKEN_TTL_SEC);
    return data.token;
  } catch {
    return null;
  }
}

/** GET umami API;未配置/网络失败/401 重登后仍失败 → null */
export async function umamiApiGet(
  path: string,
  params: Record<string, string | number> = {},
): Promise<unknown | null> {
  const umami = (await getConfig()).umami;
  if (!umami) {
    return null;
  }
  try {
    const call = async (token: string) => {
      const qs = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      );
      return fetch(`${umami.apiUrl}${path}?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
    };
    let token = await fetchUmamiToken();
    if (!token) {
      return null;
    }
    let res = await call(token);
    if (res.status === 401) {
      token = await fetchUmamiToken(true);
      if (!token) {
        return null;
      }
      res = await call(token);
    }
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

export type UmamiStatsBlock =
  | { configured: false }
  | {
      configured: true;
      ok: true;
      pv24h: number;
      uv24h: number;
      topReferrers: { domain: string; visits: number }[];
    }
  | { configured: true; ok: false };

/** 看板 umami 区块:24h PV/UV + 来源域 top5(搜索词不可得,降级来源域,research R5) */
export async function getUmamiSummary(): Promise<UmamiStatsBlock> {
  const umami: UmamiConfig | undefined = (await getConfig()).umami;
  if (!umami) {
    return { configured: false };
  }
  const endAt = Date.now();
  const startAt = endAt - 24 * 3600 * 1000;
  const stats = (await umamiApiGet(`/websites/${umami.websiteId}/stats`, {
    startAt,
    endAt,
  })) as { pageview?: { value: number }; visitor?: { value: number } } | null;
  const metrics = (await umamiApiGet(`/websites/${umami.websiteId}/metrics`, {
    startAt,
    endAt,
    type: "referrer",
    limit: 5,
  })) as { x: string; y: number }[] | null;
  if (!stats || !metrics) {
    return { configured: true, ok: false };
  }
  return {
    configured: true,
    ok: true,
    pv24h: stats.pageview?.value ?? 0,
    uv24h: stats.visitor?.value ?? 0,
    topReferrers: metrics.map((m) => ({ domain: m.x, visits: m.y })),
  };
}
