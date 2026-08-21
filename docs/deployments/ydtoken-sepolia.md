# YDToken Ethereum Sepolia 部署记录

## 结论

- 状态：部署成功，源码已验证。
- 网络：Ethereum Sepolia（chain ID `11155111`）。
- 合约：`YDToken`。
- 地址：[`0x63c887858f27b1d558f16b13f35a0a1b5fb8cde8`](https://sepolia.etherscan.io/address/0x63c887858f27b1d558f16b13f35a0a1b5fb8cde8#code)。
- 交易：[`0x852935ebea7e829e3a1c4e240fef35bf2cbbf9ab1ebd6cdea2e51171f26553c1`](https://sepolia.etherscan.io/tx/0x852935ebea7e829e3a1c4e240fef35bf2cbbf9ab1ebd6cdea2e51171f26553c1)。
- 部署区块：`11534376`。
- 部署账户：`0x0b0ab3cccf72c761d1e48430cd7c71986ad63409`。
- Treasury：`0xC1f1127D7F12722eD9Ef824A6c9B8619798Bc8B8`。

## 链上不变量

部署后机器验收于 `2026-08-21T06:57:06Z` 通过：

- 名称为 `YiDeng Token`。
- 符号为 `YD`。
- 小数位为 `18`。
- 总供应量为 `80,000,000 YD`，基础单位值为 `80000000000000000000000000`。
- 初始总供应量全部位于上述 Treasury。
- 部署交易回执状态成功，回执合约地址与记录一致，合约地址存在字节码。
- Etherscan 返回合约名 `YDToken`、Solidity `0.8.26` 的已验证源码。

可重复验收命令：

```bash
/Users/jgt/.volta/bin/node infra/scripts/verify-yd-sepolia-deployment.mjs
```

验收脚本只读取公开链数据；RPC URL 与 Etherscan Key 从 Git 忽略的本地环境读取且不写入输出。

## 边界与恢复

- 本记录只证明 `YDToken` 已在 Sepolia 部署并验证，不代表 CourseCatalog、CourseMarket、CertificateSBT、ChainlinkPriceOracle 或 Uniswap 池已经部署。
- Sepolia 资产没有真实经济价值，本地址不得冒充 Ethereum 主网资产。
- `YDToken` 是固定供应、不可升级合约。链上部署不能回滚；若将来发现构造参数或代码错误，应停止在应用中引用该地址，部署新版本并公开标记旧地址废弃，禁止对同一脚本盲目重复广播。
