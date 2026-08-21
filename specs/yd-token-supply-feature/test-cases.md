# YD 固定供应量调整测试用例

## TC-001 精确总供应量

- Maps to: AC-001
- Type / priority: Foundry unit, P0
- Preconditions: 使用非零 Treasury 部署 `YDToken`
- Expected: `totalSupply()` 与 Treasury 余额均精确等于 `80_000_000 ether`
- Evidence: `contracts-yd-supply` 命令输出哈希

## TC-002 固定供应与零地址边界

- Maps to: AC-002, AC-003
- Type / priority: Foundry negative/static contract, P0
- Preconditions: 当前 `YDToken` 源码和零地址构造测试
- Expected: 零地址构造回退；源码无构造后 `mint` 入口
- Evidence: Foundry 结果与 scoped review

## TC-003 CourseMarket 回归

- Maps to: AC-003, AC-005
- Type / priority: Foundry contract integration, P1
- Preconditions: 现有 CourseMarket fixture 使用更新后的 YDToken
- Expected: 课程购买、分账及总供应量断言继续通过
- Evidence: `contracts-yd-supply` 命令输出哈希

## TC-004 文档和格式一致性

- Maps to: AC-004, AC-005
- Type / priority: static/Foundry format, P1
- Expected: README 与架构文档均为 80,000,000 YD；`forge fmt --check` 通过
- Evidence: `contracts-format` 结果、`rg` 和 `git diff --check`

