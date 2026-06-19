import { describe, expect, it } from "vitest";
import { MemoryMailProvider } from "../../../../src/server/mail/provider";
import { AuthService } from "../../../../src/server/auth/auth-service";
import { InMemoryEmailVerificationCodeStore } from "../../../../src/server/auth/email-verification-code-store";
import { InMemoryAuthRepository } from "../../../../src/server/auth/in-memory-auth-repository";
import { ScryptPasswordHasher } from "../../../../src/server/auth/password";
import { createSessionCookieOptions } from "../../../../src/server/auth/session-cookie";
import { AuthError } from "../../../../src/server/auth/types";

function createHarness(input: { now?: Date } = {}) {
  let now = input.now ?? new Date("2026-01-01T00:00:00.000Z");
  let id = 0;
  let token = 0;
  const repository = new InMemoryAuthRepository({ now: () => now });
  const mailProvider = new MemoryMailProvider();
  const verificationCodeStore = new InMemoryEmailVerificationCodeStore();
  const service = new AuthService(repository, new ScryptPasswordHasher(), mailProvider, verificationCodeStore, {
    appBaseUrl: "https://resume.example",
    now: () => now,
    createId: () => `id-${++id}`,
    createToken: () => `token-${++token}`,
    verificationTokenTtlMs: 1_000,
    verificationCodeTtlMs: 1_000,
    passwordResetTokenTtlMs: 1_000,
    sessionTtlMs: 1_000,
  });
  return {
    repository,
    mailProvider,
    service,
    verificationCodeStore,
    setNow: (value: Date) => {
      now = value;
    },
  };
}

describe("AuthService", () => {
  it("registers a pending user, hashes password and verification token, and sends email", async () => {
    const { repository, mailProvider, service } = createHarness();

    const result = await service.register({ email: " User@Example.COM ", password: "passw0rd" });

    expect(result.user.email).toBe("user@example.com");
    expect(result.user.status).toBe("pending_verification");
    const user = await repository.findUserByEmail("user@example.com");
    expect(user?.passwordHash).not.toBe("passw0rd");
    const storedToken = [...repository.emailVerificationTokens.values()][0];
    expect(storedToken.tokenHash).not.toBe("token-1");
    expect(mailProvider.findLatest("email_verification", "user@example.com")).toMatchObject({
      token: "token-1",
      verificationUrl: "https://resume.example/auth/verify-email?token=token-1",
    });
    expect(mailProvider.findLatest("email_verification", "user@example.com")).toMatchObject({
      code: expect.stringMatching(/^\d{6}$/),
      expiresInMinutes: 1,
    });
  });

  it("rejects weak passwords and resends verification for pending duplicate emails", async () => {
    const { mailProvider, service } = createHarness();

    await expect(service.register({ email: "bad@example.com", password: "short1" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await service.register({ email: "user@example.com", password: "passw0rd" });
    await expect(service.register({ email: "USER@example.com", password: "newpassw0rd" })).resolves.toMatchObject({
      user: { email: "user@example.com", status: "pending_verification" },
    });
    expect(mailProvider.findLatest("email_verification", "user@example.com")).toMatchObject({ token: "token-2" });
  });

  it("rejects duplicate emails after verification", async () => {
    const { service } = createHarness();
    await service.register({ email: "user@example.com", password: "passw0rd" });
    await service.verifyEmail({ token: "token-1" });

    await expect(service.register({ email: "USER@example.com", password: "passw0rd" })).rejects.toMatchObject({
      code: "EMAIL_ALREADY_EXISTS",
    });
  });

  it("verifies email once and blocks login before verification", async () => {
    const { service } = createHarness();
    await service.register({ email: "user@example.com", password: "passw0rd" });

    await expect(service.login({ email: "user@example.com", password: "passw0rd" })).rejects.toMatchObject({
      code: "ACCOUNT_NOT_ACTIVE",
    });

    const verified = await service.verifyEmail({ token: "token-1" });
    expect(verified.status).toBe("active");
    await expect(service.verifyEmail({ token: "token-1" })).rejects.toMatchObject({ code: "TOKEN_USED" });
  });

  it("verifies email with the mailed verification code", async () => {
    const { mailProvider, service } = createHarness();
    await service.register({ email: "user@example.com", password: "passw0rd" });

    const verificationMail = mailProvider.findLatest("email_verification", "user@example.com");
    expect(verificationMail?.kind).toBe("email_verification");
    if (verificationMail?.kind !== "email_verification") {
      throw new Error("Expected an email verification message.");
    }

    await expect(service.verifyEmail({ email: "USER@example.com", code: verificationMail.code })).resolves.toMatchObject({
      email: "user@example.com",
      status: "active",
    });
    await expect(service.verifyEmail({ email: "user@example.com", code: verificationMail.code })).rejects.toMatchObject({
      code: "INVALID_VERIFICATION_CODE",
    });
  });

  it("rejects expired verification tokens", async () => {
    const { service, setNow } = createHarness();
    await service.register({ email: "user@example.com", password: "passw0rd" });

    setNow(new Date("2026-01-01T00:00:02.000Z"));

    await expect(service.verifyEmail({ token: "token-1" })).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
  });

  it("creates hashed sessions, resolves current user, and revokes sessions on logout", async () => {
    const { repository, service } = createHarness();
    await service.register({ email: "user@example.com", password: "passw0rd" });
    await service.verifyEmail({ token: "token-1" });

    const login = await service.login({ email: "user@example.com", password: "passw0rd" });

    expect(login.sessionToken).toBe("token-2");
    expect(login.session.sessionTokenHash).not.toBe("token-2");
    const cookieOptions = createSessionCookieOptions({ expiresAt: login.session.expiresAt });
    expect(cookieOptions).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
    await expect(service.getCurrentUser({ sessionToken: login.sessionToken })).resolves.toMatchObject({
      email: "user@example.com",
    });

    await service.logout({ sessionToken: login.sessionToken });
    const session = [...repository.sessions.values()][0];
    expect(session.revokedAt).toBeInstanceOf(Date);
    await expect(service.getCurrentUser({ sessionToken: login.sessionToken })).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });

  it("sends password reset without leaking unknown emails and marks reset tokens used", async () => {
    const { mailProvider, service } = createHarness();
    await service.register({ email: "user@example.com", password: "passw0rd" });
    await service.verifyEmail({ token: "token-1" });

    await service.forgotPassword({ email: "missing@example.com" });
    expect(mailProvider.findLatest("password_reset")).toBeUndefined();

    await service.forgotPassword({ email: "user@example.com" });
    expect(mailProvider.findLatest("password_reset", "user@example.com")).toMatchObject({ token: "token-2" });

    await service.resetPassword({ token: "token-2", newPassword: "n3wpassw0rd" });
    await expect(service.resetPassword({ token: "token-2", newPassword: "another1" })).rejects.toMatchObject({
      code: "TOKEN_USED",
    });
    await expect(service.login({ email: "user@example.com", password: "passw0rd" })).rejects.toBeInstanceOf(AuthError);
    await expect(service.login({ email: "user@example.com", password: "n3wpassw0rd" })).resolves.toMatchObject({
      user: { email: "user@example.com" },
    });
  });
});
