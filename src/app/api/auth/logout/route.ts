import { getAppServices } from "@/server/app-services";
import { clearSessionCookie, jsonError, jsonOk, readSessionToken } from "@/server/api/http";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const sessionToken = readSessionToken(request);
    if (sessionToken) {
      await getAppServices().authService.logout({ sessionToken });
    }
    const response = jsonOk({ loggedOut: true });
    clearSessionCookie(response, process.env.NODE_ENV === "production");
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
