# 简历数据模块任务

## 最小可执行任务

- [x] 定义 `ResumeContent`、`ResumeSection`、`RichText`、`ResumeAsset`、`ConfirmationItem` 和 `ResumeLayout` 类型。
- [x] 实现 `resumes`、`resume_contents`、`resume_links`、`generation_tasks` 的数据库迁移脚本。
- [x] 实现简历状态枚举：`generating`、`draft`、`published`、`failed`、`cancelled`、`deleted`。
- [x] 实现简历创建服务，保存源文件元数据但不保存原始文件内容。
- [x] 实现 AI 生成结果保存服务，写入 `resume_contents` 并将简历更新为 `draft`。
- [x] 实现编辑保存服务，更新内容、布局和 `updated_at`。
- [x] 实现发布状态更新服务，将简历状态更新为 `published`。
- [x] 实现软删除服务，将简历状态更新为 `deleted`、`is_deleted=true` 并写入 `deleted_at`。
- [x] 实现未删除简历数量统计服务，供上传限制使用。
- [x] 实现简历内容 Schema 校验。
- [x] 实现 `moduleOrder` 与 section ID 一致性校验。
- [x] 实现布局 `sectionLayout` 与 section ID 一致性校验。
- [x] 实现确认项状态流转：`pending`、`confirmed`、`edited`、`dismissed`。
- [x] 实现持久化资产引用校验，确保不依赖原始临时目录。
- [x] 实现历史记录摘要查询，返回标题、创建时间、更新时间、链接和编辑入口所需数据。
- [x] 编写状态流转测试。
- [x] 编写 Schema 校验测试。
- [x] 编写模块顺序一致性测试。
- [x] 编写删除记录后不计入 3 份限制测试。
- [x] 编写原始临时文件路径不进入持久化内容测试。

## 完成标准

- [x] 简历结构化内容、布局、资产和待确认项都能被校验和保存。
- [x] 简历状态流转符合生成、编辑、发布和删除流程。
- [x] 上传文件只保留元数据，不保留原始文件路径或内容。
