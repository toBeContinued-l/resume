import { createConnection, type Socket } from "net";
import { Buffer } from "buffer";
import { AuthError } from "@/server/auth/types";

export type RateLimitRule = {
  key: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  ok: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

export interface RateLimiter {
  check(rule: RateLimitRule): Promise<RateLimitResult>;
}

export class InMemoryRateLimiter implements RateLimiter {
  private readonly store = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async check(rule: RateLimitRule): Promise<RateLimitResult> {
    const now = this.now();
    const current = this.store.get(rule.key);
    if (!current || current.expiresAt <= now) {
      this.store.set(rule.key, {
        count: 1,
        expiresAt: now + rule.windowSeconds * 1000,
      });
      return {
        ok: true,
        retryAfterSeconds: rule.windowSeconds,
        remaining: Math.max(0, rule.limit - 1),
      };
    }

    current.count += 1;
    this.store.set(rule.key, current);
    const retryAfterSeconds = Math.max(1, Math.ceil((current.expiresAt - now) / 1000));
    return {
      ok: current.count <= rule.limit,
      retryAfterSeconds,
      remaining: Math.max(0, rule.limit - current.count),
    };
  }
}

export type RedisRateLimiterOptions = {
  host: string;
  port: number;
  password?: string;
  database?: number;
  keyPrefix?: string;
};

export class RedisRateLimiter implements RateLimiter {
  private readonly keyPrefix: string;

  constructor(private readonly options: RedisRateLimiterOptions) {
    this.keyPrefix = options.keyPrefix ?? "online-resume:rate-limit:";
  }

  async check(rule: RateLimitRule): Promise<RateLimitResult> {
    const socket = await openSocket(this.options.host, this.options.port);
    try {
      const parser = new RedisResponseParser(socket);
      if (this.options.password) {
        await writeCommand(socket, ["AUTH", this.options.password]);
        await parser.read();
      }
      if (this.options.database !== undefined) {
        await writeCommand(socket, ["SELECT", String(this.options.database)]);
        await parser.read();
      }

      const key = this.key(rule.key);
      const script = "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; local ttl = redis.call('TTL', KEYS[1]); return {count, ttl}";
      await writeCommand(socket, ["EVAL", script, "1", key, String(rule.windowSeconds)]);
      const execResult = await parser.read();
      const values = Array.isArray(execResult) ? execResult : [];
      const count = Number(values[0] ?? 0);
      const ttl = Math.max(1, Number(values[1] ?? rule.windowSeconds));
      return {
        ok: count <= rule.limit,
        retryAfterSeconds: ttl,
        remaining: Math.max(0, rule.limit - count),
      };
    } finally {
      socket.end();
    }
  }

  private key(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}

export function createRateLimiterFromEnv(): RateLimiter {
  if (!process.env.REDIS_HOST?.trim()) {
    return new InMemoryRateLimiter();
  }

  const port = Number(process.env.REDIS_PORT ?? 6379);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("REDIS_PORT must be a positive integer.");
  }

  const database = process.env.REDIS_DATABASE === undefined ? undefined : Number(process.env.REDIS_DATABASE);
  if (database !== undefined && (!Number.isInteger(database) || database < 0)) {
    throw new Error("REDIS_DATABASE must be a non-negative integer.");
  }

  return new RedisRateLimiter({
    host: process.env.REDIS_HOST,
    port,
    password: process.env.REDIS_PASSWORD,
    database,
    keyPrefix: process.env.REDIS_RATE_LIMIT_PREFIX,
  });
}

const globalRateLimiter = globalThis as typeof globalThis & {
  __resumeRateLimiter?: RateLimiter;
};

export function getSharedRateLimiter(): RateLimiter {
  globalRateLimiter.__resumeRateLimiter ??= createRateLimiterFromEnv();
  return globalRateLimiter.__resumeRateLimiter;
}

export function resetSharedRateLimiterForTest(): void {
  delete globalRateLimiter.__resumeRateLimiter;
}

export function setSharedRateLimiterForTest(limiter: RateLimiter | undefined): void {
  if (limiter) {
    globalRateLimiter.__resumeRateLimiter = limiter;
    return;
  }
  delete globalRateLimiter.__resumeRateLimiter;
}

export async function enforceRateLimits(
  limiter: RateLimiter,
  rules: RateLimitRule[],
  message = "Too many requests. Please try again later.",
): Promise<void> {
  let retryAfterSeconds = 0;
  for (const rule of rules) {
    const result = await limiter.check(rule);
    if (!result.ok) {
      retryAfterSeconds = Math.max(retryAfterSeconds, result.retryAfterSeconds);
    }
  }
  if (retryAfterSeconds > 0) {
    const error = new AuthError("RATE_LIMITED", message) as AuthError & { retryAfterSeconds?: number };
    error.retryAfterSeconds = retryAfterSeconds;
    throw error;
  }
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  const connectingIp = request.headers.get("cf-connecting-ip")?.trim();
  if (connectingIp) {
    return connectingIp;
  }
  return "unknown";
}

export function normalizeRateLimitKey(value: string): string {
  return value.trim().toLowerCase() || "unknown";
}

export const GATEWAY_RATE_LIMIT = { limit: 300, windowSeconds: 60 } as const;
export const LOGIN_RATE_LIMITS = {
  ip: { limit: 10, windowSeconds: 15 * 60 },
  email: { limit: 5, windowSeconds: 15 * 60 },
} as const;
export const FORGOT_PASSWORD_RATE_LIMITS = {
  ip: { limit: 5, windowSeconds: 15 * 60 },
  email: { limit: 3, windowSeconds: 60 * 60 },
} as const;
export const PUBLIC_LINK_PASSWORD_RATE_LIMITS = {
  ip: { limit: 20, windowSeconds: 15 * 60 },
  slug: { limit: 10, windowSeconds: 15 * 60 },
} as const;

export function buildGatewayRateLimitRule(ip: string): RateLimitRule {
  return {
    key: `gateway:ip:${normalizeRateLimitKey(ip)}`,
    limit: GATEWAY_RATE_LIMIT.limit,
    windowSeconds: GATEWAY_RATE_LIMIT.windowSeconds,
  };
}

export function buildLoginRateLimitRules(input: { ip: string; email: string }): RateLimitRule[] {
  return [
    {
      key: `login:ip:${normalizeRateLimitKey(input.ip)}`,
      limit: LOGIN_RATE_LIMITS.ip.limit,
      windowSeconds: LOGIN_RATE_LIMITS.ip.windowSeconds,
    },
    {
      key: `login:email:${normalizeRateLimitKey(input.email)}`,
      limit: LOGIN_RATE_LIMITS.email.limit,
      windowSeconds: LOGIN_RATE_LIMITS.email.windowSeconds,
    },
  ];
}

export function buildForgotPasswordRateLimitRules(input: { ip: string; email: string }): RateLimitRule[] {
  return [
    {
      key: `forgot-password:ip:${normalizeRateLimitKey(input.ip)}`,
      limit: FORGOT_PASSWORD_RATE_LIMITS.ip.limit,
      windowSeconds: FORGOT_PASSWORD_RATE_LIMITS.ip.windowSeconds,
    },
    {
      key: `forgot-password:email:${normalizeRateLimitKey(input.email)}`,
      limit: FORGOT_PASSWORD_RATE_LIMITS.email.limit,
      windowSeconds: FORGOT_PASSWORD_RATE_LIMITS.email.windowSeconds,
    },
  ];
}

export function buildPublicLinkPasswordRateLimitRules(input: { ip: string; slug: string }): RateLimitRule[] {
  return [
    {
      key: `public-link-password:ip:${normalizeRateLimitKey(input.ip)}`,
      limit: PUBLIC_LINK_PASSWORD_RATE_LIMITS.ip.limit,
      windowSeconds: PUBLIC_LINK_PASSWORD_RATE_LIMITS.ip.windowSeconds,
    },
    {
      key: `public-link-password:slug:${normalizeRateLimitKey(input.slug)}`,
      limit: PUBLIC_LINK_PASSWORD_RATE_LIMITS.slug.limit,
      windowSeconds: PUBLIC_LINK_PASSWORD_RATE_LIMITS.slug.windowSeconds,
    },
  ];
}

type RedisValue = string | number | null | RedisValue[];

function openSocket(host: string, port: number): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port, timeout: 10_000 });
    socket.once("connect", () => resolve(socket));
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("Redis connection timeout."));
    });
    socket.once("error", reject);
  });
}

