"use client";

import { useEffect, useRef, type RefObject } from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { requestJson, errorMessage } from "@/lib/api-client";
import {
  FORUM_TEXT_PALETTE,
  forumPaletteClass,
  forumPaletteSwatchIcon,
  type ForumPaletteKey,
} from "@/constants/forum-palette";

const MAX_CONTENT = 20_000;

/** 色板开标记的原文形态(IR DOM 里 code.vditor-ir_marker 的 textContent) */
const PALETTE_OPEN_RE = new RegExp(
  `^<span class="c-(${FORUM_TEXT_PALETTE.map((c) => c.key).join("|")})">$`,
);

/** IR 模式把内联 HTML 渲染成隐藏代码标记节点(span[data-type=html-inline] 内的
 * code.vditor-ir__marker),正文是夹在开/闭标记之间的裸文本节点,CSS 无法命中
 * ⇒ 上色后编辑区视觉零变化(所见即所得缺口)。此处把「开标记..闭标记」整段包进
 * <span class="c-x"> 预览层:Lute 序列化只读标记节点文本,对包裹层零感知(已实测
 * VditorIRDOM2Md 往返无损),着色走既有 .vditor-reset .c-x 双作用域样式 */
function retagPaletteSpans(pre: HTMLElement) {
  for (const marker of pre.querySelectorAll<HTMLElement>(
    'span[data-type="html-inline"] > code.vditor-ir__marker',
  )) {
    const color = PALETTE_OPEN_RE.exec(marker.textContent ?? "")?.[1];
    if (!color) continue;
    const open = marker.parentElement;
    if (!open || open.parentElement?.dataset.palette) continue; // 已包,幂等
    const seq: ChildNode[] = [];
    let node: ChildNode | null = open;
    let closed = false;
    while (node) {
      seq.push(node);
      if (
        node !== open &&
        node instanceof HTMLElement &&
        node.dataset.type === "html-inline" &&
        node.querySelector(":scope > code.vditor-ir__marker")?.textContent === "</span>"
      ) {
        closed = true;
        break;
      }
      node = node.nextSibling;
    }
    if (!closed) continue; // 未闭合(跨块/残片):不包,帖内渲染不受影响
    const first = seq[0];
    if (!first) continue;
    const wrap = document.createElement("span");
    wrap.className = `c-${color}`;
    wrap.dataset.palette = color;
    open.parentElement!.insertBefore(wrap, first);
    for (const n of seq) wrap.appendChild(n);
  }
}

/** 文字颜色组(受限色板)。子项必须走自定义 click:IR 模式的 processToolbar 只认
 * 固定命令名(bold/italic/…),prefix/suffix 对未知命令名直接落空不插入。click 的
 * vditor 参数是内部 IVditor(无原型方法),经组件 ref 拿公共实例,取选区文本后
 * insertMD(经 Lute Md2VditorIRDOM)包裹类标记并替换选区 */
function colorToolbarItem(vdRef: RefObject<Vditor | null>) {
  return {
    name: "forum-color",
    tip: "文字颜色",
    click: () => {},
    icon: `<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 3a9 9 0 0 0 0 18c1.4 0 2.2-.9 2.2-2 0-1.2-.9-1.7-.9-2.6 0-.8.7-1.4 1.6-1.4h1.9c2.4 0 4.2-1.8 4.2-4.2C21 6.3 17 3 12 3Zm-4.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm2-3.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>`,
    toolbar: FORUM_TEXT_PALETTE.map((c) => ({
      name: `forum-c-${c.key}`,
      tip: c.label,
      icon: forumPaletteSwatchIcon(c.color),
      click: () => {
        const vd = vdRef.current;
        if (!vd) return;
        const selected = vd.getSelection() ?? "";
        const safe = selected
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        vd.insertMD(`<span class="${forumPaletteClass(c.key as ForumPaletteKey)}">${safe}</span>`);
      },
    })),
  };
}

/**
 * 论坛正文编辑器(Vditor IR 即时渲染,Typora 式编辑即所见):
 * - 代码层仍是纯 Markdown,与后端 contentHtml 契约/renderMarkdown 管线零改动;
 * - 运行时资产自托管 cdn:"/vditor"(dev/build 脚本链拷贝,禁 unpkg 默认源);
 * - 编辑区关闭 Lute sanitize(受限色板靠内联 span 类标记渲染;XSS 真闸门
 *   在服务端 rehype-sanitize 白名单,不在编辑器);
 * - 图片上传接管 upload.handler:工具栏按钮/粘贴/拖拽统一走 /api/forum/upload。
 */
