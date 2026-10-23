import "server-only";
import { env } from "@/lib/env";

/**
 * AzerothCore SOAP 传输层:urn:AC executeCommand 是单一固定操作,
 * 零依赖 fetch 直封协议(超时经 AbortSignal 精确可控),不引入 WSDL 客户端。
 * 偏差注记:npm `node-soap` 实为无 WSDL/无超时的迷你包,与契约设想 API 不符,已弃用。
 * 连接配置经 lib/env.ts 收口(缺失/非法在模块加载即 fail-fast)。
 */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function extractTag(xml: string, tag: string): string | null {
  const m = xml.match(
    new RegExp(
      `<(?:[\\w.-]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${tag}>`,
      "i",
    ),
  );
  return m?.[1] ?? null;
}

function textContent(raw: string): string {
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*)\]\]>/);
  return cdata?.[1] ?? unescapeXml(raw.trim());
}

/** 抛错语义:超时/连接/鉴权/HTTP 错误/Fault 均按失败处理,由 execute 决定重试与落库 */
export async function rawExecuteCommand(
  command: string,
  timeoutMs: number,
): Promise<string> {
  const { SOAP_URL: url, SOAP_USER: user, SOAP_PASSWORD: password } = env;
  const auth = Buffer.from(`${user}:${password}`, "utf8").toString("base64");
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="urn:AC">` +
    `<SOAP-ENV:Body><ns1:executeCommand>` +
    `<command>${escapeXml(command)}</command>` +
    `</ns1:executeCommand></SOAP-ENV:Body></SOAP-ENV:Envelope>`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: '""',
        Authorization: `Basic ${auth}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new Error(`SOAP 请求超时(${timeoutMs}ms)`);
    }
    throw new Error(
      `SOAP 连接失败: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const bodyText = await res.text();

  if (res.status === 401) {
    throw new Error("SOAP 鉴权失败(401):检查 SOAP_USER/SOAP_PASSWORD");
  }
  if (!res.ok) {
    const fault = extractTag(bodyText, "faultstring");
    throw new Error(
      `SOAP 调用失败(HTTP ${res.status}): ${fault ? textContent(fault) : bodyText.slice(0, 200)}`,
    );
  }
  const fault = extractTag(bodyText, "faultstring");
  if (fault) {
    throw new Error(`SOAP Fault: ${textContent(fault)}`);
  }

  const result = extractTag(bodyText, "result") ?? extractTag(bodyText, "return");
  if (result === null) {
    throw new Error(`SOAP 响应无法解析: ${bodyText.slice(0, 200)}`);
  }
  return textContent(result);
}
