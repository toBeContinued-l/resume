import { randomUUID } from "crypto";
import path from "path";
import type { GenerationQueue } from "@/types/queue";
import type { TempFileService } from "@/types/temp-files";
import type { GenerationTaskStatusService } from "../queue/status-service";
import type { GenerationTaskRepository } from "../queue/types";
import type { ResumeRepository, SourceFileType } from "../resume/types";
import type { ResumeService } from "../resume/resume-service";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const RESUME_LIMIT = 3;

const MIME_BY_EXTENSION: Record<SourceFileType, Set<string>> = {
  doc: new Set(["application/msword"]),
  docx: new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]),
  pdf: new Set(["application/pdf"]),
};

export type UploadFileInput = {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type UploadResumeResult = {
  resumeId: string;
  taskId: string;
  status: "pending";
};

export type UploadResumeErrorCode =
  | "UNAUTHENTICATED"
  | "VALIDATION_ERROR"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "RESUME_LIMIT_REACHED"
  | "GENERATION_FAILED";

export class UploadResumeError extends Error {
  constructor(
    readonly code: UploadResumeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UploadResumeError";
  }
}

export type UploadResumeServiceOptions = {
  createId?: () => string;
};

export class UploadResumeService {
  private readonly createId: () => string;

  constructor(
    private readonly resumeService: ResumeService,
    private readonly resumeRepository: ResumeRepository,
    private readonly taskService: GenerationTaskStatusService,
    private readonly taskRepository: GenerationTaskRepository,
    private readonly tempFileService: TempFileService,
    private readonly queue: GenerationQueue,
    options: UploadResumeServiceOptions = {},
  ) {
    this.createId = options.createId ?? (() => randomUUID());
  }

  async upload(input: { userId: string; file: UploadFileInput | null }): Promise<UploadResumeResult> {
    if (!input.userId) {
      throw new UploadResumeError("UNAUTHENTICATED", "Authentication is required.");
    }
    if (!input.file) {
      throw new UploadResumeError("VALIDATION_ERROR", "A single resume file is required.");
    }

    const fileType = assertAllowedFile(input.file);
    const activeCount = await this.resumeService.countActiveResumes(input.userId);
    if (activeCount >= RESUME_LIMIT) {
      throw new UploadResumeError("RESUME_LIMIT_REACHED", "You can keep up to 3 active resumes.");
    }

    const taskId = this.createId();
    let resumeId: string | null = null;
    let taskCreated = false;

    try {
      const taskDir = await this.tempFileService.createTaskDir({ userId: input.userId, taskId });
      const content = Buffer.from(await input.file.arrayBuffer());
      const tempFile = await this.tempFileService.saveOriginal({
        taskDir,
        fileName: safeServerFileName(input.file.name, fileType),
        content,
      });

      const resume = await this.resumeService.createResume({
        userId: input.userId,
        title: titleFromFileName(input.file.name),
        sourceFileName: input.file.name,
        sourceFileType: fileType,
        sourceFileSize: input.file.size,
        currentTaskId: taskId,
      });
      resumeId = resume.id;

      await this.taskService.createTask({
        id: taskId,
        userId: input.userId,
        resumeId: resume.id,
        fileType,
        fileSize: input.file.size,
        tempFilePath: tempFile.path,
      });
      taskCreated = true;

      await this.queue.publish({
        taskId,
        resumeId: resume.id,
        userId: input.userId,
        attempt: 0,
        reason: "initial",
      });

      return { resumeId: resume.id, taskId, status: "pending" };
    } catch (error) {
      await this.rollback({ userId: input.userId, taskId, resumeId, taskCreated });
      if (error instanceof UploadResumeError) {
        throw error;
      }
      throw new UploadResumeError("GENERATION_FAILED", "Upload failed before the generation task could be queued.");
    }
  }

  private async rollback(input: {
    userId: string;
    taskId: string;
    resumeId: string | null;
    taskCreated: boolean;
  }): Promise<void> {
    await Promise.allSettled([
      this.tempFileService.removeTaskDir({ userId: input.userId, taskId: input.taskId }),
      input.resumeId ? this.resumeRepository.deleteResume(input.resumeId) : Promise.resolve(),
      input.taskCreated ? this.taskRepository.deleteTask(input.taskId) : Promise.resolve(),
    ]);
  }
}

export function assertAllowedFile(file: Pick<UploadFileInput, "name" | "type" | "size">): SourceFileType {
  if (file.size <= 0) {
    throw new UploadResumeError("VALIDATION_ERROR", "Resume file cannot be empty.");
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new UploadResumeError("FILE_TOO_LARGE", "Resume file must be 15MB or smaller.");
  }

  const extension = path.extname(file.name).toLowerCase().slice(1);
  if (!isSourceFileType(extension)) {
    throw new UploadResumeError("UNSUPPORTED_FILE_TYPE", "Only .doc, .docx, and .pdf files are supported.");
  }

  const allowedMimes = MIME_BY_EXTENSION[extension];
  if (!allowedMimes.has(file.type)) {
    throw new UploadResumeError("UNSUPPORTED_FILE_TYPE", "File extension and MIME type do not match.");
  }
  return extension;
}

function isSourceFileType(value: string): value is SourceFileType {
  return value === "doc" || value === "docx" || value === "pdf";
}

function safeServerFileName(originalFileName: string, fileType: SourceFileType): string {
  return `${randomUUID()}.${fileType}`;
}

function titleFromFileName(fileName: string): string {
  return path.basename(fileName, path.extname(fileName)).trim() || "Untitled resume";
}
