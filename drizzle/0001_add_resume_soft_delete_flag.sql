ALTER TABLE `resumes`
  ADD COLUMN `is_deleted` boolean NOT NULL DEFAULT false AFTER `current_task_id`;

UPDATE `resumes`
  SET `is_deleted` = true
  WHERE `status` = 'deleted' OR `deleted_at` IS NOT NULL;

CREATE INDEX `idx_resumes_user_deleted_status`
  ON `resumes` (`user_id`, `is_deleted`, `status`);
