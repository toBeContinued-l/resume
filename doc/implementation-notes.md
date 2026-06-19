# 实现日志

## 2026-06-03 工程基础

- 初始化 Next.js + TypeScript 工程配置，使用 npm 作为包管理器。
- 选择 Zod 作为运行时 Schema 校验库，用于 API、解析结果、AI 输出和简历内容校验。
- 选择 Drizzle 作为 MySQL 数据模型方向，后续模块需要保持一致。
- 添加 Vitest 测试配置，并建立共享 Schema、API 响应、ID 和时间工具的第一批单元测试。
- 初始完整候选依赖树过大且多次异常退出，因此先保留阶段一代码实际需要的最小依赖集。Tiptap、OpenAI、Mammoth、pdf.js、amqplib、drizzle-kit、isomorphic-dompurify 等会在对应模块进入实现时补回。

## 账号认证 + 简历数据模块第一阶段

- 本阶段在 `src/server/auth`、`src/server/mail`、`src/server/resume` 下提供可单测的服务实现，并在 `tests/unit/server/auth`、`tests/unit/server/resume` 下补充 Vitest 单元测试。
- 认证模块通过 `AuthRepository`、`PasswordHasher`、`MailProvider` 隔离持久层、哈希算法和邮件服务；默认提供内存仓库、内存邮件 Provider 和 Node `scrypt` 哈希实现。等依赖就绪后，密码哈希应按详细设计切换为 `argon2id` 优先、`bcrypt` 备用。
- 简历数据模块通过 `ResumeRepository` 隔离 MySQL/ORM；当前内存实现覆盖生成完成保存、编辑保存、发布、软删除、历史摘要、3 份限制计数、所有权校验和删除后链接失效。
- 简历服务层已复用 `src/types/resume.ts` 的共享 Zod Schema，并在 `src/server/resume/validation.ts` 追加确认项字段路径、布局精确一致性和持久化资产引用校验。

## 法律页面模块

- 新增匿名可访问的 `/legal/terms` 和 `/legal/privacy` 页面，正文覆盖账号、上传用途、原始文件临时保存、AI 服务使用、链接访问模式和删除规则。
- 注册页当前为早期静态入口，已加入用户协议和隐私政策链接；后续认证表单接入时应保留该入口。

## 临时文件模块

- 本地临时文件服务默认使用系统临时目录下的 `online-resume/uploads`，可通过 `TEMP_UPLOAD_ROOT` 覆盖；任务目录固定为 `{userId}/{taskId}`，原始文件保存为 `original.{ext}`，转换文件保存为 `converted.docx`，解析资源保存到 `assets/`。
- 路径安全策略使用受限 ID 字符集、路径归一化、根目录校验和写入前后真实路径校验，删除操作只接受 `{userId, taskId}` 并保持幂等。

## 生成任务队列模块第一阶段

- `src/server/queue` 当前提供 `GenerationQueue` 的内存实现、RabbitMQ durable exchange/queue/persistent message 适配器骨架、内存任务仓储和任务状态更新/进度文案辅助；RabbitMQ 常量按详细设计使用 `resume.generation`、`resume.generation.tasks`、`generation.requested`。
- `src/worker` 当前提供可单测的任务编排函数：解析成功进入 AI，AI 成功保存生成内容并完成；解析空内容最多重新投递 2 次，耗尽后标记失败并调用临时目录清理，随后进入 `cleaned`。
- RabbitMQ adapter 当前保持可选依赖形态；未安装 `amqplib` 时会在运行时提示安装该包。后续进入 RabbitMQ 集成阶段时需要补回真实队列集成测试。
- 真实 MySQL 任务仓储、任务查询 API 路由、上传模块接线、真实 parser/AI provider 和清理服务仍由后续模块接入；当前实现以接口和依赖注入保留替换点。

## 验证记录

- `npm install --omit=optional` 初次因 npm 缓存 tarball 多次重试，后续补装 `@rollup/rollup-darwin-arm64` 后可正常运行 Vitest。
- `npm run lint`：通过。
- `npm run typecheck`：通过。
- `npm test`：13 个测试文件、42 个测试全部通过。
- `npm run build`：通过。Next build 仍提示未检测到 Next ESLint 插件；当前 flat config 已直接接入 `@next/eslint-plugin-next`，该提示不影响构建产物，后续可在升级 Next/ESLint 配置时再消除。

