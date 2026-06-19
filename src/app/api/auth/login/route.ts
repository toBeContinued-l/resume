import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk, readJsonObject } from "@/server/api/http";
import { SESSION_COOKIE_NAME, createSessionCookieOptions } from "@/server/auth/session-cookie";
import { buildLoginRateLimitRules, enforceRateLimits, getClientIp, normalizeRateLimitKey } from "@/server/rate-limit";

export async function POST(request: Request) {
  try {
    const body = await readJsonObject(request);
    const email = String(body.email ?? "");
    await enforceRateLimits(getAppServices().rateLimiter, buildLoginRateLimitRules({
      ip: getClientIp(request),
      email: normalizeRateLimitKey(email),
    }));
    const result = await getAppServices().authService.login({
      email,
      password: String(body.password ?? ""),
    });
    const response = jsonOk({ user: result.user });
    response.cookies.set(
      SESSION_COOKIE_NAME,
      result.sessionToken,
      createSessionCookieOptions({
        expiresAt: result.session.expiresAt,
        secure: process.env.NODE_ENV === "production",
      }),
    );
    return response;
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
