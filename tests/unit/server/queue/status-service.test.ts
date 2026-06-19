import { describe, expect, it } from "vitest";
import { GenerationTaskError, GenerationTaskStatusService, InMemoryGenerationTaskRepository } from "@/server/queue";

function createHarness() {
  let now = new Date("2026-01-01T00:00:00.000Z");
  const repository = new InMemoryGenerationTaskRepository(() => now);
  const service = new GenerationTaskStatusService(repository, () => now);
  return {
    repository,
    service,
    tick: () => {
      now = new Date(now.getTime() + 1_000);
    },
  };
}

describe("GenerationTaskStatusService", () => {
  it("creates a pending task and returns localized progress copy", async () => {
    const { service } = createHarness();
    await service.createTask({
      id: "task-1",
      userId: "user-1",
      resumeId: "resume-1",
      fileType: "docx",
      fileSize: 1024,
      tempFilePath: "/tmp/online-resume/uploads/user-1/task-1/original.docx",
    });

    const progress = await service.getProgressForUser("user-1", "task-1");

    expect(progress).toMatchObject({
      taskId: "task-1",
      resumeId: "resume-1",
      status: "pending",
      retryCount: 0,
      message: "已提交，正在排队准备处理",
      stageIndex: 1,
      stageCount: 4,
      progressPercent: 15,
      canCancel: true,
      canRetry: false,
    });
  });

  it("updates status, retry count, and terminal error state", async () => {
    const { service, repository, tick } = createHarness();
    await service.createTask({
      id: "task-1",
      userId: "user-1",
      resumeId: "resume-1",
      fileType: "pdf",
      fileSize: 2048,
      tempFilePath: "/tmp/online-resume/uploads/user-1/task-1/original.pdf",
    });

    tick();
    await service.markParsing("task-1");
    await service.incrementRetryCount("task-1");
    await service.markFailed({
      taskId: "task-1",
      errorCode: "PARSE_EMPTY",
      errorMessage: "No content",
    });
    await service.markCleaned("task-1");

    const task = await repository.findTaskById("task-1");
    const progress = await service.getProgressForUser("user-1", "task-1");

    expect(task).toMatchObject({
      status: "cleaned",
      retryCount: 1,
      errorCode: "PARSE_EMPTY",
      errorMessage: "No content",
    });
    expect(task?.completedAt).toBeInstanceOf(Date);
    expect(progress.status).toBe("failed");
    expect(progress.message).toBe("生成失败，可以重试或重新上传");
    expect(progress.canRetry).toBe(false);
  });

  it("retries failed tasks and marks cancellable tasks as cancelled", async () => {
    const { service, repository } = createHarness();
    const publishedMessages: unknown[] = [];
    await service.createTask({
      id: "task-1",
      userId: "user-1",
      resumeId: "resume-1",
      fileType: "pdf",
      fileSize: 2048,
      tempFilePath: "/tmp/online-resume/uploads/user-1/task-1/original.pdf",
    });

    await service.markFailed({
      taskId: "task-1",
      errorCode: "AI_ERROR",
      errorMessage: "AI unavailable",
    });
    const retried = await service.retryTaskForUser("user-1", "task-1", {
      publish: async (message) => {
        publishedMessages.push(message);
      },
      consume: async () => undefined,
    });

    expect(retried).toMatchObject({
      status: "pending",
      retryCount: 1,
      canCancel: true,
      canRetry: false,
    });
    expect(publishedMessages).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        reason: "user_retry",
        attempt: 1,
      }),
    ]);

    const cancelled = await service.cancelTaskForUser("user-1", "task-1");
    const task = await repository.findTaskById("task-1");
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.canCancel).toBe(false);
    expect(task?.status).toBe("cancelled");
  });

  it("enforces task ownership for progress queries", async () => {
    const { service } = createHarness();
    await service.createTask({
      id: "task-1",
      userId: "user-1",
      resumeId: "resume-1",
      fileType: "doc",
      fileSize: 512,
      tempFilePath: "/tmp/online-resume/uploads/user-1/task-1/original.doc",
    });

    await expect(service.getProgressForUser("user-2", "task-1")).rejects.toBeInstanceOf(GenerationTaskError);
    await expect(service.getProgressForUser("user-2", "task-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
