import { NextResponse } from "next/server";
import { ResumeError } from "@/server/resume/types";

export function jsonOk(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function jsonNoContent() {
  return new NextResponse(null, { status: 204 });
}

export function handleApiError(error: unknown) {
  if (error instanceof Response) {
    return error;
  }
  if (error instanceof ResumeError) {
    const status =
      error.code === "FORBIDDEN"
        ? 403
        : error.code === "RESUME_NOT_FOUND"
          ? 404
          : 400;
    return NextResponse.json({ error: error.code }, { status });
  }
  return NextResponse.json({ error: "INTERNAL_SERVER_ERROR" }, { status: 500 });
}

export async function readRouteParams<T extends Record<string, string>>(
  params: T | Promise<T>,
): Promise<T> {
  return params instanceof Promise ? params : Promise.resolve(params);
}
