import type { NextRequest } from "next/server";
import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk, readSessionToken } from "@/server/api/http";

export async function GET(request: NextRequest) {
  try {
    const user = await getAppServices().authService.getCurrentUser({ sessionToken: readSessionToken(request) });
    return jsonOk({ user });
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
