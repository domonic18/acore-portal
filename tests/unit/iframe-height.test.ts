import { describe, expect, it } from "vitest";
import {
  clampIframeHeight,
  isMessageFromIframe,
  parseIframeHeightMessage,
  resolveIframeOrigin,
} from "@/lib/iframe-height";
import {
  TOOLS_IFRAME_HEIGHT_MAX_PX,
  TOOLS_IFRAME_HEIGHT_MIN_PX,
  TOOLS_IFRAME_HEIGHT_SOURCE,
  TOOLS_IFRAME_HEIGHT_TYPE,
} from "@/constants/tools";

/**
 * 工具页 iframe 高度协议(门户侧纯函数):
 * rank 子站(acore-ranking)上报内容高度 → 门户把 iframe 撑到内容高度。
 */

const HEIGHT_MSG = {
  source: TOOLS_IFRAME_HEIGHT_SOURCE,
  type: TOOLS_IFRAME_HEIGHT_TYPE,
  height: 1234,
};

describe("parseIframeHeightMessage", () => {
  it("解析本协议的高度消息", () => {
    expect(parseIframeHeightMessage(HEIGHT_MSG)).toBe(1234);
  });

  it("来源/类型不符一律拒绝", () => {
    expect(parseIframeHeightMessage({ ...HEIGHT_MSG, source: "other" })).toBeNull();
    expect(parseIframeHeightMessage({ ...HEIGHT_MSG, type: "other" })).toBeNull();
  });

  it("高度非法(非数字/非正/非有限)一律拒绝", () => {
    expect(parseIframeHeightMessage({ ...HEIGHT_MSG, height: "1234" })).toBeNull();
    expect(parseIframeHeightMessage({ ...HEIGHT_MSG, height: 0 })).toBeNull();
    expect(parseIframeHeightMessage({ ...HEIGHT_MSG, height: -1 })).toBeNull();
    expect(parseIframeHeightMessage({ ...HEIGHT_MSG, height: Number.NaN })).toBeNull();
    expect(parseIframeHeightMessage({ ...HEIGHT_MSG, height: Infinity })).toBeNull();
  });

  it("非对象载荷一律拒绝", () => {
    expect(parseIframeHeightMessage(null)).toBeNull();
    expect(parseIframeHeightMessage(undefined)).toBeNull();
    expect(parseIframeHeightMessage("1234")).toBeNull();
    expect(parseIframeHeightMessage(1234)).toBeNull();
  });
});

describe("clampIframeHeight", () => {
  it("区间内取整保留", () => {
    expect(clampIframeHeight(1234)).toBe(1234);
    expect(clampIframeHeight(1234.4)).toBe(1234);
    expect(clampIframeHeight(1234.6)).toBe(1235);
  });

  it("低于下限抬到下限,高于上限压到上限", () => {
    expect(clampIframeHeight(1)).toBe(TOOLS_IFRAME_HEIGHT_MIN_PX);
    expect(clampIframeHeight(999999)).toBe(TOOLS_IFRAME_HEIGHT_MAX_PX);
  });
});

describe("resolveIframeOrigin", () => {
  it("取绝对 URL 的源站", () => {
    expect(resolveIframeOrigin("https://rank.lokta.cn/hardcore")).toBe(
      "https://rank.lokta.cn",
    );
  });

  it("非法 URL 返回 null", () => {
    expect(resolveIframeOrigin("not-a-url")).toBeNull();
  });
});

describe("isMessageFromIframe", () => {
  const contentWindow = { name: "frame" };
  const iframe = {
    contentWindow,
    src: "https://rank.lokta.cn/hardcore",
  };

  it("源窗口与源站都对得上才认", () => {
    expect(
      isMessageFromIframe(
        { source: contentWindow, origin: "https://rank.lokta.cn" },
        iframe,
      ),
    ).toBe(true);
  });

  it("源窗口对不上直接拒", () => {
    expect(
      isMessageFromIframe(
        { source: { name: "other" }, origin: "https://rank.lokta.cn" },
        iframe,
      ),
    ).toBe(false);
  });

  it("源站对不上直接拒", () => {
    expect(
      isMessageFromIframe(
        { source: contentWindow, origin: "https://evil.example.invalid" },
        iframe,
      ),
    ).toBe(false);
  });

  it("iframe 未加载(contentWindow 为空)一律拒", () => {
    expect(
      isMessageFromIframe(
        { source: null, origin: "https://rank.lokta.cn" },
        { contentWindow: null, src: iframe.src },
      ),
    ).toBe(false);
  });

  it("src 非法时只校验源窗口", () => {
    expect(
      isMessageFromIframe(
        { source: contentWindow, origin: "https://whatever.example.invalid" },
        { contentWindow, src: "not-a-url" },
      ),
    ).toBe(true);
  });
});
