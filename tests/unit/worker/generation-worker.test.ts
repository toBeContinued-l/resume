import { describe, expect, it, vi } from "vitest";
import { InMemoryResumeRepository } from "@/server/resume/in-memory-resume-repository";
import { ResumeService } from "@/server/resume/resume-service";
import type { ResumeContent, ResumeLayout } from "@/server/resume/types";
import {
  GenerationTaskStatusService,
  InMemoryGenerationQueue,
  InMemoryGenerationTaskRepository,
} from "@/server/queue";
import type { ResumeAiProvider } from "@/types/ai";
import type { ParsedResumeDocument } from "@/types/parser";
import type { TempFileService } from "@/types/temp-files";
import {
  isParsedDocumentEmpty,
  processGenerationTask,
  startGenerationWorker,
  type ResumeParser,
} from "@/worker";

function sampleParsedDocument(overrides: Partial<ParsedResumeDocument> = {}): ParsedResumeDocument {
  return {
    source: {
      fileType: "docx",
      originalFileName: "resume.docx",
      fileSize: 1024,
    },
    plainText: "Milu\nProduct Engineer\nTypeScript",
    semanticHtml: "<p>Milu</p>",
    blocks: [{ id: "block-1", type: "paragraph", text: "Milu" }],
    tables: [],
    assets: [],
    warnings: [],
    ...overrides,
  };
}

function emptyParsedDocument(): ParsedResumeDocument {
  return sampleParsedDocument({
    plainText: "   ",
    semanticHtml: "",
    blocks: [],
    tables: [],
  });
}

function sampleContent(overrides: Partial<ResumeContent> = {}): ResumeContent {
  const base: ResumeContent = {
    schemaVersion: 1,
    title: "Product Engineer Resume",
    sections: [
      {
        id: "profile",
        type: "profile",
        title: "Profile",
        visible: true,
        data: {
          name: "Milu",
          summary: {
            format: "html",
            html: "<p>Builds TypeScript products</p>",
            plainText: "Builds TypeScript products",
          },
        },
      },
    ],
    moduleOrder: ["profile"],
    assets: [],
    confirmationItems: [],
  };
  return { ...base, ...overrides };
}

function sampleLayout(): ResumeLayout {
  return {
    schemaVersion: 1,
    template: "default",
    theme: {
      fontFamily: "system",
      accentColor: "#2357D8",
      density: "comfortable",
    },
    sectionLayout: [{ sectionId: "profile", variant: "standard" }],
  };
}

function createHarness() {
  let resumeId = 0;
  const resumeRepository = new InMemoryResumeRepository({ createId: () => `content-${++resumeId}` });
  const resumeService = new ResumeService(resumeRepository, { createId: () => `resume-${++resumeId}` });
  const taskRepository = new InMemoryGenerationTaskRepository(() => new Date("2026-01-01T00:00:00.000Z"));
  const taskStatus = new GenerationTaskStatusService(taskRepository, () => new Date("2026-01-01T00:00:01.000Z"));
  const queue = new InMemoryGenerationQueue();
  const tempFileService = {
    removeTaskDir: vi.fn(async () => undefined),
  } as Pick<TempFileService, "removeTaskDir">;

  return {
    queue,
    resumeRepository,
    resumeService,
    taskRepository,
    taskStatus,
    tempFileService,
  };
}

