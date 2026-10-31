// 论坛转换器类型声明(scripts/migrate/lib/forum-convert.mjs)
export type ThreadStatusLabel = "none" | "standard" | "resolved" | "closed";

export function stripStatusPrefix(title: string | null | undefined): {
  label: ThreadStatusLabel;
  title: string;
};
export function byEarlyOrder(
  a: { created_at: Date | string | null; id: number | bigint },
  b: { created_at: Date | string | null; id: number | bigint },
): number;
export const MAIN_POST_FLOOR: number;
export function floorOfReply(index: number): number;
export function visibleFromStatus(status: string): boolean;
export const BOARD_SLUGS: Record<number, string>;
