import "server-only";
import { ITEMSEND_SKU_PREFIX, parseItemSendSku } from "@/constants/shop";
import { ITEM_SEND_PARAM_SCHEMA } from "@/server/services/shop/param-schemas";
import { prisma } from "@/lib/db";
import { executeDeliveryCommand } from "@/server/soap/delivery";
import { resolveCharacterName } from "./character";
import type { DeliveryHandler } from "./registry";

/**
 * ItemSendHandler(soap-delivery 契约 §SKU→处理器→命令映射):
 * .send items {char} "{subject}" "{text}" {itemId}:{count}
 * AC 解析器(cs_send.cpp)玩家名为裸 token;subject/text 是 QuotedString,含空格
 * 必须双引号包裹,否则参数整体错位。角色名按 guid+账号实查 characters 库。
 * 数量口径对齐 WP ItemSend::payment_complete(2026-10-26 核对):`_stack` 后缀=可堆叠
 * 物品一封 qty 个;无后缀=qty 封各 1 个——AC Item::CreateItem 超过 maxStackSize 会
 * 静默钳制(武器 stackable=1,一封 "id:2" 玩家只收到 1 个)。
 * 幂等键:单封=orderitem:{id}:{attempt};多封追加 :m{i} 子键。重试防重发:非堆叠多封
 * 按 requestedBy 统计本行已成功封数,只补未发部分。
 */
export const itemSendHandler: DeliveryHandler = {
  skuKey: `${ITEMSEND_SKU_PREFIX}*`,
  validateSchema: ITEM_SEND_PARAM_SCHEMA,

  async execute({ item, order, params, gameAccountId, idempotencyKey }) {
    const parsed = parseItemSendSku(item.sku);
    if (!parsed) {
      return { ok: false, error: `SKU 物品 id 非法: ${item.sku}` };
    }
    const charName = await resolveCharacterName(params.characterGuid, gameAccountId);
    if (!charName) {
      return { ok: false, error: "角色不存在或已不在本人账号名下" };
    }

    const subject = `"【老克塔】订单 ${order.orderNo}"`;
    const text = '"感谢您的购买,附件为所购物品,请查收。"';
    const requestedBy = `order:${order.id}:item:${item.id}`;
    const mailArgs = (count: number) => [charName, subject, text, `${parsed.itemId}:${count}`];

    // 多封形态:堆叠=1 封 qty 个;非堆叠(qty>1)=qty 封各 1 个(qty=1 走单封 attempt 键)
    const mails =
      parsed.isStack || item.qty === 1
        ? [{ count: parsed.isStack ? item.qty : 1, key: idempotencyKey }]
        : Array.from({ length: item.qty }, (_, i) => ({ count: 1, key: `${idempotencyKey}:m${i}` }));

    if (!parsed.isStack && mails.length > 1) {
      const sent = await prisma.soapCall.count({
        where: { requestedBy, status: "success" },
      });
      if (sent >= mails.length) {
        // 全部封数已成功但行未落 delivered(崩溃边界):补记首封 callId 收口
        const first = await prisma.soapCall.findFirst({
          where: { requestedBy, status: "success" },
          orderBy: { id: "asc" },
          select: { id: true },
        });
        return { ok: true, soapCallId: BigInt(first!.id) };
      }
      mails.splice(0, sent);
    }

    let firstCallId = 0n;
    for (const mail of mails) {
      const result = await executeDeliveryCommand(".send items", mailArgs(mail.count), {
        idempotencyKey: mail.key,
        requestedBy,
      });
      if (result.status !== "success") {
        return { ok: false, error: result.error };
      }
      if (firstCallId === 0n) firstCallId = BigInt(result.callId);
    }
    return { ok: true, soapCallId: firstCallId };
  },
};
