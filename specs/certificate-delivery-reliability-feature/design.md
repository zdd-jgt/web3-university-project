# 自动铸证可靠性与失败队列 Feature 设计

## 核心解释
“调用 mint”不是交付证书。系统只在达到确认深度的成功 receipt 与 `certificateOf` 一致时写 MINTED；否则必须在有限时间内重试或进入人工队列。

## 方案比较
- A: receipt 未找到就无限等待。不会误发第二笔，但任务可能永久卡死。
- B: 保存广播时间/检查次数，超时后用 confirmed-state 对账，再做有界重试或 FAILED。多一个状态事实，但可恢复、可审计。

选择 B。本地环境允许重新广播；SBT 与数据库唯一性提供最终防重复。真实 Sepolia 上线前另行设计同 nonce replacement 与费用上调，不把本地策略冒充生产完备。

## 数据与状态
- `CourseCompletion` 增加 `broadcastAt`、`lastReceiptCheckAt`，最终 txHash 只保存成功或当前尝试的 hash。
- Outbox attempts 统一表示已消费的失败尝试；达到上限同时将 Outbox 和 Completion FAILED。
- 管理员重试用原子条件更新 FAILED -> PENDING，清除非最终 txHash/广播时间，保留审计失败原因和递增 retry generation。

## Worker 流程
1. 领取 PENDING，读取关系化 buyer wallet/course/token URI。
2. 从达到确认深度的区块状态查询已有证书；存在则恢复落库。
3. 广播并原子保存 txHash/broadcastAt。
4. receipt 成功且确认后读证书并 MINTED；revert 进入有界 retry。
5. receipt 未找到或未确认超过 timeout，先 confirmed-state 对账；无证书则 retry/FAILED。

## 管理员边界
- API 只允许 ADMIN 查询/重试；不接受 buyer、course、tokenUri、attempts 等覆盖值。
- 重试仅作用于 FAILED 且未确认存在证书的任务；Worker负责最终链上对账。
- UI 展示稳定错误码、attempts、时间和短 txHash，不展示内部 RPC、私钥或完整 stderr。

## 证据与回退
- 真实 PostgreSQL 集成测试验证 SQL 状态机；Go fake chain验证时间；Anvil 验证合约行为。
- 代码回退前停止 Worker；数据库新增字段可保留为空，不需要破坏性删除。
