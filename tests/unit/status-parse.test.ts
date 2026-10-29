import { describe, expect, it } from "vitest";
import { parseServerInfo } from "@/server/services/status/parse";

describe("parseServerInfo", () => {
  it("英文 mock 样例:Uptime + Connection queue", () => {
    const text = "Uptime: 3 days, 4 hours, 12 minutes\nConnection queue: 3";
    expect(parseServerInfo(text)).toEqual({
      uptimeText: "3 days, 4 hours, 12 minutes",
      queueCount: 3,
    });
  });

  it("真机中文构建:服务器运行时间 / 连接队列", () => {
    const text = "Connected players: 0.\n服务器运行时间: 4 minute(s) 5 second(s)\n连接队列: 2";
    expect(parseServerInfo(text)).toEqual({
      uptimeText: "4 minute(s) 5 second(s)",
      queueCount: 2,
    });
  });

  it("缺字段时返回 null(冷启动/格式差异不抛错)", () => {
    expect(parseServerInfo("Connected players: 0.")).toEqual({
      uptimeText: null,
      queueCount: null,
    });
  });
});
