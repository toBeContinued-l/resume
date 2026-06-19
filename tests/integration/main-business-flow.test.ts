import { File as NodeFile } from "node:buffer";
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as verifyEmail } from "@/app/api/auth/verify-email/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as uploadResume } from "@/app/api/resumes/upload/route";
import { GET as getTask } from "@/app/api/generation-tasks/[taskId]/route";
import {
  DELETE as deleteResume,
  GET as getResume,
  PUT as saveResume,
} from "@/app/api/resumes/[resumeId]/route";
import { PUT as publishLink } from "@/app/api/resumes/[resumeId]/link/route";
import { POST as verifyPublicLinkPassword } from "@/app/api/public-links/[slug]/verify-password/route";
import { createAppServices, setAppServicesForTest, type AppServices } from "@/server/app-services";
import { setAppRuntimeForTests } from "@/server/app-runtime";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-cookie";
import { MemoryMailProvider } from "@/server/mail/provider";
import { MockResumeAiProvider, ResumeAiService } from "@/server/ai/resume-ai-service";
import { InMemoryGenerationQueue } from "@/server/queue";
import type { ResumeContent, ResumeLayout } from "@/types/resume";
import type { ApiResponse } from "@/types/api";
import type { ParsedResumeDocument } from "@/types/parser";
import type { TempFileRef, TempFileService } from "@/types/temp-files";
import { processGenerationTask, type ResumeParser } from "@/worker";

type RouteContext<TParams extends Record<string, string>> = {
  params: Promise<TParams>;
};

type RegisterData = {
  user: {
    id: string;
    email: string;
  };
};

type UploadData = {
  resumeId: string;
  taskId: string;
  status: "pending";
};

type TaskProgressData = {
  taskId: string;
  resumeId: string;
  status: string;
};

type EditableResumeData = {
  resume: {
    id: string;
    title: string;
    status: string;
  };
  content: ResumeContent;
  layout: ResumeLayout;
};

type LinkData = {
  link: {
    slug: string;
    accessMode: string;
    hasPassword: boolean;
    urlPath: string;
    isActive: boolean;
  };
};

const originalEnv = {
  DATABASE_URL: process.env.DATABASE_URL,
  RABBITMQ_URL: process.env.RABBITMQ_URL,
  AI_API_KEY: process.env.AI_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
};
const originalFile = globalThis.File;

