import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as gatewayRateLimit } from "@/app/api/_gateway/rate-limit/route";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as verifyPublicLinkPassword } from "@/app/api/public-links/[slug]/verify-password/route";
import { createAppServices, setAppServicesForTest, type AppServices } from "@/server/app-services";
import {
  resetSharedRateLimiterForTest,
  setSharedRateLimiterForTest,
  type RateLimitResult,
  type RateLimiter,
} from "@/server/rate-limit";
import { middleware } from "../../../middleware";

type RouteContext<TParams extends Record<string, string>> = {
  params: Promise<TParams>;
};

describe("rate limiting flow", () => {
  let services: AppServices;

  beforeEach(() => {
    resetSharedRateLimiterForTest();
    services = createAppServices();
    setAppServicesForTest(services);
  });

  afterEach(() => {
    resetSharedRateLimiterForTest();
    vi.unstubAllGlobals();
  });

  it("applies gateway rate limiting to every api request", async () => {
    const limiter = makeLimiter(() => ({ ok: false, retryAfterSeconds: 12, remaining: 0 }));
    setSharedRateLimiterForTest(limiter);

    const response = await gatewayRateLimit(
      jsonRequest("/api/_gateway/rate-limit", {}),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
    expect(limiter.check).toHaveBeenCalledWith({
      key: "gateway:ip:203.0.113.9",
      limit: 300,
      windowSeconds: 60,
    });
  });

  it("returns the middleware response from the gateway check", async () => {
    const responseMock = new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
        },
      }),
      {
        status: 429,
        headers: { "Retry-After": "9" },
      },
    );
    const fetchMock = vi.fn(async () => responseMock);
    vi.stubGlobal("fetch", fetchMock);

    const response = await middleware(request("/api/auth/login"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("9");
  });

  it("skips the internal gateway route in middleware", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await middleware(request("/api/_gateway/rate-limit"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("adds login business rate limits on top of the gateway", async () => {
    const limiter = makeLimiter(() => ({ ok: true, retryAfterSeconds: 15, remaining: 4 }));
    services.rateLimiter = limiter as RateLimiter;
    services.authService = {
      login: vi.fn(async () => ({
        user: { id: "user-1", email: "Test@Example.com", status: "active", emailVerifiedAt: new Date() },
        session: { expiresAt: new Date(Date.now() + 60_000) },
        sessionToken: "session-token",
      })),
    } as unknown as typeof services.authService;

    const response = await login(
      jsonRequest("/api/auth/login", { email: "Test@Example.com", password: "secret" }),
    );

    expect(response.status).toBe(200);
    expect(limiter.check).toHaveBeenCalledWith({
      key: "login:ip:203.0.113.9",
      limit: 10,
      windowSeconds: 15 * 60,
    });
    expect(limiter.check).toHaveBeenCalledWith({
      key: "login:email:test@example.com",
      limit: 5,
      windowSeconds: 15 * 60,
    });
  });

  it("adds forgot-password business rate limits on top of the gateway", async () => {
    const limiter = makeLimiter(() => ({ ok: true, retryAfterSeconds: 60, remaining: 2 }));
    services.rateLimiter = limiter as RateLimiter;
    services.authService = {
      forgotPassword: vi.fn(async () => undefined),
    } as unknown as typeof services.authService;

    const response = await forgotPassword(
      jsonRequest("/api/auth/forgot-password", { email: "Test@Example.com" }),
    );

    expect(response.status).toBe(200);
    expect(limiter.check).toHaveBeenCalledWith({
      key: "forgot-password:ip:203.0.113.9",
      limit: 5,
      windowSeconds: 15 * 60,
    });
    expect(limiter.check).toHaveBeenCalledWith({
      key: "forgot-password:email:test@example.com",
      limit: 3,
      windowSeconds: 60 * 60,
    });
  });

  it("adds public-link password verification rate limits on top of the gateway", async () => {
    const limiter = makeLimiter(() => ({ ok: true, retryAfterSeconds: 45, remaining: 9 }));
    services.rateLimiter = limiter as RateLimiter;
    services.resumeLinkService = {
      verifyPassword: vi.fn(async () => ({
        ok: true,
        resume: { title: "Protected Resume" },
        link: { slug: "slug-1" },
      })),
    } as unknown as typeof services.resumeLinkService;

    const response = await verifyPublicLinkPassword(
      jsonRequest("/api/public-links/Slug-1/verify-password", { password: "visitor-pass" }),
      routeContext("Slug-1"),
    );

    expect(response.status).toBe(200);
    expect(limiter.check).toHaveBeenCalledWith({
      key: "public-link-password:ip:203.0.113.9",
      limit: 20,
      windowSeconds: 15 * 60,
    });
    expect(limiter.check).toHaveBeenCalledWith({
      key: "public-link-password:slug:slug-1",
      limit: 10,
      windowSeconds: 15 * 60,
    });
  });
});

function makeLimiter(
  resultFactory: () => RateLimitResult,
): RateLimiter & { check: ReturnType<typeof vi.fn> } {
  return {
    check: vi.fn(async () => resultFactory()),
  };
}

function request(path: string): NextRequest {
  return new Request(`http://localhost${path}`, {
    headers: {
      "x-forwarded-for": "203.0.113.9",
      "x-real-ip": "203.0.113.9",
    },
  }) as NextRequest;
}

function jsonRequest(path: string, body: unknown): NextRequest {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.9",
      "x-real-ip": "203.0.113.9",
    },
    body: JSON.stringify(body),
  }) as NextRequest;
}

function routeContext(slug: string): RouteContext<{ slug: string }> {
  return { params: Promise.resolve({ slug }) };
}
