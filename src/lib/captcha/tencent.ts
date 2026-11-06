import "server-only";
import { captcha as CaptchaSdk } from "tencentcloud-sdk-nodejs-captcha";
import { getConfig } from "@/lib/config";

/**
 * 腾讯云验证码(TCaptcha)服务端票据校验。
 *
 * 前端:动态加载 https://turing.captcha.qcloud.com/TJCaptcha.js,
 *       new TencentCaptcha(appId, cb).show() → cb({ret,ticket,randstr});
 * 服务端:DescribeCaptchaResult(云API 3.0) 校验 ticket+randstr 是否与 appId 匹配。
 *
 * 失败语义(与撞库加固的失败关闭原则一致,但区分「运维误配」与「第三方抖动」):
 * - 配置缺失(已启用却没填齐密钥)→ 失败关闭:这是部署前的显式错误,后台出红字横幅,
 *   不能悄悄放行(否则验证码形同虚设而无人察觉)。
 * - 第三方不可达/超时/系统繁忙 → 降级放行:官方《业务容灾方案》要求业务侧在票据校验
 *   接口异常时跳过验证,不能因为第三方抖动把全站锁在登录门外。
 * - 票据明确判定不通过 → 拒绝:让用户重试。
 */
export type CaptchaVerifyResult = {
  ok: boolean;
  /** 走的是降级放行(第三方不可达):审计可见,便于发现第三方故障窗口 */
  degraded?: boolean;
  /** 机器可读的原因码;不含任何凭据值 */
  errors?: string[];
  /** 人机校验是否真正生效(已启用且配置齐备) */
  configured: boolean;
};

/** 官方 CaptchaCode 字典(文档:核查验证码票据结果 Web及APP) */
const CODE_OK = 1;
/** 26 = system busy(验证码服务内部错误) */
const CODE_SYSTEM_BUSY = 26;
/** 21 = 票据校验异常:风控判定,或前端网络差时的容灾票据 */
const CODE_TICKET_EXCEPTION = 21;
/** 前端自动容灾票据前缀(文档:21 说明里「若 Ticket 包含 trerror 前缀」) */
const DISASTER_TICKET_PREFIX = "trerror";
/** 官方:票据校验接口超时时间为 5 秒 */
const REQ_TIMEOUT_SEC = 5;

function buildClient(cfg: {
  secretId: string;
  secretKey: string;
}): InstanceType<typeof CaptchaSdk.v20190722.Client> {
  return new CaptchaSdk.v20190722.Client({
    credential: { secretId: cfg.secretId, secretKey: cfg.secretKey },
    // 该接口不需要区域(文档:Region 否),留空即可
    region: "",
    profile: { httpProfile: { reqTimeout: REQ_TIMEOUT_SEC } },
  });
}

export async function verifyCaptcha(
  ticket: string,
  randstr: string,
  remoteIp?: string
): Promise<CaptchaVerifyResult> {
  const cfg = (await getConfig()).captcha;
  if (cfg.misconfigured) {
    return { ok: false, errors: ["not-configured"], configured: false };
  }
  if (!cfg.enabled) {
    return { ok: true, configured: false };
  }
  if (!ticket || !randstr) {
    return { ok: false, errors: ["missing-ticket"], configured: true };
  }
  const appId = Number(cfg.appId);
  if (!Number.isInteger(appId) || appId <= 0) {
    return { ok: false, errors: ["not-configured"], configured: false };
  }

  try {
    const res = await buildClient(cfg).DescribeCaptchaResult({
      CaptchaType: 9,
      Ticket: ticket,
      Randstr: randstr,
      UserIp: remoteIp ?? "",
      CaptchaAppId: appId,
      AppSecretKey: cfg.appSecret,
    });
    // SDK 已剥掉云API 的 Response 外层信封,直接返回响应体
    const code = res.CaptchaCode ?? 0;
    if (code === CODE_OK) {
      return { ok: true, configured: true };
    }
    if (code === CODE_SYSTEM_BUSY) {
      return { ok: true, degraded: true, errors: [`code-${code}`], configured: true };
    }
    if (code === CODE_TICKET_EXCEPTION && ticket.startsWith(DISASTER_TICKET_PREFIX)) {
      // 前端容灾票据(用户网络差,前端自动降级生成):官方说明业务侧可跳过验证,
      // 否则这部分用户会被彻底挡在登录门外
      return { ok: true, degraded: true, errors: ["disaster-ticket"], configured: true };
    }
    // 7/8/9/15/16/21/100:票据不合法、过期、重复使用、appid 不匹配等 → 拒绝
    return { ok: false, errors: [`code-${code}`], configured: true };
  } catch (err) {
    // 鉴权/签名失败等一切异常:凭据或链路不可信,但放行比锁死全站登录更可取
    // (验证码只是减速带,真正的撞库防线是 IP 限速 + 全局哈希预算 + 并发闸)
    const code = (err as { code?: string }).code ?? "unknown";
    console.warn(`[captcha] 票据校验异常,按容灾放行:${code}`);
    return { ok: true, degraded: true, errors: ["provider-unavailable"], configured: true };
  }
}
