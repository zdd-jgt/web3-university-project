# 课程内容上传与学习判定测试用例

## TC-001 迁移与现有视频映射
- Maps to: AC-001
- Type / priority: PostgreSQL migration, P0
- Preconditions: 现有迁移已应用并存在一条 VideoAsset fixture
- Execution: `api-media-schema`
- Expected: 新迁移成功，旧视频映射为 VIDEO，缺验真字段时不被错误提升为 READY
- Evidence: 真实 PostgreSQL 命令与测试输出

## TC-002 资产状态与约束
- Maps to: AC-001, AC-010
- Type / priority: schema/constraint, P0
- Expected: 每课时单一资产、唯一媒体任务、唯一课时完成和合法状态由数据库兜底

## TC-003 课程 READY 门禁
- Maps to: AC-006
- Type / priority: API service, P0
- Expected: READY VIDEO/DOCUMENT 可提交审批，其他状态或缺资产必修课时失败；字幕缺失不阻断

## TC-004 上传会话授权
- Maps to: AC-002
- Type / priority: API authorization, P0
- Expected: 仅课程教师和 DRAFT 课时成功，其他用户/状态按对象级权限失败

## TC-005 上传输入与资源上限
- Maps to: AC-002, AC-003
- Type / priority: API boundary, P0
- Expected: 文件名、允许 MIME、大小、过期时间被验证，key 仅由服务端生成

## TC-006 finalize 失败关闭
- Maps to: AC-003
- Type / priority: storage integration, P0
- Expected: 缺对象、大小不符、过期和重复冲突不排队、不 READY

## TC-007 视频真实转码
- Maps to: AC-004
- Type / priority: FFmpeg + MinIO integration, P0
- Expected: 输入视频输出 MP4/H.264/AAC，二次探测、大小、时长和 SHA-256 被持久化

## TC-008 文档验真
- Maps to: AC-003, AC-004
- Type / priority: real-byte integration, P0
- Expected: 合法 PDF/OOXML/TXT READY；伪扩展、损坏容器、脚本和压缩包 FAILED

## TC-009 处理租约与重试
- Maps to: AC-005
- Type / priority: PostgreSQL concurrency, P0
- Expected: 并发处理器只有一个持有租约，中断可重领，达到上限 FAILED 且错误脱敏

## TC-010 学习会话边界
- Maps to: AC-007
- Type / priority: auth/entitlement API, P0
- Expected: 未购、错链、错用户/钱包、过期和重放会话均失败

## TC-011 视频心跳与覆盖率
- Maps to: AC-008
- Type / priority: domain + PostgreSQL, P0
- Expected: 有序且符合服务端时间的区间累计；重复、乱序、快进和超时不增加覆盖；95% 才完成

## TC-012 文档访问确认
- Maps to: AC-009
- Type / priority: API + PostgreSQL, P0
- Expected: 未访问不能确认，访问后确认成功，重复确认返回同一 LessonCompletion

## TC-013 并发最后课时完成
- Maps to: AC-010
- Type / priority: real PostgreSQL concurrency, P0
- Expected: 进度 100%，唯一 CourseCompletion 与唯一 certificate.mint Outbox

## TC-014 教师上传交互
- Maps to: AC-011
- Type / priority: React component, P1
- Expected: 类型/大小错误、上传中、处理中、READY、FAILED 和重试状态可见且可键盘操作

## TC-015 学生学习交互
- Maps to: AC-011
- Type / priority: React component, P1
- Expected: 视频心跳恢复、文档打开与确认、100% 进度和 API 失败恢复可见；Demo/live 不混用

## TC-016 本地跨层闭环
- Maps to: AC-012
- Type / priority: local E2E, P0
- Expected: MinIO 上传、处理、学习、Completion/Outbox 在同一本地环境形成可追踪证据

## TC-017 范围与秘密检查
- Maps to: AC-012
- Type / priority: scoped diff/repository check, P0
- Expected: 无密钥、签名 URL、对象存储凭据或越界 diff；未验证层如实记录
