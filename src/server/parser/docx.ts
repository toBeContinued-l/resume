import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { inflateRawSync } from "zlib";
import mammoth from "mammoth";
import type { ParsedAsset, ParsedBlock, ParsedResumeDocument, ParsedTable, ParserWarning } from "@/types/parser";
import type { SourceFileType } from "@/server/resume/types";
import { ParserError, RetryableParserError } from "./errors";

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

export async function parseDocxBuffer(input: {
  content: Buffer;
  originalFileName: string;
  fileSize: number;
  sourceFileType?: SourceFileType;
  taskDir?: string;
}): Promise<ParsedResumeDocument> {
  let files: Map<string, Buffer>;
  try {
    files = unzip(input.content);
  } catch (error) {
    throw new ParserError("DOCX_PARSE_FAILED", getErrorMessage(error), false);
  }

  const documentXml = files.get("word/document.xml");
  if (!documentXml) {
    throw new ParserError("DOCX_PARSE_FAILED", "DOCX file does not contain word/document.xml.", false);
  }

  const xml = documentXml.toString("utf8");
  const tables = extractTables(xml);
  const blocks = extractBlocks(xml, tables);
  const plainText = blocks
    .filter((block) => block.text?.trim())
    .map((block) => block.text?.trim())
    .join("\n");

  if (!plainText.trim() && !tables.some((table) => table.rows.some((row) => row.some((cell) => cell.text.trim())))) {
    throw new RetryableParserError("PARSE_EMPTY", "No readable text was found in the DOCX file.");
  }

  const assets = await extractAssets(files, input.taskDir);
  const mammothResult = await convertDocxWithMammoth(input.content);
  const warnings = collectWarnings(assets, mammothResult.messages);
  return {
    source: {
      fileType: input.sourceFileType ?? "docx",
      originalFileName: input.originalFileName,
      fileSize: input.fileSize,
    },
    plainText,
    semanticHtml: mammothResult.html || blocksToHtml(blocks),
    blocks,
    tables,
    assets,
    warnings,
  };
}

function unzip(content: Buffer): Map<string, Buffer> {
  const entries = readCentralDirectory(content);
  const files = new Map<string, Buffer>();

  for (const entry of entries) {
    const localOffset = entry.localHeaderOffset;
    if (content.readUInt32LE(localOffset) !== 0x04034b50) {
      continue;
    }
    const fileNameLength = content.readUInt16LE(localOffset + 26);
    const extraLength = content.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + fileNameLength + extraLength;
    const compressed = content.subarray(dataStart, dataStart + entry.compressedSize);
    if (entry.method === 0) {
      files.set(entry.name, compressed);
    } else if (entry.method === 8) {
      files.set(entry.name, inflateRawSync(compressed));
    }
  }

  return files;
}

