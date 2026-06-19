# 总体进度

## 模块完成状态

- [x] 账号认证模块：`doc/tasks/auth.md`
- [x] 用户协议与隐私页面模块：`doc/tasks/legal.md`
- [x] 文件上传模块：`doc/tasks/upload.md`
- [x] 临时文件存储模块：`doc/tasks/temp-files.md`
- [x] 生成任务队列模块：`doc/tasks/generation-queue.md`
- [x] 文件解析模块：`doc/tasks/parser.md`
- [x] AI 内容处理模块：`doc/tasks/ai.md`
- [x] 简历数据模块：`doc/tasks/resume-data.md`
- [x] 在线编辑模块：`doc/tasks/editor.md`
- [x] 在线链接模块：`doc/tasks/links.md`
- [x] 在线简历访问模块：`doc/tasks/public-resume.md`
- [x] 历史记录模块：`doc/tasks/history.md`
- [x] 文件清理模块：`doc/tasks/cleanup.md`

## 当前阶段性实现

- [x] 工程骨架：Next.js、TypeScript、Vitest、ESLint、基础页面和全局样式已建立。
- [x] 共享 Schema：API、解析结果、AI 输入输出、简历内容、队列消息和临时文件接口已建立。
- [x] MySQL 数据模型基础：Drizzle schema 和初始 SQL 迁移文件已建立。
- [x] 账号认证：内存仓储、邮件 Provider、注册、验证、登录、退出、当前用户、忘记密码、重置密码和对应 API 已实现；页面入口已补齐。
- [x] 用户协议与隐私页面：`/legal/terms`、`/legal/privacy` 和注册页法律链接已实现并有组件测试。
- [x] 简历数据服务：内存仓储、状态流转、内容保存、发布、软删除、历史摘要、所有权校验、3 份限制计数和编辑读取已实现并有单元测试。
- [x] 临时文件服务：本地任务目录、原始文件、转换文件、assets、路径安全和幂等删除已实现并有单元测试。
- [x] 生成任务队列：内存队列、任务状态服务、任务查询 API 和 Worker 编排已实现；RabbitMQ adapter 保持可选骨架。
- [x] 文件上传：`/api/resumes/upload`、格式/MIME/大小/数量校验、临时文件保存、resume/task 创建、队列投递和失败回滚已实现并有单元测试。
- [x] 文件解析：`.doc` LibreOffice 转换入口、`.docx` zip/xml 基础解析、文本 PDF 基础解析、扫描/空 PDF 可重试边界和解析警告已实现并有单元测试。
- [x] AI 内容处理：`ResumeAiProvider`、Mock Provider、OpenAI Provider 骨架、输出 Schema 校验、后置校验和格式错误重试服务已实现并有单元测试。
- [x] 在线编辑：`/editor/{resumeId}` 已接入可视化 client editor，支持标题、模块标题/显示、模块新增删除排序、个人信息、技能、条目文本、自定义/摘要富文本、AI 待确认项状态、撤销/重做、保存和链接发布。
- [x] 在线链接：链接服务、slug 唯一生成、三种访问模式、密码哈希、模式切换、删除失效和密码校验 API 已实现并有单元测试。
- [x] 在线简历访问：`/r/{slug}` 可匿名访问公开/私密链接，密码模式不返回内容直到提交密码，公开页不暴露后台入口。
- [x] 历史记录：`/dashboard`、`GET /api/resumes`、删除 API、所有权过滤、软删除和剩余上传数量已实现。
- [x] API 网关限流：`middleware` 对所有 `/api/*` 请求统一调用 `_gateway/rate-limit`，登录、找回密码、公开链接密码验证三条敏感入口额外叠加业务级限流。

## 生产化验收状态