## 2026-06-06 主流程 API、解析、AI、链接和页面集成

- 接手子 Agent 因额度不足中断后留下的半成品，统一 `src/server/app-services.ts` 作为应用服务组合根，避免认证、上传、编辑、链接和历史页各自持有不同内存仓储实例。
- 补齐认证 API：`POST /api/auth/register`、`POST /api/auth/verify-email`、`POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`、`POST /api/auth/forgot-password`、`POST /api/auth/reset-password`。`readJsonObject` 现在同时支持 JSON 与普通 HTML form 提交，便于首期页面直接使用。
- 补齐上传和任务 API：`POST /api/resumes/upload`、`GET /api/generation-tasks/{taskId}`。上传服务覆盖单文件边界、扩展名/MIME/大小校验、3 份限制、临时文件写入、resume/task 创建、队列投递和失败回滚。
- 补齐简历与链接 API：`GET/PUT/POST/DELETE /api/resumes/{resumeId}`、`GET/PUT/POST /api/resumes/{resumeId}/link`、`POST /api/public-links/{slug}/verify-password`。链接服务实现 128-bit slug、唯一性重试、三种访问模式、密码哈希和删除失效。
- 新增页面入口：登录、注册、邮箱验证、忘记密码、重置密码、上传、历史记录、编辑页和公开简历页。历史记录和编辑页读取真实会话 Cookie；未登录时展示登录入口。
- 新增 `src/server/parser` 基础解析服务：`.doc` 通过 LibreOffice headless adapter 转换为 `.docx`，`.docx` 使用无外部依赖的 zip/xml 基础解析，PDF 使用文本流基础解析；扫描/空 PDF 会触发可重试空解析错误，不做 OCR。
- 新增 `src/server/ai`：`ResumeAiService`、`MockResumeAiProvider`、`OpenAiResumeAiProvider` 和 AI 输出后置校验。OpenAI Provider 使用 fetch-based Responses API 适配，支持可注入 `fetch`、endpoint 和 model，并通过 `text.format.json_schema` 请求结构化 JSON 输出；本地主流程默认仍使用 Mock Provider。
- 在线渲染通过 `ResumePreview` 展示固定 `default` 模板，并在渲染前进行保守 HTML 清理；编辑保存仍会经过服务端 Schema 校验和富文本清理。
- 新增单元测试：AI 输出校验、上传服务和失败回滚、链接密码/删除失效、Parser PDF/类型识别边界。测试总量从 13 个文件 42 个用例增加到 17 个文件 54 个用例。
- 继续补齐在线编辑器：新增 `ResumeEditor` client component 和 CSS module，支持模块新增/删除/排序、模块标题/显示状态、个人信息、技能、自定义模块富文本、经历条目基础编辑、AI 待确认项状态、撤销/重做、保存和链接发布。新增组件测试覆盖保存请求、撤销/重做、模块增删、确认项状态和 HTML 清理。

## 当前限制（当时记录，后续条目已继续补强）

- MySQL repository 已接线：`DATABASE_URL` 存在时应用服务会使用 `MysqlPoolExecutor`、`MysqlAuthRepository`、`MysqlResumeRepository` 和 `MysqlGenerationTaskRepository`；无数据库 URL 时仍使用内存仓储，便于本地开发和测试。
- RabbitMQ adapter 已实现可注入 AMQP module、durable exchange/queue、persistent publish、prefetch、ack/nack requeue 行为；本地和单元测试默认使用内存队列，`RABBITMQ_URL` 存在时应用服务自动切换到 RabbitMQ。后续已补生产依赖和 guarded 真实 broker smoke。
- OpenAI Provider 已具备可运行适配边界；后续已补 guarded OpenAI smoke，配置 `OPENAI_API_KEY` 后可做真实模型输出质量和成本验收。
- 在线编辑页已覆盖首期主要模块编辑操作；后续已继续补齐教育、工作、项目、证书和荣誉的结构化字段表单。
- `.docx`/PDF 解析在本段记录时为基础实现；后续已接入 Mammoth/pdf.js，并补齐复杂 DOCX、有效 PDF、扫描/空 PDF、损坏文件和 `.doc` 转换分支测试。
- MySQL repository 在本段记录时通过 fake executor 单测验证 SQL 和映射；后续已补初始迁移一致性测试和 guarded 真实 MySQL smoke。

