import { redirect } from "next/navigation";

/** /admin/ai 单入口:默认落到模型配置 Tab(菜单只放一项,页内 Tab 切换) */
export default function AdminAiIndexPage(): never {
  redirect("/admin/ai/models");
}
