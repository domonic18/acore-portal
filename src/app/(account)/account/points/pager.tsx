"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/format";
import { requestJson } from "@/lib/api-client";
import { POINT_TX_TYPE_LABEL, type PointTxTypeValue } from "@/constants/points";

export type PointTx = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  remark: string | null;
  createdAt: string;
};

/** 服务端注入首页数据,翻页走 GET /api/account/points?page=(契约:客户端翻页) */
export function PointsPager({
  initial,
  page,
  totalPages,
}: {
  initial: PointTx[];
  page: number;
  totalPages: number;
}) {
  const [txs, setTxs] = useState(initial);
  const [current, setCurrent] = useState(page);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(next: number) {
    if (next < 1 || next > totalPages || loading) return;
    setLoading(true);
    setError(null);
    try {
      const body = await requestJson<{ transactions: PointTx[]; page: number }>(
        `/api/account/points?page=${next}`,
      );
      setTxs(body.transactions);
      setCurrent(body.page);
    } catch {
      setError("加载失败,请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 窄屏靠横滚不靠折行(AGENTS 规则 20):表头与数值/时间列 nowrap,
          备注列留可折行空间 */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-body">
              <th className="whitespace-nowrap py-2 pr-3">类型</th>
              <th className="whitespace-nowrap py-2 pr-3">变动</th>
              <th className="whitespace-nowrap py-2 pr-3">变动后余额</th>
              <th className="whitespace-nowrap py-2 pr-3">时间</th>
              <th className="py-2">备注</th>
            </tr>
          </thead>
          <tbody>
            {txs.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-body">
                  暂无积分流水。
                </td>
              </tr>
            ) : (
              txs.map((t) => (
                <tr key={t.id} className="border-b border-line-row">
                  <td className="whitespace-nowrap py-2 pr-3">
                    {POINT_TX_TYPE_LABEL[t.type as PointTxTypeValue] ?? t.type}
                  </td>
                  <td
                    className={`whitespace-nowrap py-2 pr-3 ${t.amount >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {t.amount >= 0 ? "+" : ""}
                    {t.amount}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-foreground">
                    {t.balanceAfter}
                  </td>
                  <td className="whitespace-nowrap py-2 pr-3 text-body">
                    {formatDateTime(t.createdAt)}
                  </td>
                  <td className="min-w-[140px] py-2 break-words text-body">
                    {t.remark ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      {totalPages > 1 && (
        <div className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => go(current - 1)}
            disabled={current <= 1 || loading}
            className="rounded-md border border-line px-3 py-1 disabled:opacity-40"
          >
            上一页
          </button>
          <span className="text-body">
            第 {current} / {totalPages} 页
          </span>
          <button
            type="button"
            onClick={() => go(current + 1)}
            disabled={current >= totalPages || loading}
            className="rounded-md border border-line px-3 py-1 disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