describe("generation worker", () => {
  it("parses successfully, enters AI, saves generated content, and completes", async () => {
    const harness = createHarness();
    const resume = await harness.resumeService.createResume({
      userId: "user-1",
      sourceFileName: "resume.docx",
      sourceFileType: "docx",
      sourceFileSize: 1024,
      currentTaskId: "task-1",
    });
    await harness.taskStatus.createTask({
      id: "task-1",
      userId: "user-1",
      resumeId: resume.id,
      fileType: "docx",
      fileSize: 1024,
      tempFilePath: "/tmp/online-resume/uploads/user-1/task-1/original.docx",
    });
    const parser: ResumeParser = {
      parse: vi.fn(async () => sampleParsedDocument()),
    };
    const aiProvider: ResumeAiProvider = {
      generateResume: vi.fn(async () => ({
        resume: sampleContent(),
        layout: sampleLayout(),
        confirmationItems: [
          {
            id: "confirm-1",
            fieldPath: "sections[0].data.summary.plainText",
            message: "Confirm summary",
            status: "pending" as const,
          },
        ],
        aiWarnings: [],
      })),
    };

    const result = await processGenerationTask(
      {
        taskId: "task-1",
        resumeId: resume.id,
        userId: "user-1",
        attempt: 0,
        reason: "initial",
      },
      {
        taskStatus: harness.taskStatus,
        queue: harness.queue,
        parser,
        aiProvider,
        resumeService: harness.resumeService,
        tempFileService: harness.tempFileService,
      },
    );

    const task = await harness.taskRepository.findTaskById("task-1");
    const updatedResume = await harness.resumeRepository.findResumeById(resume.id);
    const savedContent = await harness.resumeRepository.findResumeContent(resume.id);

    expect(result.outcome).toBe("completed");
    expect(parser.parse).toHaveBeenCalledOnce();
    expect(aiProvider.generateResume).toHaveBeenCalledWith(
      expect.objectContaining({
        parsedDocument: expect.objectContaining({ plainText: expect.stringContaining("Milu") }),
        constraints: expect.objectContaining({ noFabrication: true }),
      }),
    );
    expect(task?.status).toBe("completed");
    expect(updatedResume?.status).toBe("draft");
    expect(savedContent?.contentJson.confirmationItems).toHaveLength(1);
    expect(harness.tempFileService.removeTaskDir).toHaveBeenCalledWith({ userId: "user-1", taskId: "task-1" });
  });

  it("drops invalid AI confirmation paths instead of failing the generation", async () => {
    const harness = createHarness();
    const resume = await harness.resumeService.createResume({
      userId: "user-1",
      sourceFileName: "resume.docx",
      sourceFileType: "docx",
      sourceFileSize: 1024,
      currentTaskId: "task-2",
    });
    await harness.taskStatus.createTask({
      id: "task-2",
      userId: "user-1",
      resumeId: resume.id,
      fileType: "docx",
      fileSize: 1024,
      tempFilePath: "/tmp/online-resume/uploads/user-1/task-2/original.docx",
    });
    const parser: ResumeParser = {
      parse: vi.fn(async () => sampleParsedDocument()),
    };
    const aiProvider: ResumeAiProvider = {
      generateResume: vi.fn(async () => ({
        resume: sampleContent(),
        layout: sampleLayout(),
        confirmationItems: [
          {
            id: "confirm-valid",
            fieldPath: "sections[0].data.summary.plainText",
            message: "Confirm summary",
            status: "pending" as const,
          },
          {
            id: "confirm-invalid",
            fieldPath: "sections[9].items[0].dateRange",
            message: "Bad path from AI",
            status: "pending" as const,
          },
        ],
        aiWarnings: [],
      })),
    };

    const result = await processGenerationTask(
      {
        taskId: "task-2",
        resumeId: resume.id,
        userId: "user-1",
        attempt: 0,
        reason: "initial",
      },
      {
        taskStatus: harness.taskStatus,
        queue: harness.queue,
        parser,
        aiProvider,
        resumeService: harness.resumeService,
        tempFileService: harness.tempFileService,
      },
    );

    const savedContent = await harness.resumeRepository.findResumeContent(resume.id);

    expect(result.outcome).toBe("completed");
    expect(savedContent?.contentJson.confirmationItems).toEqual([
      expect.objectContaining({
        id: "confirm-valid",
        fieldPath: "sections[0].data.summary.plainText",
      }),
    ]);
  });

  it("requeues empty parsed content twice before failing and keeping the task retryable", async () => {
    const harness = createHarness();
    await harness.resumeService.createResume({
      userId: "user-1",
      title: "Resume 1",
      sourceFileName: "resume.pdf",
      sourceFileType: "pdf",
      sourceFileSize: 1024,
      currentTaskId: "task-1",
    });
    await harness.taskStatus.createTask({
      id: "task-1",
      userId: "user-1",
      resumeId: "resume-1",
      fileType: "pdf",
      fileSize: 1024,
      tempFilePath: "/tmp/online-resume/uploads/user-1/task-1/original.pdf",
    });
    const parser: ResumeParser = {
      parse: vi.fn(async () => emptyParsedDocument()),
    };
    const aiProvider: ResumeAiProvider = {
      generateResume: vi.fn(async () => {
        throw new Error("AI should not run for empty parsed content.");
      }),
    };

    await startGenerationWorker({
      taskStatus: harness.taskStatus,
      queue: harness.queue,
      parser,
      aiProvider,
      resumeService: harness.resumeService,
      tempFileService: harness.tempFileService,
      maxParseEmptyRetries: 2,
    });
    await harness.queue.publish({
      taskId: "task-1",
      resumeId: "resume-1",
      userId: "user-1",
      attempt: 0,
      reason: "initial",
    });

    const task = await harness.taskRepository.findTaskById("task-1");

    expect(parser.parse).toHaveBeenCalledTimes(3);
    expect(aiProvider.generateResume).not.toHaveBeenCalled();
    expect(harness.queue.publishedMessages.map((message) => message.reason)).toEqual([
      "initial",
      "retry_parse_empty",
      "retry_parse_empty",
    ]);
    expect(task).toMatchObject({
      status: "failed",
      retryCount: 2,
      errorCode: "PARSE_EMPTY",
    });
    const resume = await harness.resumeRepository.findResumeById("resume-1");
    expect(resume?.status).toBe("failed");
    expect(harness.tempFileService.removeTaskDir).not.toHaveBeenCalled();
  });

  it("marks AI failures as failed after recording the error", async () => {
    const harness = createHarness();
    await harness.resumeService.createResume({
      userId: "user-1",
      title: "Resume 1",
      sourceFileName: "resume.docx",
      sourceFileType: "docx",
      sourceFileSize: 1024,
      currentTaskId: "task-1",
    });
    await harness.taskStatus.createTask({
      id: "task-1",
      userId: "user-1",
      resumeId: "resume-1",
      fileType: "docx",
      fileSize: 1024,
      tempFilePath: "/tmp/online-resume/uploads/user-1/task-1/original.docx",
    });
    const parser: ResumeParser = {
      parse: vi.fn(async () => sampleParsedDocument()),
    };
    const aiProvider: ResumeAiProvider = {
      generateResume: vi.fn(async () => {
        throw new Error("AI provider unavailable");
      }),
    };

    const result = await processGenerationTask(
      {
        taskId: "task-1",
        resumeId: "resume-1",
        userId: "user-1",
        attempt: 0,
        reason: "initial",
      },
      {
        taskStatus: harness.taskStatus,
        queue: harness.queue,
        parser,
        aiProvider,
        resumeService: harness.resumeService,
        tempFileService: harness.tempFileService,
      },
    );

    const task = await harness.taskRepository.findTaskById("task-1");
    const resume = await harness.resumeRepository.findResumeById("resume-1");

    expect(result.outcome).toBe("failed");
    expect(task).toMatchObject({
      status: "failed",
      errorCode: "AI_ERROR",
      errorMessage: "AI provider unavailable",
    });
    expect(resume?.status).toBe("failed");
    expect(harness.tempFileService.removeTaskDir).not.toHaveBeenCalled();
  });

  it("detects empty parsed documents from text, blocks, and tables", () => {
    expect(isParsedDocumentEmpty(emptyParsedDocument())).toBe(true);
    expect(isParsedDocumentEmpty(sampleParsedDocument({ plainText: "", blocks: [{ id: "b", type: "paragraph", text: "x" }] }))).toBe(false);
    expect(
      isParsedDocumentEmpty(
        sampleParsedDocument({
          plainText: "",
          blocks: [],
          tables: [{ id: "t", rows: [[{ text: "cell" }]] }],
        }),
      ),
    ).toBe(false);
  });
});
