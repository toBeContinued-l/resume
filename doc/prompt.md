# Vibe Coding 起始 Prompt

你是本项目的主 Agent，负责从零到可验收地实现一个在线简历生成工具。你需要阅读并遵守仓库中的输入文档：

- `doc/proposal.md`
- `doc/detailed-design.md`
- `doc/tasks/*.md`

当前仓库主要是设计文档，尚未包含应用代码。你需要先初始化工程，再按模块推进实现、测试和集成验收。

## 一、最终目标

实现一个基于 TypeScript 和 Next.js 的在线简历生成工具，使用户可以：

1. 通过邮箱注册、邮箱验证、登录、退出和密码找回使用系统。
2. 上传 `.doc`、`.docx` 或 `.pdf` 简历文件，单文件不超过 15MB。
3. 每个用户最多保留 3 份未删除简历记录，删除后允许重新上传。
4. 通过异步 Worker 解析文件，并调用 AI 生成结构化简历内容和网页排版。
5. 在在线编辑器中修改简历内容，支持富文本、撤销、重做、模块新增删除和排序。
6. 保存后生成在线简历链接，支持 `public`、`private_link`、`password` 三种访问模式。
7. 访问者可通过 `/r/{slug}` 匿名查看可访问的在线简历。
8. 登录用户可在历史记录中查看、编辑、删除自己的简历。
9. 原始上传文件只做临时处理，生成完成、失败或重试耗尽后必须清理。
10. 全部核心业务代码必须有完整单元测试，关键流程必须有集成测试。

整个实现过程默认不会有人工参与。你必须自主推进、拆分任务、调用子 Agent、修复测试失败并完成验收。

## 二、必须遵守的产品与技术约束

以 `doc/detailed-design.md` 为最高优先级设计依据；当 `doc/proposal.md` 和详细设计冲突时，以详细设计为准。

必须遵守：

- 主要语言：TypeScript。
- Web 框架：Next.js。
- 数据库：MySQL。
- 队列：RabbitMQ 优先；如果本地实现或测试受限，可以通过 `GenerationQueue` 接口提供内存或 Redis 替代实现，但业务层不得直接依赖具体队列 SDK。
- 临时文件：本地临时目录，通过 `TEMP_UPLOAD_ROOT` 配置。
- AI 服务：OpenAI API 优先，并通过 `ResumeAiProvider` 接口隔离；测试必须使用 Mock Provider。
- `.doc` 解析：优先使用 LibreOffice headless 转换为 `.docx` 后解析。
- `.docx` 解析：优先使用 Mammoth。
- 文本型 PDF 解析：优先使用 pdf.js 体系。
- 不支持扫描版 PDF 或图片型 PDF 的 OCR。
- 首期不允许模板切换。
- 首期不保存编辑历史或版本回退。
- 首期不统计在线访问次数。
- 必须提供用户协议和隐私政策页面。
- 上传失败记录不保留。
- 删除简历记录后，对应在线链接立即失效。

AI 必须遵守：

- 不得虚构学历、公司、岗位、项目、证书、工作年限等事实性经历。
- 不得把推测内容写成已确认事实。
- 可以优化措辞、调整语序、提升专业表达。
- 只能基于已有信息补全非事实性表达。
- 不确定内容必须进入 `confirmationItems`。
- AI 输出必须经过服务端 Schema、安全和事实性后置校验后才能保存。

安全与隐私必须遵守：

- 用户只能访问自己的后台简历数据。
- 在线访问页面不得暴露编辑入口、后台路由或用户管理信息。
- 登录密码、访问密码、邮箱验证令牌、密码重置令牌和会话令牌都不得明文持久化。
- Cookie 必须使用 `HttpOnly`、`Secure`、`SameSite=Lax`。
- 富文本保存前必须清理 HTML，在线渲染时也必须使用安全渲染组件。
- 原始上传文件路径不得进入前端响应或持久化简历内容。

## 三、主 Agent 工作方式

