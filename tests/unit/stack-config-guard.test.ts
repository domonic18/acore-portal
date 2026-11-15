import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 容器栈的 system_config 守卫:
 * 宿主机默认值(游戏库 localhost:3307 / SOAP / SMTP localhost)在容器内指的是「容器自己」,
 * web 容器读到就启动自检失败(unhealthy)⇒ 发布健康检查判失败、连回滚也起不来
 * (2026-11-15 测试环境发布失败即此因:宿主默认种子覆盖了容器内取值)。
 * 故容器可达性地址必须由一个**独立且排在最后**的 initdb 文件翻译,且 base 种子须带警示。
 */
const BASE = "scripts/dev/initdb/init-system-config.sql";
const CONTAINER = "scripts/dev/initdb/zz-init-system-config-container.sql";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("容器栈的 system_config 覆盖", () => {
  it("容器覆盖文件存在且按文件名序排在 base 种子之后(initdb 依次执行)", () => {
    expect(read(CONTAINER)).toContain("UPDATE");
    // initdb 按文件名序执行:'zz-...' 必须排在 'init-system-config.sql' 之后
    expect(CONTAINER.localeCompare(BASE)).toBeGreaterThan(0);
  });

  it("容器覆盖把三条容器内可达性地址翻译成 compose 服务名", () => {
    const sql = read(CONTAINER);
    expect(sql).toMatch(/REPLACE\(`value`,'localhost:3307','mysql:3306'\)/);
    expect(sql).toContain("'soap.url'");
    expect(sql).toContain("http://soap-mock:7878/");
    expect(sql).toContain("'smtp.host'");
    expect(sql).toContain("'mailpit'");
  });

  it("base 种子的容器提示不再手写这三条(单一真相源,禁两处各写一份)", () => {
    const base = read(BASE);
    expect(base).not.toContain("localhost:3307','mysql:3306");
    expect(base).not.toContain("http://soap-mock:7878/'    WHERE");
    expect(base).toContain("zz-init-system-config-container.sql");
  });

  it("base 种子带「勿对已运行容器栈执行」的警示(它是覆盖写)", () => {
    const base = read(BASE);
    expect(base).toContain("ON DUPLICATE KEY UPDATE");
    expect(base).toMatch(/⚠️/);
    expect(base).toContain("容器");
  });
});
