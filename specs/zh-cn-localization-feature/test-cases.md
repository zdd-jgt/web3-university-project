# 正经打工人的 web3大学中文本地化测试用例

## TC-001 品牌一致性

- Maps to: AC-001
- Type / priority: React component + browser, P1
- Preconditions: 本地前端可运行
- Expected: 标题、页头、页脚和品牌无障碍名称均为“正经打工人的 web3大学”
- Evidence: 前端测试输出与本地浏览器 DOM

## TC-002 Privy 中文配置

- Maps to: AC-002
- Type / priority: TypeScript configuration, P1
- Preconditions: 使用已安装 Privy React SDK 3.37.1 类型
- Expected: 入口标题、说明与 SDK 当前开放的钱包连接字符串配置中文；类型检查通过
- Evidence: `web-typecheck` 和配置源码

## TC-003 状态码中文解释

- Maps to: AC-003
- Type / priority: unit + React component, P1
- Data: 已知/未知学习原因码与媒体失败码
- Expected: 已知码显示中文含义；未知码中文兜底并保留诊断码
- Evidence: 本地化单元测试和课程内容/教师组件测试

## TC-004 zh-CN 格式

- Maps to: AC-004
- Type / priority: unit, P1
- Data: 固定 UTC 时间、整数和小数
- Expected: 显式 `zh-CN` 输出，不依赖运行环境默认 locale；无效日期安全降级
- Evidence: 本地化单元测试

## TC-005 前端回归与浏览器验收

- Maps to: AC-005
- Type / priority: workspace test + typecheck + static + browser, P1
- Execution: `teacher-admin-comments-closure`、`web-typecheck`、Biome、`git diff --check` 和本地浏览器抽查
- Expected: 所有命令通过，页面无新增运行错误；未配置真实 Privy tenant 的限制如实报告
- Evidence: Harness 事件链、命令输出哈希和浏览器截图
