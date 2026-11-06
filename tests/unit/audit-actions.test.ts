import { describe, expect, it } from "vitest";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";

/**
 * 2026-11-06 撞库加固:新增审计动作的值域约束
 * - audit_log.action 是 VarChar(64),超长会被截断/报错 → 长度必须 ≤64
 * - 值全局唯一(重复会让后台按动作聚合失真)
 */
describe("AUDIT_ACTION 值域约束", () => {
  it("所有动作值唯一且非空", () => {
    const values = Object.values(AUDIT_ACTION);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(v.length).toBeGreaterThan(0);
  });

  it("所有动作值长度 ≤64(与 audit_log.action 列宽一致)", () => {
    for (const v of Object.values(AUDIT_ACTION)) {
      expect(v.length).toBeLessThanOrEqual(64);
    }
  });

  it("撞库加固相关动作已登记", () => {
    expect(AUDIT_ACTION.LOGIN_SUCCESS).toBe("login_success");
    expect(AUDIT_ACTION.LOGIN_FAILED_UNKNOWN).toBe("login_failed_unknown");
    expect(AUDIT_ACTION.LOGIN_IP_SUSPICIOUS).toBe("login_ip_suspicious");
    expect(AUDIT_ACTION.SECURITY_ALERT).toBe("security_alert");
  });

  it("类别值唯一且 security 类别存在", () => {
    const values = Object.values(AUDIT_CATEGORY);
    expect(new Set(values).size).toBe(values.length);
    expect(AUDIT_CATEGORY.SECURITY).toBe("security");
  });
});
