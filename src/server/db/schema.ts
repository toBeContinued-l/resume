import {
  boolean,
  datetime,
  index,
  int,
  json,
  mysqlTable,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";

export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    emailVerifiedAt: datetime("email_verified_at"),
    createdAt: datetime("created_at").notNull(),
    updatedAt: datetime("updated_at").notNull(),
    lastLoginAt: datetime("last_login_at"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: datetime("deleted_at")
  },
  (table) => ({
    usersEmailUnique: uniqueIndex("uniq_users_email").on(table.email)
  })
);

export const emailVerificationTokens = mysqlTable(
  "email_verification_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    expiresAt: datetime("expires_at").notNull(),
    usedAt: datetime("used_at"),
    createdAt: datetime("created_at").notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: datetime("deleted_at")
  },
  (table) => ({
    userIdx: index("idx_email_verification_tokens_user").on(table.userId)
  })
);

export const passwordResetTokens = mysqlTable(
  "password_reset_tokens",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    tokenHash: varchar("token_hash", { length: 255 }).notNull(),
    expiresAt: datetime("expires_at").notNull(),
    usedAt: datetime("used_at"),
    createdAt: datetime("created_at").notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: datetime("deleted_at")
  },
  (table) => ({
    userIdx: index("idx_password_reset_tokens_user").on(table.userId)
  })
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    sessionTokenHash: varchar("session_token_hash", { length: 255 }).notNull(),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: datetime("created_at").notNull(),
    revokedAt: datetime("revoked_at"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: datetime("deleted_at")
  },
  (table) => ({
    userIdx: index("idx_sessions_user").on(table.userId),
    tokenUnique: uniqueIndex("uniq_sessions_token").on(table.sessionTokenHash)
  })
);

export const resumes = mysqlTable(
  "resumes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    sourceFileName: varchar("source_file_name", { length: 255 }),
    sourceFileType: varchar("source_file_type", { length: 16 }),
    sourceFileSize: int("source_file_size"),
    currentTaskId: varchar("current_task_id", { length: 36 }),
    isDeleted: boolean("is_deleted").notNull().default(false),
    createdAt: datetime("created_at").notNull(),
    updatedAt: datetime("updated_at").notNull(),
    deletedAt: datetime("deleted_at")
  },
  (table) => ({
    userStatusIdx: index("idx_resumes_user_status").on(table.userId, table.status),
    userDeletedStatusIdx: index("idx_resumes_user_deleted_status").on(table.userId, table.isDeleted, table.status),
    userUpdatedIdx: index("idx_resumes_user_updated").on(table.userId, table.updatedAt)
  })
);

export const resumeContents = mysqlTable(
  "resume_contents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    resumeId: varchar("resume_id", { length: 36 }).notNull(),
    contentJson: json("content_json").notNull(),
    layoutJson: json("layout_json").notNull(),
    createdAt: datetime("created_at").notNull(),
    updatedAt: datetime("updated_at").notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: datetime("deleted_at")
  },
  (table) => ({
    resumeUnique: uniqueIndex("uniq_resume_contents_resume").on(table.resumeId)
  })
);

export const resumeLinks = mysqlTable(
  "resume_links",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    resumeId: varchar("resume_id", { length: 36 }).notNull(),
    slug: varchar("slug", { length: 128 }).notNull(),
    accessMode: varchar("access_mode", { length: 32 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    isActive: boolean("is_active").notNull(),
    createdAt: datetime("created_at").notNull(),
    updatedAt: datetime("updated_at").notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: datetime("deleted_at")
  },
  (table) => ({
    slugUnique: uniqueIndex("uniq_resume_links_slug").on(table.slug),
    resumeUnique: uniqueIndex("uniq_resume_links_resume").on(table.resumeId)
  })
);

export const generationTasks = mysqlTable(
  "generation_tasks",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    resumeId: varchar("resume_id", { length: 36 }).notNull(),
    fileType: varchar("file_type", { length: 16 }).notNull(),
    fileSize: int("file_size").notNull(),
    tempFilePath: varchar("temp_file_path", { length: 1024 }).notNull(),
    status: varchar("status", { length: 32 }).notNull(),
    retryCount: int("retry_count").notNull(),
    errorCode: varchar("error_code", { length: 64 }),
    errorMessage: varchar("error_message", { length: 1024 }),
    createdAt: datetime("created_at").notNull(),
    updatedAt: datetime("updated_at").notNull(),
    completedAt: datetime("completed_at"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    deletedAt: datetime("deleted_at")
  },
  (table) => ({
    userIdx: index("idx_generation_tasks_user").on(table.userId),
    resumeIdx: index("idx_generation_tasks_resume").on(table.resumeId),
    statusIdx: index("idx_generation_tasks_status").on(table.status)
  })
);