你是主 Agent，只负责全局编排、架构一致性、任务派发、集成、测试和验收。你必须创建子 Agent 来实现各模块。

主 Agent 必须持续维护：

- `doc/tasks/progress.md` 中的模块状态。
- 一个简短的实现日志，例如 `doc/implementation-notes.md`，记录关键技术选择、偏离设计的原因、运行方式和已知限制。
- 测试状态和未解决失败项。

主 Agent 的循环：

1. 阅读输入文档和当前代码。
2. 初始化 Next.js + TypeScript 工程和测试基础设施。
3. 明确公共类型、数据库、服务接口和目录结构。
4. 按阶段创建子 Agent。
5. 子 Agent 完成模块代码和测试后，主 Agent 做代码审查。
6. 主 Agent 运行相关测试，失败则派回对应子 Agent 修复。
7. 阶段完成后运行更大范围测试。
8. 所有模块完成后运行全量测试和集成验收。
9. 更新任务清单和实现日志。

如果实现过程中遇到文档没有明确规定的问题，且不会影响产品安全、隐私或数据模型兼容性，主 Agent 应保守决策并记录在实现日志中，不要停止等待人工确认。只有出现无法继续实现的硬阻塞，例如关键凭据、系统依赖或外部服务完全不可用，才允许记录阻塞并使用 Mock、内存实现或可替换 Provider 继续推进可测试主流程。

## 四、推荐工程结构

优先采用详细设计建议的目录结构：

```text
src/
  app/
    api/
    auth/
    dashboard/
    editor/
    r/
    legal/
  components/
  server/
    auth/
    upload/
    parser/
    ai/
    resume/
    links/
    queue/
    mail/
    temp-files/
  worker/
  types/
  utils/
tests/
  unit/
  integration/
  fixtures/
```

业务逻辑必须放在 `src/server/*`、`src/worker/*`、`src/types/*` 等可单元测试位置；`src/app/api/*` 只负责 HTTP 入参、出参和认证上下文组装。

推荐先建立：

- TypeScript 严格模式。
- ESLint 和格式化脚本。
- Vitest 或 Jest 单元测试。
- React Testing Library，用于前端组件测试。
- Playwright 或等价工具，用于关键页面/流程集成测试。
- 数据库迁移方案，优先选择适合 MySQL 的 ORM/Query Builder，例如 Prisma、Drizzle 或 Kysely。选择后全项目保持一致。

## 五、公共 Schema 和接口优先级

在任何模块深入实现前，必须先建立共享类型和校验：

- `ApiResponse<T>`
- `ParsedResumeDocument`
- `ParsedBlock`
- `ParsedTable`
- `ParsedAsset`
- `ParserWarning`
- `ResumeContent`
- `ResumeSection`
- `RichText`
- `ResumeAsset`
- `ConfirmationItem`
- `ResumeLayout`
- `GenerationTaskMessage`
- `GenerationQueue`
- `ResumeAiProvider`
- `TempFileService`

Schema 必须具备运行时校验能力，推荐使用 Zod 或同类库。所有 API 入参、AI 输出、编辑保存内容、链接配置都必须经过运行时校验。

## 六、数据库必须覆盖的表

按照 `doc/detailed-design.md` 实现 MySQL 迁移：

- `users`
- `email_verification_tokens`
- `password_reset_tokens`
- `sessions`
- `resumes`
- `resume_contents`
- `resume_links`
- `generation_tasks`

主键使用字符串 ID，建议 UUID 或 ULID。时间字段使用 UTC。结构化简历内容和布局保存为 JSON 字段。

所有涉及用户数据的查询必须带 `user_id` 或显式所有权校验。

## 七、API 和页面范围

必须实现以下 API：

