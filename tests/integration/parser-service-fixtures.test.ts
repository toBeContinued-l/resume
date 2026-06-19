import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ParserService } from "@/server/parser";
import type { LibreOfficeDocConverter } from "@/server/parser/doc-converter";
import type { GenerationTaskRecord } from "@/server/queue/types";
import {
  createDocxFixture,
  createValidTextPdfFixture,
} from "../fixtures/parser/builders";

describe("ParserService fixture integration", () => {
  let taskDir: string;

  beforeEach(async () => {
    taskDir = await mkdtemp(path.join(tmpdir(), "resume-parser-service-"));
  });

  afterEach(async () => {
    await rm(taskDir, { recursive: true, force: true });
  });

  it("parses a complex DOCX fixture from disk with text, table, list, link and image assets", async () => {
    const content = createDocxFixture({
      documentXml: complexDocxXml,
      media: [{ path: "word/media/avatar.png", content: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }],
    });
    const filePath = path.join(taskDir, "complex-resume.docx");
    await writeFile(filePath, content);

    const parsed = await new ParserService().parse({
      task: task({ fileType: "docx", fileSize: content.length, tempFilePath: filePath }),
    });

    expect(parsed.source).toMatchObject({ fileType: "docx", originalFileName: "complex-resume.docx" });
    expect(parsed.plainText).toContain("Milu Zhang");
    expect(parsed.tables[0]?.rows[0]?.map((cell) => cell.text)).toEqual(["Skill", "TypeScript"]);
    expect(parsed.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "heading", level: 1, text: "Milu Zhang" }),
        expect.objectContaining({ type: "list", text: "Launched resume editor" }),
        expect.objectContaining({ type: "paragraph", text: "Portfolio", marks: ["link"] }),
      ]),
    );
    expect(parsed.assets[0]).toMatchObject({ kind: "image", mimeType: "image/png" });
    expect(parsed.assets[0]?.tempPath).toContain(path.join(taskDir, "assets"));
  });

  it("parses a valid PDF fixture from disk through PDF.js", async () => {
    const content = createValidTextPdfFixture("Milu Zhang Product Engineer");
    const filePath = path.join(taskDir, "resume.pdf");
    await writeFile(filePath, content);

    const parsed = await new ParserService().parse({
      task: task({ fileType: "pdf", fileSize: content.length, tempFilePath: filePath }),
    });

    expect(parsed.source).toMatchObject({ fileType: "pdf", originalFileName: "resume.pdf" });
    expect(parsed.plainText).toContain("Milu Zhang Product Engineer");
    expect(parsed.blocks[0]).toMatchObject({ page: 1, text: "Milu Zhang Product Engineer" });
    expect(parsed.warnings[0]?.message).toContain("PDF.js");
  });

  it("converts legacy DOC files to DOCX before parsing", async () => {
    const docContent = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00, 0x01]);
    const docPath = path.join(taskDir, "legacy-resume.doc");
    const convertedDocxPath = path.join(taskDir, "legacy-resume.docx");
    const convertedDocxContent = createDocxFixture({
      documentXml: `
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p>
              <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
              <w:r><w:t>Milu Zhang Legacy Resume</w:t></w:r>
            </w:p>
            <w:p><w:r><w:t>Converted from old Word format</w:t></w:r></w:p>
          </w:body>
        </w:document>
      `,
    });
    const converter: LibreOfficeDocConverter = {
      async convertDocToDocx(input) {
        expect(input).toEqual({ docPath, taskDir });
        await writeFile(convertedDocxPath, convertedDocxContent);
        return { docxPath: convertedDocxPath };
      },
    };
    await writeFile(docPath, docContent);

    const parsed = await new ParserService(converter).parse({
      task: task({ fileType: "doc", fileSize: docContent.length, tempFilePath: docPath }),
    });

    expect(parsed.source).toMatchObject({ fileType: "doc", originalFileName: "legacy-resume.doc" });
    expect(parsed.plainText).toContain("Milu Zhang Legacy Resume");
    expect(parsed.plainText).toContain("Converted from old Word format");
    expect(parsed.warnings[0]).toEqual({
      code: "DOC_CONVERTED",
      message: ".doc file was converted to .docx before parsing.",
    });
  });
});

function task(input: Pick<GenerationTaskRecord, "fileType" | "fileSize" | "tempFilePath">): GenerationTaskRecord {
  const now = new Date("2026-06-07T00:00:00.000Z");
  return {
    id: "task-1",
    userId: "user-1",
    resumeId: "resume-1",
    status: "pending",
    retryCount: 0,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    isDeleted: false,
    deletedAt: null,
    ...input,
  };
}

const complexDocxXml = `
  <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
      <w:p>
        <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
        <w:r><w:t>Milu Zhang</w:t></w:r>
      </w:p>
      <w:p>
        <w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Product Engineer</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
        <w:r><w:t>Launched resume editor</w:t></w:r>
      </w:p>
      <w:p>
        <w:hyperlink r:id="rLink1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <w:r><w:t>Portfolio</w:t></w:r>
        </w:hyperlink>
      </w:p>
      <w:tbl>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Skill</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>TypeScript</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>
    </w:body>
  </w:document>
`;
