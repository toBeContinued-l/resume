import { randomInt, randomUUID } from "crypto";
import type { EmailVerificationCodeStore } from "./email-verification-code-store";
import type { MailProvider } from "../mail/provider";
import type { PasswordHasher } from "./password";
import { validatePasswordStrength } from "./password";
import { createSecretToken, hashToken } from "./token";
import type { AuthRepository, AuthServiceOptions, PublicUser, SessionRecord, UserRecord } from "./types";
import { AuthError } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFICATION_CODE_PATTERN = /^\d{6}$/;
const DEFAULT_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_RESET_TTL_MS = 60 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type RegisterResult = {
  user: PublicUser;
};

export type LoginResult = {
  user: PublicUser;
  sessionToken: string;
  session: SessionRecord;
};

export class AuthService {
  private readonly verificationTokenTtlMs: number;
  private readonly verificationCodeTtlMs: number;
  private readonly passwordResetTokenTtlMs: number;
  private readonly sessionTtlMs: number;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly createToken: () => string;
  private readonly appBaseUrl: string;

  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordHasher: PasswordHasher,
    private readonly mailProvider: MailProvider,
    private readonly verificationCodeStore: EmailVerificationCodeStore,
    options: AuthServiceOptions,
  ) {
    this.appBaseUrl = options.appBaseUrl.replace(/\/$/, "");
    this.verificationTokenTtlMs = options.verificationTokenTtlMs ?? DEFAULT_VERIFICATION_TTL_MS;
    this.verificationCodeTtlMs = options.verificationCodeTtlMs ?? DEFAULT_VERIFICATION_CODE_TTL_MS;
    this.passwordResetTokenTtlMs = options.passwordResetTokenTtlMs ?? DEFAULT_RESET_TTL_MS;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? (() => randomUUID());
    this.createToken = options.createToken ?? (() => createSecretToken());
  }

  async register(input: { email: string; password: string }): Promise<RegisterResult> {
    const email = normalizeEmail(input.email);
    assertEmail(email);
    assertPassword(input.password);

    const existingUser = await this.repository.findUserByEmail(email);
    if (existingUser) {
      if (existingUser.status !== "pending_verification") {
        throw new AuthError("EMAIL_ALREADY_EXISTS", "Email is already registered.");
      }
      const passwordHash = await this.passwordHasher.hash(input.password);
      const user = await this.repository.updateUser({ ...existingUser, passwordHash });
      await this.createAndSendEmailVerification(user);
      return { user: toPublicUser(user) };
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.repository.createUser({
      id: this.createId(),
      email,
      passwordHash,
      status: "pending_verification",
    });

    await this.createAndSendEmailVerification(user);

    return { user: toPublicUser(user) };
  }

  private async createAndSendEmailVerification(user: UserRecord): Promise<void> {
    const token = this.createToken();
    const code = createVerificationCode();
    const codeExpiresAt = addMs(this.now(), this.verificationCodeTtlMs);
    await this.repository.createEmailVerificationToken({
      id: this.createId(),
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: addMs(this.now(), this.verificationTokenTtlMs),
    });
    await this.verificationCodeStore.save(
      {
        email: user.email,
        userId: user.id,
        codeHash: hashVerificationCode(user.email, code),
        expiresAt: codeExpiresAt,
      },
      Math.ceil(this.verificationCodeTtlMs / 1000),
    );

    await this.mailProvider.sendEmailVerification({
      to: user.email,
      token,
      code,
      expiresInMinutes: Math.ceil(this.verificationCodeTtlMs / 60_000),
      verificationUrl: `${this.appBaseUrl}/auth/verify-email?token=${encodeURIComponent(token)}`,
    });
  }

  async verifyEmail(input: { token?: string; email?: string; code?: string }): Promise<PublicUser> {
    const token = input.token?.trim();
    if (token) {
      return this.verifyEmailToken(token);
    }
    return this.verifyEmailCode(input);
  }

  private async verifyEmailToken(token: string): Promise<PublicUser> {
    const tokenRecord = await this.repository.findEmailVerificationTokenByHash(hashToken(token));
    if (!tokenRecord) {
      throw new AuthError("INVALID_TOKEN", "Email verification token is invalid.");
    }
    if (tokenRecord.usedAt) {
      throw new AuthError("TOKEN_USED", "Email verification token has already been used.");
    }
    if (tokenRecord.expiresAt.getTime() <= this.now().getTime()) {
      throw new AuthError("TOKEN_EXPIRED", "Email verification token has expired.");
    }

    const user = await this.requireUser(tokenRecord.userId);
    const now = this.now();
    await this.repository.updateEmailVerificationToken({ ...tokenRecord, usedAt: now });
    await this.verificationCodeStore.deleteByEmail(user.email);
    const updatedUser = await this.markUserEmailVerified(user, now);

    return toPublicUser(updatedUser);
  }

  private async verifyEmailCode(input: { email?: string; code?: string }): Promise<PublicUser> {
    const email = normalizeEmail(input.email ?? "");
    assertEmail(email);
    const code = String(input.code ?? "").trim();
    if (!VERIFICATION_CODE_PATTERN.test(code)) {
      throw new AuthError("INVALID_VERIFICATION_CODE", "Email verification code is invalid.");
    }

    const codeRecord = await this.verificationCodeStore.findByEmail(email);
    if (!codeRecord) {
      throw new AuthError("INVALID_VERIFICATION_CODE", "Email verification code is invalid or expired.");
    }
    if (codeRecord.expiresAt.getTime() <= this.now().getTime()) {
      await this.verificationCodeStore.deleteByEmail(email);
      throw new AuthError("TOKEN_EXPIRED", "Email verification code has expired.");
    }
    if (codeRecord.codeHash !== hashVerificationCode(email, code)) {
      throw new AuthError("INVALID_VERIFICATION_CODE", "Email verification code is invalid.");
    }

    const user = await this.requireUser(codeRecord.userId);
    if (user.email !== email) {
      throw new AuthError("INVALID_VERIFICATION_CODE", "Email verification code is invalid.");
    }

    await this.verificationCodeStore.deleteByEmail(email);
    return toPublicUser(await this.markUserEmailVerified(user, this.now()));
  }

  async login(input: { email: string; password: string }): Promise<LoginResult> {
    const email = normalizeEmail(input.email);
    const user = await this.repository.findUserByEmail(email);
    if (!user || !(await this.passwordHasher.verify(input.password, user.passwordHash))) {
      throw new AuthError("INVALID_CREDENTIALS", "Email or password is invalid.");
    }
    if (user.status === "disabled") {
      throw new AuthError("ACCOUNT_DISABLED", "Account is disabled.");
    }
    if (user.status !== "active") {
      throw new AuthError("ACCOUNT_NOT_ACTIVE", "Email must be verified before login.");
    }

    const sessionToken = this.createToken();
    const session = await this.repository.createSession({
      id: this.createId(),
      userId: user.id,
      sessionTokenHash: hashToken(sessionToken),
      expiresAt: addMs(this.now(), this.sessionTtlMs),
    });
    const updatedUser = await this.repository.updateUser({ ...user, lastLoginAt: this.now() });
    return { user: toPublicUser(updatedUser), sessionToken, session };
  }

  async logout(input: { sessionToken: string }): Promise<void> {
    const session = await this.repository.findSessionByTokenHash(hashToken(input.sessionToken));
    if (session && !session.revokedAt) {
      await this.repository.updateSession({ ...session, revokedAt: this.now() });
    }
  }

  async getCurrentUser(input: { sessionToken: string | null | undefined }): Promise<PublicUser> {
    if (!input.sessionToken) {
      throw new AuthError("UNAUTHENTICATED", "Authentication is required.");
    }

    const session = await this.repository.findSessionByTokenHash(hashToken(input.sessionToken));
    if (!session || session.revokedAt || session.expiresAt.getTime() <= this.now().getTime()) {
      throw new AuthError("UNAUTHENTICATED", "Session is invalid or expired.");
    }

    const user = await this.requireUser(session.userId);
    if (user.status !== "active") {
      throw new AuthError("UNAUTHENTICATED", "Account is not active.");
    }

    return toPublicUser(user);
  }

  async forgotPassword(input: { email: string }): Promise<void> {
    const email = normalizeEmail(input.email);
    const user = await this.repository.findUserByEmail(email);
    if (!user || user.status !== "active") {
      return;
    }

    const token = this.createToken();
    await this.repository.createPasswordResetToken({
      id: this.createId(),
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: addMs(this.now(), this.passwordResetTokenTtlMs),
    });

    await this.mailProvider.sendPasswordReset({
      to: user.email,
      token,
      resetUrl: `${this.appBaseUrl}/auth/reset-password?token=${encodeURIComponent(token)}`,
    });
  }

  async resetPassword(input: { token: string; newPassword: string }): Promise<void> {
    assertPassword(input.newPassword);
    const tokenRecord = await this.repository.findPasswordResetTokenByHash(hashToken(input.token));
    if (!tokenRecord) {
      throw new AuthError("INVALID_TOKEN", "Password reset token is invalid.");
    }
    if (tokenRecord.usedAt) {
      throw new AuthError("TOKEN_USED", "Password reset token has already been used.");
    }
    if (tokenRecord.expiresAt.getTime() <= this.now().getTime()) {
      throw new AuthError("TOKEN_EXPIRED", "Password reset token has expired.");
    }

    const user = await this.requireUser(tokenRecord.userId);
    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    await this.repository.updateUser({ ...user, passwordHash });
    await this.repository.updatePasswordResetToken({ ...tokenRecord, usedAt: this.now() });
  }

  private async requireUser(userId: string): Promise<UserRecord> {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new AuthError("INVALID_TOKEN", "Token is not linked to an existing user.");
    }
    return user;
  }

  private async markUserEmailVerified(user: UserRecord, now: Date): Promise<UserRecord> {
    return this.repository.updateUser({
      ...user,
      status: "active",
      emailVerifiedAt: user.emailVerifiedAt ?? now,
    });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isEmailValid(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

function assertEmail(email: string): void {
  if (!isEmailValid(email)) {
    throw new AuthError("VALIDATION_ERROR", "Email format is invalid.");
  }
}

function assertPassword(password: string): void {
  const errors = validatePasswordStrength(password);
  if (errors.length > 0) {
    throw new AuthError("VALIDATION_ERROR", errors.join(" "));
  }
}

function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

function createVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hashVerificationCode(email: string, code: string): string {
  return hashToken(`${email}:${code}`);
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    status: user.status,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}