## 2026-06-06 MySQL 生产适配层

- 新增 `src/server/db/mysql-client.ts`，封装 `mysql2/promise` pool executor，并提供 JSON 与日期字段映射工具。
- 新增 `MysqlAuthRepository`、`MysqlResumeRepository` 和 `MysqlGenerationTaskRepository`，覆盖认证、简历内容/链接和生成任务的 MySQL CRUD 映射。
- `createAppServices()` 会在 `DATABASE_URL` 存在时自动选择 MySQL repository；未配置时保持内存仓储，避免本地测试依赖外部数据库。
- 新增 `tests/unit/server/db/mysql-repositories.test.ts`，通过 fake executor 验证关键 SQL 调用、snake_case 到业务对象映射、JSON 持久化和任务状态更新。

## 2026-06-06 RabbitMQ 生产适配层

- `RabbitGenerationQueue` 支持注入 AMQP module，生产默认延迟加载 `amqplib`；项目依赖已包含运行包，实际启用 RabbitMQ 时仍需提供可连接的 broker。
- `createAppServices()` 会在 `RABBITMQ_URL` 存在时自动选择 RabbitMQ 队列，并支持 `RABBITMQ_PREFETCH` 配置；未配置时保持内存队列。
- 新增 `tests/unit/server/queue/rabbitmq-queue.test.ts`，用 fake channel 验证 durable exchange/queue/bind、persistent JSON publish、prefetch、消费成功 ack、处理失败 nack 并 requeue。

## 2026-06-06 验证记录

- `npm run lint`：通过。
- `npm run typecheck`：通过。注意不要与 `npm run build` 并发执行，否则 `.next/types` 可能被构建过程重写，导致缺失生成类型文件的假失败。
- `npm test`：20 个测试文件、64 个测试全部通过。
- `npm run build`：通过。Next build 仍提示未检测到 Next ESLint 插件；当前 flat config 已直接接入 `@next/eslint-plugin-next`，提示不影响构建产物。

## 2026-06-06 主链路集成验收与依赖收口

- 新增 `tests/integration/main-business-flow.test.ts`，覆盖注册、邮箱验证、登录 Cookie 会话、上传创建任务、Worker 使用 mock parser + Mock AI 完成生成、编辑保存与富文本清理、密码链接发布、公开访问门禁、密码验证访问和删除后链接失效。
- 新增 `tests/unit/server/app-services.test.ts`，验证默认内存服务、`DATABASE_URL` MySQL repository 切换和 `RABBITMQ_URL` RabbitMQ queue 切换，防止服务组合根接线回退。
- 将 `amqplib` 加入生产依赖，将 `@types/amqplib` 加入开发依赖；`RABBITMQ_URL` 启用时不再缺少运行包，后续已补 guarded 真实 broker 发布/消费 smoke。
- 本段记录时仍未执行真实外部依赖验收；后续已为 MySQL、RabbitMQ、OpenAI 和复杂解析样本补齐 guarded smoke 或外部验收手册入口。
- `npm run test:integration`：1 个集成测试通过。
- `npm test`：24 个测试文件、71 个测试全部通过。
- 新增 `.docx` 基础解析测试、非所有者编辑 API 权限测试和公开预览渲染测试；公开预览摘要渲染从错误的 `[object Object]` 修正为清理后的 HTML。
- `npm install` 后 npm audit 报告 8 个上游依赖漏洞；未执行 `npm audit fix --force`，避免破坏性升级。
- 本地 dev server 已启动并完成浏览器冒烟检查：首页、登录、注册、上传、用户协议和隐私政策页面均能打开并显示关键内容。

## 2026-06-07 剩余验收项推进

