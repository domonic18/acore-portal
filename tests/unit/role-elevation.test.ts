import { describe, expect, it } from "vitest";
import { needsElevationConfirm } from "@/lib/role-elevation";

/** 角色分配:提权 admin 需二次确认(降权/同级变更不拦) */
describe("lib/role-elevation needsElevationConfirm", () => {
  it("user → admin:需确认", () => {
    expect(needsElevationConfirm("user", "admin")).toBe(true);
  });

  it("moderator → admin:需确认", () => {
    expect(needsElevationConfirm("moderator", "admin")).toBe(true);
  });

  it("降权不需确认(admin → user/modulator)", () => {
    expect(needsElevationConfirm("admin", "user")).toBe(false);
    expect(needsElevationConfirm("admin", "moderator")).toBe(false);
    expect(needsElevationConfirm("moderator", "user")).toBe(false);
  });

  it("同级/无关角色变更不需确认", () => {
    expect(needsElevationConfirm("admin", "admin")).toBe(false);
    expect(needsElevationConfirm("user", "moderator")).toBe(false);
    expect(needsElevationConfirm("user", "user")).toBe(false);
  });
});
