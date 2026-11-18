import { describe, expect, it } from "vitest";
import { ASSISTANT_SYSTEM_PROMPT } from "@/server/services/assistant/prompt";

/**
 * 助手系统提示词口径守卫:人设/拒答边界/时间工具指引(2026-11-18 用户反馈
 * 「Agent 不知道当前时间」——get_current_time 工具 + 提示词强制先调用)。
 */
describe("ASSISTANT_SYSTEM_PROMPT", () => {
  it("人设与站点口径", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("小塔");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("WOW 怀旧社区门户");
  });

  it("拒答边界(域外话题简短婉拒)", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("拒答边界");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("我只回答 WOW 怀旧服与老克塔站内相关的问题");
  });

  it("时间能力:get_current_time 工具强制先调用,禁止凭记忆猜时间", () => {
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("get_current_time");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("北京时区");
    expect(ASSISTANT_SYSTEM_PROMPT).toContain("不要凭记忆猜测");
  });
});