- 新增 `tests/fixtures/parser/builders.ts`，用代码生成可复用解析样本：普通/表格 `.docx`、图片 `.docx`、文本 PDF、扫描/空 PDF 和损坏文件 fixture，避免提交难维护的二进制样本。
- 扩展 `tests/unit/server/parser/parser-service.test.ts`，覆盖 DOCX 图片资产落盘、损坏 DOCX 失败、文本 PDF 和扫描 PDF 边界。
- 新增 `tests/integration/openai-provider-smoke.test.ts`，当配置 `OPENAI_API_KEY` 时真实调用 OpenAI Provider 验证结构化输出质量；当前本地未配置 key，测试按预期跳过。
- 执行 `npm audit --json` 获取到 8 个上游依赖漏洞：`drizzle-orm` 高危、Vitest/Vite 链路 critical/moderate、Next/PostCSS moderate。尝试执行 `npm install drizzle-orm@0.45.2` 以及联合升级 Drizzle/Vitest，但 npm install 在 registry 响应阶段长时间无输出并被终止；未执行 `npm audit fix --force`，避免破坏性降级 Next 或大版本升级。
- 验证记录：`npm run lint` 通过，`npm run typecheck` 通过，`npm test` 为 25 个测试文件中 24 个通过、1 个 OpenAI smoke 因无 key 跳过，73 个测试通过、1 个跳过；`npm run build` 通过，仍只有 Next ESLint 插件检测提示。

## 2026-06-07 编辑体验与安全审计收口

- 在线编辑器将教育、工作经历、项目经历、证书和荣誉条目从单个合并标题输入升级为专用字段表单，分别支持学校/学位/专业、公司/职位、项目名称/角色、名称/颁发方/时间以及开始/结束时间等结构化编辑。
- 扩展 `tests/unit/components/editor/resume-editor.test.tsx`，验证工作经历结构化字段编辑后按 `company`、`role`、`startDate`、`endDate` 保存。
- 安全审计收口：升级 `drizzle-orm` 到 `0.45.2`，升级 `vitest` 到 `4.1.8`，并通过 `overrides.postcss=8.5.10` 修复 Next/PostCSS 审计链路；`npm audit --json` 返回 0 个漏洞。
- Vitest 4 默认使用 OXC transform，已在 `vitest.config.ts` 显式配置 React automatic JSX transform，确保 TSX 组件测试继续运行。
- 新增 `tests/integration/mysql-repositories-smoke.test.ts`，当 `DATABASE_URL` 和 `RUN_MYSQL_INTEGRATION=1` 同时存在时，会对真实 MySQL 执行用户、会话、简历、内容、链接和生成任务的写读改删 smoke；当前本地未提供 MySQL 实例，测试按预期跳过。
- 验证记录：`npm run lint` 通过，`npm run typecheck` 通过，`npm test` 为 26 个测试文件中 24 个通过、2 个外部 smoke 跳过，74 个测试通过、2 个跳过；`npm run build` 通过，仍只有 Next ESLint 插件检测提示。

## 2026-06-07 Mammoth 和 PDF.js 解析接入

- 安装 `mammoth` 和 `pdfjs-dist`，`parseDocxBuffer` 优先使用 Mammoth 生成语义化 HTML 和复杂元素警告，同时保留现有 ZIP/XML 抽取以继续支持表格和图片资产落盘。
- `parsePdfBuffer` 改为优先使用 PDF.js 解析真实 PDF 文本和页码，解析失败时回退到现有轻量 content stream 文本抽取；扫描/空 PDF 仍返回可重试空解析错误。
- 扩展 parser fixture，新增结构有效的最小文本 PDF fixture；新增测试验证 PDF.js 真实提取路径。
- DOCX 基础 XML fallback 进一步识别 `w:numPr` 列表段落和 `w:hyperlink`/HYPERLINK 字段链接标记，避免 Mammoth 不可用或复杂文件降级时丢失列表/链接结构线索。
- 新增 `tests/integration/parser-service-fixtures.test.ts`，将复杂 DOCX 和有效 PDF fixture 写入临时目录，通过 `ParserService.parse` 端到端验证文件类型识别、临时文件读取、表格/列表/链接抽取、图片资产落盘和 PDF.js 文本提取。
- 验证记录：parser 单测 8 个用例通过，ParserService fixture 集成测试 2 个用例通过；`npm run lint` 通过，`npm run typecheck` 通过，`npm test` 为 27 个测试文件中 25 个通过、2 个外部 smoke 跳过，78 个测试通过、2 个跳过；`npm run build` 通过，`npm audit --json` 返回 0 个漏洞。

## 2026-06-07 外部验收入口

