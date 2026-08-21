# Sepolia YDToken 首发准备设计

## 第一性原理

部署脚本的价值不是减少几条命令，而是把链、构造参数、部署顺序和部署后不变量变成一个可失败的契约。真实广播不可逆且消耗测试币，因此“可重复本地验证”和“外部动作授权”必须分离。

## 方案比较

### 方案 A：Foundry 加密 keystore（采用）

- 项目只记录 `DEPLOYER_ACCOUNT` 名称，实际私钥加密存放在用户的 Foundry keystore 目录。
- dry-run 与 broadcast 使用同一脚本，只有显式 `--broadcast` 才产生外部副作用。
- 优点是私钥不进入 `.env`、命令行参数和 Git；代价是首次需要运行 `cast wallet import` 并输入密码。

### 方案 B：本机 `.env` 保存原始私钥（不采用）

- 操作更少，但原始私钥容易被误提交、日志、终端历史或工具读取。
- 即使只用于测试网，也会扩大安全边界，不符合最小秘密暴露原则。

## 模块边界

- `DeployYDSepolia.s.sol`：拥有 Sepolia chain guard、Treasury 读取、单合约部署和部署后断言。
- `DeployYDSepolia.t.sol`：在本地 VM 模拟 Sepolia chain ID，验证成功路径和 Treasury 负例。
- `sepolia.env.example`：只描述变量契约，不保存实际值或原始私钥。
- `docs/sepolia-deployment.md`：拥有人工操作、停止条件、回执、回退和秘密处理说明。

## 不变量与信任边界

- 仅 chain ID `11155111` 可运行 Sepolia 脚本。
- Treasury 收到精确 `80_000_000 ether`；名称为 `YiDeng Token`、符号为 `YD`、小数位为 18。
- 脚本只产生一个 YDToken 地址；其余四个合约和 Uniswap 池不属于本阶段副作用。
- Treasury 是外部公共地址，部署前必须人工核对；错误地址上的固定供应无法迁移或增发补救。

## 失败、停止与恢复

- chain ID、地址、Feed 或部署后断言不符时立即回退，不继续广播。
- dry-run 失败不得加 `--broadcast` 重试；先修配置或脚本并重新测试。
- 广播中断时先检查 Foundry broadcast JSON 和 Sepolia Etherscan，不盲目重放整套脚本。
- 已部署的不可升级 YDToken 不能删除；若 Treasury 或供应参数错误，停止接线、记录错误地址并部署新版本。未投入流动性或配置课程前爆炸半径较小。

## 发布边界

- T-001 为 `prepare-only`，只产生本地文件和测试证据。
- T-002 为 `requires-confirmation`，必须确认目标链、部署账户公共地址、预计 Gas、Treasury 和回退计划后才可执行。
