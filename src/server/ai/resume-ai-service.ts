import type { ResumeAiInput, ResumeAiOutput, ResumeAiProvider } from "@/types/ai";
import { resumeAiInputSchema, resumeAiOutputSchema } from "@/types/ai";
import type { ResumeContent, ResumeLayout, ResumeSection, RichText } from "@/types/resume";
import { collectResumeValidationErrors } from "@/server/resume/validation";

export class ResumeAiError extends Error {
  constructor(
    readonly code: "AI_PROVIDER_FAILED" | "AI_OUTPUT_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "ResumeAiError";
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export class ResumeAiService implements ResumeAiProvider {
  constructor(
    private readonly provider: ResumeAiProvider,
    private readonly maxFormatRetries = 1,
  ) {}

  async generateResume(input: ResumeAiInput): Promise<ResumeAiOutput> {
    const parsedInput = resumeAiInputSchema.parse(input);
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxFormatRetries; attempt += 1) {
      try {
        const output = await this.provider.generateResume(parsedInput);
        return validateAiOutput(output);
      } catch (error) {
        lastError = error;
        if (!(error instanceof ResumeAiError) || error.code !== "AI_OUTPUT_INVALID") {
          break;
        }
      }
    }
    if (lastError instanceof ResumeAiError) {
      throw lastError;
    }
    throw new ResumeAiError("AI_PROVIDER_FAILED", lastError instanceof Error ? lastError.message : "AI generation failed.");
  }
}

export class MockResumeAiProvider implements ResumeAiProvider {
  async generateResume(input: ResumeAiInput): Promise<ResumeAiOutput> {
    const lines = input.parsedDocument.plainText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const title = lines[0] || "Untitled resume";
    const summaryText = lines.slice(0, 4).join(" ");
    const sections: ResumeSection[] = [
      {
        id: "profile",
        type: "profile",
        title: "个人信息",
        visible: true,
        data: {
          name: title,
          summary: toRichText(summaryText || "请在编辑器中完善个人摘要。"),
        },
      },
      {
        id: "experience",
        type: "custom",
        title: "简历内容",
        visible: true,
        content: toRichText(lines.slice(1).join("<br>") || summaryText || "请补充简历内容。"),
      },
    ];
    const content: ResumeContent = {
      schemaVersion: 1,
      title,
      sections,
      moduleOrder: sections.map((section) => section.id),
      assets: input.parsedDocument.assets.map((asset) => ({
        id: asset.id,
        kind: "image",
        mimeType: asset.mimeType,
        dataRef: `asset://${asset.id}`,
        alt: asset.id,
      })),
      confirmationItems:
        lines.length <= 1
          ? [
              {
                id: "confirm-summary",
                fieldPath: "sections.0.data.summary.plainText",
                message: "解析内容较少，请确认摘要是否完整。",
                status: "pending",
              },
            ]
          : [],
    };
    const layout: ResumeLayout = {
      schemaVersion: 1,
      template: "default",
      theme: {
        fontFamily: "system",
        accentColor: "#0f766e",
        density: "comfortable",
      },
      sectionLayout: [
        { sectionId: "profile", variant: "standard" },
        { sectionId: "experience", variant: "rich_text" },
      ],
    };
    return {
      resume: content,
      layout,
      confirmationItems: content.confirmationItems,
      aiWarnings: input.parsedDocument.warnings.map((warning) => ({
        code: warning.code,
        message: warning.message,
      })),
    };
  }
}

export type OpenAiResumeAiProviderOptions = {
  apiKey?: string;
  model?: string;
  endpoint?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
};

type OpenAiEndpointMode = "responses" | "chat_completions";

export class OpenAiResumeAiProvider implements ResumeAiProvider {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly endpoint: string;
  private readonly endpointMode: OpenAiEndpointMode;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(options: OpenAiResumeAiProviderOptions = {}) {
    const endpointConfig = options.endpoint
      ? { url: options.endpoint, mode: inferOpenAiEndpointMode(options.endpoint) }
      : getOpenAiEndpointFromEnv();
    this.apiKey = options.apiKey ?? readEnv("DOUBAO_API_KEY", "AI_API_KEY", "OPENAI_API_KEY");
    this.model = options.model ?? readEnv("DOUBAO_MODEL", "AI_MODEL", "OPENAI_MODEL") ?? "gpt-4o-mini";
    this.endpoint = endpointConfig.url;
    this.endpointMode = endpointConfig.mode;
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? readTimeoutMsFromEnv() ?? 90_000;
  }

