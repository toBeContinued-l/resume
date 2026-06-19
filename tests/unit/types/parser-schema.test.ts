import { describe, expect, it } from "vitest";
import { parsedResumeDocumentSchema } from "@/types/parser";

describe("parser schemas", () => {
  it("accepts a text PDF parse result", () => {
    const result = parsedResumeDocumentSchema.safeParse({
      source: {
        fileType: "pdf",
        originalFileName: "resume.pdf",
        fileSize: 1024
      },
      plainText: "张三 前端工程师",
      blocks: [
        {
          id: "b1",
          type: "paragraph",
          text: "张三 前端工程师",
          page: 1,
          bbox: { x: 0, y: 0, width: 100, height: 20 }
        }
      ],
      tables: [],
      assets: [],
      warnings: []
    });

    expect(result.success).toBe(true);
  });

  it("rejects unsupported file types", () => {
    const result = parsedResumeDocumentSchema.safeParse({
      source: {
        fileType: "txt",
        originalFileName: "resume.txt",
        fileSize: 10
      },
      plainText: "",
      blocks: [],
      tables: [],
      assets: [],
      warnings: []
    });

    expect(result.success).toBe(false);
  });
});
