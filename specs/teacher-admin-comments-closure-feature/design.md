# 教师、管理员与评论工作流收口 Design

## 第一性原理与用户结果

页面是否隐藏按钮不是权限证明。可信结果必须是：浏览器只表达意图；NestJS 从认证 Principal、数据库对象关系和链上购买投影重新判断；失败不写入状态且给用户可恢复反馈。

## 方案比较

### 方案 A：把现有跨层改动拆成多个新 Task

优点是角色路由更细；缺点是当前未提交改动已经共同修改 `api.ts`、`app.tsx`、`styles.css` 和状态文档，无法在不暂存/回退用户工作树的情况下独立 adopt，容易造成范围和证据混杂。

### 方案 B：单个高风险 adoption closure Task

将现有相关 diff 一次性纳入严格 owned paths，补齐权限负例、嵌套评论约束、Biome边界、类型/构建/视觉证据，再由 Sol 一次审查。选择本方案，因为它保留现状、可回退为一个本地提交，并减少重复 Agent/测试循环。

## 模块边界

- `apps/api/src/teachers`：教师申请和管理员队列；原子审核与角色变更。
- `apps/api/src/comments`：公开可见评论、购买门禁、课程教师回复、管理员审核。
- `apps/api/src/users/users.controller.ts`：返回当前认证主体的最小会话事实。
- `apps/web/src/lib/api.ts`：唯一浏览器 API 适配层和稳定错误映射。
- `apps/web/src/features/teacher`：教师申请、草稿、课时、上传声明和发布申请编排。
- `apps/web/src/features/admin`：审核队列和 publication package 展示，不持有签名能力。
- `apps/web/src/features/comments`：公开讨论、购买者发帖和教师回复交互。
- `docs/status.md`：只记录本地证据及未验证边界。

## 数据与API契约

- `GET /v1/profile/me` 仅返回 `{userId, role}`。
- `GET /v1/teacher-applications/review-queue` 仅 ADMIN，最多100条PENDING。
- `GET /v1/comments/review-queue` 仅 ADMIN，最多100条并映射课程标题和审核状态。
- 评论回复要求 parent 同课程、未隐藏且 `parentId = null`；数据库可以存关系，但服务层把产品层级限制为一层。
- publication package 是只读部署输入；管理员页面不导入钱包写合约能力。

## 状态与失败处理

- React Query拥有服务器列表缓存；成功后仅失效相关 query。
- 写请求显示 busy、禁用重复提交，并保留错误提示。
- 401/403/404/409/429/503 映射为稳定用户提示；未知错误不泄露后端内容。
- 上传只证明API与浏览器请求形状；真实对象存储、CORS、FFmpeg READY由后续E2E验证。

## 安全与隐私

- 认证由 Privy access token 和当前钱包 Principal 建立；浏览器传入角色不可信。
- 顶层评论购买资格由 EntitlementReader验证；教师回复由课程 `teacherId` 验证。
- 审核接口在Controller再次检查 ADMIN，Service只接受可信adminId并约束目标对象。
- 公开评论仅显示作者内部ID的短前缀；本任务不新增邮箱或PII字段。

## 测试设计

- API单元/边界：队列过滤、非管理员拒绝、教师原子审核、评论购买/所有权/顶层层级、审核原因。
- Web组件：Demo fail closed、成功提交、READY门禁、publication package、评论发帖/回复/审核及错误。
- 客户端契约：方法、路径、body、认证Header和错误映射。
- 机械门禁：任务范围Biome、API/Web typecheck、Web build。
- 视觉证据：无设计参考，检查桌面和平板Demo阻断状态及可见焦点；不声称像素级设计对照。

## 发布与回退

- 仅本地代码提交，不部署。
- 回退为撤销本任务独立提交；数据库无迁移、链上无交易、外部资源无副作用。

## 已知限制

- adoption任务含跨层文件是一次性自举例外，原因是既有diff重叠；后续新功能恢复按层拆分。
- 不创建Codex UI Goal：本任务不设计新界面，只收口已经存在的UI；仍强制视觉证据。
