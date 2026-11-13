import { Badge } from "@/components/ui/badge";

const ROLE_TONE: Record<string, "accent" | "warn" | "muted"> = {
  admin: "accent",
  moderator: "warn",
  user: "muted",
};

/** 只读角色徽章(用户列表/详情页共用);角色分配入口在详情页操作区,列表不放编辑控件 */
export function RoleBadge({ role, className }: { role: string; className?: string }) {
  return (
    <Badge tone={ROLE_TONE[role] ?? "muted"} className={className}>
      {role}
    </Badge>
  );
}
