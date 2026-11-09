import { characterAvatar } from "@/constants/characters";

/**
 * 用户头像:名字首字符 + 职业色底(2026-11-09 用户反馈:页头是随机角色头像、
 * 60s 一换且与账号总览的名字缩略图不一致 ⇒ 两处统一走本组件,口径单一)
 */
export function UserAvatar({
  name,
  classId = 0,
  className = "",
}: {
  name: string;
  classId?: number;
  className?: string;
}) {
  const { initial, color } = characterAvatar(name || "?", classId);
  return (
    <span
      aria-hidden="true"
      data-testid="user-avatar"
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-gray-900 ${className}`}
      style={{ backgroundColor: color }}
    >
      {initial}
    </span>
  );
}
