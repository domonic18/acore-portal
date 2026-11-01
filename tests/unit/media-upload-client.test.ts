import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadMediaFiles } from "@/components/admin/media-library";

/**
 * 上传客户端容错:公网测试栈 nginx 对 >1MB 请求返回 HTML 413,
 * 旧实现直接 res.json() 抛 "Unexpected token '<'"。PDF 不触发压缩,
 * 便于在 Node 环境单测响应解析分支。
 */
function pdfFile() {
  return new File([new Uint8Array([37, 80, 68, 70])], "doc.pdf", {
    type: "application/pdf",
  });
}

function mockFetch(response: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadMediaFiles 响应容错", () => {
  it("代理层 HTML 413 → 可读错误,不再抛 JSON 解析异常", async () => {
    mockFetch(
      new Response("<html>\n<head><title>413 Request Entity Too Large</title></head></html>", {
        status: 413,
        headers: { "content-type": "text/html" },
      }),
    );
    await expect(uploadMediaFiles([pdfFile()])).rejects.toThrow(/HTTP 413/);
  });

  it("JSON 错误透传服务端 message", async () => {
    mockFetch(
      new Response(
        JSON.stringify({ error: { code: "TOO_LARGE", message: "单文件不得超过 10MB:x.png" } }),
        { status: 422, headers: { "content-type": "application/json" } },
      ),
    );
    await expect(uploadMediaFiles([pdfFile()])).rejects.toThrow(
      "单文件不得超过 10MB:x.png",
    );
  });

  it("成功返回资产列表", async () => {
    const items = [{ id: "1", url: "/uploads/media/x.png", originalName: "x.png" }];
    mockFetch(
      new Response(JSON.stringify({ items }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(uploadMediaFiles([pdfFile()])).resolves.toEqual(items);
  });

  it("200 但非 JSON → 上传响应异常", async () => {
    mockFetch(new Response("ok", { status: 200, headers: { "content-type": "text/plain" } }));
    await expect(uploadMediaFiles([pdfFile()])).rejects.toThrow("上传响应异常");
  });
});
