CREATE TABLE `users` (
  `id` varchar(36) NOT NULL PRIMARY KEY COMMENT '用户ID',
  `email` varchar(255) NOT NULL COMMENT '登录邮箱',
  `password_hash` varchar(255) NOT NULL COMMENT '密码哈希',
  `status` varchar(32) NOT NULL COMMENT '用户状态：pending_verification、active、disabled',
  `email_verified_at` datetime COMMENT '邮箱验证时间',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  `last_login_at` datetime COMMENT '最近登录时间',
  `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识',
  `deleted_at` datetime COMMENT '删除时间',
  CONSTRAINT `uniq_users_email` UNIQUE (`email`)
) COMMENT='用户账号表';

CREATE TABLE `email_verification_tokens` (
  `id` varchar(36) NOT NULL PRIMARY KEY COMMENT '邮箱验证令牌ID',
  `user_id` varchar(36) NOT NULL COMMENT '用户ID',
  `token_hash` varchar(255) NOT NULL COMMENT '邮箱验证令牌哈希',
  `expires_at` datetime NOT NULL COMMENT '过期时间',
  `used_at` datetime COMMENT '使用时间',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识',
  `deleted_at` datetime COMMENT '删除时间'
) COMMENT='邮箱验证令牌表';

CREATE INDEX `idx_email_verification_tokens_user`
  ON `email_verification_tokens` (`user_id`);

CREATE TABLE `password_reset_tokens` (
  `id` varchar(36) NOT NULL PRIMARY KEY COMMENT '密码重置令牌ID',
  `user_id` varchar(36) NOT NULL COMMENT '用户ID',
  `token_hash` varchar(255) NOT NULL COMMENT '密码重置令牌哈希',
  `expires_at` datetime NOT NULL COMMENT '过期时间',
  `used_at` datetime COMMENT '使用时间',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识',
  `deleted_at` datetime COMMENT '删除时间'
) COMMENT='密码重置令牌表';

CREATE INDEX `idx_password_reset_tokens_user`
  ON `password_reset_tokens` (`user_id`);

CREATE TABLE `sessions` (
  `id` varchar(36) NOT NULL PRIMARY KEY COMMENT '会话ID',
  `user_id` varchar(36) NOT NULL COMMENT '用户ID',
  `session_token_hash` varchar(255) NOT NULL COMMENT '会话令牌哈希',
  `expires_at` datetime NOT NULL COMMENT '过期时间',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `revoked_at` datetime COMMENT '撤销时间',
  `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识',
  `deleted_at` datetime COMMENT '删除时间',
  CONSTRAINT `uniq_sessions_token` UNIQUE (`session_token_hash`)
) COMMENT='登录会话表';

CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);

CREATE TABLE `resumes` (
  `id` varchar(36) NOT NULL PRIMARY KEY COMMENT '简历ID',
  `user_id` varchar(36) NOT NULL COMMENT '用户ID',
  `title` varchar(255) NOT NULL COMMENT '简历标题',
  `status` varchar(32) NOT NULL COMMENT '简历状态：generating、draft、published、failed、cancelled、deleted',
  `source_file_name` varchar(255) COMMENT '原始文件名',
  `source_file_type` varchar(16) COMMENT '原始文件类型：doc、docx、pdf',
  `source_file_size` int COMMENT '原始文件大小，单位字节',
  `current_task_id` varchar(36) COMMENT '当前生成任务ID',
  `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  `deleted_at` datetime COMMENT '删除时间'
) COMMENT='简历主表';

CREATE INDEX `idx_resumes_user_status` ON `resumes` (`user_id`, `status`);
CREATE INDEX `idx_resumes_user_deleted_status` ON `resumes` (`user_id`, `is_deleted`, `status`);
CREATE INDEX `idx_resumes_user_updated` ON `resumes` (`user_id`, `updated_at`);

CREATE TABLE `resume_contents` (
  `id` varchar(36) NOT NULL PRIMARY KEY COMMENT '简历内容ID',
  `resume_id` varchar(36) NOT NULL COMMENT '简历ID',
  `content_json` json NOT NULL COMMENT '结构化简历内容JSON',
  `layout_json` json NOT NULL COMMENT '简历布局配置JSON',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识',
  `deleted_at` datetime COMMENT '删除时间',
  CONSTRAINT `uniq_resume_contents_resume` UNIQUE (`resume_id`)
) COMMENT='简历结构化内容表';

CREATE TABLE `resume_links` (
  `id` varchar(36) NOT NULL PRIMARY KEY COMMENT '在线链接ID',
  `resume_id` varchar(36) NOT NULL COMMENT '简历ID',
  `slug` varchar(128) NOT NULL COMMENT '公开访问短标识',
  `access_mode` varchar(32) NOT NULL COMMENT '访问模式：public、private_link、password',
  `password_hash` varchar(255) COMMENT '访问密码哈希',
  `is_active` boolean NOT NULL COMMENT '链接是否有效',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识',
  `deleted_at` datetime COMMENT '删除时间',
  CONSTRAINT `uniq_resume_links_slug` UNIQUE (`slug`),
  CONSTRAINT `uniq_resume_links_resume` UNIQUE (`resume_id`)
) COMMENT='在线简历链接表';

CREATE TABLE `generation_tasks` (
  `id` varchar(36) NOT NULL PRIMARY KEY COMMENT '生成任务ID',
  `user_id` varchar(36) NOT NULL COMMENT '用户ID',
  `resume_id` varchar(36) NOT NULL COMMENT '简历ID',
  `file_type` varchar(16) NOT NULL COMMENT '上传文件类型：doc、docx、pdf',
  `file_size` int NOT NULL COMMENT '上传文件大小，单位字节',
  `temp_file_path` varchar(1024) NOT NULL COMMENT '临时文件路径',
  `status` varchar(32) NOT NULL COMMENT '任务状态：pending、parsing、ai_processing、completed、failed、cancelled、cleaned',
  `retry_count` int NOT NULL COMMENT '自动重试次数',
  `error_code` varchar(64) COMMENT '失败错误码',
  `error_message` varchar(1024) COMMENT '失败错误信息',
  `created_at` datetime NOT NULL COMMENT '创建时间',
  `updated_at` datetime NOT NULL COMMENT '更新时间',
  `completed_at` datetime COMMENT '完成时间',
  `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识',
  `deleted_at` datetime COMMENT '删除时间'
) COMMENT='简历生成任务表';

CREATE INDEX `idx_generation_tasks_user` ON `generation_tasks` (`user_id`);
CREATE INDEX `idx_generation_tasks_resume` ON `generation_tasks` (`resume_id`);
CREATE INDEX `idx_generation_tasks_status` ON `generation_tasks` (`status`);
