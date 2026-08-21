# YDToken Sepolia 首发手册

## 当前边界

本手册只准备 `YDToken` 在 Ethereum Sepolia（chain ID `11155111`）的首发。当前任务没有连接 Sepolia、没有广播交易，也没有消耗 SepoliaETH。CourseCatalog、CourseMarket、CertificateSBT、ChainlinkPriceOracle 和 Uniswap 池均不在本次部署范围内。

## 你需要准备的内容

1. `TREASURY_ADDRESS`：你控制的测试专用钱包公开地址。部署后全部 80,000,000 YD 会进入这里，填错后无法从合约侧改回。
2. `SEPOLIA_RPC_URL`：Alchemy 或 Infura 创建 Ethereum Sepolia 应用后获得的 HTTPS Endpoint。
3. `ETHERSCAN_API_KEY`：Etherscan API Dashboard 创建的 Key，用于验证合约源码。
4. `DEPLOYER_ACCOUNT`：Foundry 加密 keystore 的账户名称，默认 `web3-university-sepolia`。
5. 少量 SepoliaETH：只放在部署账户，用于未来广播 Gas；测试币没有现实价值。

不要把私钥、助记词、keystore 密码发到聊天、提交到 Git 或写入项目环境模板。

## 本机准备

在 `packages/contracts` 目录复制模板并填写：

```bash
cp sepolia.env.example .env.sepolia
```

`.env.sepolia` 已被根 `.gitignore` 的 `.env.*` 规则忽略。填写后在当前终端加载：

```bash
set -a
source .env.sepolia
set +a
```

把一个专用于 Sepolia、没有真实资产的钱包导入 Foundry 加密 keystore。命令会交互式要求私钥和新的 keystore 密码，私钥不会写入项目：

```bash
cast wallet import "$DEPLOYER_ACCOUNT" --interactive
```

你可以读取部署账户公开地址，用它领取少量 SepoliaETH：

```bash
cast wallet address --account "$DEPLOYER_ACCOUNT"
```

## 本地验证与 Sepolia dry-run

先运行本地测试，验证错误链、零 Treasury 和 80,000,000 YD 固定供应：

```bash
forge test --match-contract DeployYDSepoliaTest -vvv
forge fmt --check
```

随后可在获得 RPC 后执行 Sepolia 模拟。没有 `--broadcast` 时 Foundry 只模拟，不会产生链上交易：

```bash
forge script script/DeployYDSepolia.s.sol:DeployYDSepolia \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --account "$DEPLOYER_ACCOUNT" \
  -vvvv
```

只有 dry-run 成功、Treasury 与部署账户公开地址经人工复核、Gas 估算可接受，并且用户针对 Sepolia 广播再次明确授权后，才允许执行下列命令：

```bash
# 当前禁止执行：T-002 获得单独授权后才能使用。
forge script script/DeployYDSepolia.s.sol:DeployYDSepolia \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --account "$DEPLOYER_ACCOUNT" \
  --broadcast \
  --verify \
  --etherscan-api-key "$ETHERSCAN_API_KEY" \
  --slow \
  -vvvv
```

## 广播前停止条件

- 钱包网络或 RPC 返回的 chain ID 不是 `11155111`。
- Treasury 与你最终确认的公开地址不一致或无法控制。
- dry-run 中名称、符号、18 位小数、总供应或 Treasury 余额断言失败。
- 部署账户余额不足、Gas 估算异常、Etherscan Key 无效或出现未知签名请求。
- Git diff 中出现私钥、助记词、完整 RPC URL、API Key 或 `.env.sepolia`。

## 回执与恢复

- dry-run 失败没有链上副作用：修复配置后重新运行本地测试与 dry-run。
- 广播开始后不要直接重跑整套命令。先检查 `packages/contracts/broadcast/DeployYDSepolia.s.sol/11155111/run-latest.json` 和 Sepolia Etherscan，确认交易是否已上链。
- 已成功部署但 Treasury 错误时，旧 YDToken 无法升级或改写初始余额；应停止向前端、CourseMarket 和 Uniswap 接线，记录该错误地址并在重新授权后部署新版本。
- T-002 完成时应把 YDToken 地址、部署交易、区块、Treasury、编译器和源码验证状态写入独立部署记录；不得把忽略目录中的本地 JSON 当作唯一长期证据。

