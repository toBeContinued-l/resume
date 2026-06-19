import { z } from "zod";
import { errorCodes } from "./errors";

export const apiErrorSchema = z.object({
  code: z.enum(errorCodes),
  message: z.string().min(1)
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.discriminatedUnion("ok", [
    z.object({
      ok: z.literal(true),
      data: dataSchema
    }),
    z.object({
      ok: z.literal(false),
      error: apiErrorSchema
    })
  ]);
