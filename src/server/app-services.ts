import { AuthService } from "./auth/auth-service";
import { createEmailVerificationCodeStoreFromEnv } from "./auth/email-verification-code-store";
import { InMemoryAuthRepository } from "./auth/in-memory-auth-repository";
import { MysqlAuthRepository } from "./auth/mysql-auth-repository";
import { ScryptPasswordHasher } from "./auth/password";
import { ResumeLinkService } from "./links/resume-link-service";
import { createMailProviderFromEnv } from "./mail/provider";
import { MockResumeAiProvider, OpenAiResumeAiProvider, ResumeAiService } from "./ai";
import { MysqlPoolExecutor } from "./db/mysql-client";
import { ParserService } from "./parser";
import { getSharedRateLimiter } from "./rate-limit";
import { InMemoryGenerationTaskRepository } from "./queue/generation-task-store";
import { InMemoryGenerationQueue } from "./queue/in-memory-queue";
import { MysqlGenerationTaskRepository } from "./queue/mysql-generation-task-repository";
import { RabbitGenerationQueue } from "./queue/rabbitmq-queue";
import { GenerationTaskStatusService } from "./queue/status-service";
import { InMemoryResumeRepository } from "./resume/in-memory-resume-repository";
import { MysqlResumeRepository } from "./resume/mysql-resume-repository";
import { ResumeService } from "./resume/resume-service";
import { LocalTempFileService } from "./temp-files";
import { UploadResumeService } from "./upload/upload-service";

export type AppServices = ReturnType<typeof createAppServices>;

export function createAppServices() {
  const mysqlExecutor = process.env.DATABASE_URL ? new MysqlPoolExecutor(process.env.DATABASE_URL) : null;
  const authRepository = mysqlExecutor ? new MysqlAuthRepository(mysqlExecutor) : new InMemoryAuthRepository();
  const resumeRepository = mysqlExecutor ? new MysqlResumeRepository(mysqlExecutor) : new InMemoryResumeRepository();
  const generationTaskRepository = mysqlExecutor
    ? new MysqlGenerationTaskRepository(mysqlExecutor)
    : new InMemoryGenerationTaskRepository();
  const generationQueue = process.env.RABBITMQ_URL
    ? new RabbitGenerationQueue({ url: process.env.RABBITMQ_URL, prefetch: Number(process.env.RABBITMQ_PREFETCH ?? 1) })
    : new InMemoryGenerationQueue();
  const rateLimiter = getSharedRateLimiter();
  const tempFileService = new LocalTempFileService();
  const mailProvider = createMailProviderFromEnv();
  const emailVerificationCodeStore = createEmailVerificationCodeStoreFromEnv();

  const authService = new AuthService(authRepository, new ScryptPasswordHasher(), mailProvider, emailVerificationCodeStore, {
    appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  });
  const resumeService = new ResumeService(resumeRepository);
  const resumeLinkService = new ResumeLinkService(resumeRepository);
  const generationTaskStatusService = new GenerationTaskStatusService(generationTaskRepository);
  const aiProvider = new ResumeAiService(hasAiApiKey() ? new OpenAiResumeAiProvider() : new MockResumeAiProvider());
  const parser = new ParserService();
  const uploadResumeService = new UploadResumeService(
    resumeService,
    resumeRepository,
    generationTaskStatusService,
    generationTaskRepository,
    tempFileService,
    generationQueue,
  );

  return {
    authRepository,
    authService,
    emailVerificationCodeStore,
    aiProvider,
    generationQueue,
    generationTaskRepository,
    generationTaskStatusService,
    generationWorker: null,
    mailProvider,
    parser,
    rateLimiter,
    resumeRepository,
    resumeLinkService,
    resumeService,
    tempFileService,
    uploadResumeService,
  };
}

function hasAiApiKey(): boolean {
  return Boolean(process.env.DOUBAO_API_KEY?.trim() || process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim());
}

const globalServices = globalThis as typeof globalThis & {
  __resumeAppServices?: AppServices;
};

export function getAppServices(): AppServices {
  globalServices.__resumeAppServices ??= createAppServices();
  return globalServices.__resumeAppServices;
}

export function setAppServicesForTest(services: AppServices): void {
  globalServices.__resumeAppServices = services;
}

export function resetAppServicesForTest(): AppServices {
  globalServices.__resumeAppServices = createAppServices();
  return globalServices.__resumeAppServices;
}
