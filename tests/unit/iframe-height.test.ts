import { describe, expect, it } from "vitest";
import {
  buildHeightAvailableMessage,
  clampIframeHeight,
  isMessageFromIframe,
  parseAvailableHeightRequest,
  parseIframeHeightMessage,
  resolveIframeOrigin,
} from "@/lib/iframe-height";
import {
  EMBED_AVAILABLE_HEIGHT_REQUEST_TYPE,
  EMBED_AVAILABLE_HEIGHT_TYPE,
  EMBED_CHILD_SOURCE,
  EMBED_HEIGHT_MAX_PX,
  EMBED_HEIGHT_MIN_PX,
  EMBED_HEIGHT_TYPE,
  EMBED_PARENT_SOURCE,
} from "@/constants/embed";

/**
 * iframe 嵌入高度协议(门户侧纯函数):
 * ① rank 子站上报内容高度 → 门户把 iframe 撑到内容高度(工具页);
 * ② 门户把 iframe 框高下发给子站 → 子站裁剪内容(首页「最近成就」)。
 */

const HEIGHT_MSG = {
  source: EMBED_CHILD_SOURCE,
  type: EMBED_HEIGHT_TYPE,
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
    expect(clampIframeHeight(1)).toBe(EMBED_HEIGHT_MIN_PX);
    expect(clampIframeHeight(999999)).toBe(EMBED_HEIGHT_MAX_PX);
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

describe("buildHeightAvailableMessage", () => {
  it("产出父页下发可用高度的消息", () => {
    expect(buildHeightAvailableMessage(612)).toEqual({
      source: EMBED_PARENT_SOURCE,
      type: EMBED_AVAILABLE_HEIGHT_TYPE,
      height: 612,
    });
  });

  it("小数取整", () => {
    expect(buildHeightAvailableMessage(612.4)?.height).toBe(612);
    expect(buildHeightAvailableMessage(612.6)?.height).toBe(613);
  });

  it("非法高度不产出消息", () => {
    expect(buildHeightAvailableMessage(0)).toBeNull();
    expect(buildHeightAvailableMessage(-1)).toBeNull();
    expect(buildHeightAvailableMessage(Number.NaN)).toBeNull();
    expect(buildHeightAvailableMessage(Infinity)).toBeNull();
  });
});

describe("parseAvailableHeightRequest", () => {
  it("认子页的索要消息", () => {
    expect(
      parseAvailableHeightRequest({
        source: EMBED_CHILD_SOURCE,
        type: EMBED_AVAILABLE_HEIGHT_REQUEST_TYPE,
      }),
    ).toBe(true);
  });

  it("来源/类型不符一律拒绝", () => {
    expect(
      parseAvailableHeightRequest({
        source: "someone-else",
        type: EMBED_AVAILABLE_HEIGHT_REQUEST_TYPE,
      }),
    ).toBe(false);
    expect(
      parseAvailableHeightRequest({
        source: EMBED_CHILD_SOURCE,
        type: EMBED_AVAILABLE_HEIGHT_TYPE,
      }),
    ).toBe(false);
  });

  it("非对象载荷一律拒绝", () => {
    expect(parseAvailableHeightRequest(null)).toBe(false);
    expect(parseAvailableHeightRequest("available-height-request")).toBe(false);
  });
});
