"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/cn";

const Drawer = DialogPrimitive.Root;
const DrawerTrigger = DialogPrimitive.Trigger;
const DrawerClose = DialogPrimitive.Close;

/** 遮罩:与 Dialog 同款(主题遮罩色 + 4px 模糊)。Radix 经 Portal/Presence
 * 向下传 ref,React 18 下扩展包装必须 forwardRef(普通函数组件收 ref 即告警)。 */
const DrawerOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DrawerOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      {...props}
      className={cn(
        "fixed inset-0 z-50 bg-scrim/70 backdrop-blur-[4px]",
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className,
      )}
    />
  );
});

/**
 * 侧滑面板(基于 Radix Dialog side 模式):滚动锁定/焦点陷阱/ESC 全内置。
 * side="right" 默认;全屏场景传 className="w-full" 覆盖宽度。
 * forceMount:关闭时仍保持挂载(配合外部 className="hidden" 做 CSS 隐藏,
 * 供须保留内部状态的常驻面板用,如助手对话)。
 */
const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: "right" | "left" | "bottom";
  }
>(function DrawerContent(
  { className, children, side = "right", forceMount, ...props },
  ref,
) {
  const sideClasses =
    side === "right"
      ? "inset-y-0 right-0 h-full w-80 border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right"
      : side === "left"
        ? "inset-y-0 left-0 h-full w-80 border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left"
        : "inset-x-0 bottom-0 max-h-[85vh] rounded-t-overlay border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom";
  return (
    <DialogPrimitive.Portal forceMount={forceMount}>
      <DrawerOverlay />
      <DialogPrimitive.Content
        ref={ref}
        forceMount={forceMount}
        {...props}
        className={cn(
          "fixed z-50 overflow-y-auto border-line-strong bg-popover shadow-overlay outline-none",
          sideClasses,
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:duration-200",
          className,
        )}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

const DrawerHeader = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div">
>(function DrawerHeader({ className, ...props }, ref) {
  return <div ref={ref} className={cn("border-b border-line px-4 py-3", className)} {...props} />;
});

const DrawerTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DrawerTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      {...props}
      className={cn("text-[15px] font-semibold text-heading", className)}
    />
  );
});

const DrawerDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DrawerDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      {...props}
      className={cn("mt-1 text-xs text-muted", className)}
    />
  );
});

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
};