- [x] 持久层已提供 MySQL repository 适配：`MysqlAuthRepository`、`MysqlResumeRepository`、`MysqlGenerationTaskRepository`；`DATABASE_URL` 存在时应用服务自动切换到 MySQL，默认本地/测试仍使用内存仓储。
- [x] RabbitMQ adapter 已实现可注入 AMQP module、durable exchange/queue、persistent publish、prefetch、ack/nack requeue 行为；`RABBITMQ_URL` 存在时应用服务自动切换到 RabbitMQ，生产依赖已包含 `amqplib`，并已通过真实 broker smoke。
- [x] OpenAI Provider 已实现 fetch-based Responses API 适配边界，支持可注入 `fetch`、`AI_API_REQUEST_URL`/`AI_API_BASE_URL` 和 `AI_MODEL`，并兼容旧 `OPENAI_*` 变量；完整请求地址可使用 `/v1/responses` 或 `/v1/chat/completions`，适配 cc switch 或 OpenAI 兼容中转站；本地默认仍使用 Mock Provider，并提供 guarded 真实 AI smoke。
- [x] 在线编辑页面已覆盖首期主要模块编辑操作，并补齐教育、工作、项目、证书、荣誉条目的专用字段表单；后续仍可继续增强更完整的富文本交互体验。
- [x] `.docx`/PDF 解析已接入 Mammoth 和 pdf.js，并保留基础解析 fallback；可复用解析 fixture 和 ParserService 临时文件端到端测试覆盖标题、表格、图片、列表、链接、文本 PDF、扫描 PDF、损坏文件和旧版 `.doc` 转 `.docx` 分支。真实复杂人工样本验收入口记录在 `doc/external-acceptance.md`。
- [x] MySQL repository 已有 SQL 映射单元测试、初始迁移一致性测试，并已通过 `DATABASE_URL` + `RUN_MYSQL_INTEGRATION=1` 真实数据库 smoke。
- [x] npm 安全审计已收敛：升级 `drizzle-orm` 到 `0.45.2`、`vitest` 到 `4.1.8`，并通过 `overrides.postcss=8.5.10` 修复 Next/PostCSS 链路；`npm audit --json` 返回 0 漏洞。

## 阶段推进状态

- [x] 第一阶段：账号认证模块、用户协议与隐私页面模块、简历数据模块。
- [x] 第二阶段：临时文件存储模块、文件上传模块、生成任务队列模块。
- [x] 第三阶段：文件解析模块、AI 内容处理模块、文件清理模块。
- [x] 第四阶段：在线编辑模块、在线链接模块、在线简历访问模块、历史记录模块。

## 集成验收进度

- [x] 注册、邮箱验证、登录流程通过服务/API 实现并有认证服务测试覆盖。
- [x] 上传合法文件后成功创建生成任务、简历记录和队列消息。
- [x] Worker 消费任务并使用 Parser/AI Provider 接口生成结构化简历内容。
- [x] 编辑保存简历内容成功，保存前经过服务端 Schema 和富文本清理。
- [x] 创建公开在线链接并可匿名访问。
- [x] 创建密码访问链接后，未提交密码无法读取内容。
- [x] 删除简历后在线链接失效。
- [x] 删除简历后用户可重新上传到 3 份上限内。
- [x] 主业务链路集成测试覆盖注册、邮箱验证、登录会话、上传、Worker 生成、编辑保存、密码链接、公开访问门禁和删除失效。
- [x] `/api/*` 统一网关限流与登录、找回密码、公开链接密码验证的叠加业务限流已通过单元测试回归。

## 最近验证记录

- [x] `npm run lint`：通过。
- [x] `npm run typecheck`：通过。注意不要与 `next build` 并发运行，否则 `.next/types` 可能被构建过程重写导致假失败。
- [x] `npm run test:integration`：2 个本地集成测试文件通过、3 个外部 smoke 跳过；4 个本地集成用例通过、3 个外部用例跳过。
- [x] `npm test`：29 个测试文件中 26 个通过、3 个外部 smoke 跳过；81 个测试通过、3 个跳过。
- [x] `npm run test:external`：OpenAI、MySQL 和 RabbitMQ 外部 smoke 在未配置外部环境时按预期跳过。
- [x] `npm audit --json`：0 个漏洞。
- [x] `npm run build`：通过；Next build 仍提示未检测到 Next ESLint 插件，当前 flat config 已直接接入插件，该提示不影响构建。
- [x] 本地 dev server 浏览器冒烟检查：`/`、`/auth/login`、`/auth/register`、`/resumes/upload`、`/dashboard`、`/legal/terms`、`/legal/privacy`、`/r/missing-smoke-slug` 可打开并显示关键内容或正确的失效提示。
- [x] 外部验收手册已新增：`doc/external-acceptance.md`，并提供 guarded smoke 命令入口 `npm run test:external`、`npm run test:external:mysql`、`npm run test:external:openai`、`npm run test:external:rabbitmq`。
- [x] `npm test`：31 个测试文件中 28 个通过、3 个外部 smoke 跳过，99 个测试通过、3 个跳过。
- [x] `npm run lint`：通过。
- [x] `npm run typecheck`：通过。
- [x] `npm run build`：通过；仅保留 Next ESLint 插件检测提示，不影响产物。
