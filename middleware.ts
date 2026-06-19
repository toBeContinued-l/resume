import { NextResponse, type NextRequest } from "next/server";

const GATEWAY_RATE_LIMIT_PATH = "/api/_gateway/rate-limit";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl?.pathname ?? new URL(request.url).pathname;
  if (pathname.startsWith(GATEWAY_RATE_LIMIT_PATH)) {
    return NextResponse.next();
  }

  const response = await checkGatewayRateLimit(request);
  return response ?? NextResponse.next();
}

async function checkGatewayRateLimit(request: NextRequest): Promise<Response | null> {
  const headers = new Headers();
  copyHeader(request, headers, "x-forwarded-for");
  copyHeader(request, headers, "x-real-ip");
  copyHeader(request, headers, "cf-connecting-ip");

  const response = await fetch(new URL(GATEWAY_RATE_LIMIT_PATH, request.url), {
    method: "POST",
    headers,
    cache: "no-store",
  });

  if (response.status === 204) {
    return null;
  }
  if (response.status === 429) {
    return response;
  }
  return response;
}

function copyHeader(request: NextRequest, headers: Headers, name: string): void {
  const value = request.headers.get(name);
  if (value) {
    headers.set(name, value);
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
