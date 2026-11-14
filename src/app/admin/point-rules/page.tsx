import { listPointRules } from "@/server/services/points/admin";
import { PointRulesManager } from "@/components/admin/point-rules-manager";

/**
 * 后台积分规则管控(FR-104):获取类事件(注册送分 / 徽章送分)的分值与开关。
 * 消费(shop_payment)与手调(manual_adjust)走固定账务路径,不在此页管控。
 */
export default async function AdminPointRulesPage() {
  const rules = await listPointRules();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">积分规则</h1>
        <p className="mt-1 text-[13px] text-[#6482a3]">
          这里管的是「获取类」积分的分值与开关:改动后对新发生的发放即刻生效,已入账的流水不追溯。
        </p>
      </div>

      <PointRulesManager rules={rules} />
    </div>
  );
}
