import type { NextRequest } from "next/server";
import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk, readJsonObject } from "@/server/api/http";
import { requireCurrentUser } from "@/server/app-runtime";
import { readRouteParams } from "@/app/api/resumes/api-utils";
import type { ResumeLinkAccessMode } from "@/server/resume/types";

type RouteContext = {
  params: Promise<{ resumeId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser(request);
    const { resumeId } = await readRouteParams(context.params);
    const link = await getAppServices().resumeLinkService.getOrCreateLink({ userId: user.id, resumeId });
    return jsonOk({ link });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser(request);
    const { resumeId } = await readRouteParams(context.params);
    const body = (await request.json()) as { accessMode?: ResumeLinkAccessMode; password?: string };
    const link = await getAppServices().resumeLinkService.updateLink({
      userId: user.id,
      resumeId,
      accessMode: body.accessMode ?? "private_link",
      password: body.password,
    });
    await getAppServices().resumeService.publish({ userId: user.id, resumeId });
    return jsonOk({ link });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser(request);
    const { resumeId } = await readRouteParams(context.params);
    const body = await readJsonObject(request);
    const link = await getAppServices().resumeLinkService.updateLink({
      userId: user.id,
      resumeId,
      accessMode: String(body.accessMode ?? "private_link") as ResumeLinkAccessMode,
      password: typeof body.password === "string" ? body.password : undefined,
    });
    await getAppServices().resumeService.publish({ userId: user.id, resumeId });
    return jsonOk({ link });
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
