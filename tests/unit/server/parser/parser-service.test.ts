import { describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { identifyResumeFileType, parseDocxBuffer, parsePdfBuffer, ParserError, RetryableParserError } from "@/server/parser";
import {
  createCorruptedFileFixture,
  createDocxFixture,
  createScannedPdfFixture,
  createTextPdfFixture,
  createValidTextPdfFixture,
} from "../../../fixtures/parser/builders";

describe("parser services", () => {
  it("identifies files by content signature before extension", () => {
    expect(identifyResumeFileType({ fileName: "resume.docx", content: Buffer.from("%PDF-1.7") })).toBe("pdf");
    expect(identifyResumeFileType({ fileName: "resume.pdf", content: Buffer.from("PK\u0003\u0004demo") })).toBe("docx");
  });

  it("extracts text from simple text PDF content streams", async () => {
    const pdf = createTextPdfFixture("Milu Resume\nFrontend Engineer");

    const parsed = await parsePdfBuffer({ content: pdf, originalFileName: "resume.pdf", fileSize: pdf.length });

    expect(parsed.source.fileType).toBe("pdf");
    expect(parsed.plainText).toContain("Milu Resume");
    expect(parsed.plainText).toContain("Frontend");
    expect(parsed.warnings[0]?.code).toBe("PDF_TEXT_ORDER_UNCERTAIN");
  });

  it("uses PDF.js to extract text from a structurally valid PDF", async () => {
    const pdf = createValidTextPdfFixture("Milu Zhang Product Engineer");

    const parsed = await parsePdfBuffer({ content: pdf, originalFileName: "valid.pdf", fileSize: pdf.length });

    expect(parsed.plainText).toContain("Milu Zhang Product Engineer");
    expect(parsed.blocks[0]).toMatchObject({ page: 1, text: "Milu Zhang Product Engineer" });
    expect(parsed.warnings[0]?.message).toContain("PDF.js");
  });

  it("extracts text, headings, formatting marks and tables from a simple DOCX", async () => {
    const docx = createDocxFixture({ documentXml: sampleDocumentXml });

    const parsed = await parseDocxBuffer({
      content: docx,
      originalFileName: "resume.docx",
      fileSize: docx.length,
    });

    expect(parsed.source.fileType).toBe("docx");
    expect(parsed.plainText).toContain("Milu Resume");
    expect(parsed.semanticHtml).toContain("<h1>Milu Resume</h1>");
    expect(parsed.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "heading", level: 1, text: "Milu Resume" }),
        expect.objectContaining({ type: "paragraph", marks: ["bold", "italic"], text: "Senior Product Engineer" }),
      ]),
    );
    expect(parsed.tables[0]?.rows[0]?.map((cell) => cell.text)).toEqual(["Skill", "TypeScript"]);
  });

  it("recognizes DOCX list paragraphs and hyperlink marks", async () => {
    const docx = createDocxFixture({ documentXml: listAndLinkDocumentXml });

    const parsed = await parseDocxBuffer({
      content: docx,
      originalFileName: "resume-list-link.docx",
      fileSize: docx.length,
    });

    expect(parsed.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "list", text: "Built editor modules" }),
        expect.objectContaining({ type: "paragraph", text: "Portfolio", marks: ["link"] }),
      ]),
    );
  });

  it("treats scanned or empty PDF content as retryable empty parse", async () => {
    const pdf = createScannedPdfFixture();

    await expect(parsePdfBuffer({ content: pdf, originalFileName: "scan.pdf", fileSize: pdf.length })).rejects.toThrow(RetryableParserError);
  });

  it("preserves DOCX images as task assets", async () => {
    const taskDir = await mkdtemp(path.join(tmpdir(), "resume-parser-"));
    try {
      const docx = createDocxFixture({
        documentXml: sampleDocumentXml,
        media: [{ path: "word/media/avatar.png", content: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }],
      });

      const parsed = await parseDocxBuffer({
        content: docx,
        originalFileName: "resume-with-avatar.docx",
        fileSize: docx.length,
        taskDir,
      });

      expect(parsed.assets).toEqual([
        expect.objectContaining({
          id: "asset-1",
          kind: "image",
          mimeType: "image/png",
          tempPath: expect.stringContaining("asset-1.png"),
        }),
      ]);
      expect(parsed.warnings[0]?.code).toBe("STYLE_LOSS");
    } finally {
      await rm(taskDir, { recursive: true, force: true });
    }
  });

  it("fails corrupted DOCX fixtures without treating structural bytes as resume text", async () => {
    const corrupted = createCorruptedFileFixture();

    await expect(
      parseDocxBuffer({ content: corrupted, originalFileName: "broken.docx", fileSize: corrupted.length }),
    ).rejects.toBeInstanceOf(ParserError);
  });
});

const sampleDocumentXml = `
  <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
      <w:p>
        <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
        <w:r><w:t>Milu Resume</w:t></w:r>
      </w:p>
      <w:p>
        <w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>Senior Product Engineer</w:t></w:r>
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

const listAndLinkDocumentXml = `
  <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
      <w:p>
        <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>
        <w:r><w:t>Built editor modules</w:t></w:r>
      </w:p>
      <w:p>
        <w:hyperlink r:id="rLink1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
          <w:r><w:t>Portfolio</w:t></w:r>
        </w:hyperlink>
      </w:p>
    </w:body>
  </w:document>
`;
