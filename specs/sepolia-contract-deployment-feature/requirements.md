# Sepolia YDToken 首发与验证需求

## 目标

- 为 `YDToken` 提供独立、可审计的 Ethereum Sepolia 首发脚本。
- 使用空环境模板和 Foundry 加密 keystore，避免私钥进入项目文件。
- 在任何真实广播前完成本地脚本测试、链 ID 门禁和部署后不变量校验。

## 非目标

- T-001 准备任务不连接或写入 Sepolia，不广播交易、不验证 Etherscan；T-002 仅在用户明确授权后部署 YDToken 并验证源码。
- 不创建、初始化或注资 Uniswap 池。
- 不部署 CourseCatalog、CourseMarket、CertificateSBT、ChainlinkPriceOracle。
- 不修改 `YDToken` 的业务逻辑或构造参数。
- 不把私钥、助记词、keystore 密码、RPC URL 或 API Key 写入 Git。

## 功能需求

- FR-001：Sepolia 脚本只能在 chain ID `11155111` 执行，其他链必须失败。
- FR-002：脚本只部署一个 `YDToken`，从环境读取 Treasury 并拒绝零地址。
- FR-003：脚本部署后校验名称、符号、18 位小数、80,000,000 YD 总量及 Treasury 全额余额。
- FR-004：脚本输出 YDToken 地址，供后续 CourseMarket 与 Uniswap 配置引用。
- FR-005：环境模板不得包含原始私钥字段；部署账户通过 Foundry keystore 名称提供。
- FR-006：真实 `--broadcast --verify` 必须作为单独的 requires-confirmation 任务，不能由本地准备授权推导。

## 验收标准

- AC-001：错误 chain ID 和零地址 Treasury 的负例均通过。
- AC-002：模拟 Sepolia 环境能部署一个 YDToken，并验证名称、符号、小数位、固定总量与 Treasury 余额。
- AC-003：示例环境文件只含空秘密占位、公开地址占位和非敏感默认值，Git 忽略实际环境与 broadcast 制品。
- AC-004：中文文档说明 keystore 导入、dry-run、广播门禁、部署回执、停止条件和恢复方式。
- AC-005：完整 Foundry 测试、格式检查和 `git diff --check` 通过；没有链上交易证据，也不得声称已部署。
- AC-006：真实部署记录证明链 ID 为 `11155111`、交易成功并产生合约字节码；链上名称、符号、小数位、80,000,000 YD 总量和 Treasury 全额余额均匹配，且 Etherscan 返回已验证的 `YDToken` 源码。

## 依赖与开放项

- 依赖 F-006 已完成的 80,000,000 YD 固定供应实现。
- 真实部署前由用户提供 Treasury 公共地址、RPC 与 Etherscan Key。
- T-002 已由用户明确确认目标为 Ethereum Sepolia、动作为只部署 `YDToken` 并验证源码；其他合约、Uniswap 和任何主网操作仍未获授权。
