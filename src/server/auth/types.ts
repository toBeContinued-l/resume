export type UserStatus = "pending_verification" | "active" | "disabled";

type SoftDeleteRecord = {
  isDeleted: boolean;
  deletedAt: Date | null;
};

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
} & SoftDeleteRecord;

export type EmailVerificationTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
} & SoftDeleteRecord;

export type PasswordResetTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
} & SoftDeleteRecord;

export type SessionRecord = {
  id: string;
  userId: string;
  sessionTokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
} & SoftDeleteRecord;

export type PublicUser = {
  id: string;
  email: string;
  status: UserStatus;
  emailVerifiedAt: Date | null;
};

export type AuthErrorCode =
  | "VALIDATION_ERROR"
  | "EMAIL_ALREADY_EXISTS"
  | "INVALID_TOKEN"
  | "INVALID_VERIFICATION_CODE"
  | "TOKEN_EXPIRED"
  | "TOKEN_USED"
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_NOT_ACTIVE"
  | "ACCOUNT_DISABLED"
  | "RATE_LIMITED"
  | "UNAUTHENTICATED";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export interface AuthRepository {
  createUser(input: Omit<UserRecord, "createdAt" | "updatedAt" | "lastLoginAt" | "emailVerifiedAt" | "isDeleted" | "deletedAt">): Promise<UserRecord>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  findUserById(id: string): Promise<UserRecord | null>;
  updateUser(user: UserRecord): Promise<UserRecord>;

  createEmailVerificationToken(
    input: Omit<EmailVerificationTokenRecord, "createdAt" | "usedAt" | "isDeleted" | "deletedAt">,
  ): Promise<EmailVerificationTokenRecord>;
  findEmailVerificationTokenByHash(tokenHash: string): Promise<EmailVerificationTokenRecord | null>;
  updateEmailVerificationToken(token: EmailVerificationTokenRecord): Promise<EmailVerificationTokenRecord>;

  createPasswordResetToken(
    input: Omit<PasswordResetTokenRecord, "createdAt" | "usedAt" | "isDeleted" | "deletedAt">,
  ): Promise<PasswordResetTokenRecord>;
  findPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetTokenRecord | null>;
  updatePasswordResetToken(token: PasswordResetTokenRecord): Promise<PasswordResetTokenRecord>;

  createSession(input: Omit<SessionRecord, "createdAt" | "revokedAt" | "isDeleted" | "deletedAt">): Promise<SessionRecord>;
  findSessionByTokenHash(sessionTokenHash: string): Promise<SessionRecord | null>;
  updateSession(session: SessionRecord): Promise<SessionRecord>;
}

export type AuthServiceOptions = {
  appBaseUrl: string;
  verificationTokenTtlMs?: number;
  verificationCodeTtlMs?: number;
  passwordResetTokenTtlMs?: number;
  sessionTtlMs?: number;
  now?: () => Date;
  createId?: () => string;
  createToken?: () => string;
};