- 新增 `doc/external-acceptance.md`，明确 MySQL、RabbitMQ、OpenAI 和真实复杂解析样本的准备步骤、运行命令、跳过条件和通过标准。
- 新增 `npm run test:external`、`npm run test:external:mysql`、`npm run test:external:openai`、`npm run test:external:rabbitmq`，用于集中运行 guarded 外部 smoke；无外部环境时测试按预期 skip。
- 新增 `tests/integration/rabbitmq-queue-smoke.test.ts`，当 `RABBITMQ_URL` 和 `RUN_RABBITMQ_INTEGRATION=1` 同时存在时，通过真实 broker 验证 RabbitMQ 队列发布、消费、ack 和测试 topology 清理；当前本地未提供 RabbitMQ 实例，测试按预期跳过。
- `.env.example` 补充 `RUN_MYSQL_INTEGRATION` 和 `RUN_RABBITMQ_INTEGRATION` 开关，避免真实外部依赖测试被误触发。
- 验证记录：`npm run test:external:rabbitmq` 在未配置 RabbitMQ 时通过并跳过；`npm run test:external` 在未配置外部环境时通过，3 个 smoke 测试按预期跳过。
- 最终验证记录：`npm run lint` 通过；`npm run typecheck` 通过；`npm run test:integration` 为 2 个本地集成测试通过、3 个外部 smoke 跳过；`npm test` 为 28 个测试文件中 25 个通过、3 个外部 smoke 跳过，78 个测试通过、3 个跳过；`npm audit --json` 返回 0 个漏洞；`npm run build` 通过，仍只有 Next ESLint 插件检测提示。

## 2026-06-07 完成度审计补强

- 新增 `tests/unit/server/db/mysql-migration.test.ts`，解析 `drizzle/0000_initial.sql` 并验证 MySQL 初始迁移包含 repository 层依赖的全部表、列、唯一约束和查询索引，降低真实数据库不可用时的迁移漂移风险。
- 扩展 `tests/integration/parser-service-fixtures.test.ts`，新增旧版 `.doc` 转 `.docx` 的 ParserService 集成测试：通过 fake LibreOffice converter 写出 DOCX fixture，验证转换入口、`DOC_CONVERTED` warning、source fileType 和转换后的文本抽取。
- 只读需求审计确认：主业务链路、上传、Worker、简历数据安全、在线编辑/公开预览均已有强测试证据；真实外部服务执行和人工复杂样本验收已有 guarded smoke 与手册入口，当前本机缺少外部服务命令行和凭据，未作为代码阻塞。
- 验证记录：MySQL migration 单测 2 个用例通过；MySQL repository 单测通过且真实 MySQL smoke 按环境 guard 跳过；ParserService fixture 集成测试 3 个用例通过；ParserService 单测 8 个用例通过。
- 最终验证记录：`npm run lint` 通过；`npm run typecheck` 通过；`npm run test:integration` 为 2 个本地集成测试文件通过、3 个外部 smoke 跳过，4 个本地集成用例通过、3 个外部用例跳过；`npm run test:external` 为 3 个外部 smoke 按环境 guard 跳过；`npm test` 为 29 个测试文件中 26 个通过、3 个外部 smoke 跳过，81 个测试通过、3 个跳过；`npm audit --json` 返回 0 个漏洞；`npm run build` 通过，仍只有 Next ESLint 插件检测提示。
- 浏览器冒烟记录：本地 dev server 打开 `/`、`/auth/login`、`/auth/register`、`/resumes/upload`、`/dashboard`、`/legal/terms`、`/legal/privacy`、`/r/missing-smoke-slug`，均显示关键内容或正确的公开链接失效提示。

## 2026-06-07 真实外部服务配置

- 新增本地 `.env.local`，写入用户提供的 MySQL `DATABASE_URL`、RabbitMQ `RABBITMQ_URL`、`TEMP_UPLOAD_ROOT`、邮件/应用基础配置，以及预留的 `OPENAI_API_KEY`、`OPENAI_MODEL`、`OPENAI_ENDPOINT`、`OPENAI_BASE_URL`。
- `.gitignore` 已忽略 `.env`、`.env*.local`、`.env.development`、`.env.production`，避免本地真实密码和 API key 进入版本管理。
- `OpenAiResumeAiProvider` 支持从 `OPENAI_ENDPOINT` 读取完整 Responses API 地址，或从 `OPENAI_BASE_URL` 自动拼接 `/responses`；适用于兼容 OpenAI Responses API 的中转站。
- 修复 `RabbitGenerationQueue` 在 ESM 环境下通过 `require("amqplib")` 延迟加载失败的问题，改为动态 `import("amqplib")`，真实 RabbitMQ smoke 已验证。
- 真实外部验收记录：使用用户提供的公网 MySQL 配置运行 `RUN_MYSQL_INTEGRATION=1 npm run test:external:mysql` 通过；使用用户提供的公网 RabbitMQ 配置运行 `RUN_RABBITMQ_INTEGRATION=1 npm run test:external:rabbitmq` 通过。
- 配置后回归记录：`npx vitest run tests/unit/server/ai/resume-ai-service.test.ts` 通过；`npx vitest run tests/unit/server/queue/rabbitmq-queue.test.ts` 通过；`npm run typecheck` 通过；`npm test` 通过，26 个测试文件通过、3 个外部 smoke 默认跳过，82 个测试通过、3 个跳过；`npm run lint` 通过；`npm run build` 通过，仍只有 Next ESLint 插件检测提示。