function readCentralDirectory(content: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(content);
  if (eocdOffset < 0) {
    throw new Error("ZIP central directory was not found.");
  }

  const entryCount = content.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = content.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (content.readUInt32LE(offset) !== 0x02014b50) {
      break;
    }
    const method = content.readUInt16LE(offset + 10);
    const compressedSize = content.readUInt32LE(offset + 20);
    const uncompressedSize = content.readUInt32LE(offset + 24);
    const fileNameLength = content.readUInt16LE(offset + 28);
    const extraLength = content.readUInt16LE(offset + 30);
    const commentLength = content.readUInt16LE(offset + 32);
    const localHeaderOffset = content.readUInt32LE(offset + 42);
    const name = content.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");
    entries.push({ name, method, compressedSize, uncompressedSize, localHeaderOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(content: Buffer): number {
  const minOffset = Math.max(0, content.length - 0xffff - 22);
  for (let offset = content.length - 22; offset >= minOffset; offset -= 1) {
    if (content.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  return -1;
}

function extractBlocks(xml: string, tables: ParsedTable[]): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const paragraphRegex = /<w:p\b[\s\S]*?<\/w:p>/g;
  let paragraphMatch: RegExpExecArray | null;
  let index = 0;
  while ((paragraphMatch = paragraphRegex.exec(xml))) {
    const paragraphXml = paragraphMatch[0];
    const text = extractTextRuns(paragraphXml).trim();
    if (!text) {
      continue;
    }
    const headingLevel = getHeadingLevel(paragraphXml);
    const isList = isListParagraph(paragraphXml);
    blocks.push({
      id: `block-${++index}`,
      type: headingLevel ? "heading" : isList ? "list" : "paragraph",
      text,
      ...(headingLevel ? { level: headingLevel } : {}),
      marks: extractMarks(paragraphXml),
    });
  }

  for (const table of tables) {
    blocks.push({ id: `block-${++index}`, type: "table", text: table.rows.flat().map((cell) => cell.text).join(" ") });
  }

  return blocks;
}

function extractTables(xml: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  const tableRegex = /<w:tbl\b[\s\S]*?<\/w:tbl>/g;
  let tableMatch: RegExpExecArray | null;
  let tableIndex = 0;
  while ((tableMatch = tableRegex.exec(xml))) {
    const rows = [...tableMatch[0].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)].map((rowMatch) =>
      [...rowMatch[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)].map((cellMatch) => ({
        text: extractTextRuns(cellMatch[0]).trim(),
      })),
    );
    if (rows.some((row) => row.some((cell) => cell.text))) {
      tables.push({ id: `table-${++tableIndex}`, rows });
    }
  }
  return tables;
}

function extractTextRuns(xml: string): string {
  return [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1]))
    .join("");
}

function getHeadingLevel(xml: string): number | undefined {
  const match = xml.match(/<w:pStyle[^>]*w:val=["']Heading([1-6])["']/i);
  return match ? Number(match[1]) : undefined;
}

function isListParagraph(xml: string): boolean {
  return /<w:numPr\b/.test(xml) || /<w:pStyle[^>]*w:val=["'][^"']*List/i.test(xml);
}

function extractMarks(xml: string): ParsedBlock["marks"] {
  const marks = new Set<NonNullable<ParsedBlock["marks"]>[number]>();
  if (/<w:b\b/.test(xml)) {
    marks.add("bold");
  }
  if (/<w:i\b/.test(xml)) {
    marks.add("italic");
  }
  if (/<w:u\b/.test(xml)) {
    marks.add("underline");
  }
  if (/<w:hyperlink\b/.test(xml) || /<w:fldChar\b/.test(xml) || /HYPERLINK\s+["']?/i.test(xml)) {
    marks.add("link");
  }
  return marks.size > 0 ? [...marks] : undefined;
}

async function extractAssets(files: Map<string, Buffer>, taskDir: string | undefined): Promise<ParsedAsset[]> {
  if (!taskDir) {
    return [];
  }
  const assets: ParsedAsset[] = [];
  const assetsDir = path.join(taskDir, "assets");
  await mkdir(assetsDir, { recursive: true });

  for (const [name, content] of files.entries()) {
    if (!name.startsWith("word/media/")) {
      continue;
    }
    const id = `asset-${assets.length + 1}`;
    const fileName = `${id}${path.extname(name).toLowerCase() || ".bin"}`;
    const tempPath = path.join(assetsDir, fileName);
    await writeFile(tempPath, content);
    assets.push({
      id,
      kind: "image",
      mimeType: mimeTypeFromExtension(name),
      tempPath,
    });
  }

  return assets;
}

function blocksToHtml(blocks: ParsedBlock[]): string {
  return blocks
    .filter((block) => block.type !== "table" && block.text?.trim())
    .map((block) => {
      const text = escapeHtml(block.text ?? "");
      if (block.type === "heading") {
        const level = block.level ?? 2;
        return `<h${level}>${text}</h${level}>`;
      }
      if (block.type === "list") {
        return `<ul><li>${text}</li></ul>`;
      }
      return `<p>${text}</p>`;
    })
    .join("");
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mimeTypeFromExtension(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".gif") {
    return "image/gif";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  return "image/png";
}

async function convertDocxWithMammoth(content: Buffer): Promise<{ html: string; messages: string[] }> {
  try {
    const result = await mammoth.convertToHtml(
      { buffer: content },
      {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "b => strong",
          "i => em",
          "u => u",
        ],
      },
    );
    return {
      html: result.value.trim(),
      messages: result.messages.map((message) => message.message).filter(Boolean),
    };
  } catch {
    return { html: "", messages: ["Mammoth could not fully parse the DOCX; basic XML extraction was used."] };
  }
}

function collectWarnings(assets: ParsedAsset[], mammothMessages: string[]): ParserWarning[] {
  const warnings: ParserWarning[] = [];
  if (assets.length > 0) {
    warnings.push({ code: "STYLE_LOSS", message: "Images were preserved as assets but complex Word styling may be simplified." });
  }
  for (const message of mammothMessages) {
    warnings.push({ code: "UNSUPPORTED_COMPLEX_ELEMENT", message });
  }
  return warnings;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "DOCX parsing failed.";
}
