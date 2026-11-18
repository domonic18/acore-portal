import { AiModelsManager } from "@/components/admin/ai-models/manager";
import { listRoleBindings } from "@/server/services/shared/ai-models/bindings";
import { listAiModelsAdmin } from "@/server/services/shared/ai-models/crud";

/**
 * 后台「AI 管理 → 模型」Tab(LLM 通道重构,照 aitech-hub 形态):
 * 模型条目表(双协议多模型)+ 角色绑定卡(对话/向量,主备 + 日配额)。
 * 旧 settings 页 llm 组已拆除;条目/绑定落专表,热生效无需重启。
 */
export default async function AdminAiModelsPage() {
  const [models, bindings] = await Promise.all([listAiModelsAdmin(), listRoleBindings()]);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-[#6482a3]">
        对话与向量模型的条目登记与角色绑定:改动保存后即刻生效,无需重启。密钥只写不读,保存后不可回看。
      </p>

      <AiModelsManager models={models} bindings={bindings} />
    </div>
  );
}
