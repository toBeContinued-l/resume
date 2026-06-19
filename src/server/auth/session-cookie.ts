export const SESSION_COOKIE_NAME = "resume_session";

export type SessionCookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  expires: Date;
};

export function createSessionCookieOptions(input: { expiresAt: Date; secure?: boolean }): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: input.secure ?? true,
    sameSite: "lax",
    path: "/",
    expires: input.expiresAt,
  };
}

export function createExpiredSessionCookieOptions(input: { secure?: boolean } = {}): SessionCookieOptions {
  return {
    httpOnly: true,
    secure: input.secure ?? true,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  };
}
