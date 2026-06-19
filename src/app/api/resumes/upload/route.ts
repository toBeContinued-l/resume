import type { NextRequest } from "next/server";
import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk } from "@/server/api/http";
import { requireCurrentUser } from "@/server/app-runtime";
import { UploadResumeError } from "@/server/upload/upload-service";

export async function POST(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const formData = await request.formData();
    const files = formData.getAll("file").filter((value): value is File => value instanceof File);
    if (files.length !== 1) {
      throw new UploadResumeError("VALIDATION_ERROR", "A single resume file is required.");
    }
    const result = await getAppServices().uploadResumeService.upload({ userId: user.id, file: files[0] });
    return jsonOk(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
