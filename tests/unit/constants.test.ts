import { describe, expect, it } from "vitest";
import {
  isSoapCommandAllowed,
  SOAP_COMMAND_REGISTRY,
  SOAP_COMMANDS,
  SOAP_RETRY_DELAYS_MS,
  SOAP_STATUS,
} from "@/constants/soap";
import {
  MEDIA_CATEGORIES,
  MEDIA_CATEGORY_FORUM,
  MEDIA_CATEGORY_SHOP,
  MEDIA_DEFAULT_CATEGORY,
} from "@/constants/media";
import {
  INVITATION_ALPHABET,
  INVITATION_LIMITS,
  INVITATION_PREFIX_PATTERN,
} from "@/constants/invitation";
import { RESERVED_SLUGS } from "@/constants/content";

/**
 * issue #80/#82/#83/#88:常量单一真相源的表驱动校验。
 * 注册表与清单一旦与实际写入路径分叉,此处即红。
 */
describe("SOAP 命令注册表(#82)", () => {
  it("全部命令均登记元数据(命令→幂等/超时/重试)", () => {
    for (const command of Object.values(SOAP_COMMANDS)) {
      const meta = SOAP_COMMAND_REGISTRY[command];
      expect(meta, command).toBeDefined();
      expect(meta.timeoutMs).toBeGreaterThan(0);
      expect(meta.idempotent).toBeTypeOf("boolean");
      // 幂等命令才有自动重试,退避非空且递增
      if (meta.idempotent) expect(meta.retryDelaysMs.length).toBeGreaterThan(0);
      else expect(meta.retryDelaysMs).toEqual([]);
    }
  });

  it("白名单外命令一律拒绝(含原型属性名)", () => {
    expect(isSoapCommandAllowed(".server info")).toBe(true);
    expect(isSoapCommandAllowed(".announce hacked")).toBe(false);
    expect(isSoapCommandAllowed("constructor")).toBe(false);
    expect(isSoapCommandAllowed("__proto__")).toBe(false);
    expect(isSoapCommandAllowed("")).toBe(false);
  });

  it("退避序列递增(1s/2s/4s 契约)", () => {
    expect(SOAP_RETRY_DELAYS_MS).toEqual([1000, 2000, 4000]);
    const delays = [...SOAP_RETRY_DELAYS_MS];
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1] ?? 0);
    }
  });

  it("状态枚举含 unknown(结果未知终态,issue #67)", () => {
    expect(Object.values(SOAP_STATUS)).toContain("unknown");
  });
});

describe("媒体分类(#88)", () => {
  it("命名分类均在注册表内,论坛上传与商品编辑器不再分叉", () => {
    expect(MEDIA_CATEGORIES).toContain(MEDIA_CATEGORY_FORUM);
    expect(MEDIA_CATEGORIES).toContain(MEDIA_CATEGORY_SHOP);
    expect(MEDIA_CATEGORIES).toContain(MEDIA_DEFAULT_CATEGORY);
  });

  it("分类无重复", () => {
    expect(new Set(MEDIA_CATEGORIES).size).toBe(MEDIA_CATEGORIES.length);
  });
});

describe("邀请码参数边界(#80)", () => {
  it("长度与随机段约束自洽(前缀最长时仍留得下随机段)", () => {
    expect(INVITATION_LIMITS.LENGTH_MIN).toBeGreaterThanOrEqual(
      INVITATION_LIMITS.PREFIX_MIN + 1 + INVITATION_LIMITS.RANDOM_BODY_MIN,
    );
    expect(INVITATION_LIMITS.PREFIX_MAX + 1 + INVITATION_LIMITS.RANDOM_BODY_MIN).toBeLessThanOrEqual(
      INVITATION_LIMITS.LENGTH_MAX,
    );
    expect(INVITATION_LIMITS.COUNT_MIN).toBe(1);
    expect(INVITATION_LIMITS.MAX_USES_MIN).toBe(1);
  });

  it("随机字符集去混淆字符且无重复", () => {
    for (const bad of ["0", "O", "1", "l", "I"]) {
      expect(INVITATION_ALPHABET, bad).not.toContain(bad);
    }
    expect(new Set(INVITATION_ALPHABET).size).toBe(INVITATION_ALPHABET.length);
  });

  it("前缀仅允许大写字母/数字", () => {
    expect(INVITATION_PREFIX_PATTERN.test("LK")).toBe(true);
    expect(INVITATION_PREFIX_PATTERN.test("lk")).toBe(false);
    expect(INVITATION_PREFIX_PATTERN.test("L-K")).toBe(false);
  });
});

describe("保留 slug(#83)", () => {
  it("无重复项", () => {
    expect(new Set(RESERVED_SLUGS).size).toBe(RESERVED_SLUGS.length);
  });
});
