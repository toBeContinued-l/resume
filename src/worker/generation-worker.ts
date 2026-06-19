import type { ResumeAiProvider, ResumeAiOutput } from "@/types/ai";
import type { ParsedResumeDocument } from "@/types/parser";
import {
  generationTaskMessageSchema,
  type GenerationQueue,
  type GenerationTaskMessage,
} from "@/types/queue";
import type { ResumeService } from "@/server/resume/resume-service";
import type { TempFileService } from "@/types/temp-files";
import type { GenerationTaskStatusService } from "@/server/queue/status-service";
import type { GenerationTaskRecord } from "@/server/queue/types";

export type ResumeParser = {
  parse(input: {
    task: GenerationTaskRecord;
    message: GenerationTaskMessage;
  }): Promise<ParsedResumeDocument>;
};

export type GenerationWorkerDependencies = {
  taskStatus: GenerationTaskStatusService;
  queue: GenerationQueue;
  parser: ResumeParser;
  aiProvider: ResumeAiProvider;
  resumeService: Pick<ResumeService, "markGenerationStatus" | "saveGeneratedContent">;
  tempFileService?: Pick<TempFileService, "removeTaskDir">;
  maxParseEmptyRetries?: number;
};

export type GenerationWorkerResult =
  | { outcome: "completed"; task: GenerationTaskRecord }
  | { outcome: "retry_scheduled"; task: GenerationTaskRecord; message: GenerationTaskMessage }
  | { outcome: "failed"; task: GenerationTaskRecord }
  | { outcome: "cancelled"; task: GenerationTaskRecord };

export async function startGenerationWorker(dependencies: GenerationWorkerDependencies): Promise<void> {
  await dependencies.queue.consume(async (message) => {
    await processGenerationTask(message, dependencies);
  });
}

export async function processGenerationTask(
  rawMessage: GenerationTaskMessage,
  dependencies: GenerationWorkerDependencies,
): Promise<GenerationWorkerResult> {
  const message = generationTaskMessageSchema.parse(rawMessage);
  let task = await dependencies.taskStatus.requireTask(message.taskId);
  if (task.status === "cancelled") {
    return { outcome: "cancelled", task };
  }
  if (task.status !== "pending") {
    return { outcome: "failed", task };
  }
  if (task.userId !== message.userId || task.resumeId !== message.resumeId) {
    task = await dependencies.taskStatus.markFailed({
      taskId: task.id,
      errorCode: "MESSAGE_MISMATCH",
      errorMessage: "Generation task message does not match the stored task.",
    });
    await markResumeFailed(task, dependencies);
    return { outcome: "failed", task };
  }

  task = await dependencies.taskStatus.markParsing(task.id);
  let parsedDocument: ParsedResumeDocument;
  try {
    parsedDocument = await dependencies.parser.parse({ task, message });
  } catch (error) {
    const latestTask = await dependencies.taskStatus.requireTask(task.id);
    if (latestTask.status === "cancelled") {
      return { outcome: "cancelled", task: latestTask };
    }
    task = await dependencies.taskStatus.markFailed({
      taskId: task.id,
      errorCode: "PARSE_ERROR",
      errorMessage: getErrorMessage(error),
    });
    await markResumeFailed(task, dependencies);
    return { outcome: "failed", task };
  }

  task = await dependencies.taskStatus.requireTask(task.id);
  if (task.status === "cancelled") {
    await cleanTaskFiles(task, dependencies);
    return { outcome: "cancelled", task };
  }

  if (isParsedDocumentEmpty(parsedDocument)) {
    return retryOrFailEmptyParse(task, message, dependencies);
  }

  task = await dependencies.taskStatus.markAiProcessing(task.id);
  try {
    const aiOutput = await dependencies.aiProvider.generateResume({
      parsedDocument,
      constraints: {
        noFabrication: true,
        markUncertainContent: true,
        fixedTemplateOnly: true,
        preserveParsedImagesAndTables: true,
      },
    });
    const latestTask = await dependencies.taskStatus.requireTask(task.id);
    if (latestTask.status === "cancelled") {
      await cleanTaskFiles(latestTask, dependencies);
      return { outcome: "cancelled", task: latestTask };
    }
    await dependencies.resumeService.saveGeneratedContent({
      userId: task.userId,
      resumeId: task.resumeId,
      content: mergeAiConfirmationItems(aiOutput),
      layout: aiOutput.layout,
    });
  } catch (error) {
    const latestTask = await dependencies.taskStatus.requireTask(task.id);
    if (latestTask.status === "cancelled") {
      await cleanTaskFiles(latestTask, dependencies);
      return { outcome: "cancelled", task: latestTask };
    }
    task = await dependencies.taskStatus.markFailed({
      taskId: task.id,
      errorCode: "AI_ERROR",
      errorMessage: getErrorMessage(error),
    });
    await markResumeFailed(task, dependencies);
    return { outcome: "failed", task };
  }

  task = await dependencies.taskStatus.requireTask(task.id);
  if (task.status === "cancelled") {
    await cleanTaskFiles(task, dependencies);
    return { outcome: "cancelled", task };
  }

  await cleanTaskFiles(task, dependencies);
  const completed = await dependencies.taskStatus.markCompleted(task.id);
  return { outcome: "completed", task: completed };
}

