import { describe, expect, it } from "vitest";
import { resolveSubmittedValue } from "@/server/services/settings/values";

/**
 * 敏感字段的提交值解析(保存与测试连接共用):
 * secret=只写不读、空即保持;masked=脱敏回显、回传脱敏形态即未改。
 */
describe("settings/values resolveSubmittedValue", () => {
  describe("secret(只写不读)", () => {
    it("空串 → 保持现值", () => {
      expect(resolveSubmittedValue("old-secret", "", "secret")).toBe("old-secret");
    });

    it("非空 → 覆写", () => {
      expect(resolveSubmittedValue("old-secret", "new-secret", "secret")).toBe("new-secret");
    });

    it("现值缺失 + 空串 → 空串(落空行,不编造凭据)", () => {
      expect(resolveSubmittedValue(undefined, "", "secret")).toBe("");
    });
  });

  describe("masked(连接串脱敏回显)", () => {
    const real = "mysql://acore_reader:secretpw@127.0.0.1:3306/acore_characters";
    const masked = "mysql://acore_reader:***@127.0.0.1:3306/acore_characters";

    it("回传脱敏形态 → 视为未改,保持真值", () => {
      expect(resolveSubmittedValue(real, masked, "masked")).toBe(real);
    });

    it("只改 host、口令位仍是 *** → 口令用现值回填", () => {
      const edited = "mysql://acore_reader:***@10.0.0.9:3306/acore_characters";
      expect(resolveSubmittedValue(real, edited, "masked")).toBe(
        "mysql://acore_reader:secretpw@10.0.0.9:3306/acore_characters",
      );
    });

    it("管理员重填了新口令 → 整串采用", () => {
      const edited = "mysql://acore_reader:newpw@10.0.0.9:3306/acore_characters";
      expect(resolveSubmittedValue(real, edited, "masked")).toBe(edited);
    });

    it("空串 → 保持现值", () => {
      expect(resolveSubmittedValue(real, "", "masked")).toBe(real);
    });

    it("现值无口令 + 提交串带 *** → 不回填(现值本就无口令可填)", () => {
      const noPw = "mysql://acore_reader@127.0.0.1:3306/acore_characters";
      expect(resolveSubmittedValue(noPw, noPw, "masked")).toBe(noPw);
    });
  });

  describe("非敏感字段", () => {
    it("原样返回", () => {
      expect(resolveSubmittedValue("old", "new", undefined)).toBe("new");
    });
  });
});
