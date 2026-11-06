import { describe, expect, it } from "vitest";
import { bannerSchema } from "@/app/api/admin/_shared/banners";

/**
 * Banner 链接校验单一真相源(issue #73):新建与更新共用同一 schema,
 * 表驱动断言空值/站内路径/外链/非法协议在两条路径下行为一致。
 */
describe("bannerSchema 链接规则(新建/更新一致,issue #73)", () => {
  it.each([
    { linkUrl: "", ok: true, desc: "空值" },
    { linkUrl: "/shop", ok: true, desc: "站内路径" },
    { linkUrl: "/tutorial#patch", ok: true, desc: "站内锚点" },
    { linkUrl: "https://example.com/a", ok: true, desc: "https 外链" },
    { linkUrl: "http://example.com/a", ok: true, desc: "http 外链" },
    { linkUrl: "javascript:alert(1)", ok: false, desc: "js 伪协议拒绝" },
    { linkUrl: "ftp://example.com", ok: false, desc: "非 http(s) 协议拒绝" },
    { linkUrl: "example.com/no-scheme", ok: false, desc: "无协议裸域名拒绝" },
  ])("$desc:linkUrl=$linkUrl → $ok", ({ linkUrl, ok }) => {
    const parsed = bannerSchema.safeParse({
      title: "t",
      imageUrl: "/images/a.png",
      linkUrl,
      sort: 0,
      enabled: true,
    });
    expect(parsed.success).toBe(ok);
  });

  it("缺省 linkUrl 归一为空串;sort/enabled 有默认值", () => {
    const parsed = bannerSchema.parse({ title: "t", imageUrl: "/images/a.png" });
    expect(parsed.linkUrl).toBe("");
    expect(parsed.sort).toBe(0);
    expect(parsed.enabled).toBe(true);
  });

  it("imageUrl 同规则:站内/https 放行,http 图片拒绝", () => {
    const base = { title: "t", linkUrl: "" };
    expect(bannerSchema.safeParse({ ...base, imageUrl: "/a.png" }).success).toBe(true);
    expect(bannerSchema.safeParse({ ...base, imageUrl: "https://cdn.x/a.png" }).success).toBe(true);
    expect(bannerSchema.safeParse({ ...base, imageUrl: "http://cdn.x/a.png" }).success).toBe(false);
    expect(bannerSchema.safeParse({ ...base, imageUrl: "" }).success).toBe(false);
  });

  /**
   * 轮播视频地址(2026-11-06):缺省必须解析为 undefined 而非空串——
   * 拖拽排序/启停开关的 payload 不带该字段,一旦解析成 "" 就会把已配视频静默清空。
   */
  describe("bannerSchema videoUrl(轮播视频)", () => {
    const base = { title: "t", imageUrl: "/images/a.png", linkUrl: "" };

    it("缺省 → undefined(保持现值语义),非空串", () => {
      expect(bannerSchema.parse(base).videoUrl).toBeUndefined();
    });

    it.each([
      { videoUrl: "", ok: true, desc: "空串=显式清空" },
      { videoUrl: "/uploads/media/20261106/a.mp4", ok: true, desc: "站内路径" },
      { videoUrl: "https://cdn.example.com/a.mp4", ok: true, desc: "https 外链" },
      { videoUrl: "http://cdn.example.com/a.mp4", ok: false, desc: "http 拒绝" },
      { videoUrl: "javascript:alert(1)", ok: false, desc: "js 伪协议拒绝" },
      { videoUrl: "example.com/a.mp4", ok: false, desc: "无协议裸域名拒绝" },
    ])("$desc:videoUrl=$videoUrl → $ok", ({ videoUrl, ok }) => {
      expect(bannerSchema.safeParse({ ...base, videoUrl }).success).toBe(ok);
    });
  });
});