function mergeAiConfirmationItems(output: ResumeAiOutput): ResumeAiOutput["resume"] {
  const confirmationItems = output.confirmationItems.filter((item) => pathExists(output.resume, item.fieldPath));
  return {
    ...output.resume,
    confirmationItems,
  };
}

function pathExists(root: unknown, path: string): boolean {
  const normalized = path.replace(/\[(\d+)\]/g, ".$1");
  const parts = normalized.split(".").filter(Boolean);
  let current: unknown = root;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return false;
    }
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return false;
      }
      current = current[index];
      continue;
    }
    if (typeof current !== "object" || !(part in current)) {
      return false;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return true;
}

async function retryOrFailEmptyParse(
  task: GenerationTaskRecord,
  message: GenerationTaskMessage,
  dependencies: GenerationWorkerDependencies,
): Promise<GenerationWorkerResult> {
  const maxRetries = dependencies.maxParseEmptyRetries ?? 2;
  if (task.retryCount < maxRetries) {
    await dependencies.taskStatus.incrementRetryCount(task.id);
    const retried = await dependencies.taskStatus.markPending(task.id);
    const retryMessage: GenerationTaskMessage = {
      ...message,
      attempt: message.attempt + 1,
      reason: "retry_parse_empty",
    };
    await dependencies.queue.publish(retryMessage);
    return { outcome: "retry_scheduled", task: retried, message: retryMessage };
  }

  const failed = await dependencies.taskStatus.markFailed({
    taskId: task.id,
    errorCode: "PARSE_EMPTY",
    errorMessage: "No readable resume content was parsed from the uploaded file.",
  });
  await markResumeFailed(failed, dependencies);
  return { outcome: "failed", task: failed };
}

async function markResumeFailed(
  task: GenerationTaskRecord,
  dependencies: GenerationWorkerDependencies,
): Promise<void> {
  await dependencies.resumeService.markGenerationStatus({
    userId: task.userId,
    resumeId: task.resumeId,
    status: "failed",
  });
}

async function cleanTaskFiles(
  task: GenerationTaskRecord,
  dependencies: GenerationWorkerDependencies,
): Promise<void> {
  await dependencies.tempFileService?.removeTaskDir({
    userId: task.userId,
    taskId: task.id,
  });
}

export function isParsedDocumentEmpty(document: ParsedResumeDocument): boolean {
  if (document.plainText.trim().length > 0) {
    return false;
  }
  if (document.blocks.some((block) => block.text?.trim())) {
    return false;
  }
  return !document.tables.some((table) =>
    table.rows.some((row) => row.some((cell) => cell.text.trim().length > 0)),
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Generation task failed.";
}
