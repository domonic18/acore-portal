"use client";

import { twMerge } from "tailwind-merge";

/**
 * 后台批量操作条(商品列表 / 论坛主题管理共用同一形态):
 * 结构固定为「已选计数 + 动作区 + 结果提示」;窄屏动作区两列网格、
 * 桌面端横排(规则 20 / 27⑥),两处不各写一套 className 串。
 * 颜色走语义 token(新增后台代码口径),不写 arbitrary-hex。
 */
export function BatchToolbar({
  testId,
  countText,
  actions,
  message,
  error,
  className,
}: {
  testId: string;
  /** 已选数量的白话文案(单位随业务走:件 / 个主题) */
  countText: string;
  /** 动作区内容(按钮组 / 下拉 + 按钮) */
  actions: React.ReactNode;
  /** 成功提示 */
  message?: string | null;
  /** 失败提示 */
  error?: string | null;
  /** 追加到根容器的类(如论坛侧靠右:sm:ml-auto) */
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={twMerge(
        "flex flex-col items-start gap-2 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-2",
        className,
      )}
    >
      <span className="text-body">{countText}</span>
      {/* 窄屏两列网格:按钮不再被挤成参差的一行(#48 移动端批量按钮排列) */}
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">{actions}</div>
      {message && <span className="text-xs text-ok-bright">{message}</span>}
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
