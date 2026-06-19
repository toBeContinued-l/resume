import { z } from "zod";
import { parsedResumeDocumentSchema } from "./parser";
import {
  confirmationItemSchema,
  resumeContentSchema,
  resumeLayoutSchema
} from "./resume";

export const resumeAiInputSchema = z.object({
  parsedDocument: parsedResumeDocumentSchema,
  constraints: z.object({
    noFabrication: z.literal(true),
    markUncertainContent: z.literal(true),
    fixedTemplateOnly: z.literal(true),
    preserveParsedImagesAndTables: z.literal(true)
  })
});

export type ResumeAiInput = z.infer<typeof resumeAiInputSchema>;

export const aiWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1)
});

export type AiWarning = z.infer<typeof aiWarningSchema>;

export const resumeAiOutputSchema = z.object({
  resume: resumeContentSchema,
  layout: resumeLayoutSchema,
  confirmationItems: z.array(confirmationItemSchema),
  aiWarnings: z.array(aiWarningSchema)
});

export type ResumeAiOutput = z.infer<typeof resumeAiOutputSchema>;

export interface ResumeAiProvider {
  generateResume(input: ResumeAiInput): Promise<ResumeAiOutput>;
}
