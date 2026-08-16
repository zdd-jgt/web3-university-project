# 自动铸证可靠性与失败队列 Feature 需求

## Feature 信息
- Feature ID: F-003
- 依赖: F-002
- 环境: 本地 PostgreSQL、Go Worker、Anvil、Foundry 合约

## 目标
让已产生的唯一完课 Outbox 在交易丢失、长时间未确认、revert、Worker 重启和数据库重试下最终进入 `MINTED` 或可由管理员处理的 `FAILED`，证书始终铸造给实际购买课程且完成学习的钱包。

## 非目标
- 不部署 Sepolia，不使用真实资金或真实私钥。
- 不改变 CertificateSBT 的不可转让与一钱包一课程规则。
- 不在浏览器直接铸证，不增加学生手工 claim。

## 用户故事

- 作为学生，我完成全部必修课时后无需再次操作，证书最终自动出现在实际购买课程的钱包中。
- 作为管理员，我能看到超过自动重试上限的失败任务，并在确认问题已恢复后安全重试。
- 作为运维人员，我能区分广播中、等待确认、已铸造和最终失败，不会让任务永久停在含糊状态。

## 功能需求
- FR-001: Worker 领取任务后从数据库关系取得 buyer wallet，并在链上 SBT 合约再次验证购买。
- FR-002: 广播记录包含首次广播时间和确认检查事实；`Found=false`、长期 `Confirmed=false` 或 receipt 查询错误不能无限停留 MINTING。
- FR-003: 达到广播超时后先从确认区块读取 `certificateOf` 对账；没有证书时按明确策略重试，达到上限进入 FAILED。
- FR-004: 重试不得把旧 reverted/dropped txHash 当作最终证书交易；最终记录必须对应确认成功的交易。
- FR-005: 管理员可以分页查询 FAILED 任务、脱敏失败原因和 attempts，并执行幂等重试；非管理员禁止。
- FR-006: 管理员重试前 Worker仍执行链上证书对账，已有证书只做恢复落库，不重复 mint。
- FR-007: 证书铸造成功后保存 tokenId/txHash，SBT 不可转让且 metadata URI 内容寻址。
- FR-008: 本地 E2E 从完课 Outbox 经 Go Worker 到 Anvil CertificateSBT，覆盖成功、revert、掉单超时和管理员重试。

## 验收标准
- AC-001: dropped/pending-unknown 交易在有界时间内离开无限 MINTING。
- AC-002: retry/revert/恢复路径最终 txHash 与确认成功交易一致，attempts 有界。
- AC-003: 已存在证书的恢复读取使用达到确认深度的链状态，不因 latest 短重组提前 MINTED。
- AC-004: 管理员失败队列 API 有分页、授权、幂等重试和状态冲突保护。
- AC-005: 非管理员、错误状态、重复重试和并发重试均不能破坏唯一性。
- AC-006: 前端管理员可查看和重试失败任务，明确显示交易/状态而不泄漏密钥或完整内部错误。
- AC-007: 本地真实 PostgreSQL + Go 测试覆盖 reverted -> retry -> new tx -> confirmed、dropped -> timeout 和 existing certificate recovery。
- AC-008: 本地 Anvil E2E 证明证书铸给 CourseCompletion.buyerWallet，SBT 不可转让且无重复证书。

## 非功能需求

- NFR-001: Worker 所有领取、广播、确认、重试和失败转换均有租约或原子条件保护。
- NFR-002: receipt 轮询、广播超时、最大尝试次数和退避均从显式本地配置读取并有安全默认值。
- NFR-003: 本机验证严格串行，使用无价值 Anvil 资产；不得记录私钥、完整 RPC 响应或敏感错误。
- NFR-004: 本地证据不得升级为 Sepolia 或生产可靠性声明。

## 边界情况

- 广播成功但数据库落库失败时，下一轮先链上对账，不盲目重复 mint。
- receipt 暂时不可用、交易掉出 mempool、长时间 pending、revert 和短重组必须产生不同且可恢复的处理结果。
- Worker 在持有租约期间崩溃后，其他实例可在租约过期后继续，旧实例不能覆盖新状态。
- 两个管理员同时重试同一 FAILED 任务时只有一个状态转换成功。
- 已经存在证书但数据库仍 FAILED 时，重试只能恢复 MINTED，不得再次铸造。

## 依赖

- F-002 产生的唯一 CourseCompletion 与 certificate.mint Outbox。
- 现有 CourseMarket 购买事实、CertificateSBT 不可转让和唯一性检查。
- 本地 PostgreSQL、Go Worker、Anvil 与 Foundry/Docker。

## 开放问题
- 无。生产 nonce replacement 与费用策略在本地证据完成后另行评审；本 Feature 不执行真实链交易。
