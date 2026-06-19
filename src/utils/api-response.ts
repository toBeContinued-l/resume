import type { ApiResponse } from "@/types/api";
import type { ErrorCode } from "@/types/errors";

export const ok = <T>(data: T): ApiResponse<T> => ({
  ok: true,
  data
});

export const fail = (
  code: ErrorCode,
  message: string
): ApiResponse<never> => ({
  ok: false,
  error: {
    code,
    message
  }
});