function writeCommand(socket: Socket, parts: string[]): Promise<void> {
  const payload = encodeCommand(parts);
  return new Promise((resolve, reject) => {
    socket.write(payload, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function encodeCommand(parts: string[]): Buffer {
  const buffers: Buffer[] = [Buffer.from(`*${parts.length}\r\n`)];
  for (const part of parts) {
    const body = Buffer.from(part);
    buffers.push(Buffer.from(`$${body.length}\r\n`), body, Buffer.from("\r\n"));
  }
  return Buffer.concat(buffers);
}

class RedisResponseParser {
  private buffer = Buffer.alloc(0);

  constructor(private readonly socket: Socket) {}

  async read(): Promise<RedisValue> {
    for (;;) {
      const parsed = this.tryParse(0);
      if (parsed) {
        this.buffer = this.buffer.subarray(parsed.nextOffset);
        return parsed.value;
      }
      const chunk = await this.readChunk();
      this.buffer = Buffer.concat([this.buffer, chunk]);
    }
  }

  private readChunk(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.socket.off("data", onData);
        this.socket.off("error", onError);
        this.socket.off("end", onEnd);
      };
      const onData = (chunk: Buffer) => {
        cleanup();
        resolve(chunk);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onEnd = () => {
        cleanup();
        reject(new Error("Redis connection ended before a response was received."));
      };
      this.socket.once("data", onData);
      this.socket.once("error", onError);
      this.socket.once("end", onEnd);
    });
  }

  private tryParse(offset: number): { value: RedisValue; nextOffset: number } | null {
    const type = this.buffer[offset];
    if (type === undefined) {
      return null;
    }
    if (type === 43) {
      return this.parseSimpleString(offset);
    }
    if (type === 45) {
      return this.parseError(offset);
    }
    if (type === 58) {
      return this.parseInteger(offset);
    }
    if (type === 36) {
      return this.parseBulkString(offset);
    }
    if (type === 42) {
      return this.parseArray(offset);
    }
    throw new Error("Unsupported Redis response.");
  }

  private parseSimpleString(offset: number): { value: string; nextOffset: number } | null {
    const end = this.lineEnd(offset);
    if (end < 0) {
      return null;
    }
    return { value: this.buffer.toString("utf8", offset + 1, end), nextOffset: end + 2 };
  }

  private parseError(offset: number): never | null {
    const end = this.lineEnd(offset);
    if (end < 0) {
      return null;
    }
    throw new Error(this.buffer.toString("utf8", offset + 1, end));
  }

  private parseInteger(offset: number): { value: number; nextOffset: number } | null {
    const end = this.lineEnd(offset);
    if (end < 0) {
      return null;
    }
    return { value: Number(this.buffer.toString("utf8", offset + 1, end)), nextOffset: end + 2 };
  }

  private parseBulkString(offset: number): { value: string | null; nextOffset: number } | null {
    const end = this.lineEnd(offset);
    if (end < 0) {
      return null;
    }
    const length = Number(this.buffer.toString("utf8", offset + 1, end));
    if (length === -1) {
      return { value: null, nextOffset: end + 2 };
    }
    const start = end + 2;
    const nextOffset = start + length + 2;
    if (this.buffer.length < nextOffset) {
      return null;
    }
    return { value: this.buffer.toString("utf8", start, start + length), nextOffset };
  }

  private parseArray(offset: number): { value: RedisValue[]; nextOffset: number } | null {
    const end = this.lineEnd(offset);
    if (end < 0) {
      return null;
    }
    const length = Number(this.buffer.toString("utf8", offset + 1, end));
    if (length === -1) {
      return { value: [], nextOffset: end + 2 };
    }

    const values: RedisValue[] = [];
    let nextOffset = end + 2;
    for (let index = 0; index < length; index += 1) {
      const parsed = this.tryParse(nextOffset);
      if (!parsed) {
        return null;
      }
      values.push(parsed.value);
      nextOffset = parsed.nextOffset;
    }
    return { value: values, nextOffset };
  }

  private lineEnd(offset: number): number {
    return this.buffer.indexOf("\r\n", offset);
  }
}
