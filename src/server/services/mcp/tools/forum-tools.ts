import "server-only";

import { z } from "zod";

import { THREAD_LABEL_OPTIONS } from "@/constants/forum";
import { MCP_SCOPE, MCP_TOOL } from "@/constants/mcp";
import { adminListThreads } from "@/server/services/forum/admin";
import {
  getForumBoardBySlug,
  getForumThread,
  listThreadPosts,
} from "@/server/services/forum/browse";
import { deleteThread, updateThreadTitle } from "@/server/services/forum/moderate";
import { createReply } from "@/server/services/forum/write";
import { getSiteUsername } from "@/server/services/shared/site-identity";

import { defineTool, parseId, type McpToolContext, type McpToolDef } from "./shared";

/**
 * 论坛运营工具分册(5 个;M6 增补)
 *
 * 服务 AI 巡检(灌水识别)与客服(账号申诉跟进)。写入一律走 services/forum
 * 同一入口(createReply / updateThreadTitle / deleteThread),closed 闸与
 * 软删闸照旧——不因调用方是 AI 而放松校验。
 *
 * 「下架」= deleteThread 软删:前台不可见、内容保留、后台可恢复(可逆,
 * 故可暴露);恢复(undelete)与单删楼层不暴露,留在后台人工处理。
 * 回帖作者 = 令牌绑定的管理员(实名可追责);MCP 通道自带 QPS/日配额,
 * 不套用论坛路由层的用户级频控。
 */

const listThreadsSchema = z.object({
  boardSlug: z.string().optional().describe("版块 slug(如 appeal 账号申诉);缺省=全站"),
  q: z.string().optional().describe("标题包含关键字"),
  authorName: z.string().optional().describe("作者名(精确匹配,按账号翻帖)"),
  label: z.enum(THREAD_LABEL_OPTIONS).optional().describe("状态标签"),
  includeDeleted: z.boolean().optional().describe("只看已下架(软删)主题"),
  createdAfter: z.string().optional().describe("只看此 ISO 8601 时刻之后创建的主题"),
  page: z.number().int().positive().optional().describe("页码,从 1 开始"),
  pageSize: z.number().int().positive().max(50).optional().describe("每页条数(上限 50)"),
});

const getThreadSchema = z.object({
  id: z.string().describe("主题 id"),
  page: z.number().int().positive().optional().describe("楼层页码,从 1 开始"),
  pageSize: z.number().int().positive().max(50).optional().describe("每页楼层数(上限 50)"),
});

const replyThreadSchema = z.object({
  id: z.string().describe("主题 id"),
  content: z
    .string()
    .trim()
    .min(2, "回复至少 2 个字符")
    .max(20_000)
    .describe("回复正文(Markdown,2–20000 字符)"),
});

const updateTitleSchema = z.object({
  id: z.string().describe("主题 id"),
  title: z.string().trim().min(1, "标题必填").max(64).describe("新标题(1–64 字符,与发帖同口径)"),
});

const deleteThreadSchema = z.object({
  id: z.string().describe("主题 id"),
});

/** 写工具公共前置:审计需要实名管理员,未绑定即拒 */
function requireActor(ctx: McpToolContext):
  | { ok: true; actorUserId: bigint }
  | { ok: false; code: "VALIDATION_FAILED"; message: string; field: string } {
  if (ctx.actorUserId == null) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: "令牌未绑定管理员身份,无法执行该操作,请重新签发令牌。",
      field: "author",
    };
  }
  return { ok: true, actorUserId: ctx.actorUserId };
}

