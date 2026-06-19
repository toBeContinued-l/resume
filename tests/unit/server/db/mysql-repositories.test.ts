import { describe, expect, it } from "vitest";
import { MysqlAuthRepository } from "@/server/auth/mysql-auth-repository";
import { MysqlGenerationTaskRepository } from "@/server/queue/mysql-generation-task-repository";
import { MysqlResumeRepository } from "@/server/resume/mysql-resume-repository";
import type { SqlExecutor, SqlValue } from "@/server/db/mysql-client";
import type { ResumeContent, ResumeLayout } from "@/types/resume";

class FakeSqlExecutor implements SqlExecutor {
  readonly calls: Array<{ sql: string; params: readonly SqlValue[] }> = [];
  private responses: unknown[][] = [];

  queue<T>(rows: T[]): this {
    this.responses.push(rows);
    return this;
  }

  async execute<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    this.calls.push({ sql, params });
    return (this.responses.shift() ?? []) as T[];
  }
}

const now = new Date("2026-06-06T00:00:00.000Z");

describe("MySQL repositories", () => {
  it("maps auth rows and writes token/session SQL", async () => {
    const db = new FakeSqlExecutor();
    const repository = new MysqlAuthRepository(db, () => now);

    await repository.createUser({ id: "user-1", email: "a@example.com", passwordHash: "hash", status: "pending_verification" });
    db.queue([
      {
        id: "user-1",
        email: "a@example.com",
        password_hash: "hash",
        status: "active",
        email_verified_at: now,
        created_at: now,
        updated_at: now,
        last_login_at: null,
        is_deleted: 0,
        deleted_at: null,
      },
    ]);

    const user = await repository.findUserByEmail("a@example.com");

    expect(db.calls[0]?.sql).toContain("insert into users");
    expect(db.calls[1]?.sql).toContain("select * from users where email");
    expect(user?.passwordHash).toBe("hash");
    expect(user?.emailVerifiedAt).toEqual(now);
  });

  it("persists resume content JSON and maps links", async () => {
    const db = new FakeSqlExecutor();
    const repository = new MysqlResumeRepository(db, { now: () => now, createId: () => "content-1" });
    const content: ResumeContent = {
      schemaVersion: 1,
      title: "Resume",
      sections: [{ id: "profile", type: "profile", title: "Profile", visible: true, data: { name: "Milu" } }],
      moduleOrder: ["profile"],
      assets: [],
      confirmationItems: [],
    };
    const layout: ResumeLayout = {
      schemaVersion: 1,
      template: "default",
      theme: { fontFamily: "system", accentColor: "#0f766e", density: "comfortable" },
      sectionLayout: [{ sectionId: "profile", variant: "standard" }],
    };

    db.queue([]);
    const saved = await repository.upsertResumeContent({ resumeId: "resume-1", content, layout });
    db.queue([
      {
        id: "link-1",
        resume_id: "resume-1",
        slug: "slug",
        access_mode: "password",
        password_hash: "hash",
        is_active: 1,
        created_at: now,
        updated_at: now,
        is_deleted: 0,
        deleted_at: null,
      },
    ]);
    const link = await repository.findLinkBySlug("slug");

    expect(saved.id).toBe("content-1");
    expect(db.calls[1]?.params[2]).toBe(JSON.stringify(content));
    expect(link?.isActive).toBe(true);
    expect(link?.accessMode).toBe("password");
  });

  it("persists and filters the resume soft-delete flag", async () => {
    const db = new FakeSqlExecutor();
    const repository = new MysqlResumeRepository(db, { now: () => now });

    const resume = await repository.createResume({
      id: "resume-1",
      userId: "user-1",
      title: "Resume",
      status: "draft",
      sourceFileName: "resume.pdf",
      sourceFileType: "pdf",
      sourceFileSize: 100,
      currentTaskId: "task-1",
    });
    await repository.updateResume({ ...resume, status: "deleted", isDeleted: true, deletedAt: now });
    db.queue([{ count: 0 }]);
    await repository.countActiveResumesByUser("user-1");
    db.queue([]);
    await repository.listActiveResumesByUser("user-1");

    expect(db.calls[0]?.sql).toContain("is_deleted");
    expect(db.calls[0]?.params[8]).toBe(false);
    expect(db.calls[1]?.sql).toContain("is_deleted = ?");
    expect(db.calls[1]?.params[6]).toBe(true);
    expect(db.calls[2]?.sql).toContain("is_deleted = false");
    expect(db.calls[3]?.sql).toContain("is_deleted = false");
  });

  it("soft deletes resume graph records instead of hard deleting them", async () => {
    const db = new FakeSqlExecutor();
    const repository = new MysqlResumeRepository(db, { now: () => now });

    await repository.deleteResume("resume-1");

    expect(db.calls[0]?.sql).toContain("update resume_links set is_active = false, is_deleted = true");
    expect(db.calls[1]?.sql).toContain("update resume_contents set is_deleted = true");
    expect(db.calls[2]?.sql).toContain("update resumes set status = 'deleted', is_deleted = true");
  });

  it("creates and updates generation tasks", async () => {
    const db = new FakeSqlExecutor();
    const repository = new MysqlGenerationTaskRepository(db, () => now);

    const task = await repository.createTask({
      id: "task-1",
      userId: "user-1",
      resumeId: "resume-1",
      fileType: "pdf",
      fileSize: 100,
      tempFilePath: "/tmp/original.pdf",
    });
    await repository.updateTask({ ...task, status: "completed", completedAt: now });

    expect(db.calls[0]?.sql).toContain("insert into generation_tasks");
    expect(db.calls[1]?.sql).toContain("update generation_tasks set status");
    expect(db.calls[1]?.params[0]).toBe("completed");
    expect(db.calls[0]?.params[13]).toBe(false);
  });
});
