// T047 本地性能 profile(M3 Polish;不设 CI 门,结果记 specs/003-m3-community/perf-profile.md)
// 前置:dev server 已起(localhost:3000)、dev 库已迁入文章、SOAP mock 运行中(:7878)
// 口径:①/announcements 归档列表 RSC 渲染 ②/post/[slug] 最长文章(12KB MD)渲染管线
//       ③/api/status 探针缓存命中(warmup 先打满 25s Redis 缓存,计量段全为命中)
// 三者均为公开 GET,无鉴权与数据夹具;api/status 首次冷探针不计量(warmup 消化)
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

const BASE = process.env.PERF_BASE_URL ?? "http://localhost:3000";
const WARMUP = 3;
const N = 20;
// dev 库当前最长的已发布文章(body_md 12043 字符),压力取最长 MD 管线
const POST_SLUG = "魔兽国服关服后错过的坐骑盘点-101款坐骑获取方式";

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0]!,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1]!,
  };
}

async function timed(url: string): Promise<{ ms: number; res: Response }> {
  const t0 = performance.now();
  const res = await fetch(url);
  return { ms: performance.now() - t0, res };
}

async function profileRoute(name: string, path: string, sink: number[]) {
  for (let i = 0; i < WARMUP + N; i++) {
    const { ms, res } = await timed(`${BASE}${path}`);
    if (res.status !== 200) throw new Error(`${path} 第 ${i} 次 status=${res.status}`);
    if (i >= WARMUP) sink.push(ms);
  }
  console.error(`${name} 计量完成(${N} 次)`);
}

async function main() {
  const archiveMs: number[] = [];
  const postMs: number[] = [];
  const statusMs: number[] =[];

  await profileRoute("归档列表", "/announcements", archiveMs);
  await profileRoute("文章详情", `/post/${encodeURI(POST_SLUG)}`, postMs);
  // /api/status:warmup 首次可能触发探针(SOAP 往返),后续命中 25s 缓存;
  // 计量段 20 次远快于 TTL,全为缓存命中
  await profileRoute("状态缓存命中", "/api/status", statusMs);

  console.log(
    JSON.stringify(
      {
        "归档列表 /announcements": stats(archiveMs),
        "文章详情 /post (12KB MD)": stats(postMs),
        "状态缓存命中 /api/status": stats(statusMs),
      },
      (_k, v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v),
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
