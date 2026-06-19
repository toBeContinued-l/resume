import type { NextRequest } from "next/server";
import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk, readJsonObject } from "@/server/api/http";
import { jsonNoContent } from "@/app/api/resumes/api-utils";
import { requireCurrentUser } from "@/server/app-runtime";
import type { ResumeContent, ResumeLayout } from "@/types/resume";

type RouteContext = {
  params: Promise<{ resumeId: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser(request);
    const { resumeId } = await context.params;
    const editable = await getAppServices().resumeService.getEditableResume({ userId: user.id, resumeId });
    return jsonOk(editable);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser(request);
    const { resumeId } = await context.params;
    const body = (await request.json()) as { content?: ResumeContent; layout?: ResumeLayout };
    if (!body.content || !body.layout) {
      throw new Error("content and layout are required.");
    }

    const saved = await getAppServices().resumeService.saveEditedContent({
      userId: user.id,
      resumeId,
      content: body.content,
      layout: body.layout,
    });
    const editable = await getAppServices().resumeService.getEditableResume({ userId: user.id, resumeId });
    return jsonOk({ ...editable, content: saved.contentJson, layout: saved.layoutJson });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser(request);
    const { resumeId } = await context.params;
    const body = await readJsonObject(request);
    const editable = await getAppServices().resumeService.getEditableResume({ userId: user.id, resumeId });
    const content = {
      ...editable.content,
      title: String(body.title ?? editable.content.title).trim() || editable.content.title,
    };
    const saved = await getAppServices().resumeService.saveEditedContent({
      userId: user.id,
      resumeId,
      content,
      layout: editable.layout,
    });
    return jsonOk({ ...editable, content: saved.contentJson, layout: saved.layoutJson });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireCurrentUser(request);
    const { resumeId } = await context.params;
    await getAppServices().resumeService.softDelete({ userId: user.id, resumeId });
    return jsonNoContent();
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
