import { expect, type Locator } from "@playwright/test";

/**
 * Radix Select 兼容层的选项选择(替代原生 selectOption):
 * 等可点(水合门控,规则 30)→ 点开触发器 → 按 value(触发 data-value)
 * 或按可见名点选项。点选后下拉自动收起、焦点回到触发器。
 *
 * 触发器点击带重试:dev 冷路由水合完成前 React 事件未挂载,首击被静默
 * 丢弃、下拉不弹出(规则 30 同源);下拉不出就再点,水合后自然收敛。
 */
export async function pickOption(
  trigger: Locator,
  option: { value?: string | number; label?: string },
): Promise<void> {
  await expect(trigger).toBeEnabled();
  const opt = option.label
    ? trigger.page().getByRole("option", { name: option.label, exact: true })
    : trigger.page().locator(`[role="option"][data-value="${String(option.value)}"]`);
  for (let i = 0; i < 5; i++) {
    await trigger.click();
    try {
      await opt.click({ timeout: 2_000 });
      return;
    } catch {
      /* 下拉未弹出(多为未水合):重开再点 */
    }
  }
  await opt.click();
}