  async generateResume(input: ResumeAiInput): Promise<ResumeAiOutput> {
    if (!this.apiKey) {
      throw new ResumeAiError(
        "AI_PROVIDER_FAILED",
        "DOUBAO_API_KEY, AI_API_KEY, or OPENAI_API_KEY is required to use the AI provider.",
      );
    }
    const parsedInput = resumeAiInputSchema.parse(input);
    const response = await fetchWithTimeout(
      this.fetchImpl,
      this.endpoint,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(buildOpenAiRequestBody(this.endpointMode, this.model, parsedInput)),
      },
      this.timeoutMs,
    );

    if (!response.ok) {
      throw new ResumeAiError("AI_PROVIDER_FAILED", await buildOpenAiHttpErrorMessage(response));
    }

    const raw = await response.json();
    return parseOpenAiResponse(raw);
  }
}

function readEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readTimeoutMsFromEnv(): number | undefined {
  const value = readEnv("DOUBAO_REQUEST_TIMEOUT_MS", "AI_REQUEST_TIMEOUT_MS", "OPENAI_REQUEST_TIMEOUT_MS");
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  input: string,
  init: RequestInit,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error(`AI request timed out after ${timeoutMs}ms.`)), timeoutMs);
  try {
    return await fetchImpl(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ResumeAiError("AI_PROVIDER_FAILED", `AI request timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function buildOpenAiHttpErrorMessage(response: {
  status: number;
  text(): Promise<string>;
}): Promise<string> {
  const rawText = await response.text();
  const cleanedText = sanitizeRemoteErrorText(rawText);

  if (response.status === 401) {
    return "AI 服务鉴权失败，请检查 API Key 或访问凭证是否有效。";
  }

  if (response.status === 403) {
    if (cleanedText.includes("当前地区暂不支持访问") || cleanedText.includes("访问受限")) {
      return "AI 服务拒绝了当前地区或网络出口的访问，请更换可用的模型接口地址。";
    }
    return "AI 服务拒绝访问，请检查接口权限、来源限制或中转配置。";
  }

  if (response.status === 404) {
    return "AI 接口地址不可用，请检查模型接口地址是否正确。";
  }

  if (response.status === 429) {
    return "AI 服务请求过于频繁，请稍后重试。";
  }

  if (response.status >= 500) {
    return "AI 服务暂时不可用，请稍后重试。";
  }

  return cleanedText
    ? `AI 服务请求失败（${response.status}）：${cleanedText}`
    : `AI 服务请求失败（${response.status}）。`;
}

function sanitizeRemoteErrorText(value: string): string {
  const withoutTags = value.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ");
  const normalized = decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > 180 ? `${normalized.slice(0, 180)}...` : normalized;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function getOpenAiEndpointFromEnv(): { url: string; mode: OpenAiEndpointMode } {
  const requestUrl = readEnv(
    "DOUBAO_API_REQUEST_URL",
    "DOUBAO_API_ENDPOINT",
    "AI_API_REQUEST_URL",
    "AI_API_ENDPOINT",
    "OPENAI_ENDPOINT",
  );
  if (requestUrl) {
    return normalizeOpenAiEndpoint(requestUrl);
  }
  const baseUrl = readEnv("DOUBAO_API_BASE_URL", "AI_API_BASE_URL", "OPENAI_BASE_URL");
  if (baseUrl) {
    return { url: `${baseUrl.replace(/\/+$/, "")}/responses`, mode: "responses" };
  }
  return { url: "https://api.openai.com/v1/responses", mode: "responses" };
}

function normalizeOpenAiEndpoint(endpoint: string): { url: string; mode: OpenAiEndpointMode } {
  const trimmed = endpoint.replace(/\/+$/, "");
  const mode = inferOpenAiEndpointMode(trimmed);
  if (trimmed.endsWith("/responses") || mode === "chat_completions") {
    return { url: trimmed, mode };
  }
  return { url: `${trimmed}/v1/chat/completions`, mode: "chat_completions" };
}

function inferOpenAiEndpointMode(endpoint: string): OpenAiEndpointMode {
  return endpoint.replace(/\/+$/, "").endsWith("/chat/completions") ? "chat_completions" : "responses";
}

function buildOpenAiRequestBody(mode: OpenAiEndpointMode, model: string, input: ResumeAiInput) {
  const payload = JSON.stringify(toOpenAiPayload(input));
  if (mode === "chat_completions") {
    return {
      model,
      messages: [
        { role: "system", content: OPENAI_SYSTEM_PROMPT },
        { role: "user", content: payload },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "resume_ai_output",
          strict: false,
          schema: resumeAiOutputJsonSchema,
        },
      },
    };
  }

  return {
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: OPENAI_SYSTEM_PROMPT,
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: payload,
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "resume_ai_output",
        strict: false,
        schema: resumeAiOutputJsonSchema,
      },
    },
  };
}

export const OPENAI_SYSTEM_PROMPT = [
  "You generate structured online resume content as JSON only, with no markdown and no explanatory text.",
  "Never fabricate factual experience: education, companies, roles, projects, certificates, dates, years of experience, awards, or contact details.",
  "You may improve wording, reorganize text, and fill non-factual connective phrasing based only on provided parsed resume content.",
  "Any uncertain inference must be represented in confirmationItems as objects with id, fieldPath, message, and status pending.",
  "The JSON must have exactly these top-level keys: resume, layout, confirmationItems, aiWarnings.",
  "resume must include schemaVersion 1, title, sections, moduleOrder, assets, confirmationItems.",
  "Every section must include id, type, title, and visible. Use profile, work_experience, education, project, skill, certificate, honor, or custom section types only.",
  "Rich text values must be objects like {\"format\":\"html\",\"html\":\"<p>Text</p>\",\"plainText\":\"Text\"}.",
  "layout must include schemaVersion 1, template \"default\", theme with fontFamily system or serif, accentColor as #RRGGBB, density compact or comfortable, and sectionLayout entries for every section id.",
  "confirmationItems and resume.confirmationItems must be the same array. aiWarnings must be an array of objects with code and message.",
  "Use the fixed default layout template only. Preserve parsed images as asset references when provided.",
].join(" ");

function toOpenAiPayload(input: ResumeAiInput) {
  return {
    constraints: input.constraints,
    parsedDocument: {
      source: input.parsedDocument.source,
      plainText: input.parsedDocument.plainText,
      semanticHtml: input.parsedDocument.semanticHtml,
      blocks: input.parsedDocument.blocks.map((block) => ({
        type: block.type,
        text: block.text,
        level: block.level,
        page: block.page,
      })),
      tables: input.parsedDocument.tables,
      assets: input.parsedDocument.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        mimeType: asset.mimeType,
      })),
      warnings: input.parsedDocument.warnings,
    },
  };
}

function parseOpenAiResponse(raw: unknown): ResumeAiOutput {
  const text = extractOpenAiOutputText(raw);
  if (!text) {
    throw new ResumeAiError("AI_OUTPUT_INVALID", "OpenAI response did not contain output text.");
  }
  try {
    const parsed = JSON.parse(text);
    const direct = resumeAiOutputSchema.safeParse(parsed);
    if (direct.success) {
      return direct.data;
    }
    return resumeAiOutputSchema.parse(repairAiOutput(parsed));
  } catch (error) {
    throw new ResumeAiError("AI_OUTPUT_INVALID", error instanceof Error ? error.message : "OpenAI returned invalid JSON.");
  }
}

function repairAiOutput(output: unknown): unknown {
  if (!isRecord(output)) {
    return output;
  }

  const resume = isRecord(output.resume) ? output.resume : {};
  const sections = Array.isArray(resume.sections) ? resume.sections.map(repairSection).filter(isRecord) : [];
  const sectionIds = sections.map((section, index) => getString(section.id) ?? `section-${index + 1}`);
  const repairedSections = sections.map((section, index) => ({
    ...section,
    id: sectionIds[index],
    title: getString(section.title) ?? titleFromSectionType(getString(section.type)),
    visible: typeof section.visible === "boolean" ? section.visible : true,
  }));
  const confirmationItems = repairConfirmationItems(output.confirmationItems ?? resume.confirmationItems);

  return {
    ...output,
    resume: {
      ...resume,
      schemaVersion: 1,
      title: getString(resume.title) ?? "Untitled resume",
      sections: repairedSections,
      moduleOrder: repairModuleOrder(resume.moduleOrder, sectionIds),
      assets: Array.isArray(resume.assets) ? resume.assets : [],
      confirmationItems,
    },
    layout: repairLayout(output.layout, repairedSections),
    confirmationItems,
    aiWarnings: repairAiWarnings(output.aiWarnings),
  };
}

function repairSection(section: unknown, index: number): Record<string, unknown> | null {
  if (!isRecord(section)) {
    return null;
  }
  const type = getString(section.type) ?? "custom";
  const id = getString(section.id) ?? `${type}-${index + 1}`;
  const base = {
    ...section,
    id,
    type,
    title: getString(section.title) ?? titleFromSectionType(type),
    visible: typeof section.visible === "boolean" ? section.visible : true,
  };

  if (type === "profile") {
    const data = isRecord(section.data) ? section.data : {};
    return { ...base, data };
  }
  if (["education", "work_experience", "project", "certificate", "honor"].includes(type)) {
    return { ...base, items: repairItems(section.items, `${id}-item`) };
  }
  if (type === "skill") {
    return { ...base, groups: repairSkillGroups(section.groups, section.skills, id) };
  }
  if (type === "custom") {
    return { ...base, content: repairRichText(section.content) };
  }
  return {
    ...base,
    type: "custom",
    content: repairRichText(section.content ?? section.description ?? section.title),
  };
}

function repairItems(items: unknown, idPrefix: string): unknown[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.filter(isRecord).map((item, index) => ({
    ...item,
    id: getString(item.id) ?? `${idPrefix}-${index + 1}`,
    ...(item.description === undefined ? {} : { description: repairRichText(item.description) }),
  }));
}

function repairSkillGroups(groups: unknown, skills: unknown, sectionId: string): unknown[] {
  if (Array.isArray(groups)) {
    return groups.filter(isRecord).map((group, index) => ({
      ...group,
      id: getString(group.id) ?? `${sectionId}-group-${index + 1}`,
      skills: Array.isArray(group.skills) ? group.skills.filter((skill): skill is string => typeof skill === "string" && skill.trim().length > 0) : [],
    }));
  }
  if (Array.isArray(skills)) {
    return [
      {
        id: `${sectionId}-group-1`,
        skills: skills.filter((skill): skill is string => typeof skill === "string" && skill.trim().length > 0),
      },
    ];
  }
  return [];
}

function repairLayout(layout: unknown, sections: Array<Record<string, unknown>>): unknown {
  const source = isRecord(layout) ? layout : {};
  const existingLayout = new Map<string, Record<string, unknown>>();
  if (Array.isArray(source.sectionLayout)) {
    for (const item of source.sectionLayout) {
      if (isRecord(item) && typeof item.sectionId === "string") {
        existingLayout.set(item.sectionId, item);
      }
    }
  }

  return {
    ...source,
    schemaVersion: 1,
    template: "default",
    theme: {
      fontFamily: "system",
      accentColor: "#0f766e",
      density: "comfortable",
      ...(isRecord(source.theme) ? source.theme : {}),
    },
    sectionLayout: sections.map((section) => {
      const sectionId = String(section.id);
      const existing = existingLayout.get(sectionId) ?? {};
      return {
        ...existing,
        sectionId,
        variant: getString(existing.variant) ?? variantFromSectionType(getString(section.type)),
      };
    }),
  };
}

function repairModuleOrder(moduleOrder: unknown, sectionIds: string[]): string[] {
  if (!Array.isArray(moduleOrder)) {
    return sectionIds;
  }
  const known = new Set(sectionIds);
  const ordered = moduleOrder.filter((item): item is string => typeof item === "string" && known.has(item));
  return [...ordered, ...sectionIds.filter((id) => !ordered.includes(id))];
}

function repairConfirmationItems(items: unknown): unknown[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item, index) => {
    if (isRecord(item)) {
      return {
        id: getString(item.id) ?? `confirm-${index + 1}`,
        fieldPath: getString(item.fieldPath) ?? "resume",
        message: getString(item.message) ?? "Please confirm this AI-generated content.",
        status: getString(item.status) ?? "pending",
      };
    }
    return {
      id: `confirm-${index + 1}`,
      fieldPath: "resume",
      message: String(item),
      status: "pending",
    };
  });
}

function repairAiWarnings(warnings: unknown): unknown[] {
  if (!Array.isArray(warnings)) {
    return [];
  }
  return warnings.map((warning, index) => {
    if (isRecord(warning)) {
      return {
        code: getString(warning.code) ?? `AI_WARNING_${index + 1}`,
        message: getString(warning.message) ?? "AI returned a warning.",
      };
    }
    return {
      code: `AI_WARNING_${index + 1}`,
      message: String(warning),
    };
  });
}

function repairRichText(value: unknown): unknown {
  if (isRecord(value) && value.format === "html" && typeof value.html === "string" && typeof value.plainText === "string") {
    return value;
  }
  const plainText = typeof value === "string" ? value : "";
  return {
    format: "html",
    html: plainText ? `<p>${escapeHtml(plainText)}</p>` : "<p></p>",
    plainText,
  };
}

function titleFromSectionType(type: string | undefined): string {
  switch (type) {
    case "profile":
      return "个人信息";
    case "education":
      return "教育经历";
    case "work_experience":
      return "工作经历";
    case "project":
      return "项目经历";
    case "skill":
      return "技能";
    case "certificate":
      return "证书";
    case "honor":
      return "荣誉";
    default:
      return "简历内容";
  }
}

function variantFromSectionType(type: string | undefined): "standard" | "timeline" | "tag_group" | "rich_text" {
  if (["education", "work_experience", "project", "certificate", "honor"].includes(type ?? "")) {
    return "timeline";
  }
  if (type === "skill") {
    return "tag_group";
  }
  if (type === "custom") {
    return "rich_text";
  }
  return "standard";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function extractOpenAiOutputText(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const chatCompletionText = extractChatCompletionOutputText(raw);
  if (chatCompletionText) {
    return chatCompletionText;
  }
  const maybeOutputText = (raw as { output_text?: unknown }).output_text;
  if (typeof maybeOutputText === "string") {
    return maybeOutputText;
  }

  const output = (raw as { output?: unknown }).output;
  if (!Array.isArray(output)) {
    return null;
  }
  const textParts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string") {
        textParts.push(text);
      }
    }
  }
  return textParts.length > 0 ? textParts.join("") : null;
}

function extractChatCompletionOutputText(raw: object): string | null {
  const choices = (raw as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) {
    return null;
  }
  const textParts: string[] = [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") {
      continue;
    }
    const message = (choice as { message?: unknown }).message;
    if (!message || typeof message !== "object") {
      continue;
    }
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string") {
      textParts.push(content);
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          textParts.push((part as { text: string }).text);
        }
      }
    }
  }
  return textParts.length > 0 ? textParts.join("") : null;
}

const richTextJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["format", "html", "plainText"],
  properties: {
    format: { type: "string", enum: ["html"] },
    html: { type: "string" },
    plainText: { type: "string" },
  },
};

const resumeAiOutputJsonSchema = {
  type: "object",
  additionalProperties: true,
  required: ["resume", "layout", "confirmationItems", "aiWarnings"],
  properties: {
    resume: {
      type: "object",
      additionalProperties: true,
      required: ["schemaVersion", "title", "sections", "moduleOrder", "assets", "confirmationItems"],
      properties: {
        schemaVersion: { type: "number", enum: [1] },
        title: { type: "string" },
        sections: { type: "array", items: { type: "object", additionalProperties: true } },
        moduleOrder: { type: "array", items: { type: "string" } },
        assets: { type: "array", items: { type: "object", additionalProperties: true } },
        confirmationItems: { type: "array", items: { type: "object", additionalProperties: true } },
      },
    },
    layout: {
      type: "object",
      additionalProperties: true,
      required: ["schemaVersion", "template", "theme", "sectionLayout"],
      properties: {
        schemaVersion: { type: "number", enum: [1] },
        template: { type: "string", enum: ["default"] },
        theme: { type: "object", additionalProperties: true },
        sectionLayout: { type: "array", items: { type: "object", additionalProperties: true } },
      },
    },
    confirmationItems: { type: "array", items: { type: "object", additionalProperties: true } },
    aiWarnings: { type: "array", items: { type: "object", additionalProperties: true } },
  },
  $defs: {
    richText: richTextJsonSchema,
  },
};

export function validateAiOutput(output: ResumeAiOutput): ResumeAiOutput {
  const parsed = resumeAiOutputSchema.safeParse(output);
  if (!parsed.success) {
    throw new ResumeAiError("AI_OUTPUT_INVALID", parsed.error.issues.map((issue) => issue.message).join(" "));
  }
  const merged: ResumeContent = {
    ...parsed.data.resume,
    confirmationItems: parsed.data.confirmationItems,
  };
  const validationErrors = collectResumeValidationErrors(merged, parsed.data.layout);
  if (validationErrors.length > 0) {
    throw new ResumeAiError("AI_OUTPUT_INVALID", validationErrors.join(" "));
  }
  return {
    ...parsed.data,
    resume: merged,
  };
}

function toRichText(value: string): RichText {
  const plainText = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return {
    format: "html",
    html: `<p>${escapeHtml(value).replace(/&lt;br&gt;/g, "<br>")}</p>`,
    plainText,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
