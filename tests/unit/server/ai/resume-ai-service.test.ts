import { afterEach, describe, expect, it, vi } from "vitest";
import { MockResumeAiProvider, OpenAiResumeAiProvider, ResumeAiError, ResumeAiService, validateAiOutput } from "@/server/ai";
import type { ParsedResumeDocument } from "@/types/parser";
import type { ResumeAiInput } from "@/types/ai";

const parsedDocument: ParsedResumeDocument = {
  source: { fileType: "pdf", originalFileName: "resume.pdf", fileSize: 128 },
  plainText: "Milu\nFrontend Engineer\nBuilt design systems",
  blocks: [{ id: "b1", type: "paragraph", text: "Milu" }],
  tables: [],
  assets: [],
  warnings: [],
};

const input: ResumeAiInput = {
  parsedDocument,
  constraints: {
    noFabrication: true,
    markUncertainContent: true,
    fixedTemplateOnly: true,
    preserveParsedImagesAndTables: true,
  },
};

describe("ResumeAiService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("generates schema-valid resume content with the mock provider", async () => {
    const output = await new ResumeAiService(new MockResumeAiProvider()).generateResume(input);

    expect(output.resume.title).toBe("Milu");
    expect(output.layout.template).toBe("default");
    expect(output.resume.moduleOrder).toEqual(["profile", "experience"]);
  });

  it("rejects invalid AI output before persistence", () => {
    expect(() =>
      validateAiOutput({
        resume: {
          schemaVersion: 1,
          title: "Bad",
          sections: [],
          moduleOrder: ["missing"],
          assets: [],
          confirmationItems: [],
        },
        layout: {
          schemaVersion: 1,
          template: "default",
          theme: { fontFamily: "system", accentColor: "#0f766e", density: "comfortable" },
          sectionLayout: [],
        },
        confirmationItems: [],
        aiWarnings: [],
      }),
    ).toThrow(ResumeAiError);
  });

  it("uses OpenAI Responses API structured output and validates the response", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        model: string;
        text: { format: { type: string; name: string } };
      };
      expect(body.model).toBe("gpt-test");
      expect(body.text.format.type).toBe("json_schema");
      expect(body.text.format.name).toBe("resume_ai_output");
      return {
        ok: true,
        status: 200,
        async text() {
          return "";
        },
        async json() {
          return {
            output_text: JSON.stringify(await new MockResumeAiProvider().generateResume(input)),
          };
        },
      };
    });

    const output = await new OpenAiResumeAiProvider({
      apiKey: "test-key",
      model: "gpt-test",
      endpoint: "https://example.test/responses",
      fetch: fetchMock,
    }).generateResume(input);

    expect(output.resume.title).toBe("Milu");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/responses",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer test-key" }),
      }),
    );
  });

  it("fails when the OpenAI request exceeds the timeout", async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<{
          ok: boolean;
          status: number;
          text(): Promise<string>;
          json(): Promise<unknown>;
        }>((_, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );

    await expect(
      new OpenAiResumeAiProvider({
        apiKey: "test-key",
        model: "gpt-test",
        endpoint: "https://example.test/responses",
        fetch: fetchMock,
        timeoutMs: 10,
      }).generateResume(input),
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_FAILED",
      message: "AI request timed out after 10ms.",
    });
  });

  it("shows a friendly message for region-blocked 403 HTML responses", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 403,
      async text() {
        return `<!doctype html><html><body><div><h1>访问受限</h1><p>抱歉，当前地区暂不支持访问 ai.laodog.top。</p></div></body></html>`;
      },
      async json() {
        return {};
      },
    }));

    await expect(
      new OpenAiResumeAiProvider({
        apiKey: "test-key",
        model: "gpt-test",
        endpoint: "https://example.test/responses",
        fetch: fetchMock,
      }).generateResume(input),
    ).rejects.toMatchObject({
      code: "AI_PROVIDER_FAILED",
      message: "AI 服务拒绝了当前地区或网络出口的访问，请更换可用的模型接口地址。",
    });
  });

  it("can read an OpenAI-compatible relay endpoint from environment variables", async () => {
    vi.stubEnv("AI_API_KEY", "relay-key");
    vi.stubEnv("AI_MODEL", "relay-model");
    vi.stubEnv("AI_API_BASE_URL", "https://relay.example.test/v1/");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      async text() {
        return "";
      },
      async json() {
        return {
          output_text: JSON.stringify(await new MockResumeAiProvider().generateResume(input)),
        };
      },
    }));

    await new OpenAiResumeAiProvider({ fetch: fetchMock }).generateResume(input);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://relay.example.test/v1/responses",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer relay-key" }),
        body: expect.stringContaining('"model":"relay-model"'),
      }),
    );
  });

  it("prefers Doubao-specific environment variables when present", async () => {
    vi.stubEnv("DOUBAO_API_KEY", "doubao-key");
    vi.stubEnv("DOUBAO_MODEL", "doubao-model");
    vi.stubEnv("DOUBAO_API_REQUEST_URL", "https://ark.example.test/api/v3/chat/completions");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      async text() {
        return "";
      },
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify(await new MockResumeAiProvider().generateResume(input)),
              },
            },
          ],
        };
      },
    }));

    await new OpenAiResumeAiProvider({ fetch: fetchMock }).generateResume(input);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.example.test/api/v3/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer doubao-key" }),
        body: expect.stringContaining('"model":"doubao-model"'),
      }),
    );
  });

  it("can call a cc-switch-style chat completions request URL with API key and request address", async () => {
    vi.stubEnv("AI_API_KEY", "cc-switch-key");
    vi.stubEnv("AI_MODEL", "cc-switch-model");
    vi.stubEnv("AI_API_REQUEST_URL", "https://relay.example.test/v1/chat/completions");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        model: string;
        messages: Array<{ role: string; content: string }>;
        response_format: { type: string; json_schema: { name: string } };
      };
      expect(body.model).toBe("cc-switch-model");
      expect(body.messages.map((message) => message.role)).toEqual(["system", "user"]);
      expect(body.response_format.type).toBe("json_schema");
      expect(body.response_format.json_schema.name).toBe("resume_ai_output");
      return {
        ok: true,
        status: 200,
        async text() {
          return "";
        },
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify(await new MockResumeAiProvider().generateResume(input)),
                },
              },
            ],
          };
        },
      };
    });

    const output = await new OpenAiResumeAiProvider({ fetch: fetchMock }).generateResume(input);

    expect(output.resume.title).toBe("Milu");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://relay.example.test/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer cc-switch-key" }),
      }),
    );
  });

  it("treats a relay root endpoint as a chat completions base address", async () => {
    vi.stubEnv("OPENAI_API_KEY", "relay-key");
    vi.stubEnv("OPENAI_MODEL", "relay-model");
    vi.stubEnv("OPENAI_ENDPOINT", "https://relay.example.test");
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      async text() {
        return "";
      },
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify(await new MockResumeAiProvider().generateResume(input)),
              },
            },
          ],
        };
      },
    }));

    await new OpenAiResumeAiProvider({ fetch: fetchMock }).generateResume(input);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://relay.example.test/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer relay-key" }),
        body: expect.stringContaining('"model":"relay-model"'),
      }),
    );
  });
});
