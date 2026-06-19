import type { NextRequest } from "next/server";
import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk } from "@/server/api/http";
import { requireCurrentUser } from "@/server/app-runtime";
import { readRouteParams } from "@/app/api/resumes/api-utils";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser(request);
    const { taskId } = await readRouteParams(context.params);
    const progress = await getAppServices().generationTaskStatusService.getProgressForUser(user.id, taskId);
    return jsonOk(progress);
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser(request);
    const { taskId } = await readRouteParams(context.params);
    const services = getAppServices();
    const task = await services.generationTaskStatusService.requireTaskForUser(user.id, taskId);
    const progress = await services.generationTaskStatusService.cancelTaskForUser(user.id, taskId);
    await services.resumeService.markGenerationStatus({
      userId: user.id,
      resumeId: task.resumeId,
      status: "cancelled",
    });
    await services.tempFileService.removeTaskDir({
      userId: user.id,
      taskId,
    });
    return jsonOk(progress);
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
