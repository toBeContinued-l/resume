import {
  generationProgressCopy,
  generationTaskStatusSchema,
  type GenerationTaskStatus,
  type GenerationTaskMessage,
  type GenerationQueue,
} from "@/types/queue";
import type {
  CreateGenerationTaskInput,
  GenerationTaskProgress,
  GenerationTaskRecord,
  GenerationTaskRepository,
  PublicGenerationTaskStatus,
} from "./types";
import { GenerationTaskError } from "./types";

export class GenerationTaskStatusService {
  constructor(
    private readonly repository: GenerationTaskRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createTask(input: CreateGenerationTaskInput): Promise<GenerationTaskRecord> {
    return this.repository.createTask(input);
  }

  async requireTask(taskId: string): Promise<GenerationTaskRecord> {
    const task = await this.repository.findTaskById(taskId);
    if (!task) {
      throw new GenerationTaskError("TASK_NOT_FOUND", "Generation task does not exist.");
    }
    return task;
  }

  async getProgressForUser(userId: string, taskId: string): Promise<GenerationTaskProgress> {
    const task = await this.requireTaskForUser(userId, taskId);
    return toGenerationTaskProgress(task);
  }

  async requireTaskForUser(userId: string, taskId: string): Promise<GenerationTaskRecord> {
    return this.requireOwnedTask(userId, taskId);
  }

  async markPending(taskId: string): Promise<GenerationTaskRecord> {
    return this.updateStatus(taskId, "pending", { clearError: true });
  }

  async markParsing(taskId: string): Promise<GenerationTaskRecord> {
    return this.updateStatus(taskId, "parsing", { clearError: true });
  }

  async markAiProcessing(taskId: string): Promise<GenerationTaskRecord> {
    return this.updateStatus(taskId, "ai_processing", { clearError: true });
  }

  async markCompleted(taskId: string): Promise<GenerationTaskRecord> {
    return this.updateStatus(taskId, "completed", { completedAt: this.now(), clearError: true });
  }

  async markFailed(input: {
    taskId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<GenerationTaskRecord> {
    return this.updateStatus(input.taskId, "failed", {
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    });
  }

  async markCancelled(input: { taskId: string; errorMessage?: string }): Promise<GenerationTaskRecord> {
    return this.updateStatus(input.taskId, "cancelled", {
      errorCode: "USER_CANCELLED",
      errorMessage: input.errorMessage ?? "Generation was cancelled by the user.",
      completedAt: this.now(),
    });
  }

  async markCleaned(taskId: string): Promise<GenerationTaskRecord> {
    return this.updateStatus(taskId, "cleaned", { completedAt: this.now() });
  }

  async cancelTaskForUser(userId: string, taskId: string): Promise<GenerationTaskProgress> {
    const task = await this.requireOwnedTask(userId, taskId);
    if (!canCancelStatus(task.status)) {
      throw new GenerationTaskError("INVALID_STATE", "Only queued or running generation tasks can be cancelled.");
    }
    const cancelled = await this.markCancelled({
      taskId: task.id,
      errorMessage: "用户已终止本次生成。",
    });
    return toGenerationTaskProgress(cancelled);
  }

  async retryTaskForUser(
    userId: string,
    taskId: string,
    queue: GenerationQueue,
    options: { beforePublish?: (task: GenerationTaskRecord) => Promise<void> } = {},
  ): Promise<GenerationTaskProgress> {
    const task = await this.requireOwnedTask(userId, taskId);
    if (!canRetryStatus(task.status)) {
      throw new GenerationTaskError("INVALID_STATE", "Only failed generation tasks can be retried.");
    }

    const retried = await this.repository.updateTask({
      ...task,
      status: "pending",
      retryCount: task.retryCount + 1,
      errorCode: null,
      errorMessage: null,
      completedAt: null,
    });
    const message: GenerationTaskMessage = {
      taskId: retried.id,
      resumeId: retried.resumeId,
      userId: retried.userId,
      attempt: retried.retryCount,
      reason: "user_retry",
    };
    await options.beforePublish?.(retried);
    await queue.publish(message);
    return toGenerationTaskProgress(retried);
  }

  async incrementRetryCount(taskId: string): Promise<GenerationTaskRecord> {
    const task = await this.requireTask(taskId);
    return this.repository.updateTask({
      ...task,
      retryCount: task.retryCount + 1,
    });
  }

  private async updateStatus(
    taskId: string,
    status: GenerationTaskStatus,
    options: {
      errorCode?: string | null;
      errorMessage?: string | null;
      completedAt?: Date | null;
      clearError?: boolean;
    } = {},
  ): Promise<GenerationTaskRecord> {
    const parsed = generationTaskStatusSchema.safeParse(status);
    if (!parsed.success) {
      throw new GenerationTaskError("INVALID_STATUS", "Unsupported generation task status.");
    }
    const task = await this.requireTask(taskId);
    return this.repository.updateTask({
      ...task,
      status,
      errorCode: options.clearError ? null : options.errorCode ?? task.errorCode,
      errorMessage: options.clearError ? null : options.errorMessage ?? task.errorMessage,
      completedAt: options.completedAt ?? task.completedAt,
    });
  }

  private async requireOwnedTask(userId: string, taskId: string): Promise<GenerationTaskRecord> {
    const task = await this.requireTask(taskId);
    if (task.userId !== userId) {
      throw new GenerationTaskError("FORBIDDEN", "Generation task is owned by another user.");
    }
    return task;
  }
}

export function toGenerationTaskProgress(task: GenerationTaskRecord): GenerationTaskProgress {
  const status = toPublicStatus(task.status);
  const stage = progressStage(status);
  return {
    taskId: task.id,
    resumeId: task.resumeId,
    status,
    retryCount: task.retryCount,
    message: generationProgressCopy[status],
    stageIndex: stage.stageIndex,
    stageCount: stage.stageCount,
    progressPercent: stage.progressPercent,
    canCancel: canCancelStatus(task.status),
    canRetry: canRetryStatus(task.status),
    ...(task.errorMessage ? { errorMessage: task.errorMessage } : {}),
  };
}

export function toPublicStatus(status: GenerationTaskStatus): PublicGenerationTaskStatus {
  return status === "cleaned" ? "failed" : status;
}

function progressStage(status: PublicGenerationTaskStatus): {
  stageIndex: number;
  stageCount: number;
  progressPercent: number;
} {
  const stageCount = 4;
  switch (status) {
    case "pending":
      return { stageIndex: 1, stageCount, progressPercent: 15 };
    case "parsing":
      return { stageIndex: 2, stageCount, progressPercent: 45 };
    case "ai_processing":
      return { stageIndex: 3, stageCount, progressPercent: 75 };
    case "completed":
      return { stageIndex: 4, stageCount, progressPercent: 100 };
    case "failed":
      return { stageIndex: 0, stageCount, progressPercent: 100 };
    case "cancelled":
      return { stageIndex: 0, stageCount, progressPercent: 100 };
  }
}

function canCancelStatus(status: GenerationTaskStatus): boolean {
  return status === "pending" || status === "parsing" || status === "ai_processing";
}

function canRetryStatus(status: GenerationTaskStatus): boolean {
  return status === "failed";
}