- `POST /api/auth/register`
- `POST /api/auth/verify-email`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/resumes/upload`
- `GET /api/generation-tasks/{taskId}`
- `GET /api/resumes`
- `GET /api/resumes/{resumeId}`
- `PUT /api/resumes/{resumeId}`
- `DELETE /api/resumes/{resumeId}`
- `GET /api/resumes/{resumeId}/link`
- `PUT /api/resumes/{resumeId}/link`
- `POST /api/public-links/{slug}/verify-password`

必须实现以下页面：

- 注册、邮箱验证、登录、密码找回、重置密码页面。
- 上传页面。
- 生成任务进度页面或上传后的进度区域。
- 历史记录页面 `/dashboard`。
- 编辑页面 `/editor/{resumeId}` 或项目约定的等价路由。
- 用户协议 `/legal/terms`。
- 隐私政策 `/legal/privacy`。
- 在线简历访问页 `/r/{slug}`。

页面必须完成首期可用体验，不要只做占位页。

## 八、子 Agent 分工

主 Agent 必须按模块创建子 Agent。每个子 Agent 必须完成：

1. 阅读对应任务文件和详细设计相关章节。
2. 实现模块代码。
3. 编写模块单元测试。
4. 必要时编写组件测试或集成测试。
5. 运行自己模块相关测试。
6. 向主 Agent 返回变更摘要、测试结果、风险和未完成项。

建议子 Agent 列表：

### 1. 基础工程与共享 Schema 子 Agent

输入：

- `doc/detailed-design.md`
- 所有 `doc/tasks/*.md`

任务：

- 初始化 Next.js + TypeScript 工程。
- 建立测试框架。
- 建立 `src/types` 和运行时 Schema。
- 建立 API 响应工具、错误码、ID、时间、测试工具。
- 建立数据库迁移基础和本地配置样例。

测试：

- Schema 校验测试。
- API 响应工具测试。
- ID 和时间工具测试。

### 2. 账号认证子 Agent

输入：

- `doc/tasks/auth.md`
- `doc/tasks/legal.md`
- 详细设计账号、会话、密码与令牌章节。

任务：

- 用户、邮箱验证令牌、密码重置令牌、会话模型与迁移。
- 邮箱注册、验证、登录、退出、当前用户、密码找回、重置密码。
- 邮件 Provider 接口和测试用 Mock Provider。
- 登录态中间件和简历所有权校验服务。
- 注册页展示法律页面入口。

测试：

- 注册、邮箱格式、密码强度、邮箱唯一性。
- 邮箱验证令牌过期、重复使用。
- 登录、退出、当前用户。
- 密码找回和重置密码。
- 未登录 401，非所有者 403。

### 3. 法律页面子 Agent

输入：

- `doc/tasks/legal.md`
- 详细设计隐私与安全章节。

任务：

- `/legal/terms`
- `/legal/privacy`
- 注册入口链接。
- 基础页面元信息和可读排版。

测试：

- 匿名访问。
- 注册页存在协议和隐私链接。

### 4. 简历数据子 Agent

输入：

- `doc/tasks/resume-data.md`
- 详细设计简历数据 Schema 和数据库章节。

任务：

- `resumes`、`resume_contents`、`resume_links`、`generation_tasks` 迁移。
- 简历创建、AI 结果保存、编辑保存、发布、软删除、未删除数量统计。
- 内容、布局、资产、确认项状态校验。
- 历史记录摘要查询。

测试：

- 状态流转。
- Schema 校验。
- `moduleOrder` 和 `sectionLayout` 一致性。
- 删除记录后不计入 3 份限制。
- 原始临时路径不进入持久化内容。

### 5. 临时文件子 Agent

输入：

- `doc/tasks/temp-files.md`
- 详细设计临时文件存储和文件安全章节。

任务：

- `TEMP_UPLOAD_ROOT` 策略。
- `TempFileService`。
- 任务目录创建、原始文件保存、assets 写入、转换文件引用、任务目录删除。
- 路径归一化和根目录校验。

测试：

- `../`、绝对路径、伪造 ID 的路径安全。
- 创建、写入、读取、删除生命周期。
- 删除幂等。

### 6. 上传子 Agent

输入：

- `doc/tasks/upload.md`
- 详细设计上传模块和异常处理章节。

任务：

- `/api/resumes/upload`。
- 上传页面。
- 登录态、扩展名、MIME、15MB、单文件、3 份限制校验。
- 创建 `resume` 和 `generation_task`。
- 保存临时文件并投递队列。
- 失败回滚。

测试：

- 未登录。
- 超限大小。
- 不支持格式。
- MIME 与扩展名不一致。
- 3 份限制。
- 成功创建任务。
- 临时文件或队列失败时回滚。

### 7. 队列和 Worker 子 Agent

输入：

- `doc/tasks/generation-queue.md`
- 详细设计任务状态机和 Worker 流程。

任务：

- `GenerationQueue` 接口。
- RabbitMQ 实现。
- 本地测试用 InMemory Queue。
- Worker 消费入口、prefetch、ack/nack/requeue 或重新投递策略。
- 状态更新服务。
- `/api/generation-tasks/{taskId}`。
- 任务状态到前端进度文案映射。

测试：

- 消息投递和消费。
- 状态更新。
- 解析空内容最多重试 2 次。
- 成功后 ack。
- 终态失败后清理。
- Worker 编排：解析成功进入 AI，AI 成功进入完成，失败进入清理。

### 8. 文件解析子 Agent

输入：

- `doc/tasks/parser.md`
- 详细设计文件解析章节。

任务：

- 文件类型识别。
- `.doc` LibreOffice 转换入口和超时。
- `.docx` Mammoth 解析文本、HTML、标题、段落、列表、链接、富文本标记、表格、图片。
- PDF 文本块、页码、坐标、顺序提取。
- 扫描版或纯图片 PDF 判断，不做 OCR。
- 解析警告。
- 有效性校验，空文本返回可重试错误。
- 测试 fixtures。

测试：

- 普通 `.docx`。
- 表格 `.docx`。
- 图片 `.docx`。
- 文本 PDF。
- 扫描版 PDF 无 OCR。
- 空文件和损坏文件。
- 解析空内容可重试错误。

### 9. AI 子 Agent

输入：

- `doc/tasks/ai.md`
- 详细设计 AI 内容处理章节。

任务：

- `ResumeAiProvider`。
- OpenAI Provider。
- Mock Provider。
- 系统提示词。
- 结构化输出 Schema。
- AI 输入清理。
- JSON 解析、格式校验、必填字段、模块类型、`moduleOrder`、`fieldPath`、文本长度校验。
- 疑似新增关键事实后置检查。
- 格式错误时最多重试一次。

测试：

- Mock Provider 结构识别、待确认项、布局输出。
- 非法 JSON。
- 非法模块。
- 无效字段路径。
- 疑似虚构事实。
- AI 失败后任务失败并触发清理。

### 10. 清理子 Agent

输入：

- `doc/tasks/cleanup.md`
- 详细设计文件清理章节。

任务：

- 清理服务接口。
- 成功任务清理。
- AI 失败清理。
- 解析重试耗尽清理。
- 上传失败部分清理。
- 清理状态更新。
- 失败记录对用户不可见。
- 清理幂等和失败日志。

测试：

- 成功任务清理。
- 失败任务清理。
- 重试耗尽不保留用户可见失败记录。
- 幂等和路径安全。

### 11. 在线编辑子 Agent

输入：

- `doc/tasks/editor.md`
- 详细设计在线编辑、富文本安全和保存规则章节。

任务：

- `/editor/{resumeId}`。
- `GET /api/resumes/{resumeId}`。
- `PUT /api/resumes/{resumeId}`。
- 登录态和所有权校验。
- 个人信息、教育、工作、项目、技能、证书、荣誉、自定义模块编辑。
- 模块新增、删除、排序。
- 富文本编辑器，支持加粗、链接、列表。
- 前端会话内撤销和重做。
- AI 待确认项确认、编辑后确认、忽略。
- 保存时 Schema 校验和富文本清理。
- 发布或更新在线链接入口。
- 不提供模板切换和版本回退入口。

测试：

- 非所有者不能读取或保存。
- 富文本清理。
- 模块增删排序后 Schema 合法。
- 撤销重做前端状态。
- 保存后历史记录更新时间更新。

### 12. 在线链接子 Agent

输入：

- `doc/tasks/links.md`
- 详细设计在线链接章节。

任务：

- `public`、`private_link`、`password` 枚举。
- 128 bit 以上随机 slug。
- slug 唯一性和冲突重试。
- `GET /api/resumes/{resumeId}/link`。
- `PUT /api/resumes/{resumeId}/link`。
- 登录态和所有权校验。
- 首次保存创建链接，再次保存更新配置。
- 访问密码哈希。
- 从密码模式切换到其他模式时清空密码哈希。
- 删除简历时链接失效。
- `/api/public-links/{slug}/verify-password`。
- 密码访问不设置访问会话缓存。
- 密码错误不返回简历内容。

测试：

- slug 随机性和唯一性。
- 访问密码哈希。
- 访问模式切换。
- 删除简历后链接失效。
- 密码错误无内容泄露。

### 13. 在线简历访问子 Agent

输入：

- `doc/tasks/public-resume.md`
- 详细设计在线访问和页面渲染章节。

任务：

- `/r/{slug}`。
- 根据 slug 查询有效链接和简历内容。
- 无效、失效、已删除状态页。
- 公开访问和私密链接匿名渲染。
- 密码访问表单。
- 密码未提交或错误时不返回简历内容。
- 密码正确后返回可渲染简历数据。
- `default` 固定模板。
- 桌面端和移动端响应式布局。
- 安全富文本渲染。
- 不展示编辑按钮、后台路由和用户管理信息。

测试：

- 无效 slug。
- 失效链接。
- 删除简历。
- 密码未提交、错误、正确。
- 匿名访问公开和私密链接。
- 移动端和桌面端基础渲染检查。

### 14. 历史记录子 Agent

输入：

- `doc/tasks/history.md`
- 详细设计历史记录章节。

任务：

- `/dashboard`。
- `GET /api/resumes`。
- `DELETE /api/resumes/{resumeId}`。
- 登录态和所有权校验。
- 只返回当前用户未删除记录。
- 标题、创建时间、更新时间、在线链接、编辑入口、剩余上传数量。
- 软删除并写入 `deleted_at`。
- 删除时链接失效。
- 删除后上传限制重新计算。
- 不提供版本回退。

测试：

- 所有权过滤。
- 已删除记录不展示。
- 删除记录后链接失效。
- 删除后可重新上传。

### 15. 集成验收子 Agent

输入：

- `doc/tasks/progress.md`
- 详细设计测试方案。
- 当前完整代码。

任务：

- 建立端到端或集成测试环境。
- 使用 Mock Mail Provider、Mock AI Provider、InMemory Queue 或测试 RabbitMQ。
- 覆盖首期核心验收流程。
- 修复发现的问题或派回对应模块子 Agent。

必须覆盖：

- 注册、邮箱验证、登录流程。
- 上传 `.docx` 文件后成功创建生成任务。
- Worker 消费任务并生成结构化简历内容。
- 编辑保存简历内容成功。
- 创建公开在线链接并可匿名访问。
- 创建密码访问链接后，未提交密码无法读取内容。
- 密码错误不返回简历内容。
- 删除简历后在线链接失效。
- 删除简历后用户可重新上传到 3 份上限内。

## 九、阶段推进顺序

按以下顺序推进，除非依赖关系要求调整：

### 第一阶段：工程基础和数据基础

子 Agent：

- 基础工程与共享 Schema
- 账号认证
- 法律页面
- 简历数据

阶段验收：

- 工程可启动。
- 单元测试框架可运行。
- 数据库迁移可执行。
- 注册、验证、登录、退出、密码找回的服务层和 API 测试通过。
- 法律页面可匿名访问。
- 简历内容 Schema 和状态流转测试通过。

### 第二阶段：上传、临时文件和队列

子 Agent：

- 临时文件
- 上传
- 队列和 Worker

阶段验收：

- 登录用户可上传合法文件并创建任务。
- 非法文件和超限文件被拒绝。
- 已有 3 份未删除记录时上传被拒绝。
- 上传失败无用户可见残留记录。
- 任务进度 API 可查询。
- Worker 状态机测试通过。

### 第三阶段：解析、AI 和清理

子 Agent：

- 文件解析
- AI
- 清理

阶段验收：

- `.docx` 和文本 PDF 解析测试通过。
- 扫描版 PDF 不做 OCR，空内容按可重试错误处理。
- Mock AI 生成结构化简历内容。
- AI 输出校验阻止非法结构和疑似关键事实虚构。
- 成功、失败和重试耗尽都能清理临时目录。

### 第四阶段：编辑、链接、公开访问、历史记录

子 Agent：

- 在线编辑
- 在线链接
- 在线简历访问
- 历史记录

阶段验收：

- 用户可编辑并保存简历。
- 富文本会被清理。
- 可生成三种访问模式的在线链接。
- `/r/{slug}` 可匿名访问公开和私密链接。
- 密码模式每次访问都需提交密码。
- 删除简历后历史记录不展示，链接失效，上传名额恢复。

### 第五阶段：全量集成验收

子 Agent：

- 集成验收

阶段验收：

- 全部单元测试通过。
- 关键集成测试通过。
- `doc/tasks/progress.md` 更新完成状态。
- `doc/implementation-notes.md` 记录运行方式、环境变量、测试命令和已知限制。

## 十、测试要求

这是硬性要求：代码必须有完整单元测试。

主 Agent 不得接受只实现功能、不写测试的子 Agent 结果。每个模块至少覆盖任务文件中列出的测试点。对于难以在本地真实调用的外部依赖，必须通过接口抽象和 Mock 完成可重复测试。

测试分层：

- 单元测试：服务、Schema、工具、状态机、校验逻辑。
- API 测试：登录态、权限、请求校验、响应格式。
- 组件测试：编辑器关键状态、撤销重做、富文本清理入口、公开页面渲染。
- 集成测试：注册登录、上传生成、编辑发布、在线访问、删除失效。

全量验收前必须运行：

```bash
npm run lint
npm run typecheck
npm test
npm run test:integration
```

如果实际包管理器或脚本不同，主 Agent 必须创建等价脚本，并在实现日志中写明。

## 十一、错误处理和验收标准

所有 API 使用统一响应：

```ts
type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };
```

必须覆盖错误码：

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `VALIDATION_ERROR`
- `FILE_TOO_LARGE`
- `UNSUPPORTED_FILE_TYPE`
- `RESUME_LIMIT_REACHED`
- `TASK_NOT_FOUND`
- `RESUME_NOT_FOUND`
- `LINK_NOT_FOUND`
- `LINK_INACTIVE`
- `ACCESS_PASSWORD_REQUIRED`
- `ACCESS_PASSWORD_INVALID`
- `GENERATION_FAILED`

最终交付必须满足：

- 用户主流程从注册到在线访问可跑通。
- 所有后台接口都有登录态和所有权保护。
- 在线访问页面不依赖后台登录态。
- 密码访问模式不缓存访问会话。
- 原始上传文件不长期保留。
- AI 输出必须校验后保存。
- 简历删除后链接立即失效。
- 删除后上传额度重新计算。
- 所有核心模块测试通过。

## 十二、主 Agent 最终输出

完成后，主 Agent 必须输出：

1. 已实现模块摘要。
2. 关键技术选择摘要。
3. 数据库迁移和环境变量说明。
4. 本地启动命令。
5. 测试命令和测试结果。
6. 仍然存在的限制或需要真实外部服务配置的部分。
7. 已更新的任务进度文件路径。

不要输出未经验证的“完成”。如果测试失败，必须继续修复；如果确实被外部依赖阻塞，必须提供 Mock 验证结果和明确阻塞说明。
