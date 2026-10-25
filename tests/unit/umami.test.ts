import { beforeEach, describe, expect, it, vi } from "vitest";

const { getConfig, redisGet, redisSet } = vi.hoisted(() => ({
  getConfig: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
}));

vi.mock("@/lib/config", () => ({ getConfig: () => getConfig() }));
vi.mock("@/lib/redis", () => ({
  redis: { get: redisGet, set: redisSet },
}));

import {
  fetchUmamiToken,
  getUmamiSummary,
  umamiApiGet,
} from "@/lib/umami";

/** T008:umami client——token 缓存命中/过期重取/查询失败容错(mock fetch+redis) */
const UMAMI = {
  scriptUrl: "https://stats.local/script.js",
  websiteId: "wid-1",
  apiUrl: "https://stats.local/api",
  apiUsername: "viewer",
  apiPassword: "pw",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchUmamiToken(T008)", () => {
  beforeEach(() => {
    getConfig.mockReset();
    redisGet.mockReset();
    redisSet.mockReset();
    vi.unstubAllGlobals();
    getConfig.mockResolvedValue({ umami: UMAMI });
  });

  it("未配置组 → 直接 null,不 fetch", async () => {
    getConfig.mockResolvedValue({ umami: undefined });
    vi.stubGlobal("fetch", vi.fn());
    await expect(fetchUmamiToken()).resolves.toBeNull();
  });

  it("缓存命中不 fetch;无缓存时登录并写 30min TTL", async () => {
    redisGet.mockResolvedValue("cached-token");
    await expect(fetchUmamiToken()).resolves.toBe("cached-token");
    expect(redisGet).toHaveBeenCalledWith("umami:token");

    redisGet.mockResolvedValue(null);
    const fetchMock = vi.fn(async () =>
      jsonResponse({ token: "fresh-token" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchUmamiToken()).resolves.toBe("fresh-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(redisSet).toHaveBeenCalledWith(
      "umami:token",
      "fresh-token",
      "EX",
      1800,
    );
  });

  it("force=true 绕过缓存重取", async () => {
    redisGet.mockResolvedValue("cached-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ token: "fresh-2" })),
    );
    await expect(fetchUmamiToken(true)).resolves.toBe("fresh-2");
    expect(redisGet).not.toHaveBeenCalled();
  });

  it("登录失败/网络异常 → null 不抛", async () => {
    redisGet.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 401 })),
    );
    await expect(fetchUmamiToken()).resolves.toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("boom");
      }),
    );
    await expect(fetchUmamiToken()).resolves.toBeNull();
  });
});

describe("umamiApiGet / getUmamiSummary(T008)", () => {
  beforeEach(() => {
    getConfig.mockReset();
    redisGet.mockReset();
    redisSet.mockReset();
    vi.unstubAllGlobals();
    getConfig.mockResolvedValue({ umami: UMAMI });
    redisGet.mockResolvedValue(null);
  });

  it("API 401 → 强制重登一次后重试成功", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith("/auth/login")) {
        return jsonResponse({ token: "tok-2" });
      }
      const auth = String(
        (init?.headers as Record<string, string>)?.Authorization,
      );
      if (auth === "Bearer null-or-stale") {
        return new Response("unauthorized", { status: 401 });
      }
      return jsonResponse({ ok: 1 });
    });
    // 首次 token 取不到(null)→ 先重登拿 tok-2 → 查询成功
    vi.stubGlobal("fetch", fetchMock);
    await expect(umamiApiGet("/websites/wid-1/stats")).resolves.toEqual({
      ok: 1,
    });
  });

  it("getUmamiSummary:正常聚合 pv/uv/referrers;查询失败=区块级 ok:false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const target = String(url);
        // 注意:/metrics 分支须先于 /stats——主机名 stats.local 含 "/stats"
        if (target.endsWith("/auth/login")) {
          return jsonResponse({ token: "tok" });
        }
        if (target.includes("/metrics")) {
          return jsonResponse([
            { x: "google.com", y: 96 },
            { x: "bing.com", y: 40 },
          ]);
        }
        if (target.includes("/stats")) {
          return jsonResponse({ pageview: { value: 1024 }, visitor: { value: 388 } });
        }
        return new Response("nf", { status: 404 });
      }),
    );
    await expect(getUmamiSummary()).resolves.toEqual({
      configured: true,
      ok: true,
      pv24h: 1024,
      uv24h: 388,
      topReferrers: [
        { domain: "google.com", visits: 96 },
        { domain: "bing.com", visits: 40 },
      ],
    });

    // stats 失败 → ok:false(不拖垮整响应)
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const target = String(url);
        if (target.endsWith("/auth/login")) {
          return jsonResponse({ token: "tok" });
        }
        return new Response("err", { status: 500 });
      }),
    );
    await expect(getUmamiSummary()).resolves.toEqual({
      configured: true,
      ok: false,
    });
  });

  it("未配置 → configured:false", async () => {
    getConfig.mockResolvedValue({ umami: undefined });
    await expect(getUmamiSummary()).resolves.toEqual({ configured: false });
  });
});
