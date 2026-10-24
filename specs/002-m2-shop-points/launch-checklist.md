# 上线前置清单(M2 T067 / M3 T049 扩)

> M2 验收在 soap-mock 下全链路完成(make check 137 vitest + 28 E2E 全绿);以下为切生产/公网前的硬性门槛。
> 状态真相源:docs/plan/development-plan.md;本文档只列前置项与操作入口。

## 1. SOAP 真机联调(M2 验收明确延后项)

- [ ] soap.url 指向真实 worldserver,`pnpm verify:soap` 通过
- [ ] 8 类 SERVICE_COMMANDS mock 回执 vs 真机返回逐类核对(regex 桩与真机输出差异,不中即 usage error)
- [ ] `.send items` 中文邮件主题/正文真机可达(订单号入邮件,玩家可对账)

## 2. 每处理器真机抽测(handlers-status.md 六条目闭环)

- [ ] 9 处理器(char-change-race/faction/customize/name/name-unlock/char-transfer/char-clone/guild-change/item-restoration)各 ≥1 笔真机小额单,发货结果游戏内核实
- [ ] rename 双参数形态、destAccount 大小写、在线/离线生效差异真机确认

## 3. SC-001 玩家真实登录(账号无感验收)

- [ ] 测试环境(dev.17aitech.com)邀请部分玩家真实登录;`$P$` 重哈希与 `$wp$` 零接触双路径各覆盖
- [ ] 备选:`pnpm verify:sc001`(读 workspace/verify-credentials.txt,100 组明文凭据方案保留待用)

## 4. COS 图片资产正式迁移(演练走 scan-only,见 migration-report.md)

- [ ] system_config 配置 cos.bucket/region/secretId/secretKey/cdnBase 五键(凭据不入 env/文档,宪法 VI)
- [ ] 切换日对最新快照按序重跑(全幂等):①`wp-users-import.sql` → ②`shop-import.sql` → ③`import-points.mjs` → ④`cos-upload.mjs`(去掉 `--scan-only` 即真实上传,newUrl 由 ODKU 回填 cdnBase+key)
- [ ] 死链扫描报告复跑归零;抽样前台图片可达

## 5. 运维接线(公网暴露前)

- [ ] crontab 接线:`pnpm cron:reconcile-points`(日终对账,退出码 2 告警)+ `pnpm cron:recover-deliveries`(delivering 超 5min 重驱动)
- [ ] 生产 compose+TLS 上线(docker/,参考 test 栈);游戏四库连接串入 system_config
- [ ] **Turnstile+登录限速实装**(宪法 VI deferral 归 M4,公网暴露前硬性要求——当前 429 语义未实装,公网放开前必须补)
- [ ] 备份:cron mysqldump 业务库+对象存储;审计日志保留策略确认

## 6. 切换观测

- [ ] 新旧并行观察期(读新写旧,M4 验收口径);1,897 存量订单页抽查与旧站对拍
- [ ] 复核清单 `/admin/review-items` 值守:切换日 D3 若出现金额不符单,人工 approve/驳回留痕

## 7. M3 内容/状态域前置项(T049 扩)

- [ ] SOAP `.server info` 真机解析核对:uptime 行/登录队列行解析正则 vs 真机输出(mock 固定样例先行,解析失败置 null 前台 N/A;在线数走 characters 库 `online=1` 计数不走文本解析,契约 specs/003 contracts/server-status.md)
- [ ] characters 今日新注册口径核对:`create_date`(unix 秒,M1 迁移既有字段)在真机库的语义确认为账号建号时间,避免状态卡统计口径漂移(T043 偏差注记)
- [ ] 内容迁移正式跑清单(切换日全幂等,先于/随后 M2 §4 管线):①`route-map-m3.sql`(p/page_id/cat 三键 124 行,断言见文件尾;topic/forum 两键随 forum-import 扩充) ②`content-import.mjs`(article/content_page/progression_node 三落地表+正文死链扫描) ③`forum-import.mjs`(版块/主题/帖子,contentHtml 附件重写查 image_asset_map) ④`cos-upload.mjs` 扫描面增量核对(M2 全量 4.4G/972 附件已扫,M3 新增 forum_post.contentHtml/progression_node.imageUrl 引用),死链报告复跑归零