## 2026-06-10 流程、生成状态和界面体验修复

- 注册流程调整为单页验证码闭环：注册 API 仍保留 token 兼容能力，但注册页不再引导打开邮件验证链接；用户收到邮件后复制 6 位验证码回到注册页输入即可完成验证。SMTP 邮件正文也移除验证跳转链接，只展示验证码和有效期。
- 生成任务状态扩展：新增 `cancelled` 状态，任务进度 API 返回阶段序号、总阶段数、百分比、是否可终止和是否可重试。上传页展示排队、解析、AI 优化、完成四步进度。
- 新增任务操作 API：`DELETE /api/generation-tasks/{taskId}` 用于终止生成，`POST /api/generation-tasks/{taskId}/retry` 用于失败任务重试。重试会复用同一任务和临时文件重新入队，取消和成功会清理临时文件。
- Worker 失败语义调整：解析耗尽或 AI 失败后保留 `failed` 状态供用户主动重试，不再立即转 `cleaned`；Worker 会在解析、AI 返回和保存前检查取消状态，避免用户终止后仍保存生成内容。
- 简历状态扩展为 `generating`、`draft`、`published`、`failed`、`cancelled`、`deleted`，历史记录展示中文状态徽标；失败和已终止记录不计入 3 份上传额度，避免失败任务阻塞重新上传。
- 首页、上传页、历史页和注册页完成视觉与信息架构重做：全局顶部导航、首页锚点流程、上传工作台、状态徽标、进度条和历史操作区统一为更专业的产品界面。
- 测试补强：更新队列状态、Worker 失败保留可重试、失败/终止不占上传额度等单元测试，并保留主业务链路集成测试覆盖。
- 验证记录：`npm run lint` 通过；`npm run typecheck` 通过；`npm test` 通过，29 个测试文件中 26 个通过、3 个外部 smoke 跳过，88 个测试通过、3 个跳过；`npm run build` 通过，仅保留既有 Next ESLint 插件检测提示。
- 本地 dev server 冒烟记录：`http://127.0.0.1:3000/`、`/auth/register`、`/resumes/upload`、`/dashboard`、`/r/missing-smoke-slug` 均返回 200，并显示关键页面内容或正确的公开链接失效提示。

## 2026-06-10 MySQL 软删除标识字段补强

- `resumes` 数据模型新增 `is_deleted boolean not null default false`，作为明确软删除标识；`deleted_at` 保留为删除时间，`status='deleted'` 保留为业务状态。
- 新增迁移文件 `drizzle/0001_add_resume_soft_delete_flag.sql`：添加 `is_deleted` 字段，按已有 `status='deleted'` 或 `deleted_at is not null` 回填历史数据，并创建 `idx_resumes_user_deleted_status` 索引。
- 更新 Drizzle schema、初始迁移 SQL、MySQL repository 和内存 repository：创建简历默认 `isDeleted=false`，软删除写入 `isDeleted=true`，历史列表和上传额度统计按 `is_deleted=false` 过滤。
- 删除后的简历记录不会被硬删；普通编辑/读取会将 `isDeleted=true` 的记录视为不存在，公开链接解析也会按 `isDeleted` 判定失效。
- 验证记录：`npm run typecheck` 通过；`npm test -- tests/unit/server/db/mysql-migration.test.ts tests/unit/server/db/mysql-repositories.test.ts tests/unit/server/resume/resume-service.test.ts tests/unit/server/links/resume-link-service.test.ts` 通过，17 个测试通过。
- 真实 MySQL 检查记录：当前 `.env.local` 指向的数据库仍只有 `status` 和 `deleted_at`，尚无 `is_deleted` 字段和 `idx_resumes_user_deleted_status` 索引；尝试执行迁移时返回 `ER_TABLEACCESS_DENIED_ERROR`，说明当前数据库账号缺少 ALTER/CREATE INDEX 权限，需要使用具备 DDL 权限的账号执行新增迁移。

