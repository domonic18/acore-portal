"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { errorMessage, requestJson } from "@/lib/api-client";

/**
 * 用户详情操作(FR-105/FR-104/FR-130):角色分配(自改/末位管理员保护 422,改后吊销目标会话)
 * +积分手调(原因必填 2-255,402=禁止负余额)+徽章授予(重复 409);成功后 router.refresh。
 */
export function UserActions({
  userId,
  role,
  badges,
}: {
  userId: string;
  role: string;
  badges: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [roleValue, setRoleValue] = useState(role);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleMsg, setRoleMsg] = useState<string | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustMsg, setAdjustMsg] = useState<string | null>(null);
  const [adjustBusy, setAdjustBusy] = useState(false);

  const [badgeId, setBadgeId] = useState(badges[0]?.id ?? "");
  const [badgeError, setBadgeError] = useState<string | null>(null);
  const [badgeBusy, setBadgeBusy] = useState(false);

  async function assignRole() {
    setRoleBusy(true);
    setRoleError(null);
    setRoleMsg(null);
    try {
      await requestJson(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: roleValue }),
      });
      setRoleMsg("已保存,该用户会话已重置");
      router.refresh();
    } catch (err) {
      setRoleError(errorMessage(err));
    } finally {
      setRoleBusy(false);
    }
  }

  async function adjust() {
    setAdjustBusy(true);
    setAdjustError(null);
    setAdjustMsg(null);
    try {
      const body = await requestJson<{ balance: number }>(
        `/api/admin/users/${userId}/points-adjust`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            amount: Number(amount) || 0,
            reason,
          }),
        },
      );
      setAdjustMsg(`已调整,当前余额 ${body.balance}`);
      setAmount("");
      setReason("");
      router.refresh();
    } catch (err) {
      setAdjustError(errorMessage(err));
    } finally {
      setAdjustBusy(false);
    }
  }

  async function grant() {
    setBadgeBusy(true);
    setBadgeError(null);
    try {
      await requestJson(`/api/admin/users/${userId}/badges`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ badgeId }),
      });
      router.refresh();
    } catch (err) {
      setBadgeError(errorMessage(err));
    } finally {
      setBadgeBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="text-[14px] font-semibold text-[#dcebf7]">角色分配</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[#93b2ce]">角色(分配后立即吊销该用户全部会话)</span>
            <Select
              value={roleValue}
              onChange={(e) => setRoleValue(e.target.value)}
              className="w-auto min-w-36"
            >
              <option value="user">user</option>
              <option value="moderator">moderator</option>
              <option value="admin">admin</option>
            </Select>
          </label>
          <Button
            type="button"
            variant="primary"
            disabled={roleBusy || roleValue === role}
            onClick={() => void assignRole()}
          >
            {roleBusy ? "分配中…" : "分配角色"}
          </Button>
        </div>
        {roleError && (
          <p role="alert" className="text-sm text-[#eda9a9]">
            {roleError}
          </p>
        )}
        {roleMsg && <p className="text-sm text-[#6ee7b7]">{roleMsg}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[14px] font-semibold text-[#dcebf7]">积分手调</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[#93b2ce]">调整分值(正数=增加,负数=扣减,不可为 0)</span>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="如 50 或 -30"
              className="w-40"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-sm">
            <span className="text-[#93b2ce]">原因(2-255 字,必填,可从常用项选择)</span>
            <Input
              list="adjust-reason-presets"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-w-64"
            />
            <datalist id="adjust-reason-presets">
              <option value="管理员手动调整" />
              <option value="活动补偿" />
              <option value="赞助奖励" />
              <option value="违规扣减" />
              <option value="数据纠错" />
            </datalist>
          </label>
          <Button
            type="button"
            variant="primary"
            disabled={adjustBusy || !amount || Number(amount) === 0 || reason.trim().length < 2}
            onClick={() => void adjust()}
          >
            提交调整
          </Button>
        </div>
        {adjustError && (
          <p role="alert" className="text-sm text-[#eda9a9]">
            {adjustError}
          </p>
        )}
        {adjustMsg && <p className="text-sm text-[#6ee7b7]">{adjustMsg}</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[14px] font-semibold text-[#dcebf7]">徽章授予</h2>
        {badges.length === 0 ? (
          <p className="text-sm text-[#6482a3]">暂无可选徽章,先在后台创建徽章定义。</p>
        ) : (
          <div className="flex items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[#93b2ce]">徽章</span>
              <Select
                value={badgeId}
                onChange={(e) => setBadgeId(e.target.value)}
                className="w-auto min-w-48"
              >
                {badges.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </label>
            <Button
              type="button"
              variant="primary"
              disabled={badgeBusy || !badgeId}
              onClick={grant}
            >
              {badgeBusy ? "授予中…" : "授予"}
            </Button>
          </div>
        )}
        {badgeError && (
          <p role="alert" className="text-sm text-[#eda9a9]">
            {badgeError}
          </p>
        )}
      </section>
    </div>
  );
}
