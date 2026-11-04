import {
  AlertTriangle,
  BarChart3,
  ClipboardCheck,
  FileText,
  Flame,
  Folder,
  Gauge,
  Home,
  Image,
  type LucideIcon,
  MessagesSquare,
  Newspaper,
  Package,
  PanelLeft,
  Receipt,
  Server,
  Settings,
  Shield,
  Star,
  Swords,
  Ticket,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";

/** 导航 icon key → lucide 组件(constants 层只存 key,不引组件;RSC/客户端两用) */
export const NAV_ICONS: Record<string, LucideIcon> = {
  gauge: Gauge,
  package: Package,
  folder: Folder,
  receipt: Receipt,
  ticket: Ticket,
  newspaper: Newspaper,
  "file-text": FileText,
  image: Image,
  "trending-up": TrendingUp,
  home: Home,
  "messages-square": MessagesSquare,
  "bar-chart": BarChart3,
  "clipboard-check": ClipboardCheck,
  users: Users,
  server: Server,
  "panel-left": PanelLeft,
  settings: Settings,
  // 版块图标候选(后台图标选择器与前台 NavIcon 共用)
  swords: Swords,
  shield: Shield,
  flame: Flame,
  star: Star,
  wrench: Wrench,
  "alert-triangle": AlertTriangle,
};

/** 版块图标候选 key(编辑器网格点选用;均已在 NAV_ICONS 内) */
export const BOARD_ICON_KEYS = [
  "swords",
  "shield",
  "flame",
  "star",
  "messages-square",
  "wrench",
  "alert-triangle",
  "package",
  "users",
  "ticket",
  "clipboard-check",
  "folder",
] as const;

/** 未知 key 不渲染,不抛错 */
export function NavIcon({ icon, className = "h-4 w-4" }: { icon?: string; className?: string }) {
  const Icon = icon ? NAV_ICONS[icon] : undefined;
  if (!Icon) return null;
  return <Icon aria-hidden="true" className={`${className} shrink-0`} />;
}
