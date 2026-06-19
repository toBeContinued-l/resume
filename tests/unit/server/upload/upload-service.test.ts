import { describe, expect, it, vi } from "vitest";
import { InMemoryGenerationTaskRepository } from "@/server/queue/generation-task-store";
import { InMemoryGenerationQueue } from "@/server/queue/in-memory-queue";
import { GenerationTaskStatusService } from "@/server/queue/status-service";
import { InMemoryResumeRepository } from "@/server/resume/in-memory-resume-repository";
import { ResumeService } from "@/server/resume/resume-service";
import { UploadResumeError, UploadResumeService, assertAllowedFile } from "@/server/upload/upload-service";
import type { TempFileRef, TempFileService } from "@/types/temp-files";

function file(name: string, type: string, content = "hello") {
  const buffer = Buffer.from(content);
  return {
    name,
    type,
    size: buffer.length,
    async arrayBuffer() {
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    },
  };
}

function createFixture() {
  const resumeRepository = new InMemoryResumeRepository({ createId: () => "content-id" });
  const resumeService = new ResumeService(resumeRepository, { createId: () => "resume-id" });
  const taskRepository = new InMemoryGenerationTaskRepository();
  const taskService = new GenerationTaskStatusService(taskRepository);
  const queue = new InMemoryGenerationQueue();
  const tempFileService: TempFileService = {
    createTaskDir: vi.fn(async () => "/tmp/task"),
    saveOriginal: vi.fn(async (): Promise<TempFileRef> => ({
      taskDir: "/tmp/task",
      path: "/tmp/task/original.pdf",
      originalFileName: "resume.pdf",
      fileSize: 5,
    })),
    getTaskDir: vi.fn(() => "/tmp/task"),
    getAssetsDir: vi.fn(async () => "/tmp/task/assets"),
    saveConvertedDocx: vi.fn(async (): Promise<TempFileRef> => ({
      taskDir: "/tmp/task",
      path: "/tmp/task/converted.docx",
      originalFileName: "converted.docx",
      fileSize: 5,
    })),
    saveAsset: vi.fn(async (): Promise<TempFileRef> => ({
      taskDir: "/tmp/task",
      path: "/tmp/task/assets/image.png",
      originalFileName: "image.png",
      fileSize: 5,
    })),
    removeTaskDir: vi.fn(async () => undefined),
  };
  const service = new UploadResumeService(
    resumeService,
    resumeRepository,
    taskService,
    taskRepository,
    tempFileService,
    queue,
    { createId: () => "task-id" },
  );
  return { queue, resumeRepository, service, taskRepository, tempFileService };
}

describe("UploadResumeService", () => {
  it("validates extension and MIME together", () => {
    expect(() => assertAllowedFile({ name: "resume.pdf", type: "application/msword", size: 10 })).toThrow(UploadResumeError);
    expect(assertAllowedFile({ name: "resume.pdf", type: "application/pdf", size: 10 })).toBe("pdf");
  });

  it("creates resume, task, temp file and queue message", async () => {
    const fixture = createFixture();
    const result = await fixture.service.upload({ userId: "user-1", file: file("resume.pdf", "application/pdf") });

    expect(result).toEqual({ resumeId: "resume-id", taskId: "task-id", status: "pending" });
    expect(fixture.resumeRepository.resumes.has("resume-id")).toBe(true);
    expect(await fixture.taskRepository.findTaskById("task-id")).not.toBeNull();
    expect(fixture.queue.publishedMessages).toHaveLength(1);
  });

  it("rolls back visible records when queue publish fails", async () => {
    const fixture = createFixture();
    vi.spyOn(fixture.queue, "publish").mockRejectedValueOnce(new Error("queue down"));

    await expect(fixture.service.upload({ userId: "user-1", file: file("resume.pdf", "application/pdf") })).rejects.toThrow(UploadResumeError);
    expect(await fixture.resumeRepository.findResumeById("resume-id")).toMatchObject({ isDeleted: true, status: "deleted" });
    expect(await fixture.taskRepository.findTaskById("task-id")).toBeNull();
    expect(fixture.tempFileService.removeTaskDir).toHaveBeenCalledWith({ userId: "user-1", taskId: "task-id" });
  });

  it("rejects upload when the user already has 3 active resumes", async () => {
    const fixture = createFixture();
    for (let index = 0; index < 3; index += 1) {
      await fixture.resumeRepository.createResume({
        id: `resume-${index}`,
        userId: "user-1",
        title: `Resume ${index}`,
        status: "draft",
        sourceFileName: "resume.pdf",
        sourceFileType: "pdf",
        sourceFileSize: 10,
        currentTaskId: null,
      });
    }

    await expect(fixture.service.upload({ userId: "user-1", file: file("resume.pdf", "application/pdf") })).rejects.toMatchObject({
      code: "RESUME_LIMIT_REACHED",
    });
  });
});
