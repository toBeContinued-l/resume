import type { ParsedBlock, ParsedResumeDocument } from "@/types/parser";
import { RetryableParserError } from "./errors";

export async function parsePdfBuffer(input: {
  content: Buffer;
  originalFileName: string;
  fileSize: number;
}): Promise<ParsedResumeDocument> {
  const pdfJsDocument = await parseWithPdfJs(input);
  if (pdfJsDocument) {
    return pdfJsDocument;
  }

  const raw = input.content.toString("latin1");
  const text = extractPdfText(raw);
  if (text.trim().length < 3) {
    throw new RetryableParserError("PARSE_EMPTY", "No readable text was found in the PDF file. Scanned PDFs are not supported.");
  }

  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const blocks: ParsedBlock[] = lines.map((line, index) => ({
    id: `pdf-block-${index + 1}`,
    type: "paragraph",
    text: line,
    page: 1,
  }));

  return {
    source: {
      fileType: "pdf",
      originalFileName: input.originalFileName,
      fileSize: input.fileSize,
    },
    plainText: lines.join("\n"),
    blocks,
    tables: [],
    assets: [],
    warnings: [{ code: "PDF_TEXT_ORDER_UNCERTAIN", message: "PDF text order was inferred from content stream order." }],
  };
}

async function parseWithPdfJs(input: {
  content: Buffer;
  originalFileName: string;
  fileSize: number;
}): Promise<ParsedResumeDocument | null> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(input.content),
      useSystemFonts: true,
    });
    const pdf = await loadingTask.promise;
    const blocks: ParsedBlock[] = [];
    const lines: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageLines = textContent.items
        .map((item) => ("str" in item && typeof item.str === "string" ? item.str.trim() : ""))
        .filter(Boolean);
      for (const line of pageLines) {
        lines.push(line);
        blocks.push({
          id: `pdf-block-${blocks.length + 1}`,
          type: "paragraph",
          text: line,
          page: pageNumber,
        });
      }
    }
    const plainText = lines.join("\n").trim();
    if (plainText.length < 3) {
      throw new RetryableParserError("PARSE_EMPTY", "No readable text was found in the PDF file. Scanned PDFs are not supported.");
    }
    return {
      source: {
        fileType: "pdf",
        originalFileName: input.originalFileName,
        fileSize: input.fileSize,
      },
      plainText,
      blocks,
      tables: [],
      assets: [],
      warnings: [{ code: "PDF_TEXT_ORDER_UNCERTAIN", message: "PDF text order was extracted by PDF.js and may differ from visual order." }],
    };
  } catch (error) {
    if (error instanceof RetryableParserError) {
      throw error;
    }
    return null;
  }
}

function extractPdfText(raw: string): string {
  const literalStrings = [...raw.matchAll(/\((?:\\.|[^\\)])*\)\s*Tj/g)].map((match) => decodePdfLiteral(match[0].replace(/\)\s*Tj$/, "").slice(1)));
  const arrayStrings = [...raw.matchAll(/\[(.*?)\]\s*TJ/gs)].flatMap((match) =>
    [...match[1].matchAll(/\((?:\\.|[^\\)])*\)/g)].map((part) => decodePdfLiteral(part[0].slice(1, -1))),
  );
  const hexStrings = [...raw.matchAll(/<([0-9a-fA-F]{6,})>\s*Tj/g)].map((match) => decodeHexPdfString(match[1]));
  const explicitText = [...literalStrings, ...arrayStrings, ...hexStrings].filter(Boolean).join("\n");
  if (explicitText.trim()) {
    return normalizeText(explicitText);
  }

  const readableRuns = raw
    .replace(/[^\t\n\r -~]+/g, " ")
    .match(/[A-Za-z0-9][A-Za-z0-9@+/#.,:;()&%_\-\s]{2,}/g);
  return normalizeText((readableRuns ?? []).join("\n"));
}

function decodePdfLiteral(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\([()\\])/g, "$1");
}

function decodeHexPdfString(value: string): string {
  const bytes = Buffer.from(value.length % 2 === 0 ? value : `${value}0`, "hex");
  return bytes.toString("utf8").replace(/\0/g, "");
}

function normalizeText(value: string): string {
  return value
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !line.startsWith("%PDF") && !isPdfStructuralLine(line))
    .join("\n");
}

function isPdfStructuralLine(line: string): boolean {
  const tokens = line.split(/\s+/).filter(Boolean);
  return (
    tokens.length > 0 &&
    tokens.every((token) => /^(%?PDF-\d(?:\.\d)?|obj|endobj|stream|endstream|xref|trailer|startxref|%%EOF)$/i.test(token))
  );
}
