ALTER TABLE `users`
  ADD COLUMN `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识' AFTER `last_login_at`,
  ADD COLUMN `deleted_at` datetime COMMENT '删除时间' AFTER `is_deleted`;

ALTER TABLE `email_verification_tokens`
  ADD COLUMN `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识' AFTER `created_at`,
  ADD COLUMN `deleted_at` datetime COMMENT '删除时间' AFTER `is_deleted`;

ALTER TABLE `password_reset_tokens`
  ADD COLUMN `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识' AFTER `created_at`,
  ADD COLUMN `deleted_at` datetime COMMENT '删除时间' AFTER `is_deleted`;

ALTER TABLE `sessions`
  ADD COLUMN `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识' AFTER `revoked_at`,
  ADD COLUMN `deleted_at` datetime COMMENT '删除时间' AFTER `is_deleted`;

ALTER TABLE `resume_contents`
  ADD COLUMN `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识' AFTER `updated_at`,
  ADD COLUMN `deleted_at` datetime COMMENT '删除时间' AFTER `is_deleted`;

ALTER TABLE `resume_links`
  ADD COLUMN `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识' AFTER `updated_at`,
  ADD COLUMN `deleted_at` datetime COMMENT '删除时间' AFTER `is_deleted`;

ALTER TABLE `generation_tasks`
  ADD COLUMN `is_deleted` boolean NOT NULL DEFAULT false COMMENT '软删除标识' AFTER `completed_at`,
  ADD COLUMN `deleted_at` datetime COMMENT '删除时间' AFTER `is_deleted`;
