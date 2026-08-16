# 课程内容上传与学习判定 Feature 设计

## 第一性原理与方案选择

系统必须回答两个不同问题：上传的字节是否安全且符合课程声明，以及学生是否完成了平台定义的学习操作。浏览器对 MIME、时长、观看片段和身份的声明均不可信；READY 与完成事实只能由服务端从存储字节、服务端时间、购买权益和数据库约束推导。

比较两个方案：

| 方案 | 优点 | 主要问题 |
| --- | --- | --- |
| A. API 同步接收并处理文件 | 代码入口少 | 大视频占用 API 内存/连接，超时后难恢复，无法稳定隔离 FFmpeg |
| B. 私有直传 + PostgreSQL 任务 + 独立本地媒体处理进程 | API 只签发意图，处理可租约、重试、限并发 | 状态与任务多一层，但复杂性被媒体模块隐藏 |

选择 B。NestJS 媒体模块拥有上传和处理契约，独立 `media:worker` 进程从 PostgreSQL 领取 `media.process` 任务；Go Worker继续只负责链事件和证书交易，不承担媒体规则。

## 架构与数据流

```text
Teacher -> NestJS upload session -> private MinIO source key
Browser -> presigned PUT -> finalize
NestJS -> asset PROCESSING + media.process job
Media worker -> HEAD/download -> signature/hash/probe -> transcode/copy -> READY key

Purchased student -> NestJS learning session -> signed READY URL
VIDEO -> ordered heartbeats -> accepted segments -> 95% -> lesson completion
DOCUMENT -> successful access session -> explicit confirm -> lesson completion
all required lesson completions -> unique CourseCompletion + certificate.mint Outbox
```

## 数据模型

- 新增 `LessonAsset` 作为新流程权威模型；保留旧 `VideoAsset` 表和数据以支持安全回退，并把旧记录复制为必须重新验真的 PROCESSING VIDEO。发布与学习路径不允许回退读取旧表。
- `LessonContentKind`: `VIDEO | DOCUMENT`。
- `AssetStatus`: `UPLOADING | PROCESSING | READY | FAILED`。
- 资产保存服务端生成的 source/ready key、原文件名、声明与检测 MIME、字节数、SHA-256、视频时长、失败码、上传/处理/就绪时间和乐观版本。
- `MediaProcessJob` 保存唯一 assetId、状态、attempts、availableAt、租约、lastError；不复用证书 Outbox payload，避免两个生命周期互相泄漏。
- `LearningSession` 绑定 user、已验证 wallet、lesson、asset 与会话类型，保存过期时间、最后序号/位置/心跳时间和文档访问事实。
- `LessonCompletion` 对 `(userId, lessonId)` 唯一，记录 `VIDEO_COVERAGE` 或 `DOCUMENT_CONFIRM` 与完成时间。
- 保留 `LearningEvent`/`LearningSegment` 作为视频接受事件和合并区间，新增 session/sequence 约束。

## API 契约

- `POST /v1/lessons/:lessonId/assets/upload-session`：教师身份；输入文件名、内容类型、字节数；输出 assetId、短期 PUT URL、必需 headers 和 expiresAt。
- `POST /v1/assets/:assetId/finalize`：教师身份；仅接受自己的 DRAFT 课程资产；HEAD 校验后原子进入 PROCESSING 并创建唯一媒体任务。
- `POST /v1/assets/:assetId/retry`：教师身份；仅 FAILED 且源对象仍通过基础校验时重新排队。
- `GET /v1/assets/:assetId/status`：教师只读自己的资产状态和脱敏失败码。
- `POST /v1/lessons/:lessonId/learning-session`：当前 Privy principal + verified wallet；服务端验证课程/链/购买/READY，返回会话与视频或文档签名 URL。
- `POST /v1/learning-sessions/:id/heartbeats`：视频会话，输入 sequence、positionMs、playedFromMs、playedToMs 与幂等键。
- `POST /v1/learning-sessions/:id/confirm-document`：文档会话；要求服务端已记录该会话签发过读取 URL，幂等完成。
- `GET /v1/courses/:courseId/progress`：返回必修总数、完成数、百分比和每课时状态。

