import type { SourceFileType } from "@/server/resume/types";
import type { GenerationTaskStatus } from "@/types/queue";

export type GenerationTaskRecord = {
  id: string;
  userId: string;
  resumeId: string;
  fileType: SourceFileType;
  fileSize: number;
  tempFilePath: string;
  status: GenerationTaskStatus;
  retryCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  isDeleted: boolean;
  deletedAt: Date | null;
};

export type CreateGenerationTaskInput = {
  id: string;
  userId: string;
  resumeId: string;
  fileType: SourceFileType;
  fileSize: number;
  tempFilePath: string;
};

export type PublicGenerationTaskStatus = Exclude<GenerationTaskStatus, "cleaned">;

export type GenerationTaskProgress = {
  taskId: string;
  resumeId: string;
  status: PublicGenerationTaskStatus;
  retryCount: number;
  message: string;
  stageIndex: number;
  stageCount: number;
  progressPercent: number;
  canCancel: boolean;
  canRetry: boolean;
  errorMessage?: string;
};

export type GenerationTaskErrorCode = "TASK_NOT_FOUND" | "FORBIDDEN" | "INVALID_STATUS" | "INVALID_STATE";

export class GenerationTaskError extends Error {
  constructor(
    readonly code: GenerationTaskErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GenerationTaskError";
  }
}

export interface GenerationTaskRepository {
  createTask(input: CreateGenerationTaskInput): Promise<GenerationTaskRecord>;
  findTaskById(taskId: string): Promise<GenerationTaskRecord | null>;
  updateTask(task: GenerationTaskRecord): Promise<GenerationTaskRecord>;
  deleteTask(taskId: string): Promise<void>;
}
