# ResumeCraft

把已有的 Word 或 PDF 简历转换成可编辑、可分享的在线简历页面。

项目当前实现了从上传、解析、AI 优化、在线编辑到公开分享的完整主流程，适合作为在线简历生成工具的原型或业务底座。

## 项目目标

- 支持上传 `.doc`、`.docx`、`.pdf` 简历文件
- 解析简历内容并提取结构化信息
- 使用 AI 优化表述、补全可推断内容并生成网页排版
- 在浏览器中继续编辑生成后的简历
- 生成可分享的在线简历链接
- 为登录用户提供历史记录、再次编辑和重新发布能力

## 当前功能

- 邮箱注册、登录、退出登录
- 邮箱验证码注册闭环
- 忘记密码与重置密码
- 上传简历并跟踪生成进度
- 生成失败后重试
- 在线编辑简历内容
- 在线简历公开访问、私密链接访问、密码访问
- 历史记录管理
- 隐私政策和用户协议页面

## 业务约束

- 单个文件大小不超过 `15MB`
- 每个账号最多保留 `3` 份简历记录
- 原始上传文件只用于解析流程，不长期保存
- 不支持扫描版 PDF 或图片型 PDF 的 OCR
- AI 不应虚构学历、公司、岗位、项目、证书和工作年限等关键事实

## 技术栈

- Next.js 15
- React 19
- TypeScript
- Drizzle ORM
- MySQL
- RabbitMQ
- Nodemailer
- Vitest

## 运行方式

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

以 `.env.example` 为模板创建本地环境文件：

```bash
cp .env.example .env.local
```

常用变量说明：

- `DATABASE_URL`：MySQL 连接串。不配置时使用内存仓储。
- `RABBITMQ_URL`：RabbitMQ 连接串。不配置时使用内存队列。
- `TEMP_UPLOAD_ROOT`：上传文件临时目录。
- `AI_API_KEY` / `OPENAI_API_KEY`：AI 服务密钥。不配置时使用 mock AI provider。
- `MAIL_PROVIDER`：默认可用 `mock`，如果切到 `smtp` 需要补齐 SMTP 配置。
- `APP_BASE_URL`：邮件链接和公开链接生成使用的外部访问地址。
- `SESSION_SECRET`：会话签名密钥。

### 3. 启动开发环境

```bash
npm run dev
```

默认访问地址：

```text
http://localhost:3000
```

## 常用脚本

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run typecheck
npm run test
npm run test:integration
```

外部依赖 smoke 测试：

```bash
npm run test:external:mysql
npm run test:external:rabbitmq
npm run test:external:openai
```

## 系统结构

```text
src/app             Next.js 页面与 API 路由
src/components      前端组件
src/server          认证、上传、解析、AI、队列、简历服务
src/worker          异步生成 worker
drizzle/            数据库迁移
tests/              单元测试与集成测试
doc/                需求、设计和实现过程文档
```

## 模块设计

- 账号模块：邮箱注册登录、验证码校验、密码重置、会话管理
- 上传模块：校验文件格式、大小和数量限制，创建生成任务
- 解析模块：处理 `.doc`、`.docx`、文本型 `.pdf`
- AI 模块：结构识别、文案优化、排版输出和待确认项标记
- 队列模块：跟踪 `pending`、`parsing`、`ai_processing`、`completed`、`failed` 等状态
- 编辑模块：用户确认 AI 输出并继续修改内容
- 链接模块：发布公开、私密或密码访问的在线简历链接

## 开发说明

- 未配置 `DATABASE_URL` 时，应用会退回到内存仓储，便于本地开发
- 未配置 `RABBITMQ_URL` 时，应用会使用内存队列
- 未配置 AI 密钥时，应用会使用 mock AI provider
- `MAIL_PROVIDER=mock` 时不会真的发邮件，更适合本地联调

## 文档说明

`doc/` 目录目前更偏向内部需求、设计和实现记录，不是项目运行所必需。

如果这个仓库主要用于：

- 团队协作或后续继续开发：建议保留 `doc/`
- 对外展示作品或开源主页：建议只保留精简后的公开文档，把详细设计、提示词和实施记录移到私有仓库或单独知识库

## 后续可扩展方向

- OCR 支持
- 导出 PDF / Word
- 多模板或主题切换
- 访问统计
- 多语言简历
- 更完善的部署与运维方案
