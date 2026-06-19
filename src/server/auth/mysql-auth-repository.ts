import type {
  AuthRepository,
  EmailVerificationTokenRecord,
  PasswordResetTokenRecord,
  SessionRecord,
  UserRecord,
} from "./types";
import type { SqlExecutor } from "../db/mysql-client";
import { firstOrNull, nullableDate, toDate } from "../db/mysql-client";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  status: UserRecord["status"];
  email_verified_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  last_login_at: Date | string | null;
  is_deleted: boolean | number;
  deleted_at: Date | string | null;
};

type TokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date | string;
  used_at: Date | string | null;
  created_at: Date | string;
  is_deleted: boolean | number;
  deleted_at: Date | string | null;
};

type SessionRow = {
  id: string;
  user_id: string;
  session_token_hash: string;
  expires_at: Date | string;
  created_at: Date | string;
  revoked_at: Date | string | null;
  is_deleted: boolean | number;
  deleted_at: Date | string | null;
};

export class MysqlAuthRepository implements AuthRepository {
  constructor(
    private readonly db: SqlExecutor,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createUser(input: Omit<UserRecord, "createdAt" | "updatedAt" | "lastLoginAt" | "emailVerifiedAt" | "isDeleted" | "deletedAt">): Promise<UserRecord> {
    const now = this.now();
    await this.db.execute(
      "insert into users (id, email, password_hash, status, email_verified_at, created_at, updated_at, last_login_at, is_deleted, deleted_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [input.id, input.email, input.passwordHash, input.status, null, now, now, null, false, null],
    );
    return { ...input, emailVerifiedAt: null, createdAt: now, updatedAt: now, lastLoginAt: null, isDeleted: false, deletedAt: null };
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    return mapUser(firstOrNull(await this.db.execute<UserRow>("select * from users where email = ? and is_deleted = false limit 1", [email])));
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    return mapUser(firstOrNull(await this.db.execute<UserRow>("select * from users where id = ? and is_deleted = false limit 1", [id])));
  }

  async updateUser(user: UserRecord): Promise<UserRecord> {
    const updatedAt = this.now();
    await this.db.execute(
      "update users set email = ?, password_hash = ?, status = ?, email_verified_at = ?, updated_at = ?, last_login_at = ?, is_deleted = ?, deleted_at = ? where id = ?",
      [user.email, user.passwordHash, user.status, user.emailVerifiedAt, updatedAt, user.lastLoginAt, user.isDeleted, user.deletedAt, user.id],
    );
    return { ...user, updatedAt };
  }

  async createEmailVerificationToken(
    input: Omit<EmailVerificationTokenRecord, "createdAt" | "usedAt" | "isDeleted" | "deletedAt">,
  ): Promise<EmailVerificationTokenRecord> {
    const createdAt = this.now();
    await this.db.execute(
      "insert into email_verification_tokens (id, user_id, token_hash, expires_at, used_at, created_at, is_deleted, deleted_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      [input.id, input.userId, input.tokenHash, input.expiresAt, null, createdAt, false, null],
    );
    return { ...input, usedAt: null, createdAt, isDeleted: false, deletedAt: null };
  }

  async findEmailVerificationTokenByHash(tokenHash: string): Promise<EmailVerificationTokenRecord | null> {
    return mapEmailToken(
      firstOrNull(
        await this.db.execute<TokenRow>(
          "select * from email_verification_tokens where token_hash = ? and is_deleted = false limit 1",
          [tokenHash],
        ),
      ),
    );
  }

  async updateEmailVerificationToken(token: EmailVerificationTokenRecord): Promise<EmailVerificationTokenRecord> {
    await this.db.execute("update email_verification_tokens set used_at = ?, is_deleted = ?, deleted_at = ? where id = ?", [
      token.usedAt,
      token.isDeleted,
      token.deletedAt,
      token.id,
    ]);
    return token;
  }

  async createPasswordResetToken(
    input: Omit<PasswordResetTokenRecord, "createdAt" | "usedAt" | "isDeleted" | "deletedAt">,
  ): Promise<PasswordResetTokenRecord> {
    const createdAt = this.now();
    await this.db.execute(
      "insert into password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at, is_deleted, deleted_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      [input.id, input.userId, input.tokenHash, input.expiresAt, null, createdAt, false, null],
    );
    return { ...input, usedAt: null, createdAt, isDeleted: false, deletedAt: null };
  }

  async findPasswordResetTokenByHash(tokenHash: string): Promise<PasswordResetTokenRecord | null> {
    return mapPasswordToken(
      firstOrNull(
        await this.db.execute<TokenRow>(
          "select * from password_reset_tokens where token_hash = ? and is_deleted = false limit 1",
          [tokenHash],
        ),
      ),
    );
  }

  async updatePasswordResetToken(token: PasswordResetTokenRecord): Promise<PasswordResetTokenRecord> {
    await this.db.execute("update password_reset_tokens set used_at = ?, is_deleted = ?, deleted_at = ? where id = ?", [
      token.usedAt,
      token.isDeleted,
      token.deletedAt,
      token.id,
    ]);
    return token;
  }

  async createSession(input: Omit<SessionRecord, "createdAt" | "revokedAt" | "isDeleted" | "deletedAt">): Promise<SessionRecord> {
    const createdAt = this.now();
    await this.db.execute(
      "insert into sessions (id, user_id, session_token_hash, expires_at, created_at, revoked_at, is_deleted, deleted_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      [input.id, input.userId, input.sessionTokenHash, input.expiresAt, createdAt, null, false, null],
    );
    return { ...input, createdAt, revokedAt: null, isDeleted: false, deletedAt: null };
  }

  async findSessionByTokenHash(sessionTokenHash: string): Promise<SessionRecord | null> {
    return mapSession(
      firstOrNull(
        await this.db.execute<SessionRow>("select * from sessions where session_token_hash = ? and is_deleted = false limit 1", [
          sessionTokenHash,
        ]),
      ),
    );
  }

  async updateSession(session: SessionRecord): Promise<SessionRecord> {
    await this.db.execute("update sessions set revoked_at = ?, is_deleted = ?, deleted_at = ? where id = ?", [
      session.revokedAt,
      session.isDeleted,
      session.deletedAt,
      session.id,
    ]);
    return session;
  }
}

function mapUser(row: UserRow | null): UserRecord | null {
  return row
    ? {
        id: row.id,
        email: row.email,
        passwordHash: row.password_hash,
        status: row.status,
        emailVerifiedAt: nullableDate(row.email_verified_at),
        createdAt: toDate(row.created_at),
        updatedAt: toDate(row.updated_at),
        lastLoginAt: nullableDate(row.last_login_at),
        isDeleted: Boolean(row.is_deleted),
        deletedAt: nullableDate(row.deleted_at),
      }
    : null;
}

function mapEmailToken(row: TokenRow | null): EmailVerificationTokenRecord | null {
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: toDate(row.expires_at),
        usedAt: nullableDate(row.used_at),
        createdAt: toDate(row.created_at),
        isDeleted: Boolean(row.is_deleted),
        deletedAt: nullableDate(row.deleted_at),
      }
    : null;
}

function mapPasswordToken(row: TokenRow | null): PasswordResetTokenRecord | null {
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        expiresAt: toDate(row.expires_at),
        usedAt: nullableDate(row.used_at),
        createdAt: toDate(row.created_at),
        isDeleted: Boolean(row.is_deleted),
        deletedAt: nullableDate(row.deleted_at),
      }
    : null;
}

function mapSession(row: SessionRow | null): SessionRecord | null {
  return row
    ? {
        id: row.id,
        userId: row.user_id,
        sessionTokenHash: row.session_token_hash,
        expiresAt: toDate(row.expires_at),
        createdAt: toDate(row.created_at),
        revokedAt: nullableDate(row.revoked_at),
        isDeleted: Boolean(row.is_deleted),
        deletedAt: nullableDate(row.deleted_at),
      }
    : null;
}
