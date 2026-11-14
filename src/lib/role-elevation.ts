import { ADMIN_ROLE } from "@/constants/roles";

/**
 * 角色分配是否需要二次确认:仅「提权到 admin」需要。
 * 提权后可管理全站数据(用户、订单、积分、内容),误操作代价高,前端必须先确认;
 * 降级与同级变更不拦(降级只减权限,误操作可逆)。
 */
export function needsElevationConfirm(currentRole: string, nextRole: string): boolean {
  return nextRole === ADMIN_ROLE && nextRole !== currentRole;
}
