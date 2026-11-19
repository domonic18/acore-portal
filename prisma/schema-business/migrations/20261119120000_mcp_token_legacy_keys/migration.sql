-- MCP 令牌模型改版(2026-11-19 用户反馈,MiniMax 式):哈希+有效期 → 明文+无有效期
-- 旧键(mcp.tokenHash / mcp.tokenPrefix / mcp.tokenExpiresAt)不再被任何代码读取,
-- 留着会误导排障(以为库里还存着哈希),直接清掉;DELETE 幂等,重放零变更

DELETE FROM `system_config` WHERE `key` IN ('mcp.tokenHash', 'mcp.tokenPrefix', 'mcp.tokenExpiresAt');
