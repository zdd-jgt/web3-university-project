# 自动铸证可靠性与失败队列测试用例

## TC-001 confirmed revert 重试
- Maps to: AC-002, AC-007
- Expected: reverted -> retry -> new hash -> confirmed，最终保存新成功 hash

## TC-002 dropped/pending-unknown 超时
- Maps to: AC-001, AC-007
- Expected: 有界等待后 confirmed-state 对账并 retry/FAILED，不永久 MINTING

## TC-003 finalized-state 恢复
- Maps to: AC-003
- Expected: 只有达到确认深度的 certificateOf 才能恢复 MINTED

## TC-004 失败队列授权与分页
- Maps to: AC-004, AC-005
- Expected: ADMIN 可分页查询脱敏字段，其他角色拒绝

## TC-005 幂等/并发管理员重试
- Maps to: AC-004, AC-005
- Expected: 并发重复只有一次 FAILED -> PENDING，不能覆盖 buyer/course/tokenUri

## TC-006 管理员页面
- Maps to: AC-006
- Expected: 加载、空、失败、重试中、成功/冲突状态可访问且可恢复

## TC-007 真实 PostgreSQL Worker 状态机
- Maps to: AC-007
- Expected: SQL lease、attempts、timeout、txHash 和最终状态与规格一致

## TC-008 Anvil SBT 闭环
- Maps to: AC-008
- Expected: 证书铸给 buyerWallet、唯一且不可转让，Outbox DELIVERED

## TC-009 证据边界
- Maps to: AC-008
- Expected: 仅声明本地证据，Sepolia/生产/费用与 nonce replacement 仍明确未验证
