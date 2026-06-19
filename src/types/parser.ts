import { z } from "zod";

export const fileTypeSchema = z.enum(["doc", "docx", "pdf"]);

export const parserWarningCodeSchema = z.enum([
  "DOC_CONVERTED",
  "STYLE_LOSS",
  "PDF_TEXT_ORDER_UNCERTAIN",
  "LOW_TEXT_CONFIDENCE",
  "UNSUPPORTED_COMPLEX_ELEMENT"
]);

export const parserWarningSchema = z.object({
  code: parserWarningCodeSchema,
  message: z.string().min(1)
});

export type ParserWarning = z.infer<typeof parserWarningSchema>;

export const parsedBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["heading", "paragraph", "list", "table", "image", "unknown"]),
  text: z.string().optional(),
  level: z.number().int().positive().optional(),
  page: z.number().int().positive().optional(),
  bbox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number().nonnegative(),
      height: z.number().nonnegative()
    })
    .optional(),
  marks: z.array(z.enum(["bold", "italic", "underline", "link"])).optional()
});

export type ParsedBlock = z.infer<typeof parsedBlockSchema>;

export const parsedTableSchema = z.object({
  id: z.string().min(1),
  rows: z.array(
    z.array(
      z.object({
        text: z.string(),
        colspan: z.number().int().positive().optional(),
        rowspan: z.number().int().positive().optional()
      })
    )
  )
});

export type ParsedTable = z.infer<typeof parsedTableSchema>;

export const parsedAssetSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("image"),
  mimeType: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  tempPath: z.string().min(1)
});

export type ParsedAsset = z.infer<typeof parsedAssetSchema>;

export const parsedResumeDocumentSchema = z.object({
  source: z.object({
    fileType: fileTypeSchema,
    originalFileName: z.string().min(1),
    fileSize: z.number().int().nonnegative()
  }),
  plainText: z.string(),
  semanticHtml: z.string().optional(),
  blocks: z.array(parsedBlockSchema),
  tables: z.array(parsedTableSchema),
  assets: z.array(parsedAssetSchema),
  warnings: z.array(parserWarningSchema)
});

export type ParsedResumeDocument = z.infer<typeof parsedResumeDocumentSchema>;
