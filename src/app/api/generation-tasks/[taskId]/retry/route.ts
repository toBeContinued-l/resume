import type { NextRequest } from "next/server";
import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk } from "@/server/api/http";
import { requireCurrentUser } from "@/server/app-runtime";
import { readRouteParams } from "@/app/api/resumes/api-utils";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser(request);
    const { taskId } = await readRouteParams(context.params);
    const services = getAppServices();
    const progress = await services.generationTaskStatusService.retryTaskForUser(
      user.id,
      taskId,
      services.generationQueue,
      {
        beforePublish: async (task) => {
          await services.resumeService.markGenerationStatus({
            userId: user.id,
            resumeId: task.resumeId,
            status: "generating",
          });
        },
      },
    );
    return jsonOk(progress);
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
