import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk, readJsonObject } from "@/server/api/http";
import { buildForgotPasswordRateLimitRules, enforceRateLimits, getClientIp, normalizeRateLimitKey } from "@/server/rate-limit";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const email = String(body.email ?? "");
    await enforceRateLimits(getAppServices().rateLimiter, buildForgotPasswordRateLimitRules({
      ip: getClientIp(request),
      email: normalizeRateLimitKey(email),
    }));
    await getAppServices().authService.forgotPassword({ email });
    return jsonOk({ sent: true });
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
