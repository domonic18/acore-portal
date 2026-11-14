import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * 发布链路守卫(2026-11-14 生产发布失败/耗时的根因沉淀):
 *
 *  ① **迁移步骤不得在发布机上现下载依赖**——早前 migrate 一次性服务用
 *     `node:22-slim` + `npx --yes prisma@6.19.3`,在生产机上现场下载 CLI 与引擎:
 *     国内 npm 链路 ~170KB/s,实测耗 15 分 34 秒且全程零输出;`run --rm` 又不留
 *     npm 缓存 ⇒ 每次发布都重下一次。修法是**镜像内置迁移工具**
 *     (docker/web/Dockerfile 的 /opt/prisma),migrate 服务复用 web 镜像。
 *  ② **远端发布不得依附于 SSH 会话**——2026-11-14 生产发布 exit 255 的直接死因:
 *     迁移步骤静默 15 分半(连接空闲)→ 链路 15 分钟空闲超时 RST → 远端 deploy.sh
 *     随 SIGHUP 中断。修法是远端 setsid 后台执行 + 退出码落文件 + CI 轮询,
 *     且所有 ssh 必须带保活。
 *  ③ **镜像构建必须有层缓存**——无缓存时每次发布都从零构建(实测 12 分 42 秒)。
 *     缓存的承载物是**常驻 builder 的本地层缓存**,不是 GitHub 缓存服务:
 *     `cache-to: type=gha` 会把数 GB 构建缓存推去 GitHub,写层阶段实测卡死
 *     20 分钟 ⇒ 步骤超时、作业判红,而镜像早已推完(2026-11-15 实测)。
 */

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(path.resolve(ROOT, rel), "utf8");
}

