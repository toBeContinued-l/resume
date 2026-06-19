import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getResume, PUT as saveResume } from "@/app/api/resumes/[resumeId]/route";
import { createAppServices, setAppServicesForTest, type AppServices } from "@/server/app-services";
import { setAppRuntimeForTests } from "@/server/app-runtime";
import type { ApiResponse } from "@/types/api";
import type { ResumeContent, ResumeLayout } from "@/types/resume";

type RouteContext = {
  params: Promise<{ resumeId: string }>;
};

describe("resume editor API permissions", () => {
  let services: AppServices;
  let resumeId: string;
  let content: ResumeContent;
  let layout: ResumeLayout;

  beforeEach(async () => {
    services = createAppServices();
    setAppServicesForTest(services);
    setAppRuntimeForTests(null);

    content = sampleContent();
    layout = sampleLayout();
    const resume = await services.resumeService.createResume({
      userId: "owner",
      title: "Owner Resume",
      sourceFileName: "resume.pdf",
      sourceFileType: "pdf",
      sourceFileSize: 100,
      currentTaskId: "task-1",
    });
    resumeId = resume.id;
    await services.resumeService.saveGeneratedContent({
      userId: "owner",
      resumeId,
      content,
      layout,
    });
  });

  afterEach(() => {
    setAppRuntimeForTests(null);
  });

  it("rejects non-owners reading or saving editable resume data", async () => {
    const getResponse = await getResume(authRequest("other", `/api/resumes/${resumeId}`), routeContext(resumeId));
    const putResponse = await saveResume(
      jsonRequest("other", `/api/resumes/${resumeId}`, { content, layout }),
      routeContext(resumeId),
    );

    await expectError(getResponse, 403, "FORBIDDEN");
    await expectError(putResponse, 403, "FORBIDDEN");
  });
});

function routeContext(resumeId: string): RouteContext {
  return { params: Promise.resolve({ resumeId }) };
}

function authRequest(userId: string, path: string): NextRequest {
  return new Request(`http://localhost${path}`, {
    headers: { "x-test-user-id": userId },
  }) as NextRequest;
}

function jsonRequest(userId: string, path: string, body: unknown): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-test-user-id": userId,
    },
    body: JSON.stringify(body),
  }) as NextRequest;
}

async function expectError(response: Response, status: number, code: string): Promise<void> {
  expect(response.status).toBe(status);
  const body = (await response.json()) as ApiResponse<unknown>;
  expect(body.ok).toBe(false);
  if (!body.ok) {
    expect(body.error.code).toBe(code);
  }
}

function sampleContent(): ResumeContent {
  return {
    schemaVersion: 1,
    title: "Owner Resume",
    sections: [
      {
        id: "profile",
        type: "profile",
        title: "Profile",
        visible: true,
        data: {
          name: "Milu",
          summary: { format: "html", html: "<p>Builds products.</p>", plainText: "Builds products." },
        },
      },
    ],
    moduleOrder: ["profile"],
    assets: [],
    confirmationItems: [],
  };
}

function sampleLayout(): ResumeLayout {
  return {
    schemaVersion: 1,
    template: "default",
    theme: {
      fontFamily: "system",
      accentColor: "#0f766e",
      density: "comfortable",
    },
    sectionLayout: [{ sectionId: "profile", variant: "standard" }],
  };
}
