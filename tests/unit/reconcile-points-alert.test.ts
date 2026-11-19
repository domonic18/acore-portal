import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildReconcilePointsCard,
  buildReconcilePointsFailureCard,
} from "../../scripts/cron/reconcile-points-alert";

/**
 * 积分对账的飞书同步单测(2026-11-19):
 * ① 有差异走红卡、无差异走蓝卡(后者兼作「任务确实在跑」的心跳);
 * ② 明细只落账号 id 与两处余额,不落任何凭据;条数封顶但总数以字段给出;
 * ③ 失败走红卡且带失败原因;
 * ④ 守卫:对账脚本必须真的把卡片发出去,且走统一告警出口(禁自带 fetch)。
 */

const REPO_ROOT = join(__dirname, "..", "..");

function fieldValue(card: { fields?: { label: string; value: string }[] }, label: string) {
  return card.fields?.find((f) => f.label === label)?.value;
}

const DIFFS = [
  { userId: "101", stored: 10, computed: 8 },
  { userId: "102", stored: 0, computed: 5 },
];

describe("积分对账卡片", () => {
  it("有差异:红卡 + 差异处数与账户总数齐备", () => {
    const card = buildReconcilePointsCard({ diffs: DIFFS, accounts: 42 });
    expect(card.template).toBe("red");
    expect(card.title).toContain("积分对账发现差异");
    expect(fieldValue(card, "差异处数")).toBe("2 处");
    expect(fieldValue(card, "账户总数")).toBe("42 个");
    expect(card.body).toContain("101");
    expect(card.body).toContain("102");
  });

  it("无差异:蓝卡(区别于「有差异」),不谎报差异数", () => {
    const card = buildReconcilePointsCard({ diffs: [], accounts: 42 });
    expect(card.template).toBe("blue");
    expect(card.title).toContain("积分对账正常");
    expect(fieldValue(card, "差异处数")).toBe("0 处");
  });

  it("明细条数封顶,总数仍在字段里给出(卡片过长会被截断)", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      userId: String(i),
      stored: 1,
      computed: 0,
    }));
    const card = buildReconcilePointsCard({ diffs: many, accounts: 25 });
    expect(fieldValue(card, "差异处数")).toBe("25 处");
    expect(card.body).toContain("另有 15 处");
  });

  it("失败:红卡 + 失败原因入正文;原因为空时给占位", () => {
    const card = buildReconcilePointsFailureCard({ reason: "P1001 连不上库" });
    expect(card.template).toBe("red");
    expect(card.title).toBe("积分对账失败");
    expect(card.body).toContain("P1001 连不上库");
    expect(buildReconcilePointsFailureCard({ reason: "" }).body).toContain("(未记录)");
  });
});

describe("对账脚本接线守卫", () => {
  const script = readFileSync(join(REPO_ROOT, "scripts", "cron", "reconcile-points.ts"), "utf8");

  it("必须调用卡片构造器并发出(否则同步形同虚设)", () => {
    expect(script).toContain("buildReconcilePointsCard");
    expect(script).toContain("buildReconcilePointsFailureCard");
    expect(script).toContain("sendOpsAlert");
  });

  it("走运维告警出口,不得自带 fetch(通道口径统一)", () => {
    expect(script).toContain('import("./ops-alert")');
    expect(script).not.toContain("fetch(");
  });

  it("有差异仍以退出码 2 收口(差异结论不被告警牵连)", () => {
    expect(script).toContain("process.exitCode = 2");
  });
});
