import "server-only";

/**
 * 飞书自定义机器人卡片发送(edge 安全):
 * 本模块可达启动钩子链(instrumentation → shop/delivery → 本模块),
 * Next 14 会为 instrumentation 额外编译一份 edge 产物,任何 node-only 依赖
 * (node:crypto/ioredis/mysql2)都会让 edge 编译失败 ⇒ 签名走 Web Crypto
 * (crypto.subtle) + btoa,不引入 node:crypto(守卫见 tests/unit/instrumentation-graph.test.ts)。
 *
 * 语义:
 * - 未配置 webhook → 返回 not_configured,不抛(调用方只记日志);
 * - 2xx 仍须校验 body.code(19021=签名不符等业务拒绝码不是 HTTP 错误);
 * - 网络错/5xx 视为瞬时,重试一次;
 * - 任何失败都不抛 ⇒ 告警通道故障绝不阻塞商城主链路。
 */

export type FeishuCardTemplate = "red" | "orange" | "blue" | "green" | "turquoise";

export type FeishuCardField = { label: string; value: string };

export type FeishuCard = {
  title: string;
  template?: FeishuCardTemplate;
  /** 键值区(两列) */
  fields?: FeishuCardField[];
  /** 主体(markdown 片段,如失败原因) */
  body?: string;
  /** 脚注 */
  note?: string;
};

export type FeishuSendResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "rejected" | "unreachable"; detail?: string };

const FEISHU_TIMEOUT_MS = 5000;

/** 飞书签名:base64(HMAC-SHA256(key=`${timestamp}\n${secret}`, message="")) */
async function sign(timestamp: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`${timestamp}\n${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(""));
  const bytes = new Uint8Array(sig);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** 卡片 → 飞书 JSON 2.0 载荷 */
export function buildFeishuPayload(card: FeishuCard): Record<string, unknown> {
  const elements: Record<string, unknown>[] = [];
  if (card.fields && card.fields.length > 0) {
    elements.push({
      tag: "div",
      fields: card.fields.map((f) => ({
        is_short: true,
        text: { tag: "lark_md", content: `**${f.label}**\n${f.value}` },
      })),
    });
  }
  if (card.body) {
    elements.push({ tag: "div", text: { tag: "lark_md", content: card.body } });
  }
  if (card.note) {
    elements.push({ tag: "note", elements: [{ tag: "plain_text", content: card.note }] });
  }
  return {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: card.template ?? "red",
        title: { tag: "plain_text", content: card.title },
      },
      elements,
    },
  };
}

type Attempt = { ok: true } | { ok: false; reason: "rejected" | "unreachable"; detail?: string };

async function attemptSend(url: string, secret: string | null, card: FeishuCard): Promise<Attempt> {
  const payload = buildFeishuPayload(card) as Record<string, unknown>;
  if (secret) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    payload.timestamp = timestamp;
    payload.sign = await sign(timestamp, secret);
  }
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(FEISHU_TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, reason: "unreachable", detail: err instanceof Error ? err.message : String(err) };
  }
  if (!resp.ok) {
    // 5xx=瞬时(可重试);4xx=请求本身有问题(重试无意义)
    return {
      ok: false,
      reason: resp.status >= 500 ? "unreachable" : "rejected",
      detail: `HTTP ${resp.status}`,
    };
  }
  // 2xx 不等于成功:飞书用 body.code 表达业务结果(19021=签名不符等)
  const body = (await resp.json().catch(() => null)) as { code?: number; msg?: string } | null;
  if (body && typeof body.code === "number" && body.code !== 0) {
    return { ok: false, reason: "rejected", detail: `code=${body.code}${body.msg ? ` ${body.msg}` : ""}` };
  }
  return { ok: true };
}

/** 发一张卡片;未配置 webhook 直接返回 not_configured(不视为错误) */
export async function sendFeishuCard(
  url: string,
  secret: string | null,
  card: FeishuCard,
): Promise<FeishuSendResult> {
  if (!url) return { ok: false, reason: "not_configured" };
  const first = await attemptSend(url, secret, card);
  if (first.ok) return { ok: true };
  if (first.reason === "rejected") {
    return { ok: false, reason: "rejected", detail: first.detail };
  }
  const second = await attemptSend(url, secret, card);
  if (second.ok) return { ok: true };
  return { ok: false, reason: second.reason, detail: second.detail ?? first.detail };
}