## 2026-06-10 MySQL 表和字段备注补强

- `drizzle/0000_initial.sql` 为全部 MySQL 表和字段补充中文备注，覆盖用户、验证码、密码重置、会话、简历、简历内容、在线链接和生成任务表。
- 新增 `drizzle/0002_add_mysql_comments.sql`，用于已存在数据库补充表备注和字段备注；该迁移依赖 `0001_add_resume_soft_delete_flag.sql` 先完成 `resumes.is_deleted` 字段创建。
- 扩展 `tests/unit/server/db/mysql-migration.test.ts`：验证所有表存在表备注，所有字段定义包含字段备注，并继续校验 repository 依赖的表、字段、索引和唯一约束。
- 验证记录：`npm test -- tests/unit/server/db/mysql-migration.test.ts` 通过，3 个测试通过；`npm run typecheck` 通过。

## 2026-06-11 MySQL 全表软删除补强

- 所有 MySQL 表统一补齐 `is_deleted boolean not null default false` 和 `deleted_at datetime`：覆盖 `users`、`email_verification_tokens`、`password_reset_tokens`、`sessions`、`resume_contents`、`resume_links`、`generation_tasks`，`resumes` 继续沿用既有软删除字段。
- 新增迁移文件 `drizzle/0003_add_soft_delete_to_all_tables.sql`，用于在已存在数据库上为其余表补充软删除字段；字段定义内直接带中文备注，避免备注迁移与字段迁移顺序错位。
- 更新 Drizzle schema、MySQL repository 和内存 repository：新增记录默认写入 `isDeleted=false`、`deletedAt=null`；认证/令牌/会话/任务查询默认过滤 `is_deleted=false`；任务删除与上传回滚改为软删除；简历删除会把简历主记录、结构化内容和公开链接一起标记为软删除，同时保持公开访问返回“已失效”而不是误判成不存在。
- `resume_links` 的业务语义补强为“可恢复的软删除记录”：当历史链接记录已被软删除但同一简历重新启用链接时，会复用并恢复原记录，避免唯一键与软删除策略冲突。
- 测试补强：扩展 `tests/unit/server/db/mysql-migration.test.ts` 覆盖新增字段；扩展 repository、上传回滚、简历删除、链接访问与 parser fixture 测试，确保新增软删除字段贯穿类型、SQL 和业务行为。
- 验证记录：`npm run typecheck` 通过；`npm run lint` 通过；`npx vitest run tests/unit/server/db/mysql-migration.test.ts tests/unit/server/db/mysql-repositories.test.ts tests/unit/server/resume/resume-service.test.ts tests/unit/server/links/resume-link-service.test.ts tests/unit/server/upload/upload-service.test.ts tests/unit/server/queue/status-service.test.ts tests/integration/parser-service-fixtures.test.ts` 通过，7 个测试文件 30 个测试全部通过；`npm test` 通过，29 个测试文件中 26 个通过、3 个外部 smoke 跳过，共 91 个测试通过、3 个跳过。

## 2026-06-13 API 网关限流与敏感入口叠加限流验收

- `middleware.ts` 对所有 `/api/*` 请求统一走 `/api/_gateway/rate-limit`，并显式跳过网关自身，保证基础限流覆盖整个 API 面。
- `src/app/api/auth/login/route.ts`、`src/app/api/auth/forgot-password/route.ts`、`src/app/api/public-links/[slug]/verify-password/route.ts` 都在业务处理前追加了独立限流规则，分别按 IP + 账号邮箱/slug 组合限流。
- `tests/unit/server/rate-limit.test.ts` 回归了网关限流、middleware 转发、以及三条敏感入口的业务级限流叠加，确保双层限流不会回退。
- 验证记录：`npm test` 通过，31 个测试文件中 28 个通过、3 个外部 smoke 跳过，99 个测试通过、3 个跳过；`npm run lint` 通过；`npm run typecheck` 通过；`npm run build` 通过，仅保留 Next ESLint 插件检测提示。