所有接口不接受 userId、wallet、objectKey、duration、detectedMime、READY 或完成状态作为可信输入。

## 文件验真与处理

- 上传前仅做声明 allowlist 与大小门禁；上传后处理器读取真实字节。
- PDF 检查 `%PDF-`；OOXML 检查 ZIP 容器的规定目录与 content types，不把任意 ZIP 当 Office；文本检查 UTF-8 与控制字符比例。
- 视频用 ffprobe 获取容器、流、编码、时长；FFmpeg 输出 MP4/H.264/AAC，完成后再次 ffprobe。
- SHA-256、实际大小、MIME 和视频时长来自 READY 字节；任何不一致进入 FAILED。
- READY 前先写临时 key，校验成功后提交数据库状态；孤儿对象由后续清理任务处理，不以删除成功作为数据库事务前提。

## 学习规则

- 会话 TTL 短期有效，钱包与权益在建立会话时验证；每次写进度再次验证会话所有权和未过期。
- 视频 sequence 必须严格递增；可计入播放长度不得显著超过两个服务端心跳之间的真实时间，并限制单次最大区间。
- 接受区间仍通过标准区间合并计算覆盖率；只有 `covered / duration >= 0.95` 写 `LessonCompletion`。
- 文档会话签发读取 URL 后设置 `accessedAt`；确认仅在 accessedAt 存在且会话未过期时成功。
- 最后一个必修 `LessonCompletion` 与 `CourseCompletion`/证书 Outbox 在 Serializable 事务内完成，使用唯一约束和受控重试抵御并发。

## 信任边界与安全

- 浏览器不可信：不能指定对象 key、MIME 事实、时长、READY、用户、钱包或完成状态。
- 存储元数据不等于文件事实；处理器必须检查字节。
- FFmpeg/ffprobe 在受限本地进程/容器运行，设置超时、资源与输出大小上限，不执行用户文件中的代码。
- 签名 URL 短期有效，对象私有，日志和 XJ 证据不记录签名查询参数。
- 失败对外返回稳定失败码，不暴露本地路径、命令行或完整 stderr。

## 失败与恢复

- 直传未完成/过期：保持 UPLOADING，可重新创建新资产；旧会话失效。
- finalize 重复：同一成功结果幂等；错误状态冲突。
- 处理器中断：租约过期后重新领取；达到上限标 FAILED。
- READY DB 提交前存储上传成功：留下可识别临时对象，重试可复用或覆盖；不产生假 READY。
- 心跳重复/乱序：返回既有进度或冲突，不重复累计。
- 最终完课并发：唯一约束和 Serializable 重试只产生一个证书任务。

## 迁移、回退与资源

- 迁移在 API 目录生成并用本地 PostgreSQL验证；不操作生产数据。
- 现有 VideoAsset 数据映射为 VIDEO，若缺少可验证字段则保持 PROCESSING，不能自动 READY。
- 回退代码前先停止媒体进程；数据库迁移回退只在无新 DOCUMENT 数据的本地环境执行，否则使用前滚修复。
- 本机每次只处理一个媒体任务、只运行一条重型验证命令。

## 技术决策

- TD-001: 使用独立 NestJS 媒体处理进程，不把 FFmpeg 生命周期塞进 HTTP 请求或 Go 链 Worker。
- TD-002: 用实际字节事实而不是扩展名/浏览器 MIME 判定 READY。
- TD-003: 用统一 LessonCompletion 隐藏视频与文档不同完成规则。
- TD-004: 视频字幕本轮为可选；缺字幕不阻断 READY 或课程审批。
- TD-005: 文档完成采用“成功访问后确认已阅读”，明确不声称理解证明。