describe("online resume main business flow", () => {
  let services: AppServices;
  let tempFileService: MemoryTempFileService;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.RABBITMQ_URL;
    delete process.env.AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    globalThis.File = NodeFile as unknown as typeof File;

    services = createAppServices();
    tempFileService = installMemoryTempFileService(services);
    setAppServicesForTest(services);
    setAppRuntimeForTests(null);
  });

  afterEach(() => {
    restoreEnv();
    globalThis.File = originalFile;
    setAppRuntimeForTests(null);
  });

  it("covers register, email verification, session login, upload, worker generation, editing, password publishing, public access and deletion invalidation", async () => {
    const email = "milu.integration@example.test";
    const password = "StrongPassw0rd!";

    const registered = await expectOk<RegisterData>(
      await register(jsonRequest("/api/auth/register", { email, password })),
      201,
    );
    expect(registered.user.email).toBe(email);

    const verificationMail = (services.mailProvider as MemoryMailProvider).findLatest("email_verification", email);
    expect(verificationMail?.kind).toBe("email_verification");
    await expectOk(
      await verifyEmail(jsonRequest("/api/auth/verify-email", { token: verificationMail?.token })),
    );

    const loginResponse = await login(jsonRequest("/api/auth/login", { email, password }));
    const sessionCookie = await expectSessionCookie(loginResponse);

    const uploadFile = new File(["Milu Zhang\nSenior Product Engineer\nTypeScript"], "milu-resume.pdf", {
      type: "application/pdf",
    });
    expect(uploadFile).toBeInstanceOf(File);
    expect(typeof uploadFile.arrayBuffer).toBe("function");
    const upload = await expectOk<UploadData>(
      await uploadResume(formRequest([uploadFile], sessionCookie)),
      201,
    );
    expect(upload.status).toBe("pending");
    expect(tempFileService.saveOriginal).toHaveBeenCalledOnce();

    const pendingTask = await expectOk<TaskProgressData>(
      await getTask(authRequest(`/api/generation-tasks/${upload.taskId}`, sessionCookie), routeContext({ taskId: upload.taskId })),
    );
    expect(pendingTask).toMatchObject({
      taskId: upload.taskId,
      resumeId: upload.resumeId,
      status: "pending",
    });

    const queue = services.generationQueue as InMemoryGenerationQueue;
    expect(queue.publishedMessages).toHaveLength(1);

    const parser: ResumeParser = {
      parse: vi.fn(async ({ task }): Promise<ParsedResumeDocument> => ({
        source: {
          fileType: task.fileType,
          originalFileName: "milu-resume.pdf",
          fileSize: task.fileSize,
        },
        plainText: [
          "Milu Zhang",
          "Senior Product Engineer",
          "Built TypeScript workflow tools and online resume experiences.",
        ].join("\n"),
        semanticHtml: "<p>Milu Zhang</p><p>Senior Product Engineer</p>",
        blocks: [
          { id: "name", type: "heading", level: 1, text: "Milu Zhang" },
          { id: "headline", type: "paragraph", text: "Senior Product Engineer" },
        ],
        tables: [],
        assets: [],
        warnings: [],
      })),
    };

    const workerResult = await processGenerationTask(queue.publishedMessages[0], {
      taskStatus: services.generationTaskStatusService,
      queue: services.generationQueue,
      parser,
      aiProvider: new ResumeAiService(new MockResumeAiProvider()),
      resumeService: services.resumeService,
      tempFileService: services.tempFileService,
    });
    expect(workerResult.outcome).toBe("completed");
    expect(parser.parse).toHaveBeenCalledOnce();
    expect(tempFileService.removeTaskDir).toHaveBeenCalledWith({
      userId: registered.user.id,
      taskId: upload.taskId,
    });

    const completedTask = await expectOk<TaskProgressData>(
      await getTask(authRequest(`/api/generation-tasks/${upload.taskId}`, sessionCookie), routeContext({ taskId: upload.taskId })),
    );
    expect(completedTask.status).toBe("completed");

    const editable = await expectOk<EditableResumeData>(
      await getResume(authRequest(`/api/resumes/${upload.resumeId}`, sessionCookie), routeContext({ resumeId: upload.resumeId })),
    );
    expect(editable.resume.status).toBe("draft");
    expect(editable.content.title).toBe("Milu Zhang");

    const editedContent = structuredClone(editable.content);
    editedContent.title = "Milu Zhang - Online Resume";
    const profile = editedContent.sections.find((section) => section.type === "profile");
    if (!profile || profile.type !== "profile") {
      throw new Error("Expected generated resume to include a profile section.");
    }
    profile.data.headline = "Senior Product Engineer";
    profile.data.summary = {
      format: "html",
      html: '<p>Builds polished TypeScript products.</p><script>alert("x")</script>',
      plainText: "Builds polished TypeScript products.",
    };

    const saved = await expectOk<EditableResumeData>(
      await saveResume(
        jsonRequest(`/api/resumes/${upload.resumeId}`, { content: editedContent, layout: editable.layout }, sessionCookie, "PUT"),
        routeContext({ resumeId: upload.resumeId }),
      ),
    );
    expect(saved.content.title).toBe("Milu Zhang - Online Resume");
    expect(JSON.stringify(saved.content)).not.toContain("<script");

    const published = await expectOk<LinkData>(
      await publishLink(
        jsonRequest(
          `/api/resumes/${upload.resumeId}/link`,
          { accessMode: "password", password: "visitor-pass" },
          sessionCookie,
          "PUT",
        ),
        routeContext({ resumeId: upload.resumeId }),
      ),
    );
    expect(published.link).toMatchObject({
      accessMode: "password",
      hasPassword: true,
      isActive: true,
    });
    expect(published.link.urlPath).toBe(`/r/${published.link.slug}`);

    const blockedPublicAccess = await services.resumeLinkService.resolvePublicResume({
      slug: published.link.slug,
    });
    expect(blockedPublicAccess).toEqual({ ok: false, reason: "password_required" });

    const wrongPassword = await expectOk<{ verified: false; reason: string }>(
      await verifyPublicLinkPassword(
        jsonRequest(`/api/public-links/${published.link.slug}/verify-password`, { password: "wrong" }),
        routeContext({ slug: published.link.slug }),
      ),
      401,
    );
    expect(wrongPassword).toEqual({ verified: false, reason: "password_required" });

    const verifiedPublicAccess = await expectOk<{ verified: true; resume: { title: string }; link: { slug: string } }>(
      await verifyPublicLinkPassword(
        jsonRequest(`/api/public-links/${published.link.slug}/verify-password`, { password: "visitor-pass" }),
        routeContext({ slug: published.link.slug }),
      ),
    );
    expect(verifiedPublicAccess.resume.title).toBe("Milu Zhang - Online Resume");
    expect(verifiedPublicAccess.link.slug).toBe(published.link.slug);

    await expectNoContent(
      await deleteResume(authRequest(`/api/resumes/${upload.resumeId}`, sessionCookie, "DELETE"), routeContext({ resumeId: upload.resumeId })),
    );

    const deletedPublicAccess = await services.resumeLinkService.resolvePublicResume({
      slug: published.link.slug,
      password: "visitor-pass",
    });
    expect(deletedPublicAccess).toEqual({ ok: false, reason: "inactive" });

    const deletedPasswordAccess = await expectOk<{ verified: false; reason: string }>(
      await verifyPublicLinkPassword(
        jsonRequest(`/api/public-links/${published.link.slug}/verify-password`, { password: "visitor-pass" }),
        routeContext({ slug: published.link.slug }),
      ),
      404,
    );
    expect(deletedPasswordAccess).toEqual({ verified: false, reason: "inactive" });
  });
});

