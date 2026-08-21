# Sepolia YDToken 首发准备测试用例

## TC-001 链 ID 门禁

- Maps to: AC-001
- Type / priority: Foundry negative, P0
- Expected: Anvil/mainnet 等非 `11155111` 链调用脚本均以明确错误回退。
- Evidence: `contracts-sepolia-prep`。

## TC-002 配置输入负例

- Maps to: AC-001, AC-003
- Type / priority: Foundry negative/static, P0
- Expected: 零地址 Treasury 被拒绝；示例文件无原始私钥变量。
- Evidence: Foundry 测试、静态搜索与 scoped review。

## TC-003 YDToken 模拟部署与不变量

- Maps to: AC-002
- Type / priority: Foundry integration, P0
- Preconditions: VM chain ID 设置为 Sepolia，Treasury 使用本地测试地址。
- Expected: 一个 YDToken 成功部署，名称、符号、18 位小数、80,000,000 YD 总量和 Treasury 余额全部匹配。
- Evidence: `contracts-sepolia-prep`。

## TC-004 文档、格式与秘密边界

- Maps to: AC-003, AC-004, AC-005
- Type / priority: static/format, P1
- Expected: 文档包含 keystore、dry-run、停止/恢复；`forge fmt --check` 与 `git diff --check` 通过；无秘密值和 broadcast 制品。
- Evidence: `contracts-format`、scoped diff 与 Git ignore 检查。

## TC-005 真实 Sepolia 广播与验证

- Maps to: AC-006
- Type / priority: external testnet operation, P0
- Preconditions: T-001 通过，用户针对目标链和动作明确授权，测试账户有足够 SepoliaETH。
- Expected: YDToken 部署交易确认、Etherscan 验证通过、地址与区块记录完整；失败按 runbook 停止。
- Evidence: `contracts-yd-sepolia-postdeploy` 独立读取公共链和 Etherscan；部署前保持 `not_run`，不得由本地 dry-run 冒充。