export const FORUM_TOOLS: McpToolDef[] = [
  defineTool({
    name: MCP_TOOL.LIST_FORUM_THREADS,
    title: "查询论坛主题",
    description:
      "跨版块查询论坛主题。巡检灌水、找申诉帖前先用它定位主题 id;" +
      "支持按版块/标题关键字/作者/状态标签/创建时间筛选,默认排除已下架主题。",
    scope: MCP_SCOPE.READ,
    schema: listThreadsSchema,
    run: async (args) => {
      let boardId: bigint | undefined;
      if (args.boardSlug !== undefined) {
        const board = await getForumBoardBySlug(args.boardSlug);
        if (!board) {
          return {
            ok: false,
            code: "NOT_FOUND",
            message: `版块 ${args.boardSlug} 不存在。`,
            field: "boardSlug",
          };
        }
        boardId = board.id;
      }
      let createdAfter: Date | undefined;
      if (args.createdAfter !== undefined) {
        const d = new Date(args.createdAfter);
        if (Number.isNaN(d.getTime())) {
          return {
            ok: false,
            code: "VALIDATION_FAILED",
            message: "createdAfter 不是合法的时刻(须为 ISO 8601,如 2026-11-19T00:00:00Z)。",
            field: "createdAfter",
          };
        }
        createdAfter = d;
      }
      const list = await adminListThreads({
        boardId,
        q: args.q,
        authorName: args.authorName,
        label: args.label,
        deleted: args.includeDeleted ?? false,
        createdAfter,
        page: args.page,
        pageSize: args.pageSize,
      });
      return { ok: true, data: list };
    },
  }),

  defineTool({
    name: MCP_TOOL.GET_FORUM_THREAD,
    title: "读取论坛主题楼层",
    description:
      "按 id 读取主题元信息与全部楼层(主贴+回复,楼层升序,分页)。" +
      "看申诉内容、申诉回复与判断是否灌水用这个;正文为 Markdown," +
      "存量迁移帖(legacy=true)为 HTML。",
    scope: MCP_SCOPE.READ,
    schema: getThreadSchema,
    run: async (args) => {
      const parsed = parseId(args.id);
      if (!parsed.ok) return parsed;
      const thread = await getForumThread(parsed.id);
      if (!thread) {
        return { ok: false, code: "NOT_FOUND", message: "主题不存在或已下架。", field: "id" };
      }
      const posts = await listThreadPosts({
        threadId: parsed.id,
        page: args.page,
        pageSize: args.pageSize,
      });
      return {
        ok: true,
        data: {
          thread: {
            id: thread.id.toString(),
            title: thread.title,
            boardSlug: thread.board.slug,
            boardName: thread.board.name,
            authorName: thread.authorName,
            pinned: thread.pinned,
            featured: thread.featured,
            statusLabel: thread.statusLabel,
            closed: thread.closedAt != null,
            replyCount: thread.replyCount,
            viewCount: thread.viewCount,
            createdAt: thread.createdAt.toISOString(),
            lastPostAt: thread.lastPostAt.toISOString(),
          },
          totalPosts: posts.total,
          page: posts.page,
          pageSize: posts.pageSize,
          posts: posts.items.map((p) => ({
            id: p.id.toString(),
            floor: p.floor,
            authorName: p.authorName,
            authorRole: p.authorUser?.role ?? null,
            content: p.contentHtml,
            legacy: p.legacyWpPostId != null,
            createdAt: p.createdAt.toISOString(),
          })),
        },
        targetId: thread.id.toString(),
      };
    },
  }),

  defineTool({
    name: MCP_TOOL.REPLY_FORUM_THREAD,
    title: "回复论坛主题",
    description:
      "以令牌绑定的管理员身份回复指定主题(官方回复,作者实名落库)。" +
      "已关闭或已下架的主题会被拒绝;正文 2–20000 字符。",
    scope: MCP_SCOPE.WRITE,
    schema: replyThreadSchema,
    run: async (args, ctx) => {
      const actor = requireActor(ctx);
      if (!actor.ok) return actor;
      const parsed = parseId(args.id);
      if (!parsed.ok) return parsed;
      const authorName = await getSiteUsername(actor.actorUserId);
      if (!authorName) {
        return {
          ok: false,
          code: "VALIDATION_FAILED",
          message: "令牌绑定的管理员账号不存在,无法回帖。",
          field: "author",
        };
      }
      const result = await createReply({
        threadId: parsed.id,
        author: { id: actor.actorUserId, name: authorName },
        content: args.content,
      });
      return {
        ok: true,
        data: {
          replied: true,
          threadId: parsed.id.toString(),
          postId: result.postId.toString(),
          floor: result.floor,
          authorName,
        },
        targetId: parsed.id.toString(),
      };
    },
  }),

  defineTool({
    name: MCP_TOOL.UPDATE_FORUM_THREAD_TITLE,
    title: "修改论坛主题标题",
    description:
      "修改主题标题(1–64 字符,与发帖同口径)。用于修正灌水标题或申诉帖标题;" +
      "已下架主题拒绝修改,审计记录新旧标题。",
    scope: MCP_SCOPE.WRITE,
    schema: updateTitleSchema,
    run: async (args, ctx) => {
      const actor = requireActor(ctx);
      if (!actor.ok) return actor;
      const parsed = parseId(args.id);
      if (!parsed.ok) return parsed;
      await updateThreadTitle(parsed.id, args.title, { id: actor.actorUserId });
      return {
        ok: true,
        data: { updated: true, threadId: parsed.id.toString(), title: args.title },
        targetId: parsed.id.toString(),
      };
    },
  }),

  defineTool({
    name: MCP_TOOL.DELETE_FORUM_THREAD,
    title: "下架论坛主题",
    description:
      "下架主题(软删除):前台立即不可见、内容保留、管理员可在后台恢复。" +
      "用于处理灌水/违规内容;误下架可恢复,不是不可逆操作。",
    scope: MCP_SCOPE.WRITE,
    schema: deleteThreadSchema,
    run: async (args, ctx) => {
      const actor = requireActor(ctx);
      if (!actor.ok) return actor;
      const parsed = parseId(args.id);
      if (!parsed.ok) return parsed;
      await deleteThread(parsed.id, { id: actor.actorUserId });
      return {
        ok: true,
        data: { deleted: true, threadId: parsed.id.toString(), recoverable: true },
        targetId: parsed.id.toString(),
      };
    },
  }),
];
