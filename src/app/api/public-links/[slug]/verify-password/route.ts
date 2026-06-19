import { getAppServices } from "@/server/app-services";
import { jsonError, jsonOk, readJsonObject } from "@/server/api/http";
import { readRouteParams } from "@/app/api/resumes/api-utils";
import {
  buildPublicLinkPasswordRateLimitRules,
  enforceRateLimits,
  getClientIp,
  normalizeRateLimitKey,
} from "@/server/rate-limit";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { slug } = await readRouteParams(context.params);
    const body = await readJsonObject(request);
    await enforceRateLimits(getAppServices().rateLimiter, buildPublicLinkPasswordRateLimitRules({
      ip: getClientIp(request),
      slug: normalizeRateLimitKey(slug),
    }));
    const access = await getAppServices().resumeLinkService.verifyPassword({
      slug,
      password: String(body.password ?? ""),
    });
    if (!access.ok) {
      return jsonOk({ verified: false, reason: access.reason }, { status: access.reason === "password_required" ? 401 : 404 });
    }
    return jsonOk({ verified: true, resume: access.resume, link: access.link });
  } catch (error) {
    return jsonError(error);
  }
}

export const dynamic = "force-dynamic";
