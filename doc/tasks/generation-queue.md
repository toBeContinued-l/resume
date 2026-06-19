# 生成任务队列模块任务

## 最小可执行任务

- [x] 定义 `GenerationTaskMessage` 类型，包含 `taskId`、`resumeId`、`userId`、`attempt` 和 `reason`。
- [x] 定义 `GenerationQueue` 接口，隔离 RabbitMQ 和 Redis 实现。
- [x] 实现 RabbitMQ Exchange `resume.generation`、Queue `resume.generation.tasks` 和 Routing Key `generation.requested`。
- [x] 实现持久化消息投递。
- [x] 实现 Worker 消费入口和可配置 prefetch。
- [x] 实现任务状态更新服务：`pending`、`parsing`、`ai_processing`、`completed`、`failed`、`cancelled`、`cleaned`。
- [x] 实现任务查询 API `/api/generation-tasks/{taskId}`。
- [x] 实现任务查询的登录态和所有权校验。
- [x] 实现任务状态到前端进度文案、阶段序号、百分比、可取消和可重试能力的映射。
- [x] 实现任务终止 API `DELETE /api/generation-tasks/{taskId}`。
- [x] 实现失败任务重试 API `POST /api/generation-tasks/{taskId}/retry`。
- [x] 实现解析空内容重试逻辑，最多重试 2 次。
- [x] 实现成功处理后 ack。
- [x] 实现可重试异常重新投递或 requeue。
- [x] 实现终态失败后 ack，并保留失败任务和临时文件用于用户主动重试；成功和取消后清理临时文件。
- [x] 实现业务层只依赖 `GenerationQueue` 接口，不直接依赖 RabbitMQ SDK。
- [x] 预留 Redis 队列替代实现的接口适配点。
- [x] 编写队列单元测试：投递消息、消费消息、状态更新、重试计数。
- [x] 编写 Worker 编排测试：解析成功进入 AI，AI 成功进入完成，失败进入可重试状态。

## 完成标准

- [x] 上传成功后能查询到任务进度。
- [x] Worker 能消费任务并按状态机推进。
- [x] 解析空内容最多重试 2 次，重试耗尽后进入失败状态并允许用户主动重试。
