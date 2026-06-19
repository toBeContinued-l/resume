import { readFile } from "fs/promises";
import path from "path";
import type { ParsedResumeDocument } from "@/types/parser";
import type { GenerationTaskMessage } from "@/types/queue";
import type { GenerationTaskRecord } from "@/server/queue/types";
import { ParserError } from "./errors";
import { identifyResumeFileType } from "./file-type";
import { parseDocxBuffer } from "./docx";
import { parsePdfBuffer } from "./pdf";
import { LibreOfficeHeadlessDocConverter, type LibreOfficeDocConverter } from "./doc-converter";

export type ParserServiceInput = {
  task: GenerationTaskRecord;
  message?: GenerationTaskMessage;
};

export interface ResumeParserService {
  parse(input: ParserServiceInput): Promise<ParsedResumeDocument>;
}

export class ParserService implements ResumeParserService {
  constructor(private readonly docConverter: LibreOfficeDocConverter = new LibreOfficeHeadlessDocConverter()) {}

  async parse(input: ParserServiceInput): Promise<ParsedResumeDocument> {
    const content = await this.readTaskFile(input.task.tempFilePath);
    const fileType = identifyResumeFileType({
      fileName: input.task.tempFilePath,
      content,
    });

    if (fileType !== input.task.fileType) {
      throw new ParserError("UNSUPPORTED_FILE_TYPE", "Uploaded file content does not match the queued file type.", false);
    }

    if (fileType === "docx") {
      return parseDocxBuffer({
        content,
        originalFileName: path.basename(input.task.tempFilePath),
        fileSize: input.task.fileSize,
        taskDir: path.dirname(input.task.tempFilePath),
      });
    }

    if (fileType === "pdf") {
      return await parsePdfBuffer({
        content,
        originalFileName: path.basename(input.task.tempFilePath),
        fileSize: input.task.fileSize,
      });
    }

    const converted = await this.docConverter.convertDocToDocx({
      docPath: input.task.tempFilePath,
      taskDir: path.dirname(input.task.tempFilePath),
    });
    const convertedContent = await this.readTaskFile(converted.docxPath);
    const parsed = await parseDocxBuffer({
      content: convertedContent,
      originalFileName: path.basename(input.task.tempFilePath),
      fileSize: input.task.fileSize,
      sourceFileType: "doc",
      taskDir: path.dirname(input.task.tempFilePath),
    });

    return {
      ...parsed,
      warnings: [{ code: "DOC_CONVERTED", message: ".doc file was converted to .docx before parsing." }, ...parsed.warnings],
    };
  }

  private async readTaskFile(filePath: string): Promise<Buffer> {
    try {
      return await readFile(filePath);
    } catch (error) {
      throw new ParserError("FILE_READ_FAILED", error instanceof Error ? error.message : "Unable to read uploaded file.", false);
    }
  }
}
