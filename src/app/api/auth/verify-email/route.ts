import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk, readJsonObject } from "@/server/api/http";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const user = await getAppServices().authService.verifyEmail({
      token: typeof body.token === "string" ? body.token : undefined,
      email: typeof body.email === "string" ? body.email : undefined,
      code: typeof body.code === "string" ? body.code : undefined,
    });
    return jsonOk({ user });
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
