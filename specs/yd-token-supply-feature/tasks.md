# YD 固定供应量调整任务

- [ ] T-001: 将 YD 固定供应量调整为 80,000,000 并完成合约回归 ~30min
  - role: backend
  - depends_on: none
  - owned_paths: packages/contracts/src/YDToken.sol, packages/contracts/test/YDToken.t.sol, packages/contracts/test/CourseMarket.t.sol, packages/contracts/README.md, docs/architecture.md
  - shared_files: none
  - risk: high
  - qa_level: QA-3
  - review_required: yes
  - acceptance: AC-001, AC-002, AC-003, AC-004, AC-005
  - test_cases: TC-001, TC-002, TC-003, TC-004
  - verify: contracts-yd-supply
  - review_verify: contracts-format
  - agent_route: sol
  - estimated_tokens: 4000
  - estimated_time: 30min
  - goal_required: no
  - visual_required: no
  - rollback_or_blocker: 仅本地修改；发现既有 Sepolia 部署或供应量依赖超出声明范围时立即阻止，不迁移链上资产