/** 取 compose 文件里某个服务块(缩进 2 空格的 `  <name>:` 起,到下一个同级服务止) */
function composeService(rel: string, service: string): string {
  const lines = read(rel).split("\n");
  const start = lines.findIndex((l) => l === `  ${service}:`);
  if (start === -1) throw new Error(`${rel} 里找不到服务 ${service}`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  return lines.slice(start, end === -1 ? undefined : start + 1 + end).join("\n");
}

/** 去注释行:注释里复述旧写法(如「早前是 npx 现下载」)不该被当成现状 */
function stripComments(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

const COMPOSE_FILES = [
  "docker/docker-compose.prod.yml",
  "docker/docker-compose.test.yml",
];

describe("发布链路守卫 · 迁移步骤不现下载依赖", () => {
  it.each(COMPOSE_FILES)("%s 的 migrate 服务复用 web 镜像", (file) => {
    const block = stripComments(composeService(file, "migrate"));
    expect(block).toMatch(/image:\s*\$\{WEB_IMAGE:/);
    expect(block).not.toMatch(/image:\s*node:/);
  });

  it.each(COMPOSE_FILES)("%s 的 migrate 命令不调 npx(禁现下载)", (file) => {
    const block = stripComments(composeService(file, "migrate"));
    expect(block).not.toMatch(/\bnpx\b/);
    expect(block).not.toMatch(/\bnpm\s+(install|i)\b/);
    expect(block).toMatch(/command:\s*prisma migrate deploy/);
  });

  it("web 镜像内置了 prisma CLI(迁移工具的单一来源)", () => {
    const dockerfile = read("docker/web/Dockerfile");
    expect(dockerfile).toMatch(/npm install -g --prefix \/opt\/prisma prisma@[\d.]+/);
    expect(dockerfile).toMatch(/ENV PATH="\/opt\/prisma\/bin:\$PATH"/);
  });

  it("内置的 prisma 版本与 lockfile 锁定版本一致", () => {
    const dockerfile = read("docker/web/Dockerfile");
    const lock = read("pnpm-lock.yaml");
    const version = dockerfile.match(/prisma@([\d.]+)/)?.[1];
    expect(version).toBeTruthy();
    expect(lock).toContain(`prisma@${version}:`);
  });
});

describe("发布链路守卫 · 远端发布不依附 SSH 会话", () => {
  const script = read("scripts/ci/remote-release.sh");

  it("所有 ssh 都带保活(空闲会话不被链路超时掐断)", () => {
    expect(script).toMatch(/ServerAliveInterval=\d+/);
    expect(script).toMatch(/ServerAliveCountMax=\d+/);
  });

  it("远端发布后台执行(setsid),退出码落独立文件", () => {
    expect(script).toMatch(/\bsetsid\b/);
    expect(script).toMatch(/REMOTE_EXIT/);
    expect(script).toMatch(/exit "\$code"/);
  });

  it("CI 侧轮询退出码文件判定成败,而非依赖 SSH 退出码", () => {
    expect(script).toMatch(/cat '\$REMOTE_EXIT'/);
    expect(script).toMatch(/sleep "\$POLL_INTERVAL"/);
  });

  it("生产发布作业走这份脚本(远端交互只有一份实现)", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain("bash scripts/ci/remote-release.sh");
    // 旧的前台 ssh 直跑 deploy.sh 写法不得复活
    expect(ci).not.toMatch(/ssh [^|]*deploy\.sh --env prod/);
  });

  it("脚本的密钥契约是「路径」,不是 secret 正文", () => {
    // 契约错位会直接死于预检:`[ -f "$DEPLOY_SSH_KEY" ]` 拿到密钥正文 ⇒
    // 「私钥不存在:<正文>」(2026-11-14 生产发布失败的实际原因)
    expect(script).toMatch(/DEPLOY_SSH_KEY="\$\{DEPLOY_SSH_KEY:-\$HOME\/\.ssh\/deploy_key\}"/);
    expect(script).toMatch(/\[ -f "\$DEPLOY_SSH_KEY" \]/);
  });

  it("CI 的发布步骤传路径不传 secret 正文(密钥落盘在默认路径)", () => {
    const lines = read(".github/workflows/ci.yml").split("\n");
    const idx = lines.findIndex((l) => l.includes("bash scripts/ci/remote-release.sh"));
    expect(idx).toBeGreaterThan(-1);
    // 发布步骤的 env 块(向上回溯到 `env:` 或 `- name:` 为止)
    const envLines: string[] = [];
    for (let i = idx - 1; i >= 0; i--) {
      const l = lines[i] ?? "";
      if (/^\s*-\s+name:/i.test(l) || /^\s*run:/i.test(l)) break;
      if (/^\s*(env:|DEPLOY_\w+:)/.test(l)) envLines.push(l);
    }
    expect(envLines.join("\n")).not.toMatch(/secrets\./);
  });
});

describe("发布链路守卫 · 镜像构建有层缓存且不走 GHA 缓存服务", () => {
  const workflow = stripComments(read(".github/workflows/release-image.yml"));

  it("构建走持久 builder(层缓存由本机 buildkit store 承担)", () => {
    expect(workflow).toMatch(/docker buildx use ci-builder/);
  });

  it("不使用 GitHub Actions 缓存服务(导出数 GB 会卡死步骤)", () => {
    // 2026-11-15 实测:`cache-to: type=gha,mode=max` 把整个构建缓存(数 GB)推去
    // GitHub 缓存服务,写层阶段 20 分钟零进展 ⇒ 步骤 25 分钟超时 ⇒ 作业判红,
    // 而镜像早在 3 分 41 秒就推完了。单 runner 场景下这份导出纯开销。
    expect(workflow).not.toMatch(/cache-to:\s*type=gha/);
    expect(workflow).not.toMatch(/cache-from:\s*type=gha/);
  });

  it("不用临时 builder(临时 builder 不保留层缓存)", () => {
    // setup-buildx-action 每次另建临时 builder,buildkit 的层 store 一并丢弃 ⇒
    // 等于每次从零构建(实测 12 分 42 秒)。缓存要落在常驻的 ci-builder 上。
    expect(workflow).not.toMatch(/setup-buildx-action/);
  });
});
