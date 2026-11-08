import { MASK_PLACEHOLDER, maskConnectionUrl } from "@/lib/format";
import type { SensitiveMode } from "@/server/services/settings/schemas";

/**
 * 提交值 → 最终落库值(敏感字段口径的唯一收口,保存与测试连接共用):
 * - secret(只写不读):空串=保持现值(前端回传的永远是空)
 * - masked(脱敏回显):脱敏占位 *** 处的口令用现值回填——
 *   管理员改 host/库名而没动口令时,不能把 *** 原样写进库;
 *   整串等于现值的脱敏形态时视为未改
 * - 非敏感字段:原样返回
 */
export function resolveSubmittedValue(
  current: string | undefined,
  submitted: string,
  mode: SensitiveMode | undefined,
): string {
  const cur = current ?? "";
  if (mode === "secret") {
    return submitted === "" ? cur : submitted;
  }
  if (mode === "masked") {
    if (submitted === "") return cur;
    if (submitted === maskConnectionUrl(cur)) return cur;
    return mergeMaskedPassword(cur, submitted) ?? submitted;
  }
  return submitted;
}

/**
 * 提交串的口令位仍是脱敏占位 *** → 换回现值口令;其余情况原样返回提交串。
 * 管理员自己填了新口令(≠ ***)时不介入。
 */
function mergeMaskedPassword(current: string, submitted: string): string | null {
  try {
    const cur = new URL(current);
    const sub = new URL(submitted);
    if (sub.password !== MASK_PLACEHOLDER) return null;
    if (!cur.password) return null;
    sub.password = cur.password;
    return sub.toString();
  } catch {
    return null;
  }
}
