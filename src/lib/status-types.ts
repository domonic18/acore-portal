/**
 * /api/status 契约类型(契约 server-status.md)。
 * 独立放 lib:RSC 服务端产出与客户端状态卡(components)共用,boundary 双向可达。
 */
export type ServerStatusPayload = {
  enabled: true;
  degraded: boolean;
  online: boolean;
  onlineCount: number | null;
  allianceCount: number | null;
  hordeCount: number | null;
  uptimeText: string | null;
  queueCount: number | null;
  todayPeak: number | null;
  charTotal: number | null;
  todayNewChars: number | null;
  currentStage: string | null;
  maintenanceMode: boolean;
  updatedAt: string;
};

export type ServerStatusResult = ServerStatusPayload | { enabled: false };
