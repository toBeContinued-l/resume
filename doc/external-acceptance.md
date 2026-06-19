# 外部验收手册

本项目本地默认使用内存仓储、内存队列和 Mock AI Provider。真实 MySQL、RabbitMQ、OpenAI 和复杂人工样本验收需要显式配置环境变量后运行，避免日常测试被外部服务阻塞。

## 基础验收

在任意外部验收前先运行基础矩阵：

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --json
```

当前期望结果：

- lint、typecheck、build 通过。
- `npm test` 中外部 smoke 在未配置环境时 skip。
- `npm audit --json` 漏洞数为 0。

## MySQL

准备：

- 创建空 MySQL 数据库，例如 `online_resume_acceptance`。
- 执行 `drizzle/0000_initial.sql` 初始化表结构。
- 配置 `DATABASE_URL` 指向该数据库。

运行：

```bash
RUN_MYSQL_INTEGRATION=1 DATABASE_URL="mysql://user:password@localhost:3306/online_resume_acceptance" npm run test:external:mysql
```

通过标准：

- 测试可以写入、读取、更新并清理 users、sessions、resumes、resume_contents、resume_links 和 generation_tasks。
- 测试结束后以 `it-` 前缀创建的数据被清理。

## RabbitMQ

准备：

- 启动可连接的 RabbitMQ broker。
- 配置 `RABBITMQ_URL`。

运行：

```bash
RUN_RABBITMQ_INTEGRATION=1 RABBITMQ_URL="amqp://localhost:5672" npm run test:external:rabbitmq
```

通过标准：

- 队列适配器可以创建 durable exchange/queue/bind。
- 发布的生成任务消息可以被真实 broker 投递并消费。
- 消费成功后消息被 ack，不重复滞留。
- 测试使用唯一 exchange、queue 和 routing key，结束后清理测试 topology。

## OpenAI

准备：

- 推荐配置 `AI_API_KEY` 和 `AI_API_REQUEST_URL`，分别对应 cc switch 中的 API Key 和 API 请求地址。
- 配置 `AI_MODEL` 切换模型，默认使用代码中的 provider 默认值。
- `AI_API_REQUEST_URL` 可填写完整 OpenAI Responses API 地址，例如 `https://relay.example.com/v1/responses`，也可填写 OpenAI Chat Completions 兼容地址，例如 `https://relay.example.com/v1/chat/completions`。
- 如果中转站只提供基础地址，可配置 `AI_API_BASE_URL`，例如 `https://relay.example.com/v1`，系统会自动拼接 `/responses`。
- 旧变量 `OPENAI_API_KEY`、`OPENAI_MODEL`、`OPENAI_ENDPOINT`、`OPENAI_BASE_URL` 仍兼容。

运行：

```bash
AI_API_KEY="sk-..." AI_API_REQUEST_URL="https://relay.example.com/v1/chat/completions" npm run test:external:openai
```

通过标准：

- 输出符合共享 Resume schema。
- 主要候选人身份不被改写。
- 不新增 Google、Meta、Amazon、Stanford 等输入中不存在的关键事实。
- 待确认项保持 pending，供编辑器处理。

## 真实解析样本

自动化 fixture 已覆盖标题、表格、图片、列表、链接、文本 PDF、扫描/空 PDF 和损坏文件。人工样本验收建议准备以下文件并通过上传页或 ParserService 测试入口验证：

- 普通 `.docx` 简历。
- 含表格、头像、列表和链接的 `.docx` 简历。
- 旧版 `.doc` 简历，并确保运行环境有 LibreOffice。
- 文本型 PDF 简历。
- 扫描版 PDF 或纯图片 PDF。
- 空文件、损坏文件和超过 15MB 的文件。

通过标准：

- 文本型文件能提取候选人姓名、联系方式、经历、项目和技能。
- 表格、列表、链接和图片至少以结构化 block、table、asset 或 warning 形式保留线索。
- 扫描/空 PDF 返回可重试空解析错误，不伪造内容。
- 损坏文件返回解析失败，不把二进制结构误识别为简历文本。

## 全量外部 smoke

当 MySQL、RabbitMQ 和 AI 接口都已配置时运行：

```bash
RUN_MYSQL_INTEGRATION=1 RUN_RABBITMQ_INTEGRATION=1 DATABASE_URL="mysql://user:password@localhost:3306/online_resume_acceptance" RABBITMQ_URL="amqp://localhost:5672" AI_API_KEY="sk-..." AI_API_REQUEST_URL="https://relay.example.com/v1/chat/completions" npm run test:external
```

外部环境不可用时，不应把 guarded smoke 的 skip 视为产品功能失败；应记录为“外部验收未执行”。
