import type { NextRequest } from "next/server";
import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk } from "@/server/api/http";
import { requireCurrentUser } from "@/server/app-runtime";

export async function GET(request: NextRequest) {
  try {
    const user = await requireCurrentUser(request);
    const resumes = await getAppServices().resumeService.listSummaries(user.id);
    const activeCount = await getAppServices().resumeService.countActiveResumes(user.id);
    return jsonOk({ resumes, remainingUploads: Math.max(0, 3 - activeCount) });
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
