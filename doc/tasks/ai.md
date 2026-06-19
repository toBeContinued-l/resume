# AI 内容处理模块任务

## 最小可执行任务

- [x] 定义 `ResumeAiProvider` 接口。
- [x] 定义 `ResumeAiInput` 和 `ResumeAiOutput` 类型。
- [x] 定义 AI 约束参数：不虚构事实、标记不确定内容、固定模板、保留可解析图片和表格。
- [x] 实现 OpenAI Provider 适配层。
- [x] 实现 Mock Provider，供单元测试和本地流程测试使用。
- [x] 编写系统提示词，明确不得虚构学历、公司、岗位、项目、证书和工作年限。
- [x] 编写结构化输出 Schema，覆盖 `ResumeContent`、`ResumeLayout`、`confirmationItems` 和 `aiWarnings`。
- [x] 实现 AI 输入清理：只传递解析内容和必要结构线索。
- [x] 实现 AI 返回 JSON 解析和格式校验。
- [x] 实现必填字段校验。
- [x] 实现模块类型校验。
- [x] 实现 `moduleOrder` 引用校验。
- [x] 实现不确定项 `fieldPath` 引用校验。
- [x] 实现文本长度合理性校验。
- [x] 实现疑似新增关键事实的后置检查。
- [x] 实现格式错误时 AI 调用最多重试一次。
- [x] 实现 AI 失败后任务进入 `failed`，保留任务上下文供用户主动重试。
- [x] 编写 Mock Provider 测试：结构识别、待确认项、布局输出。
- [x] 编写输出校验测试：非法 JSON、非法模块、无效字段路径、疑似虚构事实。
- [x] 编写少量真实 Provider 验收用例，验证主流程质量。

## 完成标准

- [x] AI 模块可通过 Provider 接口替换实现。
- [x] AI 输出必须通过服务端 Schema 和安全校验后才能保存。
- [x] 不确定或推测内容不会被保存为已确认事实。