function routeContext<TParams extends Record<string, string>>(params: TParams): RouteContext<TParams> {
  return { params: Promise.resolve(params) };
}

function jsonRequest(path: string, body: unknown, cookie?: string, method = "POST"): NextRequest {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  }) as NextRequest;
}

function authRequest(path: string, cookie: string, method = "GET"): NextRequest {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { cookie },
  }) as NextRequest;
}

function formRequest(files: File[], cookie: string): NextRequest {
  const formData = {
    getAll: (name: string) => (name === "file" ? files : []),
  };
  return {
    headers: new Headers({ cookie }),
    formData: async () => formData as FormData,
  } as NextRequest;
}

async function expectOk<T>(response: Response, expectedStatus = 200): Promise<T> {
  const body = (await response.json()) as ApiResponse<T>;
  if (response.status !== expectedStatus) {
    throw new Error(`Expected HTTP ${expectedStatus}, received ${response.status}: ${JSON.stringify(body)}`);
  }
  expect(body.ok).toBe(true);
  if (!body.ok) {
    throw new Error(body.error.message);
  }
  return body.data;
}

async function expectNoContent(response: Response): Promise<void> {
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
}

async function expectSessionCookie(response: Response): Promise<string> {
  await expectOk(response);
  const setCookie = response.headers.get("set-cookie");
  expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
  return setCookie?.split(";")[0] ?? "";
}

type MemoryTempFileService = TempFileService & {
  saveOriginal: ReturnType<typeof vi.fn>;
  removeTaskDir: ReturnType<typeof vi.fn>;
};

function installMemoryTempFileService(services: AppServices): MemoryTempFileService {
  const tempFileService: MemoryTempFileService = {
    createTaskDir: vi.fn(async ({ userId, taskId }: { userId: string; taskId: string }) => `/memory/uploads/${userId}/${taskId}`),
    getTaskDir: vi.fn(({ userId, taskId }: { userId: string; taskId: string }) => `/memory/uploads/${userId}/${taskId}`),
    getAssetsDir: vi.fn(async ({ taskDir }: { taskDir: string }) => `${taskDir}/assets`),
    saveOriginal: vi.fn(async ({ taskDir, fileName, content }: { taskDir: string; fileName: string; content: Buffer }): Promise<TempFileRef> => ({
      taskDir,
      path: `${taskDir}/${fileName}`,
      originalFileName: fileName,
      fileSize: content.byteLength,
    })),
    saveConvertedDocx: vi.fn(async ({ taskDir, content }: { taskDir: string; content: Buffer }): Promise<TempFileRef> => ({
      taskDir,
      path: `${taskDir}/converted.docx`,
      originalFileName: "converted.docx",
      fileSize: content.byteLength,
    })),
    saveAsset: vi.fn(async ({ taskDir, fileName, content }: { taskDir: string; fileName: string; content: Buffer }): Promise<TempFileRef> => ({
      taskDir,
      path: `${taskDir}/assets/${fileName}`,
      originalFileName: fileName,
      fileSize: content.byteLength,
    })),
    removeTaskDir: vi.fn(async () => undefined),
  };

  Object.assign(services.tempFileService, tempFileService);
  return tempFileService;
}

function restoreEnv(): void {
  restoreEnvValue("DATABASE_URL", originalEnv.DATABASE_URL);
  restoreEnvValue("RABBITMQ_URL", originalEnv.RABBITMQ_URL);
  restoreEnvValue("AI_API_KEY", originalEnv.AI_API_KEY);
  restoreEnvValue("OPENAI_API_KEY", originalEnv.OPENAI_API_KEY);
}

function restoreEnvValue(name: keyof typeof originalEnv, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
