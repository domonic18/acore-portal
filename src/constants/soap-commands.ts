/**
 * SOAP 命令白名单(contracts/soap-channel.md):白名单外一律拒绝,防注入拼接。
 * M1 仅只读验证命令;M2 追加 send items(物品发货)与 US4 服务类命令。
 * 商品面与 WP 旧站严格对齐(2026-10-25):WP 未提供的转移/复制/公会类服务
 * 不实现,真机无 transfer/clone/guild change 子命令,白名单不再保留对应命令。
 * 2026-10-26 追加 .transmog add(幻化外观收藏;真机自定义模块,usage 探针核对)。
 */
export const SOAP_COMMANDS = [
  ".server info",
  ".send items",
  ".transmog add",
  // US4 服务处理器命令(处理器落地时启用)
  ".character changerace",
  ".character changefaction",
  ".character customize",
  ".character rename",
] as const;

export type SoapCommand = (typeof SOAP_COMMANDS)[number];

export function isSoapCommandAllowed(command: string): command is SoapCommand {
  return (SOAP_COMMANDS as readonly string[]).includes(command);
}
