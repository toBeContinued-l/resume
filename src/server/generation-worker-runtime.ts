import { MockResumeAiProvider, OpenAiResumeAiProvider, ResumeAiService } from "./ai";
import { MysqlPoolExecutor } from "./db/mysql-client";
import { ParserService } from "./parser";
import { InMemoryGenerationTaskRepository } from "./queue/generation-task-store";
import { InMemoryGenerationQueue } from "./queue/in-memory-queue";
import { MysqlGenerationTaskRepository } from "./queue/mysql-generation-task-repository";
import { RabbitGenerationQueue } from "./queue/rabbitmq-queue";
import { GenerationTaskStatusService } from "./queue/status-service";
import { InMemoryResumeRepository } from "./resume/in-memory-resume-repository";
import { MysqlResumeRepository } from "./resume/mysql-resume-repository";
import { ResumeService } from "./resume/resume-service";
import { LocalTempFileService } from "./temp-files";
import { startGenerationWorker } from "@/worker";

export function ensureGenerationWorkerStarted(): Promise<void> | null {
  if (!shouldStartGenerationWorker()) {
    return null;
  }
  globalWorkerState.__resumeGenerationWorkerPromise ??= startGenerationWorker(createGenerationWorkerDependencies()).catch(
    (error: unknown) => {
      globalWorkerState.__resumeGenerationWorkerPromise = null;
      console.error("Generation worker failed to start.", error);
      throw error;
    },
  );
  return globalWorkerState.__resumeGenerationWorkerPromise;
}

export function resetGenerationWorkerForTest(): void {
  globalWorkerState.__resumeGenerationWorkerPromise = null;
}

function createGenerationWorkerDependencies() {
  const mysqlExecutor = process.env.DATABASE_URL ? new MysqlPoolExecutor(process.env.DATABASE_URL) : null;
  const resumeRepository = mysqlExecutor ? new MysqlResumeRepository(mysqlExecutor) : new InMemoryResumeRepository();
  const generationTaskRepository = mysqlExecutor
    ? new MysqlGenerationTaskRepository(mysqlExecutor)
    : new InMemoryGenerationTaskRepository();
  const generationQueue = process.env.RABBITMQ_URL
    ? new RabbitGenerationQueue({ url: process.env.RABBITMQ_URL, prefetch: Number(process.env.RABBITMQ_PREFETCH ?? 1) })
    : new InMemoryGenerationQueue();

  return {
    taskStatus: new GenerationTaskStatusService(generationTaskRepository),
    queue: generationQueue,
    parser: new ParserService(),
    aiProvider: new ResumeAiService(hasAiApiKey() ? new OpenAiResumeAiProvider() : new MockResumeAiProvider()),
    resumeService: new ResumeService(resumeRepository),
    tempFileService: new LocalTempFileService(),
  };
}

function hasAiApiKey(): boolean {
  return Boolean(process.env.DOUBAO_API_KEY?.trim() || process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
}

function shouldStartGenerationWorker(): boolean {
  if (process.env.ENABLE_GENERATION_WORKER === "0") {
    return false;
  }
  return process.env.NODE_ENV !== "test" || process.env.ENABLE_GENERATION_WORKER === "1";
}

const globalWorkerState = globalThis as typeof globalThis & {
  __resumeGenerationWorkerPromise?: Promise<void> | null;
};
