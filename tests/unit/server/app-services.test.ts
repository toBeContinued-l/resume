import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppServices } from "@/server/app-services";
import { InMemoryAuthRepository } from "@/server/auth/in-memory-auth-repository";
import { MysqlAuthRepository } from "@/server/auth/mysql-auth-repository";
import { InMemoryGenerationTaskRepository } from "@/server/queue/generation-task-store";
import { InMemoryGenerationQueue } from "@/server/queue/in-memory-queue";
import { MysqlGenerationTaskRepository } from "@/server/queue/mysql-generation-task-repository";
import { RabbitGenerationQueue } from "@/server/queue/rabbitmq-queue";
import { InMemoryResumeRepository } from "@/server/resume/in-memory-resume-repository";
import { MysqlResumeRepository } from "@/server/resume/mysql-resume-repository";

describe("createAppServices", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses in-memory repositories and queue by default", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("RABBITMQ_URL", "");

    const services = createAppServices();

    expect(services.authRepository).toBeInstanceOf(InMemoryAuthRepository);
    expect(services.resumeRepository).toBeInstanceOf(InMemoryResumeRepository);
    expect(services.generationTaskRepository).toBeInstanceOf(InMemoryGenerationTaskRepository);
    expect(services.generationQueue).toBeInstanceOf(InMemoryGenerationQueue);
  });

  it("uses MySQL repositories when DATABASE_URL is configured", () => {
    vi.stubEnv("DATABASE_URL", "mysql://user:password@localhost:3306/resume_test");
    vi.stubEnv("RABBITMQ_URL", "");

    const services = createAppServices();

    expect(services.authRepository).toBeInstanceOf(MysqlAuthRepository);
    expect(services.resumeRepository).toBeInstanceOf(MysqlResumeRepository);
    expect(services.generationTaskRepository).toBeInstanceOf(MysqlGenerationTaskRepository);
    expect(services.generationQueue).toBeInstanceOf(InMemoryGenerationQueue);
  });

  it("uses RabbitMQ queue when RABBITMQ_URL is configured", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("RABBITMQ_URL", "amqp://localhost");
    vi.stubEnv("RABBITMQ_PREFETCH", "4");

    const services = createAppServices();

    expect(services.authRepository).toBeInstanceOf(InMemoryAuthRepository);
    expect(services.resumeRepository).toBeInstanceOf(InMemoryResumeRepository);
    expect(services.generationTaskRepository).toBeInstanceOf(InMemoryGenerationTaskRepository);
    expect(services.generationQueue).toBeInstanceOf(RabbitGenerationQueue);
  });
});
