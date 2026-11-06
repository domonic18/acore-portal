"use client";

import { useState } from "react";
import { SidebarCard } from "./card";

/**
 * QQ 交流群卡(2026-11 用户反馈+issue #95):群号点击直达加群链接(qm.qq.com,
 * WP 原站行为;链接后台可配,空=群号回落点击复制),另保留复制按钮与
 * 二维码扫码路径;群号空=整卡隐藏。
 */
export function QqGroup({
  qqGroup,
  qqGroupQr,
  qqGroupJoinUrl,
}: {
  qqGroup: string;
  qqGroupQr: string;
  qqGroupJoinUrl: string;
}) {
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

  const joinHint =
    copied === "ok"
      ? "已复制群号,QQ 内搜索群号加群"
      : copied === "fail"
        ? "复制失败,请点击群号直接加群"
        : "点击群号直接加群 · QQ 内搜索亦可";
  const copyHint =
    copied === "ok"
      ? "已复制群号,打开 QQ 搜索群号加群"
      : copied === "fail"
        ? "复制失败,请手动搜索群号加群"
        : "点击群号复制 · QQ 内搜索加群";

  const number = (
    <span
      data-testid="sidebar-qq-group-number"
      className="text-[22px] font-bold leading-none tracking-wider text-highlight group-hover:text-highlight-strong"
    >
      {qqGroup}
    </span>
  );

  return (
    <SidebarCard title="QQ 交流群" testId="sidebar-qq-group">
      <div className="flex w-full items-baseline justify-between gap-2">
        {qqGroupJoinUrl ? (
          <a
            href={qqGroupJoinUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="sidebar-qq-group-join"
            aria-label={`加入 QQ 群 ${qqGroup}`}
            className="group text-left"
          >
            {number}
          </a>
        ) : (
          <button
            type="button"
            onClick={copyGroup}
            aria-label={`复制 QQ 群号 ${qqGroup}`}
            className="group flex items-baseline text-left"
          >
            {number}
          </button>
        )}
        <button
          type="button"
          onClick={copyGroup}
          data-testid="sidebar-qq-group-copy"
          className="shrink-0 text-[11px] text-body hover:text-link"
        >
          {copied === "ok" ? "已复制" : "点击复制"}
        </button>
      </div>
      <p data-testid="sidebar-qq-group-hint" className="mt-1.5 text-[12px] leading-5 text-body">
        {qqGroupJoinUrl ? joinHint : copyHint}
      </p>
      {qqGroupQr && (
        <figure className="mt-3 flex flex-col items-center">
          {/* 后台配置的任意图片地址(站内路径/外链),非构建期静态资源 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qqGroupQr}
            alt="QQ 群二维码"
            data-testid="sidebar-qq-group-qr"
            className="h-40 w-40 rounded-lg border border-line bg-white p-1.5"
          />
          <figcaption className="mt-1.5 text-[12px] text-body">扫码加群</figcaption>
        </figure>
      )}
    </SidebarCard>
  );
}
