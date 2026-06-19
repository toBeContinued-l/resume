import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, createExpiredSessionCookieOptions } from "../auth/session-cookie";
import { AuthError } from "../auth/types";
import { GenerationTaskError } from "../queue/types";
import { ResumeError } from "../resume/types";
import { UploadResumeError } from "../upload/upload-service";
import { fail, ok } from "@/utils/api-response";
import type { ErrorCode } from "@/types/errors";

export function jsonOk<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(ok(data), init);
}

export function jsonError(error: unknown): NextResponse {
  const mapped = mapError(error);
  const response = NextResponse.json(fail(mapped.code, mapped.message), { status: mapped.status });
  if (mapped.retryAfterSeconds !== undefined) {
    response.headers.set("Retry-After", String(mapped.retryAfterSeconds));
  }
  return response;
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    return Object.fromEntries(formData.entries());
  }

  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function readSessionToken(request: NextRequest): string | undefined {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value;
}

export function clearSessionCookie(response: NextResponse, secure = process.env.NODE_ENV === "production"): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", createExpiredSessionCookieOptions({ secure }));
}

function mapError(error: unknown): { code: ErrorCode; message: string; status: number; retryAfterSeconds?: number } {
  if (
    error instanceof AuthError ||
    error instanceof UploadResumeError ||
    error instanceof GenerationTaskError ||
    error instanceof ResumeError ||
    hasKnownErrorCode(error)
  ) {
    return mapKnownError(error.code, error.message, error);
  }
  return { code: "GENERATION_FAILED", message: "Unexpected server error.", status: 500 };
}

function hasKnownErrorCode(error: unknown): error is Error & { code: string } {
  return error instanceof Error && typeof (error as { code?: unknown }).code === "string";
}

function mapKnownError(
  code: string,
  message: string,
  error?: unknown,
): { code: ErrorCode; message: string; status: number; retryAfterSeconds?: number } {
  switch (code) {
    case "UNAUTHENTICATED":
      return { code: "UNAUTHENTICATED", message, status: 401 };
    case "FORBIDDEN":
      return { code: "FORBIDDEN", message, status: 403 };
    case "EMAIL_ALREADY_EXISTS":
    case "INVALID_TOKEN":
    case "INVALID_VERIFICATION_CODE":
    case "TOKEN_EXPIRED":
    case "TOKEN_USED":
    case "INVALID_CREDENTIALS":
    case "ACCOUNT_NOT_ACTIVE":
    case "ACCOUNT_DISABLED":
    case "VALIDATION_ERROR":
      return { code: "VALIDATION_ERROR", message, status: 400 };
    case "RATE_LIMITED":
      return { code: "RATE_LIMITED", message, status: 429, retryAfterSeconds: getRetryAfterSeconds(error) };
    case "FILE_TOO_LARGE":
      return { code: "FILE_TOO_LARGE", message, status: 400 };
    case "UNSUPPORTED_FILE_TYPE":
      return { code: "UNSUPPORTED_FILE_TYPE", message, status: 400 };
    case "RESUME_LIMIT_REACHED":
      return { code: "RESUME_LIMIT_REACHED", message, status: 409 };
    case "TASK_NOT_FOUND":
      return { code: "TASK_NOT_FOUND", message, status: 404 };
    case "RESUME_NOT_FOUND":
      return { code: "RESUME_NOT_FOUND", message, status: 404 };
    case "INVALID_STATUS":
    case "INVALID_STATE":
      return { code: "VALIDATION_ERROR", message, status: 409 };
    default:
      return { code: "GENERATION_FAILED", message, status: 500 };
  }
}

function getRetryAfterSeconds(error: unknown): number | undefined {
  if (error instanceof Error) {
    const value = (error as Error & { retryAfterSeconds?: unknown }).retryAfterSeconds;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.ceil(value);
    }
  }
  return undefined;
}
