import type {
  AuthRepository,
  EmailVerificationTokenRecord,
  PasswordResetTokenRecord,
  SessionRecord,
  UserRecord,
} from "./types";

export class InMemoryAuthRepository implements AuthRepository {
  readonly users = new Map<string, UserRecord>();
  readonly emailVerificationTokens = new Map<string, EmailVerificationTokenRecord>();
  readonly passwordResetTokens = new Map<string, PasswordResetTokenRecord>();
  readonly sessions = new Map<string, SessionRecord>();

  private readonly now: () => Date;

  constructor(input: { now?: () => Date } = {}) {
    this.now = input.now ?? (() => new Date());
  }

  async createUser(input: Omit<UserRecord, "createdAt" | "updatedAt" | "lastLoginAt" | "emailVerifiedAt" | "isDeleted" | "deletedAt">): Promise<UserRecord> {
    const createdAt = this.now();
    const user: UserRecord = {
      ...input,
      emailVerifiedAt: null,
      createdAt,
      updatedAt: createdAt,
      lastLoginAt: null,
      isDeleted: false,
      deletedAt: null,
    };
    this.users.set(user.id, user);
    return user;
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return [...this.users.values()].find((user) => user.email === email && !user.isDeleted) ?? null;
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = this.users.get(id);
    return user && !user.isDeleted ? user : null;
  }

  async updateUser(user: UserRecord): Promise<UserRecord> {
    this.users.set(user.id, { ...user, updatedAt: this.now() });
    return this.users.get(user.id)!;
  }

  async createEmailVerificationToken(
    input: Omit<EmailVerificationTokenRecord, "createdAt" | "usedAt" | "isDeleted" | "deletedAt">,
  ): Promise<EmailVerificationTokenRecord> {
    const token: EmailVerificationTokenRecord = { ...input, usedAt: null, createdAt: this.now(), isDeleted: false, deletedAt: null };
    this.emailVerificationTokens.set(token.id, token);
    return token;
  }

  async findEmailVerificationTokenByHash(tokenHash: string): Promise<EmailVerificationTokenRecord | null> {
    return [...this.emailVerificationTokens.values()].find((token) => token.tokenHash === tokenHash && !token.isDeleted) ?? null;
  }

  async updateEmailVerificationToken(token: EmailVerificationTokenRecord): Promise<EmailVerificationTokenRecord> {
    this.emailVerificationTokens.set(token.id, token);
    return token;
  }

  async createPasswordResetToken(
    input: Omit<PasswordResetTokenRecord, "createdAt" | "usedAt" | "isDeleted" | "deletedAt">,
  ): Promise<PasswordResetTokenRecord> {
    const token: PasswordResetTokenRecord = { ...input, usedAt: null, createdAt: this.now(), isDeleted: false, deletedAt: null };
    this.passwordResetTokens.set(token.id, token);
    return token;
  }

  async findPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    return [...this.passwordResetTokens.values()].find((token) => token.tokenHash === tokenHash && !token.isDeleted) ?? null;
  }

  async updatePasswordResetToken(token: PasswordResetTokenRecord): Promise<PasswordResetTokenRecord> {
    this.passwordResetTokens.set(token.id, token);
    return token;
  }

  async createSession(input: Omit<SessionRecord, "createdAt" | "revokedAt" | "isDeleted" | "deletedAt">): Promise<SessionRecord> {
    const session: SessionRecord = { ...input, createdAt: this.now(), revokedAt: null, isDeleted: false, deletedAt: null };
    this.sessions.set(session.id, session);
    return session;
  }

  async findSessionByTokenHash(sessionTokenHash: string): Promise<SessionRecord | null> {
    return [...this.sessions.values()].find((session) => session.sessionTokenHash === sessionTokenHash && !session.isDeleted) ?? null;
  }

  async updateSession(session: SessionRecord): Promise<SessionRecord> {
    this.sessions.set(session.id, session);
    return session;
  }
}
