import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MysqlAuthRepository } from "@/server/auth/mysql-auth-repository";
import { MysqlPoolExecutor } from "@/server/db/mysql-client";
import { MysqlGenerationTaskRepository } from "@/server/queue/mysql-generation-task-repository";
import { MysqlResumeRepository } from "@/server/resume/mysql-resume-repository";
import type { ResumeContent, ResumeLayout } from "@/types/resume";

const shouldRun = Boolean(process.env.DATABASE_URL && process.env.RUN_MYSQL_INTEGRATION === "1");
const runWithMysql = shouldRun ? describe : describe.skip;

runWithMysql("MySQL repositories smoke", () => {
  const prefix = `it-${Date.now().toString(36)}`;
  const now = new Date("2026-06-07T00:00:00.000Z");
  let db: MysqlPoolExecutor;
  let authRepository: MysqlAuthRepository;
  let resumeRepository: MysqlResumeRepository;
  let taskRepository: MysqlGenerationTaskRepository;

  beforeAll(() => {
    db = new MysqlPoolExecutor(process.env.DATABASE_URL!);
    authRepository = new MysqlAuthRepository(db, () => now);
    resumeRepository = new MysqlResumeRepository(db, { now: () => now, createId: () => `${prefix}-content` });
    taskRepository = new MysqlGenerationTaskRepository(db, () => now);
  });

  afterAll(async () => {
    await db.execute("delete from generation_tasks where id like ?", [`${prefix}-%`]);
    await db.execute("delete from resume_links where resume_id like ?", [`${prefix}-%`]);
    await db.execute("delete from resume_contents where resume_id like ?", [`${prefix}-%`]);
    await db.execute("delete from resumes where id like ?", [`${prefix}-%`]);
    await db.execute("delete from sessions where user_id like ?", [`${prefix}-%`]);
    await db.execute("delete from password_reset_tokens where user_id like ?", [`${prefix}-%`]);
    await db.execute("delete from email_verification_tokens where user_id like ?", [`${prefix}-%`]);
    await db.execute("delete from users where id like ?", [`${prefix}-%`]);
    await db.close();
  });

  it("writes, reads, updates and cleans up repository records against a real database", async () => {
    const user = await authRepository.createUser({
      id: `${prefix}-user`,
      email: `${prefix}@example.test`,
      passwordHash: "hash",
      status: "active",
    });
    await authRepository.createSession({
      id: `${prefix}-session`,
      userId: user.id,
      sessionTokenHash: `${prefix}-session-hash`,
      expiresAt: new Date("2026-06-08T00:00:00.000Z"),
    });

    const resume = await resumeRepository.createResume({
      id: `${prefix}-resume`,
      userId: user.id,
      title: "Integration Resume",
      status: "generating",
      sourceFileName: "resume.pdf",
      sourceFileType: "pdf",
      sourceFileSize: 1024,
      currentTaskId: `${prefix}-task`,
    });
    const task = await taskRepository.createTask({
      id: `${prefix}-task`,
      userId: user.id,
      resumeId: resume.id,
      fileType: "pdf",
      fileSize: 1024,
      tempFilePath: `/tmp/${prefix}/resume.pdf`,
    });

    await resumeRepository.upsertResumeContent({ resumeId: resume.id, content, layout });
    await resumeRepository.createLink({
      id: `${prefix}-link`,
      resumeId: resume.id,
      slug: `${prefix}-slug`,
      accessMode: "private_link",
      passwordHash: null,
      isActive: true,
    });

    expect(await authRepository.findUserByEmail(user.email)).toMatchObject({ id: user.id, status: "active" });
    expect(await authRepository.findSessionByTokenHash(`${prefix}-session-hash`)).toMatchObject({ userId: user.id });
    expect(await resumeRepository.findResumeById(resume.id)).toMatchObject({ id: resume.id, userId: user.id });
    expect(await resumeRepository.findResumeContent(resume.id)).toMatchObject({ resumeId: resume.id, contentJson: content });
    expect(await resumeRepository.findLinkBySlug(`${prefix}-slug`)).toMatchObject({ resumeId: resume.id, isActive: true });

    const completedTask = await taskRepository.updateTask({ ...task, status: "completed", completedAt: now });
    expect(await taskRepository.findTaskById(task.id)).toMatchObject({ status: "completed", completedAt: completedTask.completedAt });
  });
});

const content: ResumeContent = {
  schemaVersion: 1,
  title: "Integration Resume",
  sections: [
    {
      id: "profile",
      type: "profile",
      title: "Profile",
      visible: true,
      data: { name: "Milu" },
    },
  ],
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
