import type { PublicUser } from "@/server/auth/types";
import { SESSION_COOKIE_NAME } from "@/server/auth/session-cookie";
import { AuthError } from "@/server/auth/types";
import { getAppServices, type AppServices } from "./app-services";

export type AppRuntime = AppServices & {
  getCurrentUser: (input: { sessionToken: string | null; request: Request }) => Promise<Pick<PublicUser, "id" | "email"> | null>;
};

let runtime: AppRuntime | null = null;

export function getAppRuntime(): AppRuntime {
  if (!runtime) {
    const services = getAppServices();
    runtime = {
      ...services,
      getCurrentUser: async ({ sessionToken, request }) => {
        const testUserId = request.headers.get("x-test-user-id");
        if (process.env.NODE_ENV === "test" && testUserId) {
          return { id: testUserId, email: `${testUserId}@example.test` };
        }
        if (!sessionToken) {
          return null;
        }
        try {
          return await services.authService.getCurrentUser({ sessionToken });
        } catch (error) {
          if (error instanceof AuthError) {
            return null;
          }
          throw error;
        }
      },
    };
  }
  return runtime;
}

export function setAppRuntimeForTests(nextRuntime: AppRuntime | null): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setAppRuntimeForTests can only be used in tests.");
  }
  runtime = nextRuntime;
}

export async function requireCurrentUser(request: Request): Promise<Pick<PublicUser, "id" | "email">> {
  const sessionToken = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  const user = await getAppRuntime().getCurrentUser({ sessionToken, request });
  if (!user) {
    throw new AuthError("UNAUTHENTICATED", "Authentication is required.");
  }
  return user;
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  const cookies = cookieHeader.split(";").map((part) => part.trim());
  const prefix = `${name}=`;
  const cookie = cookies.find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}
