import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk, readJsonObject } from "@/server/api/http";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    await getAppServices().authService.resetPassword({
      token: String(body.token ?? ""),
      newPassword: String(body.newPassword ?? ""),
    });
    return jsonOk({ reset: true });
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
