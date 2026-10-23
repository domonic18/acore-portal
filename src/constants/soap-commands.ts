/**
 * SOAP 命令白名单(contracts/soap-channel.md):白名单外一律拒绝,防注入拼接。
 * M1 仅只读验证命令;M2 追加 send items / ban / character service 类(非幂等走失败转队列)。
 */
export const SOAP_COMMANDS = [".server info"] as const;

export type SoapCommand = (typeof SOAP_COMMANDS)[number];

export function isSoapCommandAllowed(command: string): command is SoapCommand {
  return (SOAP_COMMANDS as readonly string[]).includes(command);
}
