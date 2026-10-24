/**
 * SOAP 命令白名单(contracts/soap-channel.md):白名单外一律拒绝,防注入拼接。
 * M1 仅只读验证命令;M2 追加 send items(物品发货)与 US4 服务类命令(占位)。
 */
export const SOAP_COMMANDS = [
  ".server info",
  ".send items",
  // US4 服务处理器命令(处理器落地时启用)
  ".character changerace",
  ".character changefaction",
  ".character customize",
  ".character rename",
  ".character clone",
  ".character transfer",
  ".guild change",
] as const;

export type SoapCommand = (typeof SOAP_COMMANDS)[number];

export function isSoapCommandAllowed(command: string): command is SoapCommand {
  return (SOAP_COMMANDS as readonly string[]).includes(command);
}
