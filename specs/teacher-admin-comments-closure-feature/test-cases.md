# 教师、管理员与评论工作流收口 Test Cases

| ID | AC | 类型 | 优先级 | 前置/数据 | 执行与预期 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |
| TC-001 | AC-001 | Web组件 | P0 | Demo、缺认证、缺钱包 | 教师/管理员页面显示阻断原因且不调用受保护API | Vitest组件测试 |
| TC-002 | AC-002 | API客户端/组件 | P1 | Mock认证API | 教师申请、草稿、课时、上传会话、finalize、状态和发布请求路径/body正确 | Vitest |
| TC-003 | AC-003 | API负向 | P0 | STUDENT/TEACHER Principal | 非ADMIN队列请求403；重复教师审核冲突且不重复改角色 | NestJS单元测试 |
| TC-004 | AC-004 | API领域负向 | P0 | 已购学生、课程教师、其他用户 | 顶层评论校验购买；只有课程教师可回复；回复只能挂顶层可见评论 | NestJS单元测试 |
| TC-005 | AC-004 | Web组件 | P1 | 评论线程和会话Mock | 发帖、教师回复和管理员有原因审核调用正确；非教师无回复入口 | Vitest组件测试 |
| TC-006 | AC-005 | Web组件 | P1 | 待审核课程 | 审核成功展示publication package；页面无钱包写交易调用 | Vitest与源码审查 |
| TC-007 | AC-006 | 静态/构建 | P1 | Node24/pnpm10 | 范围Biome、API/Web typecheck、Web build、命名Harness验证退出0 | 命令输出哈希 |
| TC-008 | AC-007 | 浏览器视觉 | P1 | 本地Web Demo模式 | Desktop 1440x900、Tablet 1024x768可访问路由、阻断提示、标签和焦点可见 | `.xj/visual/teacher-admin-comments-closure/` |
| TC-009 | AC-008 | 文档审查 | P1 | 当前证据清单 | docs不声称真实Privy、MinIO上传、链上交易或Sepolia验证 | scoped diff review |

## 隔离与限制

- 自动化组件测试使用Mock API；不把Mock结果当作真实后端或对象存储E2E。
- 浏览器视觉只验证Demo fail-closed状态；真实角色旅程需后续本地集成环境。
- 不运行云端、Sepolia或产生费用的操作。
