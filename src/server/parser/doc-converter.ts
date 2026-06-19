import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";
import { ParserError } from "./errors";

const execFileAsync = promisify(execFile);

export type DocConversionResult = {
  docxPath: string;
};

export interface LibreOfficeDocConverter {
  convertDocToDocx(input: { docPath: string; taskDir: string }): Promise<DocConversionResult>;
}

export class LibreOfficeHeadlessDocConverter implements LibreOfficeDocConverter {
  constructor(private readonly command = "soffice") {}

  async convertDocToDocx(input: { docPath: string; taskDir: string }): Promise<DocConversionResult> {
    try {
      await execFileAsync(this.command, [
        "--headless",
        "--convert-to",
        "docx",
        "--outdir",
        input.taskDir,
        input.docPath,
      ]);
    } catch (error) {
      throw new ParserError("DOC_CONVERSION_FAILED", getErrorMessage(error), false);
    }

    const convertedName = `${path.basename(input.docPath, path.extname(input.docPath))}.docx`;
    return { docxPath: path.join(input.taskDir, convertedName) };
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "LibreOffice failed to convert .doc to .docx.";
}