export function VditorEditor({
  value,
  onChange,
  placeholder,
  rows = 8,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const vdRef = useRef<Vditor | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const readyRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const host = elRef.current;
    if (!host) return;
    // 每个挂载周期独立子节点:StrictMode 双挂载时旧实例(未就绪无法 destroy)的
    // 半初始化 DOM 随宿主子节点整体移除,不污染/误清新实例(vditor destroy 会
    // 清空挂载元素 innerHTML,共享同一 el 会互相抹掉)
    const mount = document.createElement("div");
    host.appendChild(mount);
    // IR 区根节点(pre.vditor-reset):retag 预览层的操作对象
    const irPre = () => mount.querySelector<HTMLElement>(".vditor-ir pre.vditor-reset");
    let ready = false;
    let hintObserver: MutationObserver | null = null;
    const vd = new Vditor(mount, {
      cdn: "/vditor",
      mode: "ir",
      lang: "zh_CN",
      theme: "dark",
      icon: "ant",
      cache: { enable: false },
      counter: { enable: true, max: MAX_CONTENT, type: "markdown" },
      placeholder,
      height: Math.max(rows * 34, 200),
      value,
      input: (v) => {
        onChangeRef.current(v.slice(0, MAX_CONTENT));
        // processAfterRender 在块重渲染后同步调本回调,此刻标记节点已是终态
        const pre = irPre();
        if (pre) retagPaletteSpans(pre);
      },
      toolbar: [
        "headings",
        "bold",
        "italic",
        "strike",
        "|",
        "list",
        "ordered-list",
        "check",
        "quote",
        "|",
        "link",
        "table",
        "inline-code",
        "code",
        "|",
        colorToolbarItem(vdRef),
        "upload",
        "|",
        "undo",
        "redo",
        "fullscreen",
      ],
      preview: { markdown: { sanitize: false } },
      upload: {
        accept: "image/*",
        multiple: true,
        handler: async (files: File[]) => {
          if (files.length === 0) return null;
          try {
            const fd = new FormData();
            for (const f of files) fd.append("files", f);
            const body = await requestJson<{ items: { url: string; originalName: string }[] }>(
              "/api/forum/upload",
              { method: "POST", body: fd },
            );
            for (const item of body.items) {
              vdRef.current?.insertValue(`\n![${item.originalName}](${item.url})\n`);
            }
          } catch (err) {
            vdRef.current?.tip(`图片上传失败:${errorMessage(err)}`, 3000);
          }
          return null;
        },
      },
      after: () => {
        // 初始化完成闸门:此前 getValue/setValue 都会因内部态未就绪抛错。
        // 旧实例迟到的 after 一律忽略(只认当前存活实例)
        if (vdRef.current !== vd) return;
        ready = true;
        readyRef.current = true;
        if (vd.getValue() !== valueRef.current) {
          vd.setValue(valueRef.current);
        }
        const pre = irPre();
        if (pre) retagPaletteSpans(pre);
        // 窄屏横滑工具栏的弹层(色板/标题下拉):挂载点在 overflow 容器内,默认
        // 绝对定位垂到工具栏下方必被裁剪(globals.css 窄屏已改 position:fixed)。
        // vditor 开面板在 click 处理内部有异步路径,按事件钩时序不稳 ⇒ 改
        // MutationObserver 盯 style 翻转:display 变 block 的瞬间落位到工具栏
        // 下方并按视口夹紧(回调在绘制前的微任务点运行,无闪烁);横滑即收起
        // (fixed 弹层不随滚动项移动,留着只会悬空)
        const toolbar = mount.querySelector<HTMLElement>(".vditor-toolbar");
        if (toolbar) {
          const hints = [...toolbar.querySelectorAll<HTMLElement>(".vditor-hint")];
          const placeHint = (hint: HTMLElement) => {
            if (!window.matchMedia("(max-width: 640px)").matches) {
              if (hint.style.top || hint.style.left) {
                hint.style.top = "";
                hint.style.left = "";
              }
              return;
            }
            const btn = hint.parentElement?.querySelector("button");
            if (!btn) return;
            const top = `${Math.round(toolbar.getBoundingClientRect().bottom + 4)}px`;
            const br = btn.getBoundingClientRect();
            const w = hint.offsetWidth;
            const left = `${Math.round(
              Math.min(Math.max(8, br.left + br.width / 2 - w / 2), window.innerWidth - w - 8),
            )}px`;
            // 同值守卫:本函数在 style 变更的观察回调里执行,写回不同值会再触发观察
            if (hint.style.top !== top) hint.style.top = top;
            if (hint.style.left !== left) hint.style.left = left;
          };
          hintObserver = new MutationObserver(() => {
            for (const hint of hints) {
              if (hint.style.display === "block") placeHint(hint);
            }
          });
          for (const hint of hints) {
            hintObserver.observe(hint, { attributes: true, attributeFilter: ["style"] });
          }
          toolbar.addEventListener("scroll", () => {
            for (const hint of hints) {
              if (hint.style.display === "block") hint.style.display = "none";
            }
          });
        }
      },
    });
    vdRef.current = vd;
    return () => {
      hintObserver?.disconnect();
      if (ready) vd.destroy();
      if (vdRef.current === vd) {
        vdRef.current = null;
        readyRef.current = false;
      }
      mount.remove();
    };
    // 初始化只跑一次:placeholder/rows 由外层按帖型固定,不随打字重挂
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 受控同步:外部 value 变化(回帖成功清空)且与编辑器内容不一致时回写;
  // 仅在编辑器初始化完成后执行(after 前调用实例方法会抛错)
  useEffect(() => {
    const vd = vdRef.current;
    if (readyRef.current && vd && vd.getValue() !== value) vd.setValue(value, true);
  }, [value]);

  return <div ref={elRef} className="vditor-forum" />;
}
