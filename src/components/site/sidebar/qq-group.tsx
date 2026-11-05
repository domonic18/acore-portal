"use client";

import { useState } from "react";
import { SidebarCard } from "./card";

/**
 * QQ 交流群卡(2026-11 用户反馈):群号点击复制并显示加群指引,
 * 二维码地址后台可配(空=不渲染);群号空=整卡隐藏。
 * qm.qq.com 加群链接需群 key 无法由群号推导,故采用复制+扫码双路径。
 */
export function QqGroup({ qqGroup, qqGroupQr }: { qqGroup: string; qqGroupQr: string }) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  if (!qqGroup) return null;

  async function copyGroup() {
    try {
      await navigator.clipboard.writeText(qqGroup);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  }

  const hint =
    copied === "ok"
      ? "已复制群号,打开 QQ 搜索群号加群"
      : copied === "fail"
        ? "复制失败,请手动搜索群号加群"
        : "点击群号复制 · QQ 内搜索加群";

  return (
    <SidebarCard title="QQ 交流群" testId="sidebar-qq-group">
      <button
        type="button"
        onClick={copyGroup}
        data-testid="sidebar-qq-group-copy"
        className="group flex w-full items-baseline justify-between gap-2 text-left"
        aria-label={`复制 QQ 群号 ${qqGroup}`}
      >
        <span
          data-testid="sidebar-qq-group-number"
          className="text-[22px] font-bold leading-none tracking-wider text-[#e8c877] group-hover:text-[#f3d98f]"
        >
          {qqGroup}
        </span>
        <span className="text-[11px] text-[#93b2ce] group-hover:text-[#6fb7e0]">
          {copied === "ok" ? "已复制" : "点击复制"}
        </span>
      </button>
      <p data-testid="sidebar-qq-group-hint" className="mt-1.5 text-[12px] leading-5 text-[#93b2ce]">
        {hint}
      </p>
      {qqGroupQr && (
        <figure className="mt-3 flex flex-col items-center">
          {/* 后台配置的任意图片地址(站内路径/外链),非构建期静态资源 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qqGroupQr}
            alt="QQ 群二维码"
            data-testid="sidebar-qq-group-qr"
            className="h-40 w-40 rounded-lg border border-[#22385a] bg-white p-1.5"
          />
          <figcaption className="mt-1.5 text-[12px] text-[#93b2ce]">扫码加群</figcaption>
        </figure>
      )}
    </SidebarCard>
  );
}
