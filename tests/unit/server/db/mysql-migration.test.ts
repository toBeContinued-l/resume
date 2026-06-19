import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync("drizzle/0000_initial.sql", "utf8");

describe("MySQL initial migration", () => {
  it("creates every table and column required by the repository layer", () => {
    const tables = parseCreateTables(migrationSql);

    expect(Object.keys(tables).sort()).toEqual(Object.keys(expectedTables).sort());

    for (const [tableName, expectedColumns] of Object.entries(expectedTables)) {
      expect(tables[tableName], tableName).toBeDefined();
      expect(Object.keys(tables[tableName]!.columns).sort()).toEqual(Object.keys(expectedColumns).sort());

      for (const [columnName, expectedType] of Object.entries(expectedColumns)) {
        expect(tables[tableName]!.columns[columnName], `${tableName}.${columnName}`).toContain(expectedType);
      }
    }
  });

  it("defines comments for every table and column", () => {
    const tables = parseCreateTables(migrationSql);

    for (const [tableName, table] of Object.entries(tables)) {
      expect(table.tableComment, tableName).toBe(expectedTableComments[tableName]);
      for (const [columnName, definition] of Object.entries(table.columns)) {
        expect(definition, `${tableName}.${columnName}`).toContain("COMMENT");
      }
    }
  });

  it("creates the unique constraints and lookup indexes used by MySQL repositories", () => {
    const constraints = parseNamedConstraints(migrationSql);
    const indexes = parseIndexes(migrationSql);

    expect(constraints).toEqual(
      expect.arrayContaining([
        "uniq_users_email",
        "uniq_sessions_token",
        "uniq_resume_contents_resume",
        "uniq_resume_links_slug",
        "uniq_resume_links_resume",
      ]),
    );
    expect(indexes).toEqual(
      expect.arrayContaining([
        "idx_email_verification_tokens_user",
        "idx_password_reset_tokens_user",
        "idx_sessions_user",
        "idx_resumes_user_deleted_status",
        "idx_resumes_user_status",
        "idx_resumes_user_updated",
        "idx_generation_tasks_user",
        "idx_generation_tasks_resume",
        "idx_generation_tasks_status",
      ]),
    );
  });
});

type ParsedTable = {
  tableComment: string;
  columns: Record<string, string>;
};

function parseCreateTables(sql: string): Record<string, ParsedTable> {
  const tables: Record<string, ParsedTable> = {};
  const createTablePattern = /CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\)\s+COMMENT='([^']+)';/g;
  let match: RegExpExecArray | null;

  while ((match = createTablePattern.exec(sql))) {
    const [, tableName, body, tableComment] = match;
    const columns: Record<string, string> = {};

    for (const line of body.split("\n")) {
      const columnMatch = line.trim().match(/^`([^`]+)`\s+(.+?)(?:,\s*)?$/);
      if (columnMatch) {
        columns[columnMatch[1]!] = columnMatch[2]!;
      }
    }

    tables[tableName!] = { tableComment: tableComment!, columns };
  }

  return tables;
}

function parseNamedConstraints(sql: string): string[] {
  return [...sql.matchAll(/CONSTRAINT `([^`]+)`/g)].map((match) => match[1]!);
}

function parseIndexes(sql: string): string[] {
  return [...sql.matchAll(/CREATE INDEX `([^`]+)`/g)].map((match) => match[1]!);
}

const expectedTables: Record<string, Record<string, string>> = {
  users: {
    id: "varchar(36)",
    email: "varchar(255)",
    password_hash: "varchar(255)",
    status: "varchar(32)",
    email_verified_at: "datetime",
    created_at: "datetime",
    updated_at: "datetime",
    last_login_at: "datetime",
    is_deleted: "boolean",
    deleted_at: "datetime",
  },
  email_verification_tokens: {
    id: "varchar(36)",
    user_id: "varchar(36)",
    token_hash: "varchar(255)",
    expires_at: "datetime",
    used_at: "datetime",
    created_at: "datetime",
    is_deleted: "boolean",
    deleted_at: "datetime",
  },
  password_reset_tokens: {
    id: "varchar(36)",
    user_id: "varchar(36)",
    token_hash: "varchar(255)",
    expires_at: "datetime",
    used_at: "datetime",
    created_at: "datetime",
    is_deleted: "boolean",
    deleted_at: "datetime",
  },
  sessions: {
    id: "varchar(36)",
    user_id: "varchar(36)",
    session_token_hash: "varchar(255)",
    expires_at: "datetime",
    created_at: "datetime",
    revoked_at: "datetime",
    is_deleted: "boolean",
    deleted_at: "datetime",
  },
  resumes: {
    id: "varchar(36)",
    user_id: "varchar(36)",
    title: "varchar(255)",
    status: "varchar(32)",
    source_file_name: "varchar(255)",
    source_file_type: "varchar(16)",
    source_file_size: "int",
    current_task_id: "varchar(36)",
    is_deleted: "boolean",
    created_at: "datetime",
    updated_at: "datetime",
    deleted_at: "datetime",
  },
  resume_contents: {
    id: "varchar(36)",
    resume_id: "varchar(36)",
    content_json: "json",
    layout_json: "json",
    created_at: "datetime",
    updated_at: "datetime",
    is_deleted: "boolean",
    deleted_at: "datetime",
  },
  resume_links: {
    id: "varchar(36)",
    resume_id: "varchar(36)",
    slug: "varchar(128)",
    access_mode: "varchar(32)",
    password_hash: "varchar(255)",
    is_active: "boolean",
    created_at: "datetime",
    updated_at: "datetime",
    is_deleted: "boolean",
    deleted_at: "datetime",
  },
  generation_tasks: {
    id: "varchar(36)",
    user_id: "varchar(36)",
    resume_id: "varchar(36)",
    file_type: "varchar(16)",
    file_size: "int",
    temp_file_path: "varchar(1024)",
    status: "varchar(32)",
    retry_count: "int",
    error_code: "varchar(64)",
    error_message: "varchar(1024)",
    created_at: "datetime",
    updated_at: "datetime",
    completed_at: "datetime",
    is_deleted: "boolean",
    deleted_at: "datetime",
  },
};

const expectedTableComments: Record<string, string> = {
  users: "用户账号表",
  email_verification_tokens: "邮箱验证令牌表",
  password_reset_tokens: "密码重置令牌表",
  sessions: "登录会话表",
  resumes: "简历主表",
  resume_contents: "简历结构化内容表",
  resume_links: "在线简历链接表",
  generation_tasks: "简历生成任务表",
};
