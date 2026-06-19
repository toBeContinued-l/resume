import { describe, expect, it } from "vitest";
import { OpenAiResumeAiProvider, ResumeAiService } from "@/server/ai";
import type { ResumeAiInput } from "@/types/ai";

const runWithOpenAi = process.env.AI_API_KEY || process.env.OPENAI_API_KEY ? it : it.skip;

describe("OpenAI resume provider smoke", () => {
  runWithOpenAi(
    "generates schema-valid resume content without inventing a different candidate identity",
    async () => {
      const output = await new ResumeAiService(new OpenAiResumeAiProvider()).generateResume(input);

      expect(output.resume.title).toMatch(/Milu Zhang/i);
      expect(output.resume.sections.length).toBeGreaterThanOrEqual(2);
      expect(output.resume.moduleOrder).toEqual(output.resume.sections.map((section) => section.id));
      expect(output.layout.template).toBe("default");
      expect(output.layout.sectionLayout.map((item) => item.sectionId)).toEqual(output.resume.moduleOrder);
      expect(JSON.stringify(output.resume)).not.toMatch(/Google|Meta|Amazon|Stanford/i);
      expect(output.resume.confirmationItems.every((item) => item.status === "pending")).toBe(true);
    },
    60_000,
  );
});

const input: ResumeAiInput = {
  parsedDocument: {
    source: { fileType: "pdf", originalFileName: "milu-zhang-resume.pdf", fileSize: 2048 },
    plainText: [
      "Milu Zhang",
      "Product Engineer",
      "Email: milu@example.test",
      "Experience",
      "Codex Labs - Product Engineer - 2024 to Present",
      "Built TypeScript workflow tools for document automation and online resume editing.",
      "Projects",
      "Online Resume Generator: implemented upload validation, AI draft generation, editing, and public links.",
      "Skills",
      "TypeScript, React, Next.js, MySQL, RabbitMQ",
    ].join("\n"),
    semanticHtml: "",
    blocks: [
      { id: "name", type: "heading", level: 1, text: "Milu Zhang" },
      { id: "role", type: "paragraph", text: "Product Engineer" },
    ],
    tables: [],
    assets: [],
    warnings: [],
  },
  constraints: {
    noFabrication: true,
    markUncertainContent: true,
    fixedTemplateOnly: true,
    preserveParsedImagesAndTables: true,
  },
};
