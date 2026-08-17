# 教师、管理员与评论工作流收口 Tasks

- [x] T-001: Adopt并收口既有教师、管理员与评论工作流 ~1h
  - role: general
  - depends_on: none
  - owned_paths: apps/api/src/comments, apps/api/src/teachers, apps/api/src/users/users.controller.ts, apps/api/test/teacher-review.spec.ts, apps/api/test/comments-review-queue.spec.ts, apps/web/src/lib/api.ts, apps/web/src/lib/api.test.ts, apps/web/src/pages/app.tsx, apps/web/src/styles.css, apps/web/src/features/admin, apps/web/src/features/comments, apps/web/src/features/teacher, docs/status.md, biome.json, xj-harness.config.mjs, specs/teacher-admin-comments-closure-feature, specs/xj-feature-plan.md
  - shared_files: apps/web/src/lib/api.ts, apps/web/src/pages/app.tsx, apps/web/src/styles.css, specs/xj-feature-plan.md
  - risk: high
  - qa_level: QA-3
  - review_required: yes
  - acceptance: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006, AC-007, AC-008
  - test_cases: TC-001, TC-002, TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009
  - verify: teacher-admin-comments-closure
  - review_verify: repo-typecheck
  - ui_mode: standard
  - design_source: none
  - visual_required: yes
  - baseline_action: test
  - mobile_required: no
  - agent_route: sol
  - estimated_tokens: 12000
  - estimated_time: 1h
  - goal_required: no
  - rollback_or_blocker: 用户已明确要求收口当前工作树；使用adopt并锁定全部既有diff。无新UI设计，goal_required例外为no但必须提供桌面/平板视觉证据。任何越权、测试失败、真实上传或浏览器不可用均不得伪造PASS。

## 执行规则

- 本Feature只有一个adoption closure Task，不与其他Task并行。
- 先修P0/P1并跑聚焦测试，再跑类型/构建/范围Biome和视觉检查。
- P2可记录但不阻塞；完成后独立提交，并更新后续开发清单。
