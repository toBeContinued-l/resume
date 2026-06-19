import { NextResponse } from "next/server";
import { jsonError } from "@/server/api/http";
import {
  buildGatewayRateLimitRule,
  enforceRateLimits,
  getClientIp,
  getSharedRateLimiter,
} from "@/server/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await enforceRateLimits(getSharedRateLimiter(), [buildGatewayRateLimitRule(getClientIp(request))]);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return jsonError(error);
  }
}
