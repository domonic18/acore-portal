import { describe, expect, it } from "vitest";
import { MAIL_TEMPLATE } from "@/constants/mail";
import { renderMail } from "@/lib/mail";

/** T017 POINTS_NOTIFY 渲染(T008 提前实现的 case 补快照断言;无一次性链接) */
describe("renderMail POINTS_NOTIFY", () => {
  it("正 delta:+ 号+绿色+余额+无一次性链接", () => {
    const mail = renderMail(MAIL_TEMPLATE.POINTS_NOTIFY, {
      username: "walker",
      delta: 50,
      balance: 62,
      reason: "手动调整",
    });
    expect(mail.subject).toContain("积分变动通知");
    expect(mail.html).toContain("+50");
    expect(mail.html).toContain("手动调整");
    expect(mail.html).toContain("62");
    expect(mail.html).not.toContain("token=");
    expect(mail.text).toContain("+50");
    expect(mail.text).toContain("62");
  });

  it("负 delta:保留负号;文本与 HTML 同步", () => {
    const mail = renderMail(MAIL_TEMPLATE.POINTS_NOTIFY, {
      username: "walker",
      delta: -8,
      balance: 4,
      reason: "商店消费",
    });
    expect(mail.html).toContain("-8");
    expect(mail.html).not.toContain("+-8");
    expect(mail.text).toContain("-8");
    expect(mail.text).toContain("4");
  });
});
