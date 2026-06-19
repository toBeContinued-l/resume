import path from "path";
import type { SourceFileType } from "@/server/resume/types";
import { ParserError } from "./errors";

const OLE_DOC_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0]);

export function identifyResumeFileType(input: { fileName?: string; content?: Buffer }): SourceFileType {
  const extension = input.fileName ? path.extname(input.fileName).toLowerCase() : "";
  const content = input.content;

  if (content?.subarray(0, 4).equals(Buffer.from("%PDF"))) {
    return "pdf";
  }
  if (content?.subarray(0, 4).equals(Buffer.from("PK\u0003\u0004"))) {
    return "docx";
  }
  if (content && content.length >= OLE_DOC_MAGIC.length && content.subarray(0, OLE_DOC_MAGIC.length).equals(OLE_DOC_MAGIC)) {
    return "doc";
  }

  if (extension === ".doc") {
    return "doc";
  }
  if (extension === ".docx") {
    return "docx";
  }
  if (extension === ".pdf") {
    return "pdf";
  }

  throw new ParserError("UNSUPPORTED_FILE_TYPE", "Only .doc, .docx, and .pdf resume files are supported.");
}
